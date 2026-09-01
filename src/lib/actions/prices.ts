"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPriceCategories, getPriceProducts } from "@/lib/data/prices";
import { basePriceSchema, landingInputsSchema, parseNumberField, weekHeaderSchema } from "@/lib/validation/prices";
import { calculateLandingInr, toChinaFobInr, toChinaFobUsd } from "@/lib/utils/priceCalculations";

export interface PriceFormState {
  error?: string;
}

// Handles both creating a brand-new week and editing an existing one --
// pass `editingWeekId` for edit mode. Every product's china_fob_usd/inr and
// (for Wafer/Cell) india_landing_inr are computed here, once, from exactly
// the values submitted on this form, and stored -- never recalculated later
// from a different week's rates or a since-changed import input. Because
// each row is looked up by (week_id, product_id), saving here can only ever
// touch this one week's rows, regardless of how many other weeks exist.
export async function saveWeeklyPricesAction(
  editingWeekId: string | null,
  _prevState: PriceFormState,
  formData: FormData
): Promise<PriceFormState> {
  const headerParsed = weekHeaderSchema.safeParse({
    week_number: formData.get("week_number"),
    price_date: formData.get("price_date"),
    rmb_to_usd: formData.get("rmb_to_usd"),
    rmb_to_inr: formData.get("rmb_to_inr"),
  });
  if (!headerParsed.success) {
    return { error: headerParsed.error.issues[0]?.message ?? "Invalid week details" };
  }
  const { week_number: weekNumber, price_date: priceDate, rmb_to_usd: rmbToUsd, rmb_to_inr: rmbToInr } =
    headerParsed.data;
  const year = Number(priceDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 2000) {
    return { error: "Enter a valid price date" };
  }

  const supabase = await createClient();

  if (!editingWeekId) {
    const { data: existing } = await supabase
      .from("price_weeks")
      .select("id")
      .eq("year", year)
      .eq("week_number", weekNumber)
      .maybeSingle();
    if (existing) {
      return {
        error: `Week ${weekNumber} of ${year} already exists. Edit it from Historical Price Management instead of adding it again.`,
      };
    }
  }

  const weekPayload = { year, week_number: weekNumber, price_date: priceDate, rmb_to_usd: rmbToUsd, rmb_to_inr: rmbToInr };

  let weekId = editingWeekId;
  if (editingWeekId) {
    const { error } = await supabase.from("price_weeks").update(weekPayload).eq("id", editingWeekId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase.from("price_weeks").insert(weekPayload).select("id").single();
    if (error || !data) return { error: error?.message ?? "Could not save the week." };
    weekId = data.id;
  }

  const [categories, products] = await Promise.all([getPriceCategories(supabase), getPriceProducts(supabase)]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const rows: Record<string, unknown>[] = [];
  for (const product of products) {
    const category = categoryById.get(product.category_id);
    if (!category) continue;

    const rawBase = parseNumberField(formData, `price_${product.id}`);
    if (rawBase === null) continue; // product not part of this submission (shouldn't happen, but never invent data)

    const baseParsed = basePriceSchema.safeParse(rawBase);
    if (!baseParsed.success) {
      return { error: `${product.name}: ${baseParsed.error.issues[0]?.message ?? "invalid price"}` };
    }
    const base = baseParsed.data;
    const fobUsd = toChinaFobUsd(base, rmbToUsd);
    const fobInr = toChinaFobInr(base, rmbToInr);

    if (category.has_landing_price) {
      const landingParsed = landingInputsSchema.safeParse({
        freight: parseNumberField(formData, `landing_freight_${product.id}`) ?? 0,
        insurance_pct: parseNumberField(formData, `landing_insurance_${product.id}`) ?? 0,
        duty_pct: parseNumberField(formData, `landing_duty_${product.id}`) ?? 0,
        port_cha: parseNumberField(formData, `landing_portcha_${product.id}`) ?? 0,
        inland: parseNumberField(formData, `landing_inland_${product.id}`) ?? 0,
      });
      if (!landingParsed.success) {
        return { error: `${product.name} import inputs: ${landingParsed.error.issues[0]?.message ?? "invalid"}` };
      }
      const inputs = landingParsed.data;
      const landingInr = calculateLandingInr(category.slug as "wafer" | "cell", fobInr, inputs);

      rows.push({
        week_id: weekId,
        product_id: product.id,
        base_price_rmb: base,
        china_fob_usd: fobUsd,
        china_fob_inr: fobInr,
        landing_freight: inputs.freight,
        landing_insurance_pct: inputs.insurance_pct,
        landing_duty_pct: inputs.duty_pct,
        landing_port_cha: inputs.port_cha,
        landing_inland: inputs.inland,
        india_landing_inr: landingInr,
      });
    } else {
      rows.push({
        week_id: weekId,
        product_id: product.id,
        base_price_rmb: base,
        china_fob_usd: fobUsd,
        china_fob_inr: fobInr,
      });
    }
  }

  if (rows.length === 0) {
    return { error: "Enter at least one product price before saving." };
  }

  const { error: upsertError } = await supabase
    .from("weekly_prices")
    .upsert(rows, { onConflict: "week_id,product_id" });
  if (upsertError) return { error: upsertError.message };

  revalidatePath("/admin/prices");
  revalidatePath("/prices");
  redirect("/admin/prices");
}
