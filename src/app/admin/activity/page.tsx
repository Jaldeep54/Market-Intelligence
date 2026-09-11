import { createClient } from "@/lib/supabase/server";
import { getViewerActivity } from "@/lib/data/activity";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function AdminActivityPage() {
  const supabase = await createClient();
  const rows = await getViewerActivity(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">User Activity</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} registered viewer{rows.length === 1 ? "" : "s"}. Running totals since each
          feature started tracking usage -- news swipes, Price Trends page visits, and Company
          Profile page visits. Sorted by total activity, most active first.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Registered</th>
              <th className="px-4 py-3 text-right font-medium">News Swipes</th>
              <th className="px-4 py-3 text-right font-medium">Price Trends Visits</th>
              <th className="px-4 py-3 text-right font-medium">Company Profile Visits</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.news_swipes + r.price_trends_visits + r.company_profile_visits;
              return (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-foreground">{r.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        r.status === "approved"
                          ? "bg-accent/10 text-accent"
                          : r.status === "rejected"
                            ? "bg-danger/10 text-danger"
                            : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{r.news_swipes}</td>
                  <td className="px-4 py-3 text-right text-foreground">{r.price_trends_visits}</td>
                  <td className="px-4 py-3 text-right text-foreground">{r.company_profile_visits}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
