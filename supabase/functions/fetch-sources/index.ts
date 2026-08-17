// Scheduled news-source check, invoked every 2 hours by Supabase pg_cron
// (via pg_net) -- see supabase/migrations/20260101000007_supabase_cron_dispatch.sql.
// Never publishes anything: it only writes to news_sources / scraped_articles
// / news_candidates / automation_runs, exactly like "Fetch All Active
// Sources" in the Admin UI. Gemini is never called from here (spec: Gemini
// only runs when the admin clicks "Prepare with Gemini" in the app).
//
// Auth: this function keeps Supabase's default JWT verification ON (no
// `--no-verify-jwt`, no custom header check in this file). The cron job
// authenticates by sending the project's service_role key as the
// Authorization Bearer token -- Supabase's own platform gateway verifies
// that JWT before this code ever runs. The service_role key is pulled from
// Supabase Vault by the cron job's SQL, never hard-coded anywhere.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY below are provided
// automatically by the Supabase Edge Function runtime for every function in
// this project -- nothing else to configure as a secret for this function.
//
// This file is intentionally self-contained (single-file, no local project
// imports) so it can be pasted directly into Supabase Dashboard -> Edge
// Functions -> Deploy a new function -> Via Editor. It implements the same
// fetch/dedupe/relevance algorithm as src/lib/automation/*.ts, which
// remains the source of truth for "Fetch Now" / "Fetch All Active Sources"
// in the Admin UI (Next.js/Node runtime) -- keep both in sync if the
// algorithm changes.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@5";

// ---------------------------------------------------------------------------
// Types (mirrors the relevant columns of src/lib/types/database.ts)
// ---------------------------------------------------------------------------

type NewsCategory = "Global Market" | "Indian Market" | "Top Company News" | "Analytical News";
type SourceType = "rss" | "website" | "other";
type SourcePriority = "high" | "medium" | "low";
type AutomationBatchTrigger = "scheduled" | "manual_all" | "manual_source";

interface NewsSource {
  id: string;
  source_name: string;
  website_url: string;
  feed_url: string | null;
  source_type: SourceType;
  active: boolean;
  default_category: NewsCategory | null;
  priority: SourcePriority;
  fetch_interval_minutes: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  articles_found_last_fetch: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Duplicate detection: URL canonicalization, content hashing, title
// similarity (Level 1 exact-duplicate + Level 2 possible-duplicate).
// ---------------------------------------------------------------------------

// Query params that identify tracking/campaign noise rather than the article
// itself. Stripped so "same article, different marketing link" collapses to
// one canonical URL (Level 1 duplicate detection).
const TRACKING_PARAM_PREFIXES = ["utm_", "fbclid", "gclid", "mc_", "icid", "ito", "ns_", "cmpid"];
const TRACKING_PARAM_EXACT = new Set(["ref", "source", "amp", "share", "spref"]);

function canonicalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  url.hash = "";
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  const keep = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAM_EXACT.has(lowerKey)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => lowerKey.startsWith(p))) continue;
    keep.append(key, value);
  }
  keep.sort();
  url.search = keep.toString();

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "") pathname = "/";
  url.pathname = pathname;

  return url.toString();
}

