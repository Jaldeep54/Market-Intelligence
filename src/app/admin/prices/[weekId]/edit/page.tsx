import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPriceCategories, getPriceProducts, getPriceWeekById, getWeeklyPricesForWeek } from "@/lib/data/prices";
import { PriceWeekForm } from "@/components/admin/PriceWeekForm";

export default async function EditWeeklyPricePage({ params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  const supabase = await createClient();
  const week = await getPriceWeekById(supabase, weekId);
  if (!week) notFound();

  const [categories, products, existingPricesMap] = await Promise.all([
    getPriceCategories(supabase),
    getPriceProducts(supabase),
    getWeeklyPricesForWeek(supabase, weekId),
  ]);

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
        <h1 className="mt-2 text-lg font-semibold text-foreground">
          Edit Week {week.week_number}, {week.year}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Changes here only affect this week&apos;s record. Every other week&apos;s saved prices and
          calculated India Landing Prices stay exactly as they were.
        </p>
      </div>

      <PriceWeekForm
        categories={categoriesWithProducts}
        defaultLandingInputs={{}}
        editingWeek={week}
        existingPrices={Object.fromEntries(existingPricesMap)}
      />
    </div>
  );
}
