import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCompanyFullById } from "@/lib/data/companies";
import { CompanyProfileForm } from "@/components/admin/CompanyProfileForm";
import { FinancialsManager } from "@/components/admin/FinancialsManager";
import { TechnologiesManager } from "@/components/admin/TechnologiesManager";

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const company = await getCompanyFullById(supabase, id);

  if (!company) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <Link href="/admin/companies" className="text-xs font-medium text-muted hover:text-foreground">
          ← Company Management
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-foreground">{company.name}</h1>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Company Profile
        </h2>
        <CompanyProfileForm company={company} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Financial Data
        </h2>
        <FinancialsManager companyId={company.id} financials={company.financials} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Technology Data
        </h2>
        <TechnologiesManager companyId={company.id} technologies={company.technologies} />
      </section>
    </div>
  );
}
