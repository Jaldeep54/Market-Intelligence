import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareNewsWithGemini } from "@/lib/ai/gemini";
import type { CandidateStatus } from "@/lib/types/database";

// Shared by the manual "Prepare with Gemini" action (src/lib/actions/candidates.ts)
// and the automatic prepare-at-ingestion call in fetchOneSource
// (src/lib/automation/fetchSources.ts), so both paths log to
// ai_processing_logs and persist prepared_* fields identically -- the only
// difference between them is `requestedBy` (an admin's user id for the
// manual path, null for automatic runs) and where the article/company data
// comes from.

export interface CandidateArticleInfo {
  sourceName: string;
  originalTitle: string;
  originalDescription: string | null;
  rawContent: string | null;
  publishedAt: string | null;
  sourceUrl: string;
}

export interface GeminiCompanyLookup {
  companyNames: string[];
  companyIdByName: Map<string, string>;
}

export async function runGeminiPrepare(
  supabase: SupabaseClient,
  candidateId: string,
  article: CandidateArticleInfo,
  lookup: GeminiCompanyLookup,
  requestedBy: string | null,
  currentStatus: CandidateStatus
): Promise<{ ok: boolean; error?: string }> {
  const result = await prepareNewsWithGemini({
    sourceName: article.sourceName,
    originalTitle: article.originalTitle,
    originalDescription: article.originalDescription,
    rawContent: article.rawContent,
    publishedAt: article.publishedAt,
    sourceUrl: article.sourceUrl,
    companyNames: lookup.companyNames,
  });

  await supabase.from("ai_processing_logs").insert({
    candidate_id: candidateId,
    model: result.model,
    status: result.ok ? "success" : "error",
    error_message: result.ok ? null : result.message,
    requested_by: requestedBy,
  });

  if (!result.ok) {
    await supabase.from("news_candidates").update({ gemini_error: result.message }).eq("id", candidateId);
    return { ok: false, error: result.message };
  }

  const matchedCompanyId = result.data.companyName
    ? lookup.companyIdByName.get(result.data.companyName.toLowerCase()) ?? null
    : null;

  const nextStatus = currentStatus === "published" || currentStatus === "rejected" ? currentStatus : "prepared";

  await supabase
    .from("news_candidates")
    .update({
      prepared_title: result.data.title,
      prepared_description: result.data.description,
      prepared_category: result.data.category,
      prepared_company_id: matchedCompanyId,
      prepared_news_date: result.data.newsDate,
      prepared_tags: result.data.tags,
      gemini_last_run_at: new Date().toISOString(),
      // Reuses gemini_error as a non-fatal notice when the word-count
      // fallback had to kick in (see prepareNewsWithGemini) -- the
      // description was still saved, just outside the 60-70 word target, so
      // it's flagged here for spot-checking rather than treated as a hard
      // failure. Cleared to null whenever a run lands cleanly in range.
      gemini_error: result.wordCountWarning ?? null,
      status: nextStatus,
      reviewed_by: requestedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  return { ok: true };
}

// Called from fetchOneSource's own try/catch around runGeminiPrepare -- a
// thrown exception (network blip, an SDK constructor throwing, the host
// process being killed mid-call by a serverless timeout) previously meant
// the whole per-source loop aborted with NO ai_processing_logs row and no
// gemini_error at all: prepared_title stayed null with zero trace of why,
// indistinguishable from auto-prepare never having been triggered. This
// guarantees every candidate that reaches an attempt ends up with a visible
// record one way or another.
export async function recordGeminiCrash(supabase: SupabaseClient, candidateId: string, err: unknown): Promise<void> {
  const message =
    err instanceof Error
      ? `Auto-prepare crashed before completing: ${err.message}`
      : "Auto-prepare crashed before completing (unexpected error).";

  console.error(`[runGeminiPrepare] threw for candidate ${candidateId}:`, err);

  await supabase.from("ai_processing_logs").insert({
    candidate_id: candidateId,
    model: "unknown",
    status: "error",
    error_message: message,
    requested_by: null,
  });

  await supabase.from("news_candidates").update({ gemini_error: message }).eq("id", candidateId);
}
