import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationBatchTrigger, AutomationRun } from "@/lib/types/database";

export interface AutomationBatchSummary {
  batchId: string;
  trigger: AutomationBatchTrigger;
  startedAt: string;
  completedAt: string | null;
  sourcesChecked: number;
  sourcesSuccessful: number;
  sourcesFailed: number;
  articlesFound: number;
  newArticles: number;
  duplicates: number;
  skippedArticles: number;
  runs: AutomationRun[];
}

const RECENT_RUNS_LIMIT = 500;

export async function getRecentAutomationBatches(
  supabase: SupabaseClient,
  batchLimit = 20
): Promise<AutomationBatchSummary[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select("*, source:news_sources(source_name)")
    .order("started_at", { ascending: false })
    .limit(RECENT_RUNS_LIMIT);

  if (error) throw error;

  const byBatch = new Map<string, (AutomationRun & { source: { source_name: string } | null })[]>();
  for (const row of (data ?? []) as unknown as (AutomationRun & { source: { source_name: string } | null })[]) {
    const list = byBatch.get(row.batch_id) ?? [];
    list.push(row);
    byBatch.set(row.batch_id, list);
  }

  const batches: AutomationBatchSummary[] = [];
  for (const [batchId, runs] of byBatch.entries()) {
    const startedAt = runs.reduce((min, r) => (r.started_at < min ? r.started_at : min), runs[0].started_at);
    const completedTimes = runs.map((r) => r.completed_at).filter((c): c is string => !!c);
    const completedAt =
      runs.every((r) => r.completed_at) && completedTimes.length > 0
        ? completedTimes.reduce((max, c) => (c > max ? c : max), completedTimes[0])
        : null;

    batches.push({
      batchId,
      trigger: runs[0].batch_trigger,
      startedAt,
      completedAt,
      sourcesChecked: runs.length,
      sourcesSuccessful: runs.filter((r) => r.status === "success").length,
      sourcesFailed: runs.filter((r) => r.status === "failed").length,
      articlesFound: runs.reduce((sum, r) => sum + r.articles_found, 0),
      newArticles: runs.reduce((sum, r) => sum + r.new_articles, 0),
      duplicates: runs.reduce((sum, r) => sum + r.duplicates, 0),
      skippedArticles: runs.reduce((sum, r) => sum + r.skipped_articles, 0),
      runs,
    });
  }

  batches.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return batches.slice(0, batchLimit);
}

export interface GeminiUsageToday {
  requests: number;
  successful: number;
  failed: number;
}

export async function getGeminiUsageToday(supabase: SupabaseClient): Promise<GeminiUsageToday> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("ai_processing_logs")
    .select("status")
    .gte("created_at", startOfDayUtc.toISOString());

  if (error) throw error;

  const rows = (data ?? []) as { status: "success" | "error" }[];
  return {
    requests: rows.length,
    successful: rows.filter((r) => r.status === "success").length,
    failed: rows.filter((r) => r.status === "error").length,
  };
}
