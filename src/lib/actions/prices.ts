"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPriceCategories, getPriceProducts } from "@/lib/data/prices";
import {
  basePriceSchema,
  landingInputsSchema,
  parseNumberField,
  productNameSchema,
  weekHeaderSchema,
} from "@/lib/validation/prices";
import { calculateLandingInr, toChinaFobInr, toChinaFobUsd } from "@/lib/utils/priceCalculations";
import type { PriceProduct } from "@/lib/types/database";

export interface PriceFormState {
  error?: string;
}

export interface AddPriceProductState extends PriceFormState {
  product?: PriceProduct;
}

function slugifyProductName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product"
  );
}

// Lets an admin add a new product line item to a category (e.g. a new Wafer
// spec) the moment its price is first published, instead of requiring a
// migration. The slug is derived from the name and de-duplicated within the
// category (matching the (category_id, slug) unique constraint); the name
// itself is also rejected case-insensitively within the category so two
// products can't differ only by spelling/casing. display_order simply
// appends after every existing product in the category -- past weeks are
// unaffected since weekly_prices rows are keyed on (week_id, product_id) and
// this only ever inserts a new product, never touches existing rows.
export async function addPriceProductAction(categoryId: string, name: string): Promise<AddPriceProductState> {
  const parsed = productNameSchema.safeParse(name);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Product name is required" };
  }
  const trimmedName = parsed.data;

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("price_products")
    .select("name, slug, display_order")
    .eq("category_id", categoryId);
  if (fetchError) return { error: fetchError.message };

  const existingProducts = existing ?? [];
  const isDuplicateName = existingProducts.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
  if (isDuplicateName) {
    return { error: `"${trimmedName}" already exists in this category.` };
  }

  const baseSlug = slugifyProductName(trimmedName);
  const existingSlugs = new Set(existingProducts.map((p) => p.slug));
  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const nextDisplayOrder = existingProducts.reduce((max, p) => Math.max(max, p.display_order), 0) + 1;

  const { data: inserted, error: insertError } = await supabase
    .from("price_products")
    .insert({ category_id: categoryId, name: trimmedName, slug, display_order: nextDisplayOrder, active: true })
    .select("*")
    .single();
  if (insertError) {
    // A concurrent submission (e.g. a double-fired click) can race past the
    // isDuplicateName check above; the (category_id, slug) unique constraint
    // is the real backstop, so a 23505 here still means "duplicate name" to
    // the admin, not a raw DB error.
    if (insertError.code === "23505") {
      return { error: `"${trimmedName}" already exists in this category.` };
    }
    return { error: insertError.message };
  }
  if (!inserted) return { error: "Could not add the product." };

  revalidatePath("/admin/prices/new");
  revalidatePath("/admin/prices/[weekId]/edit", "page");
  revalidatePath("/admin/prices");
  revalidatePath("/prices");

  return { product: inserted as PriceProduct };
}

// Tells the remove-product confirmation dialog whether this product already
// carries saved weekly prices, so the admin sees an explicit warning before
// hiding one that has real historical data attached, instead of a generic
// prompt. Deliberately just one cheap existence check (limit 1) -- no need
// for a count or anything heavier here.
export async function productHasHistoryAction(productId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("weekly_prices").select("id").eq("product_id", productId).limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

// Soft delete only: price_products.id is referenced by historical
// weekly_prices rows, and this codebase never alters or loses a past week's
// data, so this flips `active` to false and nothing else -- it never deletes
// the row or touches weekly_prices. getPriceProducts() already filters on
// active = true, so a deactivated product simply stops appearing on the "Add
// Weekly Price" form (and everywhere else that lists active products) and
// is excluded from all future weeks, while its saved history keeps
// rendering wherever it's looked up directly by product_id (edit-week view,
// product history pages).
export async function deactivatePriceProductAction(productId: string): Promise<PriceFormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("price_products").update({ active: false }).eq("id", productId);
  if (error) return { error: error.message };

  revalidatePath("/admin/prices/new");
  revalidatePath("/admin/prices/[weekId]/edit", "page");
  revalidatePath("/admin/prices");
  revalidatePath("/prices");

  return {};
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
