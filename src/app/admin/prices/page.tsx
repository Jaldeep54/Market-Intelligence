import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPriceProducts, getPriceWeeks, getWeeklyPriceCounts } from "@/lib/data/prices";

export default async function AdminPricesPage() {
  const supabase = await createClient();
  const [weeks, products, priceCounts] = await Promise.all([
    getPriceWeeks(supabase),
    getPriceProducts(supabase),
    getWeeklyPriceCounts(supabase),
  ]);
  const totalProducts = products.length;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Price Trends</h1>
          <p className="mt-1 text-sm text-muted">
            Enter this week&apos;s solar-market prices every Thursday. Past weeks are never changed by a
            new entry.
          </p>
        </div>
        <Link
          href="/admin/prices/new"
          className="min-h-[44px] rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          + Add Weekly Price
        </Link>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          Historical Price Management
        </h2>

        {weeks.length === 0 ? (
          <p className="text-sm text-muted">No weekly prices yet. Add the first week to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Week</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">RMB→USD</th>
                  <th className="py-2 pr-4">RMB→INR</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => {
                  const entered = priceCounts.get(week.id) ?? 0;
                  const complete = entered >= totalProducts;
                  return (
                  <tr key={week.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      W{week.week_number} · {week.year}
                    </td>
                    <td className="py-2 pr-4 text-muted">
                      {new Date(`${week.price_date}T00:00:00`).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-2 pr-4 text-muted">{week.rmb_to_usd}</td>
                    <td className="py-2 pr-4 text-muted">{week.rmb_to_inr}</td>
                    <td className="py-2 pr-4">
                      <span className={complete ? "text-accent" : "text-muted"}>
                        {complete ? "Complete" : `Partial (${entered}/${totalProducts})`}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <Link
                        href={`/admin/prices/${week.id}/edit`}
                        className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
