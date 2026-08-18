import { createClient } from "@/lib/supabase/server";
import { getGeminiUsageToday, getRecentAutomationBatches } from "@/lib/data/automation";

const TRIGGER_LABELS: Record<string, string> = {
  scheduled: "Scheduled (every 2 hours)",
  manual_all: "Manual — Fetch All",
  manual_source: "Manual — Fetch Now",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminAutomationPage() {
  const supabase = await createClient();
  const [batches, geminiUsage] = await Promise.all([
    getRecentAutomationBatches(supabase),
    getGeminiUsageToday(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Automation</h1>
        <p className="mt-1 text-sm text-muted">Recent source-checking runs and Gemini usage.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">Gemini</h2>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xl font-semibold text-foreground">{geminiUsage.requests}</p>
            <p className="mt-1 text-xs text-muted">Requests today</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-foreground">{geminiUsage.successful}</p>
            <p className="mt-1 text-xs text-muted">Successful</p>
          </div>
          <div>
            <p className="text-xl font-semibold text-foreground">{geminiUsage.failed}</p>
            <p className="mt-1 text-xs text-muted">Failed</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Recent Runs</h2>
        {batches.length === 0 && (
          <p className="text-sm text-muted">
            No source checks yet. Use &ldquo;Fetch All Active Sources&rdquo; on the News Sources page to run the first
            one.
          </p>
        )}
        {batches.map((batch) => (
          <div key={batch.batchId} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{formatDateTime(batch.startedAt)}</p>
              <span className="rounded-full bg-border/60 px-2.5 py-1 text-xs font-medium text-muted">
                {TRIGGER_LABELS[batch.trigger] ?? batch.trigger}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Sources checked: {batch.sourcesChecked} · Successful: {batch.sourcesSuccessful} · Failed:{" "}
              {batch.sourcesFailed}
            </p>
            <p className="mt-1 text-sm text-muted">
              Articles found: {batch.articlesFound} · New: {batch.newArticles} · Duplicates: {batch.duplicates} ·
              Skipped: {batch.skippedArticles}
            </p>
            {batch.runs.some((r) => r.status === "failed") && (
              <ul className="mt-3 space-y-1 text-xs text-danger">
                {batch.runs
                  .filter((r) => r.status === "failed")
                  .map((r) => (
                    <li key={r.id}>
                      {(r as unknown as { source: { source_name: string } | null }).source?.source_name ??
                        "Unknown source"}
                      : {r.error_message}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
