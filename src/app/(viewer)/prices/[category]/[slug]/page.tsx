import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProductPriceHistory } from "@/lib/data/prices";
import { ProductPriceDetail } from "@/components/viewer/ProductPriceDetail";

export default async function ProductPricePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const supabase = await createClient();
  const result = await getProductPriceHistory(supabase, category, slug);

  if (!result) notFound();

  return (
    <main className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
      <Link href="/prices" className="mb-4 text-xs font-medium text-muted hover:text-foreground">
        ← Price Trends
      </Link>
      <ProductPriceDetail category={result.category} product={result.product} history={result.history} />
    </main>
  );
}
