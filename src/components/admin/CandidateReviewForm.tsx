"use client";

import { useActionState, useMemo, useState } from "react";
import { NEWS_CATEGORIES, type Company, type NewsCandidateWithArticle } from "@/lib/types/database";
import type { CandidateActionState } from "@/lib/actions/candidates";

type Action = (state: CandidateActionState, formData: FormData) => Promise<CandidateActionState>;

function toDateInputValue(value: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function CandidateReviewForm({
  action,
  companies,
  candidate,
  sourceUrl,
}: {
  action: Action;
  companies: Company[];
  candidate: NewsCandidateWithArticle;
  sourceUrl: string;
}) {
  const [state, formAction, pending] = useActionState<CandidateActionState, FormData>(action, {});
  const [description, setDescription] = useState(
    candidate.prepared_description ?? candidate.article.original_description ?? ""
  );

  const wordCount = useMemo(
    () => description.trim().split(/\s+/).filter(Boolean).length,
    [description]
  );

  const initialCompanyId = candidate.prepared_company_id ?? candidate.suggested_company_id ?? "";
  const initialCategory = candidate.prepared_category ?? candidate.suggested_category ?? "";
  const initialNewsDate = toDateInputValue(candidate.prepared_news_date ?? candidate.article.published_at);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-foreground">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={candidate.prepared_title ?? candidate.article.original_title}
          className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="description" className="block text-sm font-medium text-foreground">
            Description
          </label>
          <span className="text-xs text-muted">{wordCount} words (~70 recommended)</span>
        </div>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full min-h-[9rem] resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium text-foreground">
            Category
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue={initialCategory}
            className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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

        <div>
          <label htmlFor="company_id" className="mb-1 block text-sm font-medium text-foreground">
            Company{" "}
            <span className="text-xs font-normal text-muted">(required for Top Company News)</span>
          </label>
          <select
            id="company_id"
            name="company_id"
            defaultValue={initialCompanyId}
            className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="news_date" className="mb-1 block text-sm font-medium text-foreground">
            News Date
          </label>
          <input
            id="news_date"
            name="news_date"
            type="date"
            required
            defaultValue={initialNewsDate}
            className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-medium text-foreground">
            Tags <span className="text-xs font-normal text-muted">(comma separated, 2–3)</span>
          </label>
          <input
            id="tags"
            name="tags"
            defaultValue={candidate.prepared_tags.join(", ")}
            placeholder="policy, exports, capacity"
            className="w-full min-h-[44px] rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-foreground">Source URL</span>
        <p className="break-all rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">
          {sourceUrl}
        </p>
      </div>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="min-h-[44px] flex-1 rounded-lg border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-50 sm:flex-none"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={pending}
          className="min-h-[44px] flex-1 rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none"
        >
          {pending ? "Publishing…" : "Approve & Publish"}
        </button>
      </div>
    </form>
  );
}
