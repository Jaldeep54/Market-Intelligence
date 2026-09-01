import { createClient } from "@/lib/supabase/server";
import { getAllCategoriesWithHistory } from "@/lib/data/prices";
import { PriceTrendsDashboard } from "@/components/viewer/PriceTrendsDashboard";

export default async function PricesPage() {
  const supabase = await createClient();
  const categories = await getAllCategoriesWithHistory(supabase);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <PriceTrendsDashboard categories={categories} />
    </main>
  );
}
