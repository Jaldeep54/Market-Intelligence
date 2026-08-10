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

export const NOT_DISCLOSED = "Not publicly disclosed";

export function displayOrNotDisclosed(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : NOT_DISCLOSED;
}
