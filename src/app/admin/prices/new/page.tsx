import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLatestLandingInputsByProduct, getPriceCategories, getPriceProducts } from "@/lib/data/prices";
import { PriceWeekForm } from "@/components/admin/PriceWeekForm";
import type { LandingInputs } from "@/lib/types/database";

export default async function NewWeeklyPricePage() {
  const supabase = await createClient();
  const [categories, products] = await Promise.all([getPriceCategories(supabase), getPriceProducts(supabase)]);

  const landingProductIds = products
    .filter((p) => categories.find((c) => c.id === p.category_id)?.has_landing_price)
    .map((p) => p.id);
  const defaultsMap = await getLatestLandingInputsByProduct(supabase, landingProductIds);
  const defaultLandingInputs: Record<string, LandingInputs> = Object.fromEntries(defaultsMap);

  const categoriesWithProducts = categories.map((category) => ({
    ...category,
    products: products.filter((p) => p.category_id === category.id),
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/admin/prices" className="text-xs font-medium text-muted hover:text-foreground">
          ← Price Trends
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-foreground">Add Weekly Price</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the week number, price date, this week&apos;s exchange rates, and every product price. India
          Landing Price for Wafer and Cell is calculated automatically from the import inputs below.
        </p>
      </div>

      <PriceWeekForm categories={categoriesWithProducts} defaultLandingInputs={defaultLandingInputs} />
    </div>
  );
}
