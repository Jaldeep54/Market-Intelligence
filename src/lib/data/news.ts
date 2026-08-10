import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsCategory, NewsWithRelations } from "@/lib/types/database";

export type DateMode = "today" | "yesterday" | "custom_date" | "custom_range";

export interface FeedFilterParams {
  category?: NewsCategory;
  dateMode?: DateMode;
  date?: string;
  from?: string;
  to?: string;
  companySlug?: string;
}

// Internal-tool scale: fetch a generous but bounded window rather than
// building out full pagination.
const FEED_LIMIT = 300;

// Business dates for "Today"/"Yesterday" are anchored to India Standard
// Time regardless of the server's own timezone (Vercel runs UTC), since the
// tracked market is India-centric and UTC would drift a calendar day off
// from IST during the ~00:00-05:30 IST window.
const REPORTING_TIME_ZONE = "Asia/Kolkata";

function isoDateInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function resolveDateRange(params: FeedFilterParams): { from?: string; to?: string } {
  const now = new Date();
  switch (params.dateMode) {
    case "today": {
      const today = isoDateInTimeZone(now, REPORTING_TIME_ZONE);
      return { from: today, to: today };
    }
    case "yesterday": {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const d = isoDateInTimeZone(yesterday, REPORTING_TIME_ZONE);
      return { from: d, to: d };
    }
    case "custom_date":
      return params.date ? { from: params.date, to: params.date } : {};
    case "custom_range":
      return { from: params.from, to: params.to };
    default:
      return {};
  }
}

interface RawNewsRow {
  id: string;
  title: string;
  description: string;
  category: NewsCategory;
  company_id: string | null;
  news_date: string;
  source_url: string;
  published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  company: { id: string; name: string; slug: string } | null;
  tags: { tag: { id: string; name: string; created_at: string } | null }[] | null;
}

function mapRow(row: RawNewsRow): NewsWithRelations {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    company_id: row.company_id,
    news_date: row.news_date,
    source_url: row.source_url,
    published: row.published,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company: row.company,
    tags: (row.tags ?? [])
      .map((t) => t.tag)
      .filter((t): t is { id: string; name: string; created_at: string } => !!t),
  };
}

const NEWS_SELECT =
  "*, company:companies(id,name,slug), tags:news_tags(tag:tags(id,name,created_at))";

export async function getFeedNews(
  supabase: SupabaseClient,
  params: FeedFilterParams
): Promise<NewsWithRelations[]> {
  // Company filtering is a separate, exclusive route: it is never combined
  // with date/category filters (enforced in the UI and mirrored here).
  if (params.companySlug) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", params.companySlug)
      .single();

    if (!company) return [];

    const { data, error } = await supabase
      .from("news")
      .select(NEWS_SELECT)
      .eq("published", true)
      .eq("company_id", company.id)
      .order("news_date", { ascending: false })
      .limit(FEED_LIMIT);

    if (error) throw error;
    return ((data ?? []) as unknown as RawNewsRow[]).map(mapRow);
  }

  let query = supabase
    .from("news")
    .select(NEWS_SELECT)
    .eq("published", true)
    .order("news_date", { ascending: false })
    .limit(FEED_LIMIT);

  if (params.category) {
    query = query.eq("category", params.category);
  }

  const { from, to } = resolveDateRange(params);
  if (from) query = query.gte("news_date", from);
  if (to) query = query.lte("news_date", to);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as RawNewsRow[]).map(mapRow);
}

export interface AdminNewsListParams {
  search?: string;
  category?: NewsCategory;
  status?: "published" | "unpublished";
}

export async function getAdminNewsList(
  supabase: SupabaseClient,
  params: AdminNewsListParams
): Promise<NewsWithRelations[]> {
  let query = supabase
    .from("news")
    .select(NEWS_SELECT)
    .order("news_date", { ascending: false })
    .limit(FEED_LIMIT);

  if (params.category) query = query.eq("category", params.category);
  if (params.status === "published") query = query.eq("published", true);
  if (params.status === "unpublished") query = query.eq("published", false);
  if (params.search) query = query.ilike("title", `%${params.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as RawNewsRow[]).map(mapRow);
}

export async function getNewsById(
  supabase: SupabaseClient,
  id: string
): Promise<NewsWithRelations | null> {
  const { data, error } = await supabase.from("news").select(NEWS_SELECT).eq("id", id).single();
  if (error) return null;
  return mapRow(data as unknown as RawNewsRow);
}
