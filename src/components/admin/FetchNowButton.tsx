"use client";

import { useState, useTransition } from "react";
import type { SourceFetchSummary } from "@/lib/automation/fetchSources";

export function FetchNowButton({ action }: { action: () => Promise<SourceFetchSummary> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SourceFetchSummary | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await action());
          })
        }
        className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50"
      >
        {pending ? "Checking…" : "Fetch Now"}
      </button>
      {result && (
        <span className={`text-xs ${result.ok ? "text-muted" : "text-danger"}`}>
          {result.ok
            ? `${result.newArticles} new, ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"}`
            : result.error}
        </span>
      )}
    </div>
  );
}
