"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCandidateById } from "@/lib/data/candidates";
import { getCompanies } from "@/lib/data/companies";
import { runGeminiPrepare, type GeminiCompanyLookup } from "@/lib/automation/candidatePrepare";
import { readCandidatePrepForm } from "@/lib/validation/candidates";
import { syncTags } from "@/lib/utils/tags";

export interface CandidateActionState {
  error?: string;
}

// "Prepare with Gemini" -- runs only when the admin clicks it (spec section
// 18). Every attempt is logged to ai_processing_logs regardless of outcome.
// Shares its Gemini-call-and-persist logic with the automatic prepare that
// runs at ingestion time in fetchOneSource (src/lib/automation/fetchSources.ts)
// via runGeminiPrepare -- this action just supplies the admin's user id as
// `requestedBy` where the automatic path passes null.
export async function prepareCandidateWithGeminiAction(candidateId: string): Promise<CandidateActionState> {
  const supabase = await createClient();
  const candidate = await getCandidateById(supabase, candidateId);
  if (!candidate) return { error: "This article could not be found." };

  const companies = await getCompanies(supabase);
  const lookup: GeminiCompanyLookup = {
    companyNames: companies.map((c) => c.name),
    companyIdByName: new Map(companies.map((c) => [c.name.toLowerCase(), c.id])),
  };

  const { data: userData } = await supabase.auth.getUser();

  const result = await runGeminiPrepare(
    supabase,
    candidateId,
    {
      sourceName: candidate.article.source_name,
      originalTitle: candidate.article.original_title,
      originalDescription: candidate.article.original_description,
      rawContent: candidate.article.raw_content,
      publishedAt: candidate.article.published_at,
      sourceUrl: candidate.article.original_url,
    },
    lookup,
    userData.user?.id ?? null,
    candidate.status
  );

  revalidatePath(`/admin/inbox/${candidateId}`);
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/review");

  if (!result.ok) return { error: result.error };
  return {};
}

// One form drives both buttons ("Save" and "Approve & Publish"): each
// <button type="submit" name="intent" value="save"|"publish"> tells this
// single action which path to take, so both always act on the exact same
// edited values -- there is no way to publish something other than what is
// on screen.
export async function saveOrPublishCandidateAction(
  candidateId: string,
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const intent = String(formData.get("intent") ?? "save");
  if (intent === "publish") {
    return publishCandidate(candidateId, formData);
  }
  return saveCandidate(candidateId, formData);
}

async function saveCandidate(candidateId: string, formData: FormData): Promise<CandidateActionState> {
  const parsed = readCandidatePrepForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("news_candidates")
    .select("status")
    .eq("id", candidateId)
    .single();

  if (existing?.status === "published") {
    return { error: "This article has already been published and can no longer be edited here." };
  }

  const { error } = await supabase
    .from("news_candidates")
    .update({
      prepared_title: parsed.data.title,
      prepared_description: parsed.data.description,
      prepared_category: parsed.data.category,
      prepared_company_id: parsed.data.company_id || null,
      prepared_news_date: parsed.data.news_date,
      prepared_tags: parsed.data.tags,
      status: "prepared",
      reviewed_by: userData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/inbox/${candidateId}`);
  revalidatePath("/admin/inbox");
  return {};
}

// The only path that ever writes into the existing `news` table. Requires a
// human click; Gemini output alone never publishes (spec section 22). Shared
// by the full-page review form (which redirects back to the inbox list) and
// the Admin News View card (which stays on the same page and removes the
// card optimistically) -- see performPublish below.
async function publishCandidate(candidateId: string, formData: FormData): Promise<CandidateActionState> {
  const result = await performPublish(candidateId, formData);
  if (result.error) return result;

  revalidatePath("/admin/inbox");
  revalidatePath("/admin/review");
  revalidatePath("/admin/news");
  revalidatePath("/");
  redirect("/admin/inbox");
}

// Thin wrapper around the same publish logic for the Admin News View: no
// redirect, since that page removes the published card from its own list
// instead of navigating away.
export async function publishCandidateInlineAction(
  candidateId: string,
  formData: FormData
): Promise<CandidateActionState> {
  const result = await performPublish(candidateId, formData);
  if (result.error) return result;

  revalidatePath("/admin/inbox");
  revalidatePath("/admin/review");
  revalidatePath("/admin/news");
  revalidatePath("/");
  return {};
}

async function performPublish(candidateId: string, formData: FormData): Promise<CandidateActionState> {
  const parsed = readCandidatePrepForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const supabase = await createClient();

  const { data: existingCandidate, error: fetchError } = await supabase
    .from("news_candidates")
    .select("id, status, published_news_id, article:scraped_articles(original_url)")
    .eq("id", candidateId)
    .single();

  if (fetchError || !existingCandidate) return { error: "This article could not be found." };

  const candidateRow = existingCandidate as unknown as {
    status: string;
    published_news_id: string | null;
    article: { original_url: string } | null;
  };

  if (candidateRow.status === "published" || candidateRow.published_news_id) {
    return { error: "This article has already been published." };
  }

  const sourceUrl = candidateRow.article?.original_url;
  if (!sourceUrl) return { error: "Missing source URL for this article." };

  const { data: userData } = await supabase.auth.getUser();

  const { data: inserted, error: insertError } = await supabase
    .from("news")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      company_id: parsed.data.company_id || null,
      news_date: parsed.data.news_date,
      source_url: sourceUrl,
      published: true,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Could not publish this article." };
  }

  await syncTags(supabase, inserted.id, parsed.data.tags);

  await supabase
    .from("news_candidates")
    .update({
      prepared_title: parsed.data.title,
      prepared_description: parsed.data.description,
      prepared_category: parsed.data.category,
      prepared_company_id: parsed.data.company_id || null,
      prepared_news_date: parsed.data.news_date,
      prepared_tags: parsed.data.tags,
      status: "published",
      published_news_id: inserted.id,
      approved_by: userData.user?.id ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  return {};
}

export async function rejectCandidateAction(candidateId: string) {
  const supabase = await createClient();
  await supabase.from("news_candidates").update({ status: "rejected" }).eq("id", candidateId);
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${candidateId}`);
  revalidatePath("/admin/review");
}

export async function markDuplicateCandidateAction(candidateId: string) {
  const supabase = await createClient();
  await supabase.from("news_candidates").update({ status: "duplicate" }).eq("id", candidateId);
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${candidateId}`);
}

// Dismisses a "possible duplicate" flag without discarding the article.
export async function keepCandidateAction(candidateId: string) {
  const supabase = await createClient();
  await supabase
    .from("news_candidates")
    .update({ possible_duplicate_of: null, duplicate_note: null })
    .eq("id", candidateId);
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${candidateId}`);
}

// Deletes the underlying scraped_articles row, which cascades (via
// news_candidates.scraped_article_id references scraped_articles(id) on
// delete cascade) to remove the news_candidates row too -- only one delete
// is ever issued here, never both rows explicitly. Refuses outright once an
// article has been published, since that news row must survive on its own.
export async function deleteCandidateAction(candidateId: string): Promise<CandidateActionState> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("news_candidates")
    .select("status, published_news_id, scraped_article_id")
    .eq("id", candidateId)
    .single();

  if (fetchError || !existing) return { error: "This article could not be found." };

  if (existing.status === "published" || existing.published_news_id) {
    return { error: "This article has already been published and cannot be deleted here." };
  }

  const { error } = await supabase.from("scraped_articles").delete().eq("id", existing.scraped_article_id);
  if (error) return { error: error.message };

  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${candidateId}`);
  revalidatePath("/admin/review");
  return {};
}
