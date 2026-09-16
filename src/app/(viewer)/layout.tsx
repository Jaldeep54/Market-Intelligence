import { createClient } from "@/lib/supabase/server";
import { getCompanies } from "@/lib/data/companies";
import { NavBar } from "@/components/viewer/NavBar";
import { LanguageProvider } from "@/components/viewer/LanguageContext";

export default async function ViewerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const companies = await getCompanies(supabase);

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-1 flex-col">
        <NavBar companies={companies} />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </LanguageProvider>
  );
}
