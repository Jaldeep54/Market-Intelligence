// Scheduled news-source check, invoked every 2 hours by Supabase pg_cron
// (via pg_net) -- see supabase/migrations/20260101000007_supabase_cron_dispatch.sql.
// Never publishes anything: it only writes to news_sources / scraped_articles
// / news_candidates / automation_runs / ai_processing_logs, exactly like
// "Fetch All Active Sources" in the Admin UI. Each newly discovered
// candidate is also auto-prepared with Gemini here, sequentially, right
// after it's inserted -- mirroring src/lib/automation/candidatePrepare.ts --
// so the Admin News View has a ready draft without a manual click. This
// never overwrites a human edit: only just-inserted candidates (which by
// construction have no prepared_title and no reviewed_by yet) are
// auto-prepared. The admin's manual "Prepare with Gemini" button in the app
// is unaffected and still works as a regenerate/retry option.
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
// this project. GEMINI_API_KEY *must* be set as a secret on this function
// (Supabase Dashboard -> Edge Functions -> fetch-sources -> Secrets) for
// auto-prepare to run -- it is a separate secret store from Vercel's env
// vars, so setting GEMINI_API_KEY for the Next.js app does not also cover
// this function. GEMINI_MODEL is optional and defaults the same way the
// Next.js app does. If GEMINI_API_KEY is missing, candidates are still
// discovered normally; they just aren't auto-prepared (each attempt logs an
// "error" row to ai_processing_logs, same as any other Gemini failure).
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
  exclude_url_patterns: string[];
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
// Gemini auto-prepare -- mirrors src/lib/ai/gemini.ts (prepareNewsWithGemini)
// and src/lib/automation/candidatePrepare.ts (runGeminiPrepare). Ported by
// hand rather than imported (this file has no local project imports), so
// keep the prompt wording, word limit, retry count, and error classification
// in sync if either side changes. Calls the Gemini REST API directly via
// fetch instead of the @google/genai SDK used by the Next.js app -- that
// SDK's Node-oriented build isn't guaranteed to run under this Edge
// Function's Deno runtime, and the REST call below is exactly what the SDK
// does internally.
// ---------------------------------------------------------------------------

const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const GEMINI_MAX_DESCRIPTION_WORDS = 70;
const GEMINI_MAX_ATTEMPTS = 2;
const NEWS_CATEGORY_VALUES: NewsCategory[] = [
  "Global Market",
  "Indian Market",
  "Top Company News",
  "Analytical News",
];

interface GeminiPromptInput {
  sourceName: string;
  originalTitle: string;
  originalDescription: string | null;
  rawContent: string | null;
  publishedAt: string | null;
  sourceUrl: string;
  companyNames: string[];
}

interface GeminiPrepareOutput {
  title: string;
  description: string;
  category: NewsCategory;
  companyName: string | null;
  newsDate: string;
  tags: string[];
}

type GeminiPrepareResult =
  | { ok: true; data: GeminiPrepareOutput; model: string }
  | { ok: false; message: string; model: string };

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function resolveGeminiModel(): string {
  return Deno.env.get("GEMINI_MODEL")?.trim() || GEMINI_DEFAULT_MODEL;
}

function geminiFallbackNewsDate(publishedAt: string | null): string {
  const source = publishedAt ? new Date(publishedAt) : new Date();
  if (Number.isNaN(source.getTime())) return new Date().toISOString().slice(0, 10);
  return source.toISOString().slice(0, 10);
}

// Shared wording with src/lib/ai/gemini.ts's describeWordLimitInstruction().
function describeWordLimitInstruction(retryWordCount: number | null): string {
  const base =
    'STRICT MAXIMUM of 70 words -- never exceed 70 words under any circumstances. Aim for approximately 60-70 words when the article provides enough information. Retain the most important facts, developments, companies, figures, and implications. Do not invent or add information that is not present in the source. Do not use unnecessary introductory phrases such as "This article discusses...", "According to the article...", or "The report highlights...". Write in a professional tone suitable for an internal market intelligence briefing.';
  if (!retryWordCount) return base;
  return `${base} Your previous attempt was ${retryWordCount} words, which exceeds the limit -- rewrite it so it is 70 words or fewer.`;
}

