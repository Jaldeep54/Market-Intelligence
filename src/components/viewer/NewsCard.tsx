"use client";

import type { NewsWithRelations } from "@/lib/types/database";
import { useLanguage } from "@/components/viewer/LanguageContext";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Alternates the card's own background between two tints (see globals.css)
// keyed by feed position, in place of a fixed bg-surface -- the shade
// change on the card itself is the "you swiped" cue, rather than a
// separate background layer behind it.
const CARD_TINT_CLASSES = ["bg-card-tint-a", "bg-card-tint-b"];

export function NewsCard({ news, index }: { news: NewsWithRelations; index: number }) {
  const tintClass = CARD_TINT_CLASSES[index % CARD_TINT_CLASSES.length];
  // Language is a global, feed-wide setting (see LanguageToggle) -- this
  // card only decides, per article, whether it CAN honor it. Both fields
  // must be present -- a title with no description (or vice versa) means
  // the translation is incomplete/failed, so this card silently falls back
  // to English rather than risk mixing languages or showing a blank field.
  const { lang } = useLanguage();
  const hasGujarati = Boolean(news.title_gu && news.description_gu);
  const showGujarati = hasGujarati && lang === "gu";

  return (
    <article className={`flex flex-col rounded-2xl border border-border ${tintClass} p-6 shadow-sm sm:p-8`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-accent">
        <span className="rounded-full bg-accent/10 px-2.5 py-1">{news.category}</span>
        {news.company && (
          <span className="rounded-full bg-border/60 px-2.5 py-1 text-muted">
            {news.company.name}
          </span>
        )}
      </div>

      <h2 className="text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
        {showGujarati ? news.title_gu : news.title}
      </h2>

      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90 sm:text-base">
        {showGujarati ? news.description_gu : news.description}
      </p>

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
