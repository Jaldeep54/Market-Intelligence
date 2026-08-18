import Link from "next/link";
import type { NewsSource } from "@/lib/types/database";
import {
  deleteSourceAction,
  fetchSourceNowAction,
  toggleSourceActiveAction,
} from "@/lib/actions/sources";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { SourceActiveToggle } from "@/components/admin/SourceActiveToggle";
import { FetchNowButton } from "@/components/admin/FetchNowButton";

type Health = "healthy" | "never_checked" | "failed" | "disabled";

function sourceHealth(source: NewsSource): Health {
  if (!source.active) return "disabled";
  if (!source.last_checked_at) return "never_checked";
  if (source.last_error) return "failed";
  return "healthy";
}

const HEALTH_LABELS: Record<Health, string> = {
  healthy: "Healthy",
  never_checked: "Never Checked",
  failed: "Failed",
  disabled: "Disabled",
};

const HEALTH_STYLES: Record<Health, string> = {
  healthy: "bg-accent/10 text-accent",
  never_checked: "bg-border/60 text-muted",
  failed: "bg-danger/10 text-danger",
  disabled: "bg-border/60 text-muted",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SourcesTable({ sources }: { sources: NewsSource[] }) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted">
        No sources yet. Click &ldquo;Add Source&rdquo; to add the first one you want monitored.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Last Checked</th>
            <th className="px-4 py-3 font-medium">Last Success</th>
            <th className="px-4 py-3 font-medium">Articles Found</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const health = sourceHealth(source);
            return (
              <tr key={source.id} className="border-b border-border align-top last:border-b-0">
                <td className="max-w-xs px-4 py-3">
                  <p className="font-medium text-foreground">{source.source_name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{source.website_url}</p>
                  {health === "failed" && source.last_error && (
                    <p className="mt-1 text-xs text-danger">{source.last_error}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted uppercase text-xs">{source.source_type}</td>
                <td className="px-4 py-3 text-muted capitalize">{source.priority}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${HEALTH_STYLES[health]}`}>
                    {HEALTH_LABELS[health]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{formatDateTime(source.last_checked_at)}</td>
                <td className="px-4 py-3 text-muted">{formatDateTime(source.last_success_at)}</td>
                <td className="px-4 py-3 text-muted">{source.articles_found_last_fetch}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/sources/${source.id}`} className="text-xs font-medium text-accent hover:underline">
                        Edit
                      </Link>
                      <SourceActiveToggle
                        active={source.active}
                        action={toggleSourceActiveAction.bind(null, source.id, !source.active)}
                      />
                      <ConfirmDeleteButton
                        itemLabel={source.source_name}
                        action={deleteSourceAction.bind(null, source.id)}
                      />
                    </div>
                    <FetchNowButton action={fetchSourceNowAction.bind(null, source.id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
