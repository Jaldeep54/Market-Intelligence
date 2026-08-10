import { createClient } from "@/lib/supabase/server";
import { getCompanies } from "@/lib/data/companies";
import { createNewsAction } from "@/lib/actions/news";
import { NewsForm } from "@/components/admin/NewsForm";

export default async function NewNewsPage() {
  const supabase = await createClient();
  const companies = await getCompanies(supabase);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Add News</h1>
      <NewsForm action={createNewsAction} companies={companies} submitLabel="Create article" />
    </div>
  );
}
