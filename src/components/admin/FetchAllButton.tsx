"use client";

import { useState, useTransition } from "react";
import type { BatchFetchSummary } from "@/lib/automation/fetchSources";

export function FetchAllButton({ action }: { action: () => Promise<BatchFetchSummary> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BatchFetchSummary | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await action());
          })
        }
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Checking sources…" : "Fetch All Active Sources"}
      </button>

      {result && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-foreground">
            {result.sourcesChecked} source{result.sourcesChecked === 1 ? "" : "s"} checked — {result.sourcesSuccessful}{" "}
            successful, {result.sourcesFailed} failed
          </p>
          <p className="mt-1 text-muted">
            {result.articlesFound} articles found · {result.newArticles} new · {result.duplicates} duplicates ·{" "}
            {result.skipped} skipped
          </p>
          {result.perSource.some((s) => !s.ok) && (
            <ul className="mt-2 space-y-0.5 text-xs text-danger">
              {result.perSource
                .filter((s) => !s.ok)
                .map((s) => (
                  <li key={s.sourceId}>
                    {s.sourceName}: {s.error}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
