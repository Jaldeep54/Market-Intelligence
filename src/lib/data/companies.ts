import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Company,
  CompanyCapacity,
  CompanyFinancial,
  CompanyFull,
  CompanyManagement,
  CompanyTechnology,
} from "@/lib/types/database";

export async function getCompanyNameBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<string | null> {
  const { data } = await supabase.from("companies").select("name").eq("slug", slug).maybeSingle();
  return data?.name ?? null;
}

export async function getCompanies(supabase: SupabaseClient): Promise<Company[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCompaniesWithCapacity(
  supabase: SupabaseClient
): Promise<(Company & { capacity: CompanyCapacity | null })[]> {
  const { data, error } = await supabase
    .from("companies")
    .select("*, capacity:company_capacities(*)")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (Company & { capacity: CompanyCapacity | null })[];
}

async function assembleCompanyFull(
  supabase: SupabaseClient,
  company: Company
): Promise<CompanyFull> {
  const [{ data: capacity }, { data: management }, { data: financials }, { data: technologies }] =
    await Promise.all([
      supabase.from("company_capacities").select("*").eq("company_id", company.id).maybeSingle(),
      supabase.from("company_management").select("*").eq("company_id", company.id).maybeSingle(),
      supabase
        .from("company_financials")
        .select("*")
        .eq("company_id", company.id)
        .order("period_type", { ascending: true })
        .order("sort_order", { ascending: false }),
      supabase
        .from("company_technologies")
        .select("*")
        .eq("company_id", company.id)
        .order("technology", { ascending: true }),
    ]);

  return {
    ...company,
    capacity: (capacity as CompanyCapacity) ?? null,
    management: (management as CompanyManagement) ?? null,
    financials: (financials as CompanyFinancial[]) ?? [],
    technologies: (technologies as CompanyTechnology[]) ?? [],
  };
}

export async function getCompanyFullBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<CompanyFull | null> {
  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !company) return null;
  return assembleCompanyFull(supabase, company as Company);
}

export async function getCompanyFullById(
  supabase: SupabaseClient,
  id: string
): Promise<CompanyFull | null> {
  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !company) return null;
  return assembleCompanyFull(supabase, company as Company);
}
