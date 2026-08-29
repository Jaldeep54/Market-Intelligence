import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminNewsList } from "@/lib/data/news";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/types/database";
import { AdminNewsFeed } from "@/components/admin/AdminNewsFeed";

export default async function AdminNewsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const search = typeof raw.search === "string" ? raw.search : "";
  const category = typeof raw.category === "string" ? (raw.category as NewsCategory) : undefined;
  const status =
    raw.status === "published" || raw.status === "unpublished"
      ? (raw.status as "published" | "unpublished")
      : undefined;

  const supabase = await createClient();
  const news = await getAdminNewsList(supabase, { search, category, status });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">News Management</h1>
        <Link
          href="/admin/news/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          + Add News
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="search" className="mb-1 block text-xs font-medium text-muted">
            Search title
          </label>
          <input
            id="search"
            name="search"
            defaultValue={search}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Search…"
          />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-muted">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category ?? ""}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-muted">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
        >
          Filter
        </button>
      </form>

      <AdminNewsFeed key={JSON.stringify({ search, category, status })} items={news} />
    </div>
  );
}
