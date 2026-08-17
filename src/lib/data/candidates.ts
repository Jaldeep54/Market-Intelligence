import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CandidateStatus,
  NewsCandidateWithArticle,
  RelevanceLabel,
} from "@/lib/types/database";

const CANDIDATE_SELECT = `
  *,
  article:scraped_articles(*),
  source:news_sources(id, source_name, priority),
  suggested_company:companies!news_candidates_suggested_company_id_fkey(id,name),
  prepared_company:companies!news_candidates_prepared_company_id_fkey(id,name),
  possible_duplicate:news_candidates!news_candidates_possible_duplicate_of_fkey(
    id, prepared_title, article:scraped_articles(original_title)
  )
`;

interface RawCandidateRow {
  [key: string]: unknown;
  article: NewsCandidateWithArticle["article"];
  source: { id: string; source_name: string; priority: string } | null;
  suggested_company: { id: string; name: string } | null;
  prepared_company: { id: string; name: string } | null;
  possible_duplicate: NewsCandidateWithArticle["possible_duplicate"];
}

function mapRow(row: RawCandidateRow): NewsCandidateWithArticle {
  return {
    ...(row as unknown as NewsCandidateWithArticle),
    source_name: row.source?.source_name ?? row.article?.source_name ?? null,
    suggested_company: row.suggested_company ?? null,
    prepared_company: row.prepared_company ?? null,
    possible_duplicate: row.possible_duplicate ?? null,
  };
}

export interface InboxFilterParams {
  status?: CandidateStatus;
  relevance?: RelevanceLabel;
  sourceId?: string;
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
  return ((data ?? []) as unknown as RawCandidateRow[]).map(mapRow);
}

export async function getCandidateById(
  supabase: SupabaseClient,
  id: string
): Promise<NewsCandidateWithArticle | null> {
  const { data, error } = await supabase.from("news_candidates").select(CANDIDATE_SELECT).eq("id", id).single();
  if (error || !data) return null;
  return mapRow(data as unknown as RawCandidateRow);
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
