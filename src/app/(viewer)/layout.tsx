import { createClient } from "@/lib/supabase/server";
import { getCompanies } from "@/lib/data/companies";
import { NavBar } from "@/components/viewer/NavBar";

export default async function ViewerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const companies = await getCompanies(supabase);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <NavBar companies={companies} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
