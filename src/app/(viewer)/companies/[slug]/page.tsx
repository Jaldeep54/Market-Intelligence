import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanyFullBySlug } from "@/lib/data/companies";
import { CompanyDetail } from "@/components/viewer/CompanyDetail";
import { recordActivityAction } from "@/lib/actions/activity";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const company = await getCompanyFullBySlug(supabase, slug);

  if (!company) notFound();

  after(() => recordActivityAction("company_profile_visit"));

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <CompanyDetail company={company} />
    </main>
  );
}
