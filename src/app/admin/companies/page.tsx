import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCompanies } from "@/lib/data/companies";

export default async function AdminCompaniesPage() {
  const supabase = await createClient();
  const companies = await getCompanies(supabase);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Company Management</h1>
      <p className="text-sm text-muted">
        Edit overview, manufacturing capacity, management, revenue and technology data for each
        tracked company.
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        <ul className="divide-y divide-border">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <Link
                href={`/admin/companies/${c.id}`}
                className="text-xs font-medium text-accent hover:underline"
              >
                Manage →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
