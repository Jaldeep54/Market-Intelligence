import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCandidateById } from "@/lib/data/candidates";
import { getCompanies } from "@/lib/data/companies";
import { prepareCandidateWithGeminiAction, saveOrPublishCandidateAction } from "@/lib/actions/candidates";
import { PrepareWithGeminiButton } from "@/components/admin/PrepareWithGeminiButton";
import { CandidateReviewForm } from "@/components/admin/CandidateReviewForm";
import { CandidateQuickActions } from "@/components/admin/CandidateQuickActions";

function formatDateTime(value: string | null): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CandidateReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [candidate, companies] = await Promise.all([getCandidateById(supabase, id), getCompanies(supabase)]);

  if (!candidate) notFound();

  const article = candidate.article;
  const boundPrepare = prepareCandidateWithGeminiAction.bind(null, id);
  const boundSaveOrPublish = saveOrPublishCandidateAction.bind(null, id);
  const alreadyPublished = candidate.status === "published";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Review Article</h1>
        <p className="mt-1 text-sm text-muted">{candidate.source_name ?? "Unknown source"}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Original Article</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Headline</dt>
              <dd className="text-foreground">{article.original_title}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Published</dt>
              <dd className="text-foreground">{formatDateTime(article.published_at)}</dd>
            </div>
            {article.author && (
              <div>
                <dt className="text-xs text-muted">Author</dt>
                <dd className="text-foreground">{article.author}</dd>
              </div>
            )}
            {(article.original_description || article.raw_content) && (
              <div>
                <dt className="text-xs text-muted">Description / excerpt</dt>
                <dd className="whitespace-pre-line text-foreground">
                  {article.original_description ?? article.raw_content}
                </dd>
              </div>
            )}
          </dl>
          <a
            href={article.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
          >
            Open Original Article ↗
          </a>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Processing Information</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Relevance</dt>
              <dd className="text-foreground capitalize">
                {candidate.relevance_label.replace("_", " ")} ({candidate.relevance_score}/100)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Suggested category</dt>
              <dd className="text-foreground">{candidate.suggested_category ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Suggested company</dt>
              <dd className="text-foreground">{candidate.suggested_company?.name ?? "—"}</dd>
            </div>
          </dl>

          {candidate.possible_duplicate && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium text-amber-700">Possible duplicate</p>
              <p className="mt-1 text-amber-700/90">
                A recently discovered article looks similar: &ldquo;
                {candidate.possible_duplicate.prepared_title ?? candidate.possible_duplicate.article.original_title}
                &rdquo;
              </p>
            </div>
          )}

          {!alreadyPublished && (
            <div className="mt-4">
              <CandidateQuickActions candidateId={id} hasPossibleDuplicate={Boolean(candidate.possible_duplicate)} />
            </div>
          )}
        </section>
      </div>

      {!alreadyPublished ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Prepared News</h2>
          <p className="mt-1 text-sm text-muted">
            {candidate.gemini_last_run_at
              ? `Last prepared with Gemini ${formatDateTime(candidate.gemini_last_run_at)}.`
              : "Not prepared yet — click below to have Gemini draft it, or fill in the fields yourself."}
          </p>

          <div className="mt-4">
            <PrepareWithGeminiButton
              action={boundPrepare}
              label={candidate.prepared_title ? "Regenerate with Gemini" : "Prepare with Gemini"}
            />
          </div>

          <div className="mt-6">
            <CandidateReviewForm
              action={boundSaveOrPublish}
              companies={companies}
              candidate={candidate}
              sourceUrl={article.original_url}
            />
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
          This article has already been published to the Market Intelligence dashboard.
        </section>
      )}
    </div>
  );
}
