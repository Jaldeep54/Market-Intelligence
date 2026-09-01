// Hand-written types mirroring the SQL schema in supabase/migrations.
// Kept in sync manually since this project intentionally avoids extra
// codegen tooling (see spec: no unnecessary packages).

export type Role = "admin" | "viewer";

export type NewsCategory =
  | "Global Market"
  | "Indian Market"
  | "Top Company News"
  | "Analytical News";

export const NEWS_CATEGORIES: NewsCategory[] = [
  "Global Market",
  "Indian Market",
  "Top Company News",
  "Analytical News",
];

export type Technology = "Mono-PERC" | "TOPCon" | "HJT" | "Back Contact" | "Other";
export const TECHNOLOGIES: Technology[] = ["Mono-PERC", "TOPCon", "HJT", "Back Contact", "Other"];

export type Product = "Module" | "Cell" | "Wafer/Ingot";
export const PRODUCTS: Product[] = ["Module", "Cell", "Wafer/Ingot"];

export type PeriodType = "quarter" | "fiscal_year";

export interface Profile {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  overview: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyCapacity {
  company_id: string;
  module_capacity: string | null;
  planned_module_capacity: string | null;
  cell_capacity: string | null;
  planned_cell_capacity: string | null;
  wafer_capacity: string | null;
  planned_wafer_capacity: string | null;
  updated_at: string;
}

export interface CompanyManagement {
  company_id: string;
  owner_promoter: string | null;
  ceo_md: string | null;
  cto: string | null;
  cfo: string | null;
  updated_at: string;
}

export interface CompanyFinancial {
  id: string;
  company_id: string;
  period_type: PeriodType;
  period_label: string;
  revenue_display: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyTechnology {
  id: string;
  company_id: string;
  technology: Technology;
  product: Product;
  max_efficiency: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsRow {
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
}

export interface Tag {
  id: string;
  name: string;
  created_at: string;
}

export interface NewsTag {
  news_id: string;
  tag_id: string;
}

// Composed shapes used throughout the UI (news joined with company + tags).
export interface NewsWithRelations extends NewsRow {
  company: Pick<Company, "id" | "name" | "slug"> | null;
  tags: Tag[];
}

export interface CompanyFull extends Company {
  capacity: CompanyCapacity | null;
  management: CompanyManagement | null;
  financials: CompanyFinancial[];
  technologies: CompanyTechnology[];
}

// ---------------------------------------------------------------------------
// Automated news collection / review / Gemini-preparation pipeline.
// Feeds the existing `news` table above -- never replaces it.
// ---------------------------------------------------------------------------

export type SourceType = "rss" | "website" | "other";
export const SOURCE_TYPES: SourceType[] = ["rss", "website", "other"];

export type SourcePriority = "high" | "medium" | "low";
export const SOURCE_PRIORITIES: SourcePriority[] = ["high", "medium", "low"];

export type CandidateStatus =
  | "new"
  | "needs_review"
  | "prepared"
  | "approved"
  | "published"
  | "rejected"
  | "duplicate";

export const CANDIDATE_STATUSES: CandidateStatus[] = [
  "new",
  "needs_review",
  "prepared",
  "approved",
  "published",
  "rejected",
  "duplicate",
];

export type RelevanceLabel = "high" | "medium" | "low" | "needs_review";
export const RELEVANCE_LABELS: RelevanceLabel[] = ["high", "medium", "low", "needs_review"];

export type FetchStatus = "ok" | "partial" | "error";

export type AutomationRunStatus = "running" | "success" | "failed";
export type AutomationBatchTrigger = "scheduled" | "manual_all" | "manual_source";

export interface NewsSource {
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

export interface ScrapedArticle {
  id: string;
  source_id: string | null;
  source_name: string;
  original_url: string;
  canonical_url: string;
  original_title: string;
  original_description: string | null;
  raw_content: string | null;
  published_at: string | null;
  discovered_at: string;
  author: string | null;
  image_url: string | null;
  content_hash: string;
  fetch_status: FetchStatus;
  fetch_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsCandidate {
  id: string;
  scraped_article_id: string;
  source_id: string | null;
  status: CandidateStatus;
  relevance_label: RelevanceLabel;
  relevance_score: number;
  suggested_category: NewsCategory | null;
  suggested_company_id: string | null;
  possible_duplicate_of: string | null;
  duplicate_note: string | null;
  prepared_title: string | null;
  prepared_description: string | null;
  prepared_category: NewsCategory | null;
  prepared_company_id: string | null;
  prepared_news_date: string | null;
  prepared_tags: string[];
  gemini_last_run_at: string | null;
  gemini_error: string | null;
  published_news_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

// Candidate joined with its raw scraped article + source name, as used
// throughout the News Inbox UI.
export interface NewsCandidateWithArticle extends NewsCandidate {
  article: ScrapedArticle;
  source_name: string | null;
  suggested_company: Pick<Company, "id" | "name"> | null;
  prepared_company: Pick<Company, "id" | "name"> | null;
  possible_duplicate: { id: string; prepared_title: string | null; article: { original_title: string } } | null;
}

export interface AutomationRun {
  id: string;
  batch_id: string;
  batch_trigger: AutomationBatchTrigger;
  source_id: string | null;
  started_at: string;
  completed_at: string | null;
  status: AutomationRunStatus;
  articles_found: number;
  new_articles: number;
  duplicates: number;
  skipped_articles: number;
  error_message: string | null;
  created_at: string;
}

export interface AiProcessingLog {
  id: string;
  candidate_id: string | null;
  model: string;
  status: "success" | "error";
  error_message: string | null;
  requested_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Price Trends: normalized weekly solar-market pricing (Polysilicon, Wafer,
// Cell, Module, Glass). One product + one week = one weekly_prices row.
// ---------------------------------------------------------------------------

export type PriceCategorySlug = "polysilicon" | "wafer" | "cell" | "module" | "glass";

export type Currency = "RMB" | "USD" | "INR";
export const CURRENCIES: Currency[] = ["RMB", "USD", "INR"];

export interface PriceCategory {
  id: string;
  name: string;
  slug: string;
  unit: string;
  has_landing_price: boolean;
  display_order: number;
  created_at: string;
}

export interface PriceProduct {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceWeek {
  id: string;
  year: number;
  week_number: number;
  price_date: string;
  rmb_to_usd: number;
  rmb_to_inr: number;
  created_at: string;
  updated_at: string;
}

// landing_* / india_landing_inr are null for Polysilicon/Module/Glass rows,
// and a permanent snapshot (never recalculated with later inputs) for
// Wafer/Cell rows -- see the weekly_prices table comment in the migration.
export interface WeeklyPrice {
  id: string;
  week_id: string;
  product_id: string;
  base_price_rmb: number;
  china_fob_usd: number;
  china_fob_inr: number;
  landing_freight: number | null;
  landing_insurance_pct: number | null;
  landing_duty_pct: number | null;
  landing_port_cha: number | null;
  landing_inland: number | null;
  india_landing_inr: number | null;
  created_at: string;
  updated_at: string;
}

// Per-product landing-cost inputs as edited on the admin "Add Weekly Price"
// form -- shape mirrors the landing_* snapshot columns above minus the ids.
export interface LandingInputs {
  freight: number;
  insurance_pct: number;
  duty_pct: number;
  port_cha: number;
  inland: number;
}

export interface WeeklyPriceWithWeek extends WeeklyPrice {
  week: PriceWeek;
}

export interface PriceProductWithLatest extends PriceProduct {
  latest: WeeklyPriceWithWeek | null;
  previous: WeeklyPriceWithWeek | null;
}

export interface PriceCategoryWithProducts extends PriceCategory {
  products: PriceProductWithLatest[];
}

// One product's full price history, joined with each week's date for
// charting (X = week/date, Y = selected currency + unit).
export interface ProductPriceHistory {
  product: PriceProduct;
  category: PriceCategory;
  history: WeeklyPriceWithWeek[];
}

export const NOT_DISCLOSED = "Not publicly disclosed";

export function displayOrNotDisclosed(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : NOT_DISCLOSED;
}