function buildGeminiPrompt(input: GeminiPromptInput, retryWordCount: number | null): string {
  const contentExcerpt = (input.rawContent ?? input.originalDescription ?? "").slice(0, 6000);

  return `You are preparing a solar-industry market intelligence brief for a CTO-level executive dashboard.

Source: ${input.sourceName}
Original headline: ${input.originalTitle}
Published: ${input.publishedAt ?? "unknown"}
Original URL: ${input.sourceUrl}

Article excerpt/description:
"""
${contentExcerpt || "(no additional content available -- use the headline and description only)"}
"""

Tracked companies (choose one only if the article is clearly about it, otherwise use null -- never invent a company that isn't in this list):
${input.companyNames.length > 0 ? input.companyNames.map((n) => `- ${n}`).join("\n") : "(none configured)"}

Return a JSON object with exactly these fields:
- "title": a concise, professional headline suitable for a CTO-level dashboard. Avoid sensational language.
- "description": ${describeWordLimitInstruction(retryWordCount)}
- "category": exactly one of "Global Market", "Indian Market", "Top Company News", "Analytical News".
- "company_name": the exact name of one tracked company from the list above if the article is clearly about it, otherwise null.
- "news_date": the article's publication date as YYYY-MM-DD (use ${geminiFallbackNewsDate(input.publishedAt)} if the date is unclear).
- "tags": 2 to 4 short, useful lowercase tags, no hashtags.

Return only the JSON object.`;
}

// Mirrors classifyError() in src/lib/ai/gemini.ts, adapted to a plain HTTP
// status + response body (there's no SDK error object here).
function classifyGeminiError(status: number | null, message: string, model: string): string {
  const lower = message.toLowerCase();

  if (
    status === 404 ||
    (lower.includes("model") &&
      (lower.includes("not found") || lower.includes("not_found") || lower.includes("no longer available")))
  ) {
    return `The configured Gemini model ("${model}") is unavailable. Ask the project owner to update GEMINI_MODEL.`;
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid") ||
    lower.includes("permission_denied")
  ) {
    return "Gemini rejected the configured API key. Ask the project owner to check GEMINI_API_KEY.";
  }
  if (lower.includes("quota")) {
    return "Gemini free-tier quota has been reached. Please try again later or change the configured model.";
  }
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("rate limit")) {
    return "Gemini is temporarily rate-limited. Please wait a moment and try again.";
  }
  return "Gemini could not prepare this article. Please try again.";
}

interface ValidatedGeminiOutput {
  title: string;
  description: string;
  category: string;
  company_name: string | null;
  news_date: string;
  tags: string[];
}

// Defense in depth, same as geminiOutputSchema (zod) in src/lib/ai/gemini.ts,
// just hand-written since this file has no dependency on zod.
function validateGeminiOutput(raw: unknown): ValidatedGeminiOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  const category = typeof obj.category === "string" ? obj.category : "";
  const companyName =
    obj.company_name === null ? null : typeof obj.company_name === "string" ? obj.company_name.trim() : undefined;
  const newsDate = typeof obj.news_date === "string" ? obj.news_date.trim() : "";
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 6)
    : null;

  if (!title || title.length > 300) return null;
  if (!description || description.length > 1200) return null;
  if (!NEWS_CATEGORY_VALUES.includes(category as NewsCategory)) return null;
  if (companyName === undefined || (companyName !== null && companyName.length === 0)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newsDate)) return null;
  if (!tags || tags.length === 0) return null;

  return { title, description, category, company_name: companyName, news_date: newsDate, tags };
}

async function callGeminiJson(
  apiKey: string,
  model: string,
  prompt: string,
  logLabel: string
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    });
  } catch (err) {
    console.error(`[Gemini diagnostic] ${logLabel} network error:`, err);
    return { ok: false, message: "Gemini could not be reached. Please try again." };
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    console.error(`[Gemini diagnostic] ${logLabel} HTTP error:`, {
      status: response.status,
      body: bodyText.slice(0, 500),
      model,
    });
    return { ok: false, message: classifyGeminiError(response.status, bodyText, model) };
  }

  const json = await response.json().catch(() => null);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { ok: false, message: "Gemini returned an empty response. Please try again." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "Gemini's response could not be understood. Please try again." };
  }

  return { ok: true, data: parsed };
}

