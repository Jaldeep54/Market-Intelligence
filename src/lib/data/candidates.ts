import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CandidateStatus,
  NewsCandidateWithArticle,
  RelevanceLabel,
} from "@/lib/types/database";

// "possible_duplicate" is resolved via a separate query (see
// loadPossibleDuplicates below), not embedded here. news_candidates has a
// self-referencing FK (possible_duplicate_of -> news_candidates.id), and
// PostgREST's schema-cache relationship discovery does not reliably surface
// a table's FK to itself for the `!hint` embed syntax -- confirmed via
// production logs (PGRST200 "Could not find a relationship between
// 'news_candidates' and 'news_candidates'") even with the constraint
// present under the expected name and a fresh schema-cache reload. Every
// other embed below is a normal FK to a *different* table and is unaffected.
const CANDIDATE_SELECT = `
  *,
  article:scraped_articles(*),
  source:news_sources(id, source_name, priority),
  suggested_company:companies!news_candidates_suggested_company_id_fkey(id,name),
  prepared_company:companies!news_candidates_prepared_company_id_fkey(id,name)
`;

type PossibleDuplicate = NonNullable<NewsCandidateWithArticle["possible_duplicate"]>;

interface RawCandidateRow {
  [key: string]: unknown;
  possible_duplicate_of: string | null;
  prepared_news_date: string | null;
  created_at: string;
  article: NewsCandidateWithArticle["article"];
  source: { id: string; source_name: string; priority: string } | null;
  suggested_company: { id: string; name: string } | null;
  prepared_company: { id: string; name: string } | null;
}

// The date used for "latest first" ordering and the date filter: prefer the
// prepared news date (the date the admin will actually publish under), fall
// back to the original article's published date, then to when we discovered
// it -- a fallback across joined tables that PostgREST can't order/filter on
// directly, so this is applied in JS after fetch.
export function effectiveCandidateDate(candidate: NewsCandidateWithArticle): string | null {
  return candidate.prepared_news_date ?? candidate.article.published_at ?? candidate.created_at ?? null;
}

// Fetches possible-duplicate summaries (id, prepared_title, article title)
// for the given candidate ids in one batched query -- never one query per
// row, and skipped entirely when there's nothing to look up.
async function loadPossibleDuplicates(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, PossibleDuplicate>> {
  const map = new Map<string, PossibleDuplicate>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("news_candidates")
    .select("id, prepared_title, article:scraped_articles(original_title)")
    .in("id", ids);

  if (error || !data) return map;

  for (const row of data as unknown as PossibleDuplicate[]) {
    map.set(row.id, row);
  }
  return map;
}

function mapRow(row: RawCandidateRow, duplicates: Map<string, PossibleDuplicate>): NewsCandidateWithArticle {
  return {
    ...(row as unknown as NewsCandidateWithArticle),
    source_name: row.source?.source_name ?? row.article?.source_name ?? null,
    suggested_company: row.suggested_company ?? null,
    prepared_company: row.prepared_company ?? null,
    possible_duplicate: row.possible_duplicate_of ? duplicates.get(row.possible_duplicate_of) ?? null : null,
  };
}

export interface InboxFilterParams {
  status?: CandidateStatus;
  relevance?: RelevanceLabel;
  sourceId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const INBOX_LIMIT = 300;

export async function getInboxCandidates(
  supabase: SupabaseClient,
  params: InboxFilterParams
): Promise<NewsCandidateWithArticle[]> {
  let query = supabase
    .from("news_candidates")
    .select(CANDIDATE_SELECT)
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);

  if (params.status) query = query.eq("status", params.status);
  if (params.relevance) query = query.eq("relevance_label", params.relevance);
  if (params.sourceId) query = query.eq("source_id", params.sourceId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawCandidateRow[];
  const duplicateIds = Array.from(
    new Set(rows.map((r) => r.possible_duplicate_of).filter((id): id is string => Boolean(id)))
  );
  const duplicates = await loadPossibleDuplicates(supabase, duplicateIds);

  let candidates = rows.map((row) => mapRow(row, duplicates));

  if (params.dateFrom || params.dateTo) {
    candidates = candidates.filter((c) => {
      const effective = effectiveCandidateDate(c);
      if (!effective) return false;
      const effectiveDay = effective.slice(0, 10);
      if (params.dateFrom && effectiveDay < params.dateFrom) return false;
      if (params.dateTo && effectiveDay > params.dateTo) return false;
      return true;
    });
  }

  candidates.sort((a, b) => {
    const da = effectiveCandidateDate(a);
    const db = effectiveCandidateDate(b);
    return new Date(db ?? 0).getTime() - new Date(da ?? 0).getTime();
  });

  return candidates;
}

export async function getCandidateById(
  supabase: SupabaseClient,
  id: string
): Promise<NewsCandidateWithArticle | null> {
  const { data, error } = await supabase.from("news_candidates").select(CANDIDATE_SELECT).eq("id", id).single();
  if (error || !data) return null;

  const row = data as unknown as RawCandidateRow;
  const duplicates = await loadPossibleDuplicates(
    supabase,
    row.possible_duplicate_of ? [row.possible_duplicate_of] : []
  );

  return mapRow(row, duplicates);
}

export interface InboxCounts {
  new: number;
  needs_review: number;
  high_relevance: number;
  possible_duplicate: number;
  prepared: number;
  approved: number;
  rejected: number;
}

const ACTIONABLE_STATUSES = ["new", "needs_review", "prepared"];

export async function getInboxCounts(supabase: SupabaseClient): Promise<InboxCounts> {
  const [newCount, needsReviewCount, highRelevanceCount, possibleDuplicateCount, preparedCount, approvedCount, rejectedCount] =
    await Promise.all([
      supabase.from("news_candidates").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("news_candidates").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
      supabase
        .from("news_candidates")
        .select("id", { count: "exact", head: true })
        .eq("relevance_label", "high")
        .in("status", ACTIONABLE_STATUSES),
      supabase
        .from("news_candidates")
        .select("id", { count: "exact", head: true })
        .not("possible_duplicate_of", "is", null)
        .in("status", ACTIONABLE_STATUSES),
      supabase.from("news_candidates").select("id", { count: "exact", head: true }).eq("status", "prepared"),
      supabase.from("news_candidates").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("news_candidates").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

  return {
    new: newCount.count ?? 0,
    needs_review: needsReviewCount.count ?? 0,
    high_relevance: highRelevanceCount.count ?? 0,
    possible_duplicate: possibleDuplicateCount.count ?? 0,
    prepared: preparedCount.count ?? 0,
    approved: approvedCount.count ?? 0,
    rejected: rejectedCount.count ?? 0,
  };
}
