import Link from "next/link";
import type { Company, CompanyCapacity } from "@/lib/types/database";
import { displayOrNotDisclosed } from "@/lib/types/database";
import { truncateWords } from "@/lib/utils/text";

export function CompanyProfileCard({
  company,
}: {
  company: Company & { capacity: CompanyCapacity | null };
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {company.name}
      </h2>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted">Module</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {displayOrNotDisclosed(company.capacity?.module_capacity)}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted">Cell</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {displayOrNotDisclosed(company.capacity?.cell_capacity)}
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted">Wafer/Ingot</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">
            {displayOrNotDisclosed(company.capacity?.wafer_capacity)}
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-sm leading-relaxed text-foreground/90">
        {company.overview ? truncateWords(company.overview, 40) : displayOrNotDisclosed(null)}
      </p>

      <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-4">
        <Link
          href={`/companies/${company.slug}`}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          View Full Profile
        </Link>
        <Link
          href={`/?company=${company.slug}`}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
        >
          Recent News
        </Link>
      </div>
    </article>
  );
}
