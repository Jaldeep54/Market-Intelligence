"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCandidateById } from "@/lib/data/candidates";
import { getCompanies } from "@/lib/data/companies";
import { prepareNewsWithGemini } from "@/lib/ai/gemini";
import { readCandidatePrepForm } from "@/lib/validation/candidates";
import { syncTags } from "@/lib/utils/tags";

export interface CandidateActionState {
  error?: string;
}

// "Prepare with Gemini" -- runs only when the admin clicks it (spec section
// 18). Every attempt is logged to ai_processing_logs regardless of outcome.
export async function prepareCandidateWithGeminiAction(candidateId: string): Promise<CandidateActionState> {
  const supabase = await createClient();
  const candidate = await getCandidateById(supabase, candidateId);
  if (!candidate) return { error: "This article could not be found." };

  const companies = await getCompanies(supabase);
  const companyNames = companies.map((c) => c.name);

  const result = await prepareNewsWithGemini({
    sourceName: candidate.article.source_name,
    originalTitle: candidate.article.original_title,
    originalDescription: candidate.article.original_description,
    rawContent: candidate.article.raw_content,
    publishedAt: candidate.article.published_at,
    sourceUrl: candidate.article.original_url,
    companyNames,
  });

  const { data: userData } = await supabase.auth.getUser();

  await supabase.from("ai_processing_logs").insert({
    candidate_id: candidateId,
    model: result.model,
    status: result.ok ? "success" : "error",
    error_message: result.ok ? null : result.message,
    requested_by: userData.user?.id ?? null,
  });

  if (!result.ok) {
    await supabase.from("news_candidates").update({ gemini_error: result.message }).eq("id", candidateId);
    revalidatePath(`/admin/inbox/${candidateId}`);
    return { error: result.message };
  }

  const matchedCompany = result.data.companyName
    ? companies.find((c) => c.name.toLowerCase() === result.data.companyName!.toLowerCase())
    : null;

  const nextStatus = candidate.status === "published" || candidate.status === "rejected" ? candidate.status : "prepared";

  await supabase
    .from("news_candidates")
    .update({
      prepared_title: result.data.title,
      prepared_description: result.data.description,
      prepared_category: result.data.category,
      prepared_company_id: matchedCompany?.id ?? null,
      prepared_news_date: result.data.newsDate,
      prepared_tags: result.data.tags,
      gemini_last_run_at: new Date().toISOString(),
      gemini_error: null,
      status: nextStatus,
      reviewed_by: userData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  revalidatePath(`/admin/inbox/${candidateId}`);
  revalidatePath("/admin/inbox");
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
// human click; Gemini output alone never publishes (spec section 22).
async function publishCandidate(candidateId: string, formData: FormData): Promise<CandidateActionState> {
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

  revalidatePath("/admin/inbox");
  revalidatePath("/admin/news");
  revalidatePath("/");
  redirect("/admin/inbox");
}

export async function rejectCandidateAction(candidateId: string) {
  const supabase = await createClient();
  await supabase.from("news_candidates").update({ status: "rejected" }).eq("id", candidateId);
  revalidatePath("/admin/inbox");
  revalidatePath(`/admin/inbox/${candidateId}`);
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
