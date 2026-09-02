"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/shared/Modal";
import { CandidateQuickActions } from "@/components/admin/CandidateQuickActions";
import { deleteCandidatesAction } from "@/lib/actions/candidates";
import type { NewsCandidateWithArticle } from "@/lib/types/database";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  needs_review: "Needs Review",
  prepared: "Prepared",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-accent/10 text-accent",
  needs_review: "bg-amber-500/10 text-amber-600",
  prepared: "bg-accent/10 text-accent",
  approved: "bg-accent/10 text-accent",
  published: "bg-accent text-accent-foreground",
  rejected: "bg-danger/10 text-danger",
  duplicate: "bg-border/60 text-muted",
};

const RELEVANCE_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  needs_review: "Needs Review",
};

const RELEVANCE_STYLES: Record<string, string> = {
  high: "bg-accent/10 text-accent",
  medium: "bg-border/60 text-muted",
  low: "bg-border/60 text-muted",
  needs_review: "bg-amber-500/10 text-amber-600",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Anything not yet published can be bulk-deleted -- the same rule
// deleteCandidateRow (src/lib/actions/candidates.ts) enforces server-side.
function isSelectable(candidate: NewsCandidateWithArticle): boolean {
  return candidate.status !== "published";
}

export function InboxList({ candidates }: { candidates: NewsCandidateWithArticle[] }) {
  const [items, setItems] = useState(candidates);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return <p className="text-sm text-muted">No articles match these filters.</p>;
  }

  const selectableItems = items.filter(isSelectable);
  const allSelected = selectableItems.length > 0 && selectableItems.every((c) => selectedIds.has(c.id));

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(selectableItems.map((c) => c.id)));
  }

  function handleBulkDelete() {
    setBulkError(null);
    startTransition(async () => {
      const result = await deleteCandidatesAction(Array.from(selectedIds));
      setItems((prev) => prev.filter((c) => !result.deletedIds.includes(c.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of result.deletedIds) next.delete(id);
        return next;
      });

      if (result.failed.length > 0) {
        setBulkError(
          `${result.failed.length} item${result.failed.length === 1 ? "" : "s"} could not be deleted (already published).`
        );
      } else {
        setConfirmOpen(false);
      }
    });
  }

  // Per-row actions from CandidateQuickActions: applied to local state the
  // moment the server action resolves successfully, same as handleBulkDelete
  // above, instead of waiting on revalidatePath to refresh this already-
  // mounted component's `candidates` prop.
  function handleRowDeleted(id: string) {
    setItems((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleRowRejected(id: string) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, status: "rejected" } : c)));
  }

  function handleRowMarkedDuplicate(id: string) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, status: "duplicate" } : c)));
  }

  function handleRowKept(id: string) {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, possible_duplicate: null } : c)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="h-5 w-5 rounded border-border accent-accent"
          />
          Select all ({selectableItems.length})
        </label>

        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => {
              setBulkError(null);
              setConfirmOpen(true);
            }}
            className="ml-auto min-h-[44px] rounded-lg bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Delete {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {bulkError && <p className="text-sm text-danger">{bulkError}</p>}

      {/* Mobile: stacked cards, one column, no horizontal scroll. */}
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((candidate) => (
          <div
            key={candidate.id}
            className={`rounded-xl border border-border bg-surface p-4 ${
              candidate.status === "published" ? "border-l-4 border-l-accent bg-accent/5" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              {isSelectable(candidate) && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(candidate.id)}
                  onChange={() => toggleOne(candidate.id)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-accent"
                  aria-label="Select article"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium text-foreground">{candidate.article.original_title}</p>
                {candidate.possible_duplicate && (
                  <p className="mt-1 break-words text-xs text-amber-600">
                    Possible duplicate of &ldquo;
                    {candidate.possible_duplicate.prepared_title ?? candidate.possible_duplicate.article.original_title}
                    &rdquo;
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {candidate.source_name ?? "—"} · {formatDate(candidate.article.published_at)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${RELEVANCE_STYLES[candidate.relevance_label]}`}>
                    {RELEVANCE_LABELS[candidate.relevance_label]}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[candidate.status]}`}>
                    {STATUS_LABELS[candidate.status]}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <Link
                href={`/admin/inbox/${candidate.id}`}
                className="min-h-[44px] flex items-center text-sm font-medium text-accent hover:underline"
              >
                Review
              </Link>
              <a
                href={candidate.article.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] flex items-center break-words text-sm font-medium text-muted hover:underline"
              >
                Open Source ↗
              </a>
            </div>
            {candidate.status !== "published" && candidate.status !== "rejected" && (
              <div className="mt-2">
                <CandidateQuickActions
                  candidateId={candidate.id}
                  hasPossibleDuplicate={Boolean(candidate.possible_duplicate)}
                  onDeleted={handleRowDeleted}
                  onRejected={handleRowRejected}
                  onMarkedDuplicate={handleRowMarkedDuplicate}
                  onKept={handleRowKept}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop/tablet: table. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 px-4 py-3"></th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Headline</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Suggested</th>
              <th className="px-4 py-3 font-medium">Relevance</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((candidate) => (
              <tr
                key={candidate.id}
                className={`border-b border-border align-top last:border-b-0 ${
                  candidate.status === "published" ? "border-l-2 border-l-accent bg-accent/5" : ""
                }`}
              >
                <td className="px-4 py-3">
                  {isSelectable(candidate) && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(candidate.id)}
                      onChange={() => toggleOne(candidate.id)}
                      className="h-4 w-4 rounded border-border accent-accent"
                      aria-label="Select article"
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{candidate.source_name ?? "—"}</td>
                <td className="max-w-sm px-4 py-3">
                  <p className="font-medium text-foreground">{candidate.article.original_title}</p>
                  {candidate.possible_duplicate && (
                    <p className="mt-1 text-xs text-amber-600">
                      Possible duplicate of &ldquo;{candidate.possible_duplicate.prepared_title ?? candidate.possible_duplicate.article.original_title}&rdquo;
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{formatDate(candidate.article.published_at)}</td>
                <td className="px-4 py-3 text-muted">
                  <p>{candidate.suggested_category ?? "—"}</p>
                  {candidate.suggested_company && <p className="text-xs">{candidate.suggested_company.name}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${RELEVANCE_STYLES[candidate.relevance_label]}`}>
                    {RELEVANCE_LABELS[candidate.relevance_label]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[candidate.status]}`}>
                    {STATUS_LABELS[candidate.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/inbox/${candidate.id}`} className="text-xs font-medium text-accent hover:underline">
                        Review
                      </Link>
                      <a
                        href={candidate.article.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-muted hover:underline"
                      >
                        Open Source ↗
                      </a>
                    </div>
                    {candidate.status !== "published" && candidate.status !== "rejected" && (
                      <CandidateQuickActions
                        candidateId={candidate.id}
                        hasPossibleDuplicate={Boolean(candidate.possible_duplicate)}
                        onDeleted={handleRowDeleted}
                        onRejected={handleRowRejected}
                        onMarkedDuplicate={handleRowMarkedDuplicate}
                        onKept={handleRowKept}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm bulk deletion">
        <p className="text-sm text-foreground/90">
          Delete {selectedIds.size} article{selectedIds.size === 1 ? "" : "s"} from the inbox? This removes each
          scraped article entirely and cannot be undone.
        </p>
        {bulkError && <p className="mt-2 text-sm text-danger">{bulkError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="min-h-[44px] rounded-lg border border-border px-4 text-sm text-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleBulkDelete}
            className="min-h-[44px] rounded-lg bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Deleting…" : `Delete ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
