import Link from "next/link";
import type { CompanyFull } from "@/lib/types/database";
import { displayOrNotDisclosed } from "@/lib/types/database";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function CapacityRow({
  label,
  current,
  planned,
}: {
  label: string;
  current: string | null | undefined;
  planned: string | null | undefined;
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2 pr-3 text-sm font-medium text-foreground">{label}</td>
      <td className="py-2 pr-3 text-sm text-foreground/90">{displayOrNotDisclosed(current)}</td>
      <td className="py-2 text-sm text-foreground/90">{displayOrNotDisclosed(planned)}</td>
    </tr>
  );
}

export function CompanyDetail({ company }: { company: CompanyFull }) {
  const quarters = company.financials.filter((f) => f.period_type === "quarter");
  const fiscalYears = company.financials.filter((f) => f.period_type === "fiscal_year").slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <div>
        <Link href="/companies" className="text-xs font-medium text-muted hover:text-foreground">
          ← Top Company Profiles
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{company.name}</h1>
          <Link
            href={`/?company=${company.slug}`}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Recent News
          </Link>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <Section title="Overview">
          <p className="text-sm leading-relaxed text-foreground/90">
            {company.overview ?? displayOrNotDisclosed(null)}
          </p>
        </Section>

        <Section title="Manufacturing Capacity">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Segment</th>
                <th className="pb-2 font-medium">Current</th>
                <th className="pb-2 font-medium">Planned</th>
              </tr>
            </thead>
            <tbody>
              <CapacityRow
                label="Module"
                current={company.capacity?.module_capacity}
                planned={company.capacity?.planned_module_capacity}
              />
              <CapacityRow
                label="Cell"
                current={company.capacity?.cell_capacity}
                planned={company.capacity?.planned_cell_capacity}
              />
              <CapacityRow
                label="Wafer/Ingot"
                current={company.capacity?.wafer_capacity}
                planned={company.capacity?.planned_wafer_capacity}
              />
            </tbody>
          </table>
        </Section>

        <Section title="Top Management">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Owner / Promoter", company.management?.owner_promoter],
              ["CEO / MD", company.management?.ceo_md],
              ["CTO", company.management?.cto],
              ["CFO", company.management?.cfo],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-1 text-sm text-foreground">{displayOrNotDisclosed(value)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Revenue — Recent Quarters">
          {quarters.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Quarter</th>
                  <th className="pb-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {quarters.map((q) => (
                  <tr key={q.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 text-sm font-medium text-foreground">
                      {q.period_label}
                    </td>
                    <td className="py-2 text-sm text-foreground/90">
                      {displayOrNotDisclosed(q.revenue_display)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">{displayOrNotDisclosed(null)}</p>
          )}
        </Section>

        <Section title="Revenue — Last 3 Financial Years">
          {fiscalYears.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Financial Year</th>
                  <th className="pb-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {fiscalYears.map((fy) => (
                  <tr key={fy.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 text-sm font-medium text-foreground">
                      {fy.period_label}
                    </td>
                    <td className="py-2 text-sm text-foreground/90">
                      {displayOrNotDisclosed(fy.revenue_display)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">{displayOrNotDisclosed(null)}</p>
          )}
        </Section>

        <Section title="Technology &amp; Products">
          {company.technologies.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">Technology</th>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Max Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {company.technologies.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-3 text-sm font-medium text-foreground">
                      {t.technology}
                    </td>
                    <td className="py-2 pr-3 text-sm text-foreground/90">{t.product}</td>
                    <td className="py-2 text-sm text-foreground/90">
                      {displayOrNotDisclosed(t.max_efficiency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">{displayOrNotDisclosed(null)}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
