// Deno port of src/lib/automation/fetchSources.ts -- same orchestration
// logic (per-source fetch, canonical-URL dedupe, relevance scoring,
// possible-duplicate flagging, automation_runs logging). Differences from
// the Next.js original, both purely runtime-driven, not behavioral:
//   - no `import { randomUUID } from "crypto"` (Node-only) -- uses the
//     global Web Crypto `crypto.randomUUID()`, available in Deno.
//   - `contentHash` from duplicate.ts is now async (Web Crypto), so its
//     call site here is awaited.
// Keep in sync with the Next.js copy if the fetch/dedupe/relevance
// algorithm changes -- this file is what the scheduled Edge Function runs,
// and src/lib/automation/fetchSources.ts is what "Fetch Now" / "Fetch All
// Active Sources" run from the Admin UI. Same algorithm, two runtimes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchFeed } from "./feed.ts";
import { canonicalizeUrl, contentHash, titleSimilarity, POSSIBLE_DUPLICATE_THRESHOLD } from "./duplicate.ts";
import { scoreRelevance } from "./relevance.ts";
import type { AutomationBatchTrigger, NewsSource } from "./types.ts";

export interface SourceFetchSummary {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  articlesFound: number;
  newArticles: number;
  duplicates: number;
  skipped: number;
  error: string | null;
}

export interface BatchFetchSummary {
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
  // title-similarity checks (Level 2 duplicate detection, spec section 26).
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
// memory). One source failing never stops the rest (spec sections 6, 48).
export async function fetchAllActiveSources(
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