async function prepareNewsWithGemini(input: GeminiPromptInput): Promise<GeminiPrepareResult> {
  const model = resolveGeminiModel();
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    return { ok: false, message: "Gemini is not configured yet. Ask the project owner to set GEMINI_API_KEY.", model };
  }

  let retryWordCount: number | null = null;
  let lastFailureMessage = "Gemini could not prepare this article. Please try again.";

  for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt++) {
    const result = await callGeminiJson(apiKey, model, buildGeminiPrompt(input, retryWordCount), "prepareNewsWithGemini (edge)");
    if (!result.ok) return { ok: false, message: result.message, model };

    const validated = validateGeminiOutput(result.data);
    if (!validated) {
      return { ok: false, message: "Gemini's response did not match the required format. Please try again.", model };
    }

    const words = countWords(validated.description);
    if (words > GEMINI_MAX_DESCRIPTION_WORDS) {
      retryWordCount = words;
      lastFailureMessage = "Gemini could not summarize this article within the 70-word limit. Please try again.";
      continue;
    }

    const matchedCompany = validated.company_name
      ? input.companyNames.find((n) => n.toLowerCase() === validated.company_name!.toLowerCase()) ?? null
      : null;

    return {
      ok: true,
      model,
      data: {
        title: validated.title,
        description: validated.description,
        category: validated.category as NewsCategory,
        companyName: matchedCompany,
        newsDate: validated.news_date,
        tags: validated.tags,
      },
    };
  }

  return { ok: false, message: lastFailureMessage, model };
}

// Mirrors runGeminiPrepare() in src/lib/automation/candidatePrepare.ts:
// same ai_processing_logs row and same news_candidates update on success or
// failure. `requestedBy` is always null here (this function only ever runs
// automatically, never from an admin click).
async function runGeminiPrepare(
  supabase: SupabaseClient,
  candidateId: string,
  article: Omit<GeminiPromptInput, "companyNames">,
  lookup: CompanyLookup,
  requestedBy: string | null,
  currentStatus: string
): Promise<void> {
  const result = await prepareNewsWithGemini({ ...article, companyNames: lookup.companyNames });

  await supabase.from("ai_processing_logs").insert({
    candidate_id: candidateId,
    model: result.model,
    status: result.ok ? "success" : "error",
    error_message: result.ok ? null : result.message,
    requested_by: requestedBy,
  });

  if (!result.ok) {
    await supabase.from("news_candidates").update({ gemini_error: result.message }).eq("id", candidateId);
    return;
  }

  const matchedCompanyId = result.data.companyName
    ? lookup.companyIdByName.get(result.data.companyName.toLowerCase()) ?? null
    : null;

  const nextStatus = currentStatus === "published" || currentStatus === "rejected" ? currentStatus : "prepared";

  await supabase
    .from("news_candidates")
    .update({
      prepared_title: result.data.title,
      prepared_description: result.data.description,
      prepared_category: result.data.category,
      prepared_company_id: matchedCompanyId,
      prepared_news_date: result.data.newsDate,
      prepared_tags: result.data.tags,
      gemini_last_run_at: new Date().toISOString(),
      gemini_error: null,
      status: nextStatus,
      reviewed_by: requestedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
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

  const excludePatterns = source.exclude_url_patterns ?? [];

  for (const item of result.items) {
    if (excludePatterns.some((pattern) => item.link.includes(pattern))) {
      skipped++;
      continue;
    }

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

    const candidateStatus = relevance.label === "needs_review" ? "needs_review" : "new";

    const { data: candidateRow } = await supabase
      .from("news_candidates")
      .insert({
        scraped_article_id: articleRow.id,
        source_id: source.id,
        status: candidateStatus,
        relevance_label: relevance.label,
        relevance_score: relevance.score,
        suggested_category: source.default_category,
        suggested_company_id: suggestedCompanyId,
        possible_duplicate_of: possibleDuplicateOf,
        duplicate_note: possibleDuplicateOf
          ? "A recently discovered article has a very similar title -- this may be the same story."
          : null,
      })
      .select("id")
      .single();

    // Auto-prepare with Gemini right at ingestion (see the Gemini
    // auto-prepare section above), sequentially and awaited to respect
    // rate limits -- same as the Node fetch engine. If GEMINI_API_KEY isn't
    // set as a secret on this function, this logs a "missing_key"-style
    // error to ai_processing_logs per candidate rather than silently
    // skipping, exactly like the Node path behaves without that env var.
    if (candidateRow) {
      await runGeminiPrepare(
        supabase,
        candidateRow.id,
        {
          sourceName: source.source_name,
          originalTitle: item.title,
          originalDescription: description,
          rawContent: item.contentEncoded ?? null,
          publishedAt: item.publishedAt,
          sourceUrl: item.link,
        },
        lookup,
        null,
        candidateStatus
      );
    }

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
