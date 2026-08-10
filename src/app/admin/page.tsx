import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function getCounts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [published, unpublished, companies] = await Promise.all([
    supabase.from("news").select("id", { count: "exact", head: true }).eq("published", true),
    supabase.from("news").select("id", { count: "exact", head: true }).eq("published", false),
    supabase.from("companies").select("id", { count: "exact", head: true }),
  ]);

  return {
    published: published.count ?? 0,
    unpublished: unpublished.count ?? 0,
    companies: companies.count ?? 0,
  };
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const counts = await getCounts(supabase);

  const cards = [
    { label: "Published articles", value: counts.published },
    { label: "Unpublished drafts", value: counts.unpublished },
    { label: "Tracked companies", value: counts.companies },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-5">
            <p className="text-2xl font-semibold text-foreground">{c.value}</p>
            <p className="mt-1 text-sm text-muted">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/news/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          + Add News
        </Link>
        <Link
          href="/admin/news"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
        >
          Manage News
        </Link>
        <Link
          href="/admin/companies"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
        >
          Manage Companies
        </Link>
      </div>
    </div>
  );
}
