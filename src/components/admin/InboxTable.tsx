import Link from "next/link";
import type { NewsCandidateWithArticle } from "@/lib/types/database";
import { CandidateQuickActions } from "@/components/admin/CandidateQuickActions";

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
  published: "bg-border/60 text-muted",
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

export function InboxTable({ candidates }: { candidates: NewsCandidateWithArticle[] }) {
  if (candidates.length === 0) {
    return <p className="text-sm text-muted">No articles match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
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
          {candidates.map((candidate) => (
            <tr key={candidate.id} className="border-b border-border align-top last:border-b-0">
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
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
