import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanies } from "@/lib/data/companies";
import { getNewsById } from "@/lib/data/news";
import { updateNewsAction } from "@/lib/actions/news";
import { NewsForm } from "@/components/admin/NewsForm";

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [companies, news] = await Promise.all([getCompanies(supabase), getNewsById(supabase, id)]);

  if (!news) notFound();

  const boundAction = updateNewsAction.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Edit News</h1>
      <NewsForm
        action={boundAction}
        companies={companies}
        initial={news}
        submitLabel="Save changes"
      />
    </div>
  );
}