async function contentHash(title: string, canonicalUrl: string): Promise<string> {
  const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
  const data = new TextEncoder().encode(`${normalizedTitle}::${canonicalUrl}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with",
  "is", "are", "was", "were", "be", "as", "by", "from", "its", "it", "this", "that",
  "will", "has", "have", "had", "after", "over", "into", "amid", "amid", "up",
]);

function significantWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9%.\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

// Level 2 "possible duplicate" heuristic: Jaccard similarity of significant
// title words. Cheap, no external API calls, deliberately conservative --
// this only ever *flags* a candidate for human review, never deletes it.
function titleSimilarity(a: string, b: string): number {
  const setA = significantWords(a);
  const setB = significantWords(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const POSSIBLE_DUPLICATE_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Relevance scoring. Never rejects an article outright -- it only scores it
// so the News Inbox can sort/badge, and anything uncertain is labelled
// "needs_review" rather than being dropped.
// ---------------------------------------------------------------------------

const STRONG_KEYWORDS = [
  "solar", "solar pv", "photovoltaic", "pv module", "solar module", "solar cell",
  "solar cells", "wafer", "ingot", "topcon", "mono-perc", "monoperc", "hjt",
  "heterojunction", "back contact", "polysilicon", "solar manufacturing",
  "cell manufacturing", "module manufacturing", "solar capacity", "solar efficiency",
  "solar tariff", "solar import", "solar export", "solar policy", "solar project",
  "solar demand", "solar investment", "solar supply chain", "gw of solar",
  "gigawatt solar", "renewable energy", "clean energy manufacturing",
];

const SUPPORTING_KEYWORDS = [
  "production capacity", "manufacturing expansion", "manufacturing facility",
  "silver", "supply chain", "tariffs", "imports", "exports", "capacity expansion",
  "gw capacity", "mw capacity", "gigafactory", "production line", "green energy",
  "renewable", "clean energy", "energy transition", "ppa", "power purchase agreement",
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function countMatches(haystack: string, needles: string[]): number {
  let count = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) count++;
  }
  return count;
}

interface RelevanceResult {
  score: number;
  label: "high" | "medium" | "low" | "needs_review";
  matchedCompanyName: string | null;
}

function scoreRelevance(title: string, description: string, companyNames: string[]): RelevanceResult {
  const haystack = normalize(`${title} ${description}`);

  const strongMatches = countMatches(haystack, STRONG_KEYWORDS);
  const supportingMatches = countMatches(haystack, SUPPORTING_KEYWORDS);

  let matchedCompanyName: string | null = null;
  for (const name of companyNames) {
    const normalizedName = normalize(name);
    // Guard against 1-2 char company fragments matching everything.
    if (normalizedName.length < 3) continue;
    if (haystack.includes(normalizedName)) {
      matchedCompanyName = name;
      break;
    }
  }

  let score = strongMatches * 25 + supportingMatches * 10;
  if (matchedCompanyName) score += 35;
  score = Math.min(100, score);

  let label: RelevanceResult["label"];
  if (matchedCompanyName || strongMatches >= 1) {
    label = score >= 60 ? "high" : "medium";
  } else if (supportingMatches >= 2) {
    label = "medium";
  } else if (supportingMatches === 1) {
    label = "needs_review";
  } else {
    // No strong signal at all -- still surfaced in the Inbox (never silently
    // dropped), just flagged so the admin knows to give it a closer look.
    label = "needs_review";
  }

  return { score, label, matchedCompanyName };
}

// ---------------------------------------------------------------------------
// Feed fetching: RSS/Atom autodiscovery + fetch + parse. Only reads publicly
// served HTML/feeds -- no login, no CAPTCHA-solving, no anti-bot bypass.
// ---------------------------------------------------------------------------

interface FeedItem {
  title: string;
  link: string;
  guid: string | null;
  description: string | null;
  contentEncoded: string | null;
  author: string | null;
  publishedAt: string | null; // ISO 8601, or null if unparseable/absent
  imageUrl: string | null;
}

interface FeedFetchResult {
  ok: boolean;
  items: FeedItem[];
  error: string | null;
  resolvedFeedUrl: string | null;
}

const FETCH_TIMEOUT_MS = 15_000;
// Identifies the bot honestly in the User-Agent: this monitors public
// RSS/Atom feeds and public pages only, never bypasses paywalls, logins,
// CAPTCHAs, or robots restrictions.
const USER_AGENT = "MarketIntelligenceNewsBot/1.0 (+internal solar market intelligence source monitor)";

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Best-effort feed autodiscovery from a website's public HTML <head> (link
// rel="alternate") or common conventional feed paths.
async function discoverFeedUrl(websiteUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(websiteUrl);
    if (res.ok) {
      const html = await res.text();
      const linkTags = html.match(/<link\s+[^>]*>/gi) ?? [];
      for (const tag of linkTags) {
        if (!/rel=["']alternate["']/i.test(tag)) continue;
        if (!/type=["'](application\/rss\+xml|application\/atom\+xml|application\/xml)["']/i.test(tag)) {
          continue;
        }
        const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          try {
            return new URL(hrefMatch[1], websiteUrl).toString();
          } catch {
            // ignore malformed href, keep scanning
          }
        }
      }
    }
  } catch {
    // fall through to convention guesses
  }

  const base = websiteUrl.replace(/\/+$/, "");
  const guesses = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/feed/", "/rss/", "/index.xml"];
  for (const guess of guesses) {
    try {
      const res = await fetchWithTimeout(`${base}${guess}`);
      if (!res.ok) continue;
      const text = await res.text();
      if (/<rss[\s>]|<feed[\s>]/i.test(text)) return `${base}${guess}`;
    } catch {
      continue;
    }
  }

  return null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"].trim() || null;
  }
  return null;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function rssItemToFeedItem(item: Record<string, unknown>): FeedItem | null {
  const title = textOf(item.title);
  const link = textOf(item.link) ?? textOf((item as Record<string, unknown>).guid);
  if (!title || !link) return null;

  const enclosure = item.enclosure as Record<string, unknown> | undefined;
  const mediaContent = (item["media:content"] ?? item["media:thumbnail"]) as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | undefined;
  const mediaFirst = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;

  const imageUrl =
    (enclosure?.["@_url"] as string | undefined) ??
    (mediaFirst?.["@_url"] as string | undefined) ??
    null;

  return {
    title,
    link,
    guid: textOf(item.guid),
    description: stripHtml(textOf(item.description)),
    contentEncoded: stripHtml(textOf(item["content:encoded"])),
    author: textOf(item.author) ?? textOf(item["dc:creator"]),
    publishedAt: parseDate(textOf(item.pubDate) ?? textOf(item["dc:date"])),
    imageUrl,
  };
}

function atomEntryToFeedItem(entry: Record<string, unknown>): FeedItem | null {
  const title = textOf(entry.title);
  if (!title) return null;

  const links = asArray(entry.link as Record<string, unknown> | Record<string, unknown>[]);
  const alternate =
    links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  const link = (alternate?.["@_href"] as string | undefined) ?? textOf(entry.id);
  if (!link) return null;

  const author = entry.author as Record<string, unknown> | undefined;

  return {
    title,
    link,
    guid: textOf(entry.id),
    description: stripHtml(textOf(entry.summary)),
    contentEncoded: stripHtml(textOf(entry.content)),
    author: textOf(author?.name) ?? null,
    publishedAt: parseDate(textOf(entry.published) ?? textOf(entry.updated)),
    imageUrl: null,
  };
}

function parseFeed(xml: string): FeedItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;

  const rss = parsed.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    const items = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);
    return items
      .map(rssItemToFeedItem)
      .filter((i): i is FeedItem => i !== null);
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (feed?.entry) {
    const entries = asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[]);
    return entries
      .map(atomEntryToFeedItem)
      .filter((i): i is FeedItem => i !== null);
  }

  const rdf = parsed["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rdf?.item) {
    const items = asArray(rdf.item as Record<string, unknown> | Record<string, unknown>[]);
    return items
      .map(rssItemToFeedItem)
      .filter((i): i is FeedItem => i !== null);
  }

  return [];
}

// Fetches and parses a source's feed. If feedUrl is not provided, attempts
// autodiscovery from websiteUrl first. Never falls back to scraping HTML
// article listings -- if no feed can be found, returns a clear error instead
// of attempting anything that risks bypassing site protections.
async function fetchFeed(websiteUrl: string, feedUrl: string | null): Promise<FeedFetchResult> {
  let resolvedFeedUrl = feedUrl;

  if (!resolvedFeedUrl) {
    resolvedFeedUrl = await discoverFeedUrl(websiteUrl);
    if (!resolvedFeedUrl) {
      return {
        ok: false,
        items: [],
        error:
          "No RSS/Atom feed could be found for this source automatically. Add the feed URL manually in the source's settings.",
        resolvedFeedUrl: null,
      };
    }
  }

  try {
    const res = await fetchWithTimeout(resolvedFeedUrl);
    if (!res.ok) {
      return {
        ok: false,
        items: [],
        error: `Source returned HTTP ${res.status} ${res.statusText}.`,
        resolvedFeedUrl,
      };
    }
    const xml = await res.text();
    const items = parseFeed(xml);
    if (items.length === 0) {
      return {
        ok: false,
        items: [],
        error: "The feed responded but no articles could be read from it.",
        resolvedFeedUrl,
      };
    }
    return { ok: true, items, error: null, resolvedFeedUrl };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      items: [],
      error: isAbort ? "Timed out while checking this source." : "Could not reach this source.",
      resolvedFeedUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Orchestration: per-source fetch, canonical-URL dedupe, relevance scoring,
// possible-duplicate flagging, automation_runs logging. Same behavior as
// fetchAllActiveSources() in src/lib/automation/fetchSources.ts.
// ---------------------------------------------------------------------------

interface SourceFetchSummary {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  articlesFound: number;
  newArticles: number;
  duplicates: number;
  skipped: number;
  error: string | null;
}

interface BatchFetchSummary {
  batchId: string;
  sourcesChecked: number;
  sourcesSuccessful: number;
  sourcesFailed: number;
  articlesFound: number;
  newArticles: number;
  duplicates: number;
  skipped: number;
  perSource: SourceFetchSummary[];
}

interface CompanyLookup {
  companyNames: string[];
  companyIdByName: Map<string, string>;
}

async function loadCompanyLookup(supabase: SupabaseClient): Promise<CompanyLookup> {
  const { data: companies } = await supabase.from("companies").select("id,name");
  const companyNames = (companies ?? []).map((c) => c.name as string);
  const companyIdByName = new Map<string, string>();
  for (const c of companies ?? []) {
    companyIdByName.set((c.name as string).toLowerCase(), c.id as string);
  }
  return { companyNames, companyIdByName };
}

async function fetchOneSource(
  supabase: SupabaseClient,
  source: NewsSource,
  batchId: string,
  batchTrigger: AutomationBatchTrigger,
  lookup: CompanyLookup
): Promise<SourceFetchSummary> {
  const { data: runRow } = await supabase
    .from("automation_runs")
    .insert({ batch_id: batchId, batch_trigger: batchTrigger, source_id: source.id, status: "running" })
    .select("id")
    .single();

  const nowIso = new Date().toISOString();
  await supabase.from("news_sources").update({ last_checked_at: nowIso }).eq("id", source.id);

  const result = await fetchFeed(source.website_url, source.feed_url);

  if (!result.ok) {
    await supabase
      .from("news_sources")
      .update({ last_error: result.error, articles_found_last_fetch: 0 })
      .eq("id", source.id);

    if (runRow) {
      await supabase
        .from("automation_runs")
        .update({ completed_at: new Date().toISOString(), status: "failed", error_message: result.error })
        .eq("id", runRow.id);
    }

    return {
      sourceId: source.id,
      sourceName: source.source_name,
      ok: false,
      articlesFound: 0,
      newArticles: 0,
      duplicates: 0,
      skipped: 0,
      error: result.error,
    };
  }

  let newArticles = 0;
  let duplicates = 0;
  let skipped = 0;

  // Recently discovered candidates, used for cross-source "possible duplicate"
  // title-similarity checks (Level 2 duplicate detection).
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentCandidates } = await supabase
    .from("news_candidates")
    .select("id, article:scraped_articles(original_title)")
    .gte("created_at", since)
    .limit(500);

  type RecentCandidate = { id: string; article: { original_title: string } | null };
  const recent = (recentCandidates ?? []) as unknown as RecentCandidate[];

  for (const item of result.items) {
    const canonicalUrl = canonicalizeUrl(item.link);
    const hash = await contentHash(item.title, canonicalUrl);

    const { data: existing } = await supabase
      .from("scraped_articles")
      .select("id")
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();

    if (existing) {
      duplicates++;
      continue;
    }

    const description = item.description ?? item.contentEncoded ?? null;
    const relevance = scoreRelevance(item.title, description ?? "", lookup.companyNames);

    const { data: articleRow, error: articleError } = await supabase
      .from("scraped_articles")
      .insert({
        source_id: source.id,
        source_name: source.source_name,
        original_url: item.link,
        canonical_url: canonicalUrl,
        original_title: item.title,
        original_description: item.description,
        raw_content: item.contentEncoded,
        published_at: item.publishedAt,
        author: item.author,
        image_url: item.imageUrl,
        content_hash: hash,
      })
      .select("id")
      .single();

    // A unique-constraint violation lands here too (two overlapping runs
    // racing on the same canonical_url) -- counted as skipped, never
    // creates a duplicate scraped_articles/news_candidates row. This is
    // what makes the scheduled run idempotent under overlap/retry.
    if (articleError || !articleRow) {
      skipped++;
      continue;
    }

    let possibleDuplicateOf: string | null = null;
    for (const cand of recent) {
      if (!cand.article) continue;
      if (titleSimilarity(item.title, cand.article.original_title) >= POSSIBLE_DUPLICATE_THRESHOLD) {
        possibleDuplicateOf = cand.id;
        break;
      }
    }

    const suggestedCompanyId = relevance.matchedCompanyName
      ? lookup.companyIdByName.get(relevance.matchedCompanyName.toLowerCase()) ?? null
      : null;

    await supabase.from("news_candidates").insert({
      scraped_article_id: articleRow.id,
      source_id: source.id,
      status: relevance.label === "needs_review" ? "needs_review" : "new",
      relevance_label: relevance.label,
      relevance_score: relevance.score,
      suggested_category: source.default_category,
      suggested_company_id: suggestedCompanyId,
      possible_duplicate_of: possibleDuplicateOf,
      duplicate_note: possibleDuplicateOf
        ? "A recently discovered article has a very similar title -- this may be the same story."
        : null,
    });

    newArticles++;
  }

  await supabase
    .from("news_sources")
    .update({
      last_success_at: new Date().toISOString(),
      last_error: null,
      articles_found_last_fetch: result.items.length,
    })
    .eq("id", source.id);

  if (runRow) {
    await supabase
      .from("automation_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: "success",
        articles_found: result.items.length,
        new_articles: newArticles,
        duplicates,
        skipped_articles: skipped,
      })
      .eq("id", runRow.id);
  }

  return {
    sourceId: source.id,
    sourceName: source.source_name,
    ok: true,
    articlesFound: result.items.length,
    newArticles,
    duplicates,
    skipped,
    error: null,
  };
}

function aggregate(batchId: string, perSource: SourceFetchSummary[]): BatchFetchSummary {
  return {
    batchId,
    sourcesChecked: perSource.length,
    sourcesSuccessful: perSource.filter((s) => s.ok).length,
    sourcesFailed: perSource.filter((s) => !s.ok).length,
    articlesFound: perSource.reduce((sum, s) => sum + s.articlesFound, 0),
    newArticles: perSource.reduce((sum, s) => sum + s.newArticles, 0),
    duplicates: perSource.reduce((sum, s) => sum + s.duplicates, 0),
    skipped: perSource.reduce((sum, s) => sum + s.skipped, 0),
    perSource,
  };
}

// Checks every active source, sequentially (gentle on sources, bounded
// memory). One source failing never stops the rest.
async function fetchAllActiveSources(
  supabase: SupabaseClient,
  trigger: AutomationBatchTrigger = "scheduled"
): Promise<BatchFetchSummary> {
  const batchId = crypto.randomUUID();
  const { data: sources } = await supabase.from("news_sources").select("*").eq("active", true);
  const lookup = await loadCompanyLookup(supabase);

  const perSource: SourceFetchSummary[] = [];
  for (const source of (sources ?? []) as NewsSource[]) {
    try {
      perSource.push(await fetchOneSource(supabase, source, batchId, trigger, lookup));
    } catch (err) {
      perSource.push({
        sourceId: source.id,
        sourceName: source.source_name,
        ok: false,
        articlesFound: 0,
        newArticles: 0,
        duplicates: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : "Unexpected error while checking this source.",
      });
    }
  }

  return aggregate(batchId, perSource);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the function environment." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const summary = await fetchAllActiveSources(supabase, "scheduled");

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error while checking sources.";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
