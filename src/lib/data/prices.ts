import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LandingInputs,
  PriceCategory,
  PriceCategoryWithProducts,
  PriceProduct,
  PriceProductWithLatest,
  PriceWeek,
  ProductPriceHistory,
  WeeklyPriceWithWeek,
} from "@/lib/types/database";

export async function getPriceCategories(supabase: SupabaseClient): Promise<PriceCategory[]> {
  const { data, error } = await supabase
    .from("price_categories")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPriceProducts(supabase: SupabaseClient): Promise<PriceProduct[]> {
  const { data, error } = await supabase
    .from("price_products")
    .select("*")
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Every category with its active products, each carrying its latest and
// (if any) previous weekly price for the viewer dashboard's price cards and
// week-over-week change. Supabase/PostgREST has no built-in "latest N per
// group" query, so this fetches all weekly_prices (joined with its week) and
// groups client-side -- fine at this feature's scale (dozens of products x
// one new row per product per week).
export async function getPriceCategoriesWithLatest(
  supabase: SupabaseClient
): Promise<PriceCategoryWithProducts[]> {
  const [categories, products, allPrices] = await Promise.all([
    getPriceCategories(supabase),
    getPriceProducts(supabase),
    getAllWeeklyPricesWithWeek(supabase),
  ]);

  const byProduct = new Map<string, WeeklyPriceWithWeek[]>();
  for (const row of allPrices) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }

  const productsWithLatest: PriceProductWithLatest[] = products.map((product) => {
    const rows = byProduct.get(product.id) ?? [];
    return { ...product, latest: rows[0] ?? null, previous: rows[1] ?? null };
  });

  return categories.map((category) => ({
    ...category,
    products: productsWithLatest
      .filter((p) => p.category_id === category.id)
      .sort((a, b) => a.display_order - b.display_order),
  }));
}

async function getAllWeeklyPricesWithWeek(supabase: SupabaseClient): Promise<WeeklyPriceWithWeek[]> {
  const { data, error } = await supabase
    .from("weekly_prices")
    .select("*, week:price_weeks(*)")
    .order("price_date", { ascending: false, referencedTable: "price_weeks" });
  if (error) throw error;
  return (data ?? []) as unknown as WeeklyPriceWithWeek[];
}

export async function getProductPriceHistory(
  supabase: SupabaseClient,
  categorySlug: string,
  productSlug: string
): Promise<ProductPriceHistory | null> {
  const { data: category, error: categoryError } = await supabase
    .from("price_categories")
    .select("*")
    .eq("slug", categorySlug)
    .maybeSingle();
  if (categoryError || !category) return null;

  const { data: product, error: productError } = await supabase
    .from("price_products")
    .select("*")
    .eq("category_id", category.id)
    .eq("slug", productSlug)
    .maybeSingle();
  if (productError || !product) return null;

  const { data: history, error: historyError } = await supabase
    .from("weekly_prices")
    .select("*, week:price_weeks(*)")
    .eq("product_id", product.id)
    .order("price_date", { ascending: true, referencedTable: "price_weeks" });
  if (historyError) throw historyError;

  return {
    product: product as PriceProduct,
    category: category as PriceCategory,
    history: (history ?? []) as unknown as WeeklyPriceWithWeek[],
  };
}

// Full history for every active product in a category, for the category-level
// "Price Trends" multi-select comparison chart.
export async function getCategoryHistories(
  supabase: SupabaseClient,
  categorySlug: string
): Promise<{ category: PriceCategory; products: { product: PriceProduct; history: WeeklyPriceWithWeek[] }[] } | null> {
  const { data: category, error: categoryError } = await supabase
    .from("price_categories")
    .select("*")
    .eq("slug", categorySlug)
    .maybeSingle();
  if (categoryError || !category) return null;

  const { data: products, error: productsError } = await supabase
    .from("price_products")
    .select("*")
    .eq("category_id", category.id)
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (productsError) throw productsError;

  const { data: allHistory, error: historyError } = await supabase
    .from("weekly_prices")
    .select("*, week:price_weeks(*)")
    .in("product_id", (products ?? []).map((p) => p.id))
    .order("price_date", { ascending: true, referencedTable: "price_weeks" });
  if (historyError) throw historyError;

  const byProduct = new Map<string, WeeklyPriceWithWeek[]>();
  for (const row of (allHistory ?? []) as unknown as WeeklyPriceWithWeek[]) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }

  return {
    category: category as PriceCategory,
    products: (products ?? []).map((product) => ({
      product: product as PriceProduct,
      history: byProduct.get(product.id) ?? [],
    })),
  };
}

