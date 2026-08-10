import { createClient } from "@/lib/supabase/server";
import { getCompaniesWithCapacity } from "@/lib/data/companies";
import { CompanyProfileFeed } from "@/components/viewer/CompanyProfileFeed";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const companies = await getCompaniesWithCapacity(supabase);

  return (
    <main className="flex flex-1 flex-col">
      <div className="px-4 pt-4 sm:px-8">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Top Company Profiles
        </h1>
      </div>
      <CompanyProfileFeed companies={companies} />
    </main>
  );
}
