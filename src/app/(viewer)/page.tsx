import { createClient } from "@/lib/supabase/server";
import { getFeedNews, type DateMode } from "@/lib/data/news";
import { getCompanyNameBySlug } from "@/lib/data/companies";
import { NewsFeed } from "@/components/viewer/NewsFeed";
import type { NewsCategory } from "@/lib/types/database";

function describeFilters(sp: Record<string, string | undefined>): string {
  if (sp.company) return "Company News";
  const parts: string[] = [];
  if (sp.date_mode === "today") parts.push("Today");
  else if (sp.date_mode === "yesterday") parts.push("Yesterday");
  else if (sp.date_mode === "custom_date" && sp.date) parts.push(sp.date);
  else if (sp.date_mode === "custom_range") parts.push(`${sp.from ?? "…"} – ${sp.to ?? "…"}`);
  if (sp.category) parts.push(sp.category);
  return parts.length > 0 ? parts.join(" · ") : "Latest";
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const sp: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const supabase = await createClient();
  const news = await getFeedNews(supabase, {
    category: sp.category as NewsCategory | undefined,
    dateMode: sp.date_mode as DateMode | undefined,
    date: sp.date,
    from: sp.from,
    to: sp.to,
    companySlug: sp.company,
  });

  const title = describeFilters(sp);
  const companyName = sp.company ? await getCompanyNameBySlug(supabase, sp.company) : null;

  return (
    <main className="flex flex-1 flex-col">
      <div className="px-4 pt-4 sm:px-8">
        <h1 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {sp.company ? (companyName ?? title) : title}
        </h1>
      </div>
      <NewsFeed items={news} resetKey={JSON.stringify(sp)} />
    </main>
  );
}