// Every category, every active product, and each product's full price
// history (ascending by date) in one shot -- used by the viewer dashboard so
// it can render latest-price cards, week-over-week change, and the
// multi-product comparison charts entirely from data already on the page,
// with no further round trips as the admin adds new weeks.
export async function getAllCategoriesWithHistory(supabase: SupabaseClient): Promise<
  { category: PriceCategory; products: { product: PriceProduct; history: WeeklyPriceWithWeek[] }[] }[]
> {
  const [categories, products, allPrices] = await Promise.all([
    getPriceCategories(supabase),
    getPriceProducts(supabase),
    getAllWeeklyPricesWithWeek(supabase),
  ]);

  const byProduct = new Map<string, WeeklyPriceWithWeek[]>();
  for (const row of allPrices) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  // allPrices is ordered newest-first (for getPriceCategoriesWithLatest); the
  // chart needs ascending order, so reverse each product's list once here.
  for (const list of byProduct.values()) list.reverse();

  return categories.map((category) => ({
    category,
    products: products
      .filter((p) => p.category_id === category.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map((product) => ({ product, history: byProduct.get(product.id) ?? [] })),
  }));
}

export async function getPriceWeeks(supabase: SupabaseClient): Promise<PriceWeek[]> {
  const { data, error } = await supabase
    .from("price_weeks")
    .select("*")
    .order("price_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// How many of the active products have a price entered for each week --
// shown on the Historical Price Management table so the admin can see at a
// glance whether a week is fully entered or still partial.
export async function getWeeklyPriceCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("weekly_prices").select("week_id");
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.week_id, (counts.get(row.week_id) ?? 0) + 1);
  }
  return counts;
}

export async function getPriceWeekById(supabase: SupabaseClient, id: string): Promise<PriceWeek | null> {
  const { data, error } = await supabase.from("price_weeks").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getWeeklyPricesForWeek(
  supabase: SupabaseClient,
  weekId: string
): Promise<Map<string, WeeklyPriceWithWeek>> {
  const { data, error } = await supabase
    .from("weekly_prices")
    .select("*, week:price_weeks(*)")
    .eq("week_id", weekId);
  if (error) throw error;
  const map = new Map<string, WeeklyPriceWithWeek>();
  for (const row of (data ?? []) as unknown as WeeklyPriceWithWeek[]) {
    map.set(row.product_id, row);
  }
  return map;
}

// Prefills the "Import & Landing Cost Inputs" section of the Add Weekly
// Price form with whatever was used most recently, so the admin only has to
// change a value when an assumption actually changes -- never affects
// already-saved weeks, which each keep their own snapshot regardless.
export async function getLatestLandingInputsByProduct(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, LandingInputs>> {
  if (productIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("weekly_prices")
    .select("product_id, landing_freight, landing_insurance_pct, landing_duty_pct, landing_port_cha, landing_inland, week:price_weeks(price_date)")
    .in("product_id", productIds)
    .not("landing_freight", "is", null)
    .order("price_date", { ascending: false, referencedTable: "price_weeks" });
  if (error) throw error;

  const map = new Map<string, LandingInputs>();
  for (const row of data ?? []) {
    if (map.has(row.product_id)) continue;
    map.set(row.product_id, {
      freight: Number(row.landing_freight),
      insurance_pct: Number(row.landing_insurance_pct),
      duty_pct: Number(row.landing_duty_pct),
      port_cha: Number(row.landing_port_cha),
      inland: Number(row.landing_inland),
    });
  }
  return map;
}
