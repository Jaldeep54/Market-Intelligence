"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { NEWS_CATEGORIES, type Company, type NewsWithRelations } from "@/lib/types/database";
import type { GenerateNewsDraftState, NewsFormState } from "@/lib/actions/news";

type Action = (state: NewsFormState, formData: FormData) => Promise<NewsFormState>;
type GenerateAction = (sourceUrl: string) => Promise<GenerateNewsDraftState>;

export function NewsForm({
  action,
  companies,
  initial,
  submitLabel,
  generateAction,
}: {
  action: Action;
  companies: Company[];
  initial?: NewsWithRelations;
  submitLabel: string;
  generateAction?: GenerateAction;
}) {
  const [state, formAction, pending] = useActionState<NewsFormState, FormData>(action, {});
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tags, setTags] = useState(initial?.tags.map((t) => t.name).join(", ") ?? "");
  const sourceUrlRef = useRef<HTMLInputElement>(null);

  const [generating, startGenerating] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);

  const wordCount = useMemo(
    () => description.trim().split(/\s+/).filter(Boolean).length,
    [description]
  );

  function handleGenerate() {
    const sourceUrl = sourceUrlRef.current?.value.trim() ?? "";
    if (!sourceUrl) {
      setGenerateError("Enter a source URL before generating with Gemini.");
      return;
    }
    if (!generateAction) return;

    setGenerateError(null);
    startGenerating(async () => {
      const result = await generateAction(sourceUrl);
      if (result.error) {
        setGenerateError(result.error);
        return;
      }
      if (result.data) {
        setTitle(result.data.title);
        setDescription(result.data.description);
        setTags(result.data.tags.join(", "));
      }
    });
  }

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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
            defaultValue={initial?.category ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
            defaultValue={initial?.company_id ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
            defaultValue={initial?.news_date}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label htmlFor="tags" className="mb-1 block text-sm font-medium text-foreground">
            Tags <span className="text-xs font-normal text-muted">(comma separated, 2–3)</span>
          </label>
          <input
            id="tags"
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="policy, exports, capacity"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div>
        <label htmlFor="source_url" className="mb-1 block text-sm font-medium text-foreground">
          Source URL
        </label>
        <input
          id="source_url"
          name="source_url"
          type="url"
          required
          ref={sourceUrlRef}
          defaultValue={initial?.source_url}
          placeholder="https://…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {generateAction && (
          <p className="mt-1 text-xs text-muted">
            Paste the article URL above, then use &ldquo;Generate with Gemini&rdquo; below to draft the fields.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="published"
          defaultChecked={initial?.published ?? false}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        Published (visible to viewers)
      </label>

      {generateError && <p className="text-sm text-danger">{generateError}</p>}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center gap-3">
        {generateAction && (
          <button
            type="button"
            disabled={generating || pending}
            onClick={handleGenerate}
            className="rounded-lg border border-accent px-5 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate with Gemini"}
          </button>
        )}

        <button
          type="submit"
          disabled={pending || generating}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
