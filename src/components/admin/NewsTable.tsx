import Link from "next/link";
import type { NewsWithRelations } from "@/lib/types/database";
import { deleteNewsAction, toggleNewsPublishedAction } from "@/lib/actions/news";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { PublishToggleButton } from "@/components/admin/PublishToggleButton";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NewsTable({ items }: { items: NewsWithRelations[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">No articles match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-b-0">
              <td className="max-w-xs truncate px-4 py-3 font-medium text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-3 text-muted">{item.category}</td>
              <td className="px-4 py-3 text-muted">{item.company?.name ?? "—"}</td>
              <td className="px-4 py-3 text-muted">{formatDate(item.news_date)}</td>
              <td className="px-4 py-3">
                <PublishToggleButton
                  published={item.published}
                  action={toggleNewsPublishedAction.bind(null, item.id, !item.published)}
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/news/${item.id}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Edit
                  </Link>
                  <ConfirmDeleteButton
                    itemLabel={item.title}
                    action={deleteNewsAction.bind(null, item.id)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
