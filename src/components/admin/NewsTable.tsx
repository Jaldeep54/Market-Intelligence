"use client";

import { useRef, useState } from "react";
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
  // Seeded once from `items` and then owned locally, same pattern as
  // InboxList. A filter-form submit is a real GET navigation, which
  // remounts this component with a fresh `items` prop, so no further
  // reconciliation is needed there. Deliberately NOT re-syncing `rows` to
  // `items` on every render: our own delete/toggle actions below call
  // revalidatePath, which delivers a new (but not necessarily different)
  // `items` array reference into this already-mounted component shortly
  // after each optimistic update -- syncing against that would immediately
  // clobber the optimistic change we just applied.
  const [rows, setRows] = useState(items);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Bridges ConfirmDeleteButton's synchronous onConfirm (removes the row)
  // with its later, transition-wrapped action call (which needs to know
  // what to reinsert, and where, if the real delete fails).
  const pendingDeletes = useRef(new Map<string, { item: NewsWithRelations; index: number }>());

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // Fires synchronously (via ConfirmDeleteButton's onConfirm, wrapped in
  // flushSync), so it commits and paints immediately -- see that prop's
  // comment for why. finishDelete (below) then performs the real delete
  // and reverts on failure.
  function startOptimisticDelete(id: string) {
    const index = rows.findIndex((r) => r.id === id);
    if (index !== -1) pendingDeletes.current.set(id, { item: rows[index], index });
    setRows((prev) => prev.filter((r) => r.id !== id));
    clearRowError(id);
  }

  function finishDelete(id: string): Promise<{ error?: string }> {
    return deleteNewsAction(id).then((result) => {
      if (result?.error) {
        const pending = pendingDeletes.current.get(id);
        if (pending) {
          setRows((prev) => {
            if (prev.some((r) => r.id === id)) return prev;
            const next = [...prev];
            next.splice(Math.min(pending.index, next.length), 0, pending.item);
            return next;
          });
        }
        setRowErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      pendingDeletes.current.delete(id);
      return result;
    });
  }

  // Same split pattern for publish/unpublish: the optimistic flip happens
  // synchronously in onOptimisticStart, the real call + revert-on-failure
  // in action.
  function startOptimisticToggle(id: string, nextPublished: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, published: nextPublished } : r)));
    clearRowError(id);
  }

  function finishToggle(id: string, nextPublished: boolean): Promise<{ error?: string }> {
    return toggleNewsPublishedAction(id, nextPublished).then((result) => {
      if (result?.error) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, published: !nextPublished } : r)));
        setRowErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      return result;
    });
  }

  if (rows.length === 0) {
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
          {rows.map((item) => (
            <tr
              key={item.id}
              className={`border-b border-border last:border-b-0 ${
                item.published ? "border-l-2 border-l-accent bg-accent/5" : ""
              }`}
            >
              <td className="max-w-xs truncate px-4 py-3 font-medium text-foreground">
                {item.title}
              </td>
              <td className="px-4 py-3 text-muted">{item.category}</td>
              <td className="px-4 py-3 text-muted">{item.company?.name ?? "—"}</td>
              <td className="px-4 py-3 text-muted">{formatDate(item.news_date)}</td>
              <td className="px-4 py-3">
                <PublishToggleButton
                  published={item.published}
                  onOptimisticStart={() => startOptimisticToggle(item.id, !item.published)}
                  action={() => finishToggle(item.id, !item.published)}
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
                    onConfirm={() => startOptimisticDelete(item.id)}
                    action={() => finishDelete(item.id)}
                  />
                </div>
                {rowErrors[item.id] && (
                  <p className="mt-1 text-xs text-danger">{rowErrors[item.id]}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
