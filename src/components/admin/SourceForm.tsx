"use client";

import { useActionState } from "react";
import { NEWS_CATEGORIES, SOURCE_PRIORITIES, SOURCE_TYPES, type NewsSource } from "@/lib/types/database";
import type { SourceFormState } from "@/lib/actions/sources";

type Action = (state: SourceFormState, formData: FormData) => Promise<SourceFormState>;

const SOURCE_TYPE_LABELS: Record<string, string> = { rss: "RSS", website: "Website", other: "Other" };

export function SourceForm({
  action,
  initial,
  submitLabel,
}: {
  action: Action;
  initial?: NewsSource;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SourceFormState, FormData>(action, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <div>
        <label htmlFor="source_name" className="mb-1 block text-sm font-medium text-foreground">
          Source Name
        </label>
        <input
          id="source_name"
          name="source_name"
          required
          defaultValue={initial?.source_name}
          placeholder="e.g. PV Magazine India"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label htmlFor="website_url" className="mb-1 block text-sm font-medium text-foreground">
          Website URL
        </label>
        <input
          id="website_url"
          name="website_url"
          type="url"
          required
          defaultValue={initial?.website_url}
          placeholder="https://…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label htmlFor="feed_url" className="mb-1 block text-sm font-medium text-foreground">
          Feed URL <span className="text-xs font-normal text-muted">(optional — left blank, the app tries to find it automatically)</span>
        </label>
        <input
          id="feed_url"
          name="feed_url"
          type="url"
          defaultValue={initial?.feed_url ?? ""}
          placeholder="https://…/feed"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div>
        <label htmlFor="exclude_urls" className="mb-1 block text-sm font-medium text-foreground">
          Skip articles from these URLs
        </label>
        <textarea
          id="exclude_urls"
          name="exclude_urls"
          rows={3}
          defaultValue={initial?.exclude_url_patterns?.join("\n") ?? ""}
          placeholder={"https://www.saurenergy.com/energy-jobs"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <p className="mt-1 text-xs text-muted">
          One URL or path per line. Any article whose link contains one of these will not be pulled into the
          inbox.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="source_type" className="mb-1 block text-sm font-medium text-foreground">
            Source Type
          </label>
          <select
            id="source_type"
            name="source_type"
            required
            defaultValue={initial?.source_type ?? "rss"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="mb-1 block text-sm font-medium text-foreground">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            required
            defaultValue={initial?.priority ?? "medium"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {SOURCE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fetch_interval_minutes" className="mb-1 block text-sm font-medium text-foreground">
            Check every (minutes)
          </label>
          <input
            id="fetch_interval_minutes"
            name="fetch_interval_minutes"
            type="number"
            min={15}
            max={1440}
            required
            defaultValue={initial?.fetch_interval_minutes ?? 120}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div>
        <label htmlFor="default_category" className="mb-1 block text-sm font-medium text-foreground">
          Default Category{" "}
          <span className="text-xs font-normal text-muted">(suggested for articles from this source)</span>
        </label>
        <select
          id="default_category"
          name="default_category"
          defaultValue={initial?.default_category ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">— None —</option>
          {NEWS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial?.active ?? true}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        Active (checked automatically every 2 hours)
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
