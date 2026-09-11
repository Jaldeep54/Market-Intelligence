import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllCategoriesWithHistory } from "@/lib/data/prices";
import { PriceTrendsDashboard } from "@/components/viewer/PriceTrendsDashboard";
import { recordActivityAction } from "@/lib/actions/activity";

export default async function PricesPage() {
  const supabase = await createClient();
  const categories = await getAllCategoriesWithHistory(supabase);

  // Deferred until after the response is sent -- never adds latency to
  // this page's render.
  after(() => recordActivityAction("price_trends_visit"));

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <PriceTrendsDashboard categories={categories} />
    </main>
  );
}
