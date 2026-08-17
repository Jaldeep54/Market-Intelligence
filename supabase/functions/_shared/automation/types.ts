// Minimal Deno-side mirror of the `NewsSource` / `AutomationBatchTrigger`
// shapes from src/lib/types/database.ts -- just the fields fetchSources.ts
// actually reads/writes here. If those columns change in a migration,
// mirror the change in src/lib/types/database.ts too.

export type NewsCategory = "Global Market" | "Indian Market" | "Top Company News" | "Analytical News";

export type SourceType = "rss" | "website" | "other";
export type SourcePriority = "high" | "medium" | "low";
export type AutomationBatchTrigger = "scheduled" | "manual_all" | "manual_source";

export interface NewsSource {
  id: string;
  source_name: string;
  website_url: string;
  feed_url: string | null;
  source_type: SourceType;
  active: boolean;
  default_category: NewsCategory | null;
  priority: SourcePriority;
  fetch_interval_minutes: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  articles_found_last_fetch: number;
  created_at: string;
  updated_at: string;
}
