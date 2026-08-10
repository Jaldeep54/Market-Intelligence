import type { NewsWithRelations } from "@/lib/types/database";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function NewsCard({ news }: { news: NewsWithRelations }) {
  return (
    <article className="flex max-h-full flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-accent">
        <span className="rounded-full bg-accent/10 px-2.5 py-1">{news.category}</span>
        {news.company && (
          <span className="rounded-full bg-border/60 px-2.5 py-1 text-muted">
            {news.company.name}
          </span>
        )}
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
            <span
              key={tag.id}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

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
