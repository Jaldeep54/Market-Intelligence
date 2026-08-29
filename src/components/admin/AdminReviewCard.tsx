"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PrepareWithGeminiButton } from "@/components/admin/PrepareWithGeminiButton";
import { NEWS_CATEGORIES, type Company, type NewsCandidateWithArticle } from "@/lib/types/database";
import { prepareCandidateWithGeminiAction, publishCandidateInlineAction } from "@/lib/actions/candidates";

function toDateInputValue(value: string | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Reject and Delete are swipe-only now (see AdminReviewList) -- this card is
// content-first: a category chip + the ⋮ menu at top, the title and
// description doing almost all of the work, and a slim metadata row at the
// bottom. Title/Description stay editable (unchanged functionality, just
// restyled to read like article text rather than a form) so Gemini output
// can still be tweaked before publishing.
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
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // News date and tags aren't editable here -- carried over as-is from
  // whatever Gemini (or the admin, on the full Inbox review page) already
  // prepared. Kept in state (not just read from `candidate`) so a Gemini
  // run can update them too.
  const [newsDate, setNewsDate] = useState(toDateInputValue(candidate.prepared_news_date ?? candidate.article.published_at));
  const [tags, setTags] = useState(candidate.prepared_tags);

  // Tracks whether a Gemini run has produced content for this card, so the
  // menu item switches from "Generate" to "Regenerate" the moment a run
  // succeeds -- without this it would only flip after a full page reload,
  // since `candidate` itself never changes for an already-mounted card.
  const [hasGenerated, setHasGenerated] = useState(Boolean(candidate.prepared_title));
  // Any gemini_error already on this candidate from a prior run (e.g. left
  // over from before a page reload). Cleared the moment a fresh run
  // succeeds; a fresh run that fails instead shows its own error right next
  // to the menu's Gemini button, via PrepareWithGeminiButton's own display.
  const [geminiNote, setGeminiNote] = useState(candidate.gemini_error);

  const boundPrepare = prepareCandidateWithGeminiAction.bind(null, candidate.id);
  const companyName = companies.find((c) => c.id === companyId)?.name;

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
      setMenuOpen(false);
      onRemove(candidate.id);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          {category || "Uncategorized"}
        </span>

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
              className="absolute right-0 z-10 mt-1 w-64 rounded-xl border border-border bg-surface p-2 text-sm shadow-lg"
            >
              <div className="px-1 pb-1">
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

              <button
                type="button"
                role="menuitem"
                disabled={pending}
                onClick={handlePublish}
                className="block min-h-[44px] w-full rounded-lg px-3 text-left text-foreground hover:bg-background disabled:opacity-50"
              >
                {pending ? "Publishing…" : "Publish"}
              </button>

              <div className="mt-1 px-3 py-2">
                <label className="mb-1 block text-xs font-medium text-muted">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
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
                <div className="px-3 py-2">
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Company <span className="font-normal">(required for Top Company News)</span>
                  </label>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
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
          )}
        </div>
      </div>

      {geminiNote && <p className="mb-2 text-xs text-amber-600">Gemini note: {geminiNote}</p>}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Title"
        className="w-full -mx-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold leading-snug text-foreground outline-none transition-colors hover:border-border focus:border-accent focus:bg-background sm:text-xl"
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        aria-label="Description"
        rows={9}
        className="mt-3 min-h-[15rem] w-full -mx-1 resize-y rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm leading-relaxed text-foreground/90 outline-none transition-colors hover:border-border focus:border-accent focus:bg-background"
      />

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border px-2 py-1">
              #{tag}
            </span>
          ))}
          {companyName && <span className="rounded-full border border-border px-2 py-1">{companyName}</span>}
          <span>{formatDate(newsDate)}</span>
        </div>
        <a
          href={candidate.article.original_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-accent px-3 py-1.5 font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Source ↗
        </a>
      </div>
    </div>
  );
}
