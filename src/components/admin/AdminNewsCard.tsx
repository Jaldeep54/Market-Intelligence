"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NEWS_CATEGORIES, type NewsCategory, type NewsWithRelations } from "@/lib/types/database";
import {
  deleteNewsAction,
  regenerateNewsContentAction,
  toggleNewsPublishedAction,
  updateNewsCategoryAction,
} from "@/lib/actions/news";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Visually mirrors src/components/viewer/NewsCard.tsx (same structure:
// category/company chips, title, full untruncated description, tags,
// date + source link) with two admin-only additions: a published/
// unpublished chip and the ⋮ menu below. Swipe gestures live one level up
// in AdminNewsFeed -- this component only renders content and handles its
// own menu actions.
export function AdminNewsCard({
  news,
  onUpdated,
  onDeleted,
}: {
  news: NewsWithRelations;
  onUpdated: (id: string, patch: Partial<NewsWithRelations>) => void;
  onDeleted: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function handlePublish() {
    setActionError(null);
    const result = await toggleNewsPublishedAction(news.id, true);
    if (result?.error) {
      setActionError(result.error);
      return;
    }
    onUpdated(news.id, { published: true });
    setMenuOpen(false);
  }

  async function handleCategoryChange(category: NewsCategory) {
    setActionError(null);
    const result = await updateNewsCategoryAction(news.id, category);
    if (result?.error) {
      setActionError(result.error);
      return;
    }
    onUpdated(news.id, { category });
  }

  async function handleGenerate() {
    setActionError(null);
    setGenerating(true);
    const result = await regenerateNewsContentAction(news.id, news.source_url);
    setGenerating(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? "Gemini could not generate a draft.");
      return;
    }

    // Tags are persisted server-side too (regenerateNewsContentAction calls
    // syncTags), but the returned tags are plain strings, not the Tag rows
    // NewsWithRelations expects -- left for the next full reload rather
    // than faking Tag objects with synthetic ids.
    onUpdated(news.id, { title: result.data.title, description: result.data.description });
    setMenuOpen(false);
  }

  async function handleDelete() {
    const result = await deleteNewsAction(news.id);
    if (result?.error) {
      setActionError(result.error);
      return;
    }
    onDeleted(news.id);
  }

  return (
    <article className="relative flex max-h-full flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-accent">
          <span className="rounded-full bg-accent/10 px-2.5 py-1">{news.category}</span>
          {news.company && (
            <span className="rounded-full bg-border/60 px-2.5 py-1 text-muted">{news.company.name}</span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 ${
              news.published ? "bg-accent/10 text-accent" : "bg-border/60 text-muted"
            }`}
          >
            {news.published ? "Published" : "Unpublished"}
          </span>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            ⋮
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-10 mt-1 w-60 rounded-xl border border-border bg-surface p-2 text-sm shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                disabled={generating}
                onClick={handleGenerate}
                className="block min-h-[44px] w-full rounded-lg px-3 text-left text-foreground hover:bg-background disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate with Gemini"}
              </button>

              {news.published ? (
                <div className="px-3 py-2.5 text-muted">Published ✓</div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handlePublish}
                  className="block min-h-[44px] w-full rounded-lg px-3 text-left text-foreground hover:bg-background"
                >
                  Publish
                </button>
              )}

              <div className="px-3 py-2">
                <label className="mb-1 block text-xs font-medium text-muted">Category</label>
                <select
                  value={news.category}
                  onChange={(e) => handleCategoryChange(e.target.value as NewsCategory)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                >
                  {NEWS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <Link
                href={`/admin/news/${news.id}`}
                role="menuitem"
                className="block min-h-[44px] w-full rounded-lg px-3 py-2.5 text-left text-foreground hover:bg-background"
              >
                Edit
              </Link>

              <div className="mt-1 border-t border-border px-3 pt-2">
                <ConfirmDeleteButton itemLabel={news.title} action={handleDelete} />
              </div>
            </div>
          )}
        </div>
      </div>

      <h2 className="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
        {news.title}
      </h2>

      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90 sm:text-base">
        {news.description}
      </p>

      {news.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {news.tags.map((tag) => (
            <span key={tag.id} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {actionError && <p className="mt-4 text-sm text-danger">{actionError}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
        <span>{formatDate(news.news_date)}</span>
        <a
          href={news.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-accent px-3 py-1.5 font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Source ↗
        </a>
      </div>
    </article>
  );
}
