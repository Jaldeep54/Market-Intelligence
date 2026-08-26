import { createClient } from "@/lib/supabase/server";
import { getInboxCandidates, getInboxCounts } from "@/lib/data/candidates";
import { getSources } from "@/lib/data/sources";
import { CANDIDATE_STATUSES, RELEVANCE_LABELS, type CandidateStatus, type RelevanceLabel } from "@/lib/types/database";
import { InboxTable } from "@/components/admin/InboxTable";

const COUNTER_LABELS: { key: keyof Awaited<ReturnType<typeof getInboxCounts>>; label: string }[] = [
  { key: "new", label: "New" },
  { key: "needs_review", label: "Needs Review" },
  { key: "high_relevance", label: "High Relevance" },
  { key: "possible_duplicate", label: "Possible Duplicate" },
  { key: "prepared", label: "Prepared with Gemini" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const status = typeof raw.status === "string" && (CANDIDATE_STATUSES as string[]).includes(raw.status)
    ? (raw.status as CandidateStatus)
    : undefined;
  const relevance =
    typeof raw.relevance === "string" && (RELEVANCE_LABELS as string[]).includes(raw.relevance)
      ? (raw.relevance as RelevanceLabel)
      : undefined;
  const sourceId = typeof raw.source === "string" && raw.source ? raw.source : undefined;
  const dateFrom = typeof raw.dateFrom === "string" && raw.dateFrom ? raw.dateFrom : undefined;
  const dateTo = typeof raw.dateTo === "string" && raw.dateTo ? raw.dateTo : undefined;

  const supabase = await createClient();
  const [candidates, counts, sources] = await Promise.all([
    getInboxCandidates(supabase, { status, relevance, sourceId, dateFrom, dateTo }),
    getInboxCounts(supabase),
    getSources(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">News Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Articles discovered automatically from your News Sources, waiting for review.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {COUNTER_LABELS.map((c) => (
          <div key={c.key} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xl font-semibold text-foreground">{counts[c.key]}</p>
            <p className="mt-1 text-xs text-muted">{c.label}</p>
          </div>
        ))}
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
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
            {CANDIDATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="relevance" className="mb-1 block text-xs font-medium text-muted">
            Relevance
          </label>
          <select
            id="relevance"
            name="relevance"
            defaultValue={relevance ?? ""}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {RELEVANCE_LABELS.map((r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="source" className="mb-1 block text-xs font-medium text-muted">
            Source
          </label>
          <select
            id="source"
            name="source"
            defaultValue={sourceId ?? ""}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.source_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dateFrom" className="mb-1 block text-xs font-medium text-muted">
            From date
          </label>
          <input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={dateFrom ?? ""}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="dateTo" className="mb-1 block text-xs font-medium text-muted">
            To date
          </label>
          <input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={dateTo ?? ""}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
        >
          Filter
        </button>
      </form>

      <InboxTable candidates={candidates} />
    </div>
  );
}
