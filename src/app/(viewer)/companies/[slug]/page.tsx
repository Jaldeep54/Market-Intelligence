import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyFullBySlug } from "@/lib/data/companies";
import { CompanyDetail } from "@/components/viewer/CompanyDetail";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const company = await getCompanyFullBySlug(supabase, slug);

  if (!company) notFound();

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <CompanyDetail company={company} />
    </main>
  );
}
