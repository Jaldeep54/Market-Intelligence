"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PRODUCTS, TECHNOLOGIES, type PeriodType, type Product, type Technology } from "@/lib/types/database";

export interface ActionState {
  error?: string;
  success?: boolean;
}

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const trimmed = typeof v === "string" ? v.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateCompanyProfileAction(
  companyId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const { error: companyError } = await supabase
    .from("companies")
    .update({ overview: str(formData, "overview") })
    .eq("id", companyId);
  if (companyError) return { error: companyError.message };

  const { error: capacityError } = await supabase.from("company_capacities").upsert({
    company_id: companyId,
    module_capacity: str(formData, "module_capacity"),
    planned_module_capacity: str(formData, "planned_module_capacity"),
    cell_capacity: str(formData, "cell_capacity"),
    planned_cell_capacity: str(formData, "planned_cell_capacity"),
    wafer_capacity: str(formData, "wafer_capacity"),
    planned_wafer_capacity: str(formData, "planned_wafer_capacity"),
  });
  if (capacityError) return { error: capacityError.message };

  const { error: managementError } = await supabase.from("company_management").upsert({
    company_id: companyId,
    owner_promoter: str(formData, "owner_promoter"),
    ceo_md: str(formData, "ceo_md"),
    cto: str(formData, "cto"),
    cfo: str(formData, "cfo"),
  });
  if (managementError) return { error: managementError.message };

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/companies");
  return { success: true };
}

export async function addFinancialAction(
  companyId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const periodType = String(formData.get("period_type") ?? "");
  const periodLabel = str(formData, "period_label");
  if (periodType !== "quarter" && periodType !== "fiscal_year") {
    return { error: "Select a valid period type" };
  }
  if (!periodLabel) return { error: "Period label is required" };

  const supabase = await createClient();
  const { error } = await supabase.from("company_financials").insert({
    company_id: companyId,
    period_type: periodType as PeriodType,
    period_label: periodLabel,
    revenue_display: str(formData, "revenue_display"),
    sort_order: Number(formData.get("sort_order") ?? 0) || 0,
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/companies");
  return { success: true };
}

export async function deleteFinancialAction(companyId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("company_financials").delete().eq("id", id);
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/companies");
}

export async function addTechnologyAction(
  companyId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const technology = String(formData.get("technology") ?? "");
  const product = String(formData.get("product") ?? "");
  if (!TECHNOLOGIES.includes(technology as Technology)) return { error: "Select a technology" };
  if (!PRODUCTS.includes(product as Product)) return { error: "Select a product" };

  const supabase = await createClient();
  const { error } = await supabase.from("company_technologies").insert({
    company_id: companyId,
    technology: technology as Technology,
    product: product as Product,
    max_efficiency: str(formData, "max_efficiency"),
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/companies");
  return { success: true };
}

export async function deleteTechnologyAction(companyId: string, id: string) {
  const supabase = await createClient();
  await supabase.from("company_technologies").delete().eq("id", id);
  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/companies");
}
