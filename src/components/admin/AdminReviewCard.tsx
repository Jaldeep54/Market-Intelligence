"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/shared/Modal";
import { PrepareWithGeminiButton } from "@/components/admin/PrepareWithGeminiButton";
import { NEWS_CATEGORIES, type Company, type NewsCandidateWithArticle } from "@/lib/types/database";
import {
  deleteCandidateAction,
  prepareCandidateWithGeminiAction,
  publishCandidateInlineAction,
  rejectCandidateAction,
} from "@/lib/actions/candidates";

function toDateInputValue(value: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function AdminReviewCard({
  candidate,
  companies,
  onRemove,
}: {
  candidate: NewsCandidateWithArticle;
  companies: Company[];
  onRemove: (candidateId: string) => void;
}) {
  const [title, setTitle] = useState(candidate.prepared_title ?? candidate.article.original_title);
  const [description, setDescription] = useState(
    candidate.prepared_description ?? candidate.article.original_description ?? ""
  );
  const [category, setCategory] = useState(candidate.prepared_category ?? candidate.suggested_category ?? "");
  const [companyId, setCompanyId] = useState(candidate.prepared_company_id ?? candidate.suggested_company_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // News date and tags aren't editable here to keep the card focused for
  // mobile review -- carried over as-is from whatever Gemini (or the admin,
  // on the full Inbox review page) already prepared. Kept in state (not
  // just read from `candidate`) so a Gemini run can update them too.
  const [newsDate, setNewsDate] = useState(toDateInputValue(candidate.prepared_news_date ?? candidate.article.published_at));
  const [tags, setTags] = useState(candidate.prepared_tags);

  // Tracks whether a Gemini run has produced content for this card, so the
  // button switches from "Generate" to "Regenerate" the moment a run
  // succeeds -- without this it would only flip after a full page reload,
  // since `candidate` itself never changes for an already-mounted card.
  const [hasGenerated, setHasGenerated] = useState(Boolean(candidate.prepared_title));
  // Any gemini_error already on this candidate from a prior run (e.g. left
  // over from before a page reload). Cleared the moment a fresh run
  // succeeds; a fresh run that fails instead shows its own error right next
  // to the button below, via PrepareWithGeminiButton's built-in display.
  const [geminiNote, setGeminiNote] = useState(candidate.gemini_error);

  const boundPrepare = prepareCandidateWithGeminiAction.bind(null, candidate.id);

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("description", description);
      formData.set("category", category);
      formData.set("company_id", companyId);
      formData.set("news_date", newsDate);
      formData.set("tags", tags.join(", "));

      const result = await publishCandidateInlineAction(candidate.id, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onRemove(candidate.id);
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      await rejectCandidateAction(candidate.id);
      onRemove(candidate.id);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCandidateAction(candidate.id);
      if (result.error) {
        setError(result.error);
        setConfirmDeleteOpen(false);
        return;
      }
      setConfirmDeleteOpen(false);
      onRemove(candidate.id);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{candidate.source_name ?? "Unknown source"}</span>
        <a
          href={candidate.article.original_url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent hover:underline"
        >
          Open Source ↗
        </a>
      </div>

      {geminiNote && <p className="mt-2 text-xs text-amber-600">Gemini note: {geminiNote}</p>}

      <div className="mt-3">
        <PrepareWithGeminiButton
          action={boundPrepare}
          label={hasGenerated ? "Regenerate with Gemini" : "Generate with Gemini"}
          disabled={pending}
          onSuccess={(data) => {
            setTitle(data.title);
            setDescription(data.description);
            setCategory(data.category);
            setCompanyId(data.companyId ?? "");
            setNewsDate(data.newsDate);
            setTags(data.tags);
            setHasGenerated(true);
            setGeminiNote(null);
          }}
        />
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>
                Select category
              </option>
              {NEWS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {category === "Top Company News" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Company <span className="font-normal">(required for Top Company News)</span>
              </label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              >
                <option value="">— None —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handlePublish}
          className="min-h-[44px] flex-1 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Working…" : "Publish"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleReject}
          className="min-h-[44px] flex-1 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDeleteOpen(true)}
          className="min-h-[44px] flex-1 rounded-lg border border-danger/40 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} title="Confirm deletion">
        <p className="text-sm text-foreground/90">
          Delete this article from the inbox? This removes the scraped article entirely and cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
