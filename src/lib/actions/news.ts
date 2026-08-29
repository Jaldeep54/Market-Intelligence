"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { newsSchema, parseTagsInput } from "@/lib/validation/news";
import { syncTags } from "@/lib/utils/tags";
import { extractArticleText } from "@/lib/utils/extractArticleText";
import { generateNewsDraftFromUrl } from "@/lib/ai/gemini";

export interface NewsFormState {
  error?: string;
}

export interface GenerateNewsDraftState {
  error?: string;
  data?: {
    title: string;
    description: string;
    tags: string[];
  };
}

const draftSourceUrlSchema = z.string().trim().url();

// "Generate with Gemini" on the Add News page (spec section 2/3). Only ever
// returns data for the client to populate into the form -- it never writes
// to the `news` table. Publishing still requires an explicit
// createNewsAction submit, same as every other article on this platform.
export async function generateNewsDraftAction(sourceUrl: string): Promise<GenerateNewsDraftState> {
  const parsedUrl = draftSourceUrlSchema.safeParse(sourceUrl);
  if (!parsedUrl.success) {
    return { error: "Enter a valid source URL before generating with Gemini." };
  }

  const extracted = await extractArticleText(parsedUrl.data);
  if (!extracted.ok) {
    return { error: extracted.error ?? "Could not read the article at this URL." };
  }

  const result = await generateNewsDraftFromUrl({
    sourceUrl: parsedUrl.data,
    pageTitle: extracted.title,
    pageText: extracted.text,
  });

  if (!result.ok) {
    return { error: result.message };
  }

  return {
    data: {
      title: result.data.title,
      description: result.data.description,
      tags: result.data.tags,
    },
  };
}

function readNewsForm(formData: FormData) {
  return newsSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    company_id: String(formData.get("company_id") ?? ""),
    news_date: String(formData.get("news_date") ?? ""),
    source_url: String(formData.get("source_url") ?? ""),
    published: formData.get("published") === "on",
    tags: parseTagsInput(String(formData.get("tags") ?? "")),
  });
}

export async function createNewsAction(
  _prevState: NewsFormState,
  formData: FormData
): Promise<NewsFormState> {
  const parsed = readNewsForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: inserted, error } = await supabase
    .from("news")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      company_id: parsed.data.company_id || null,
      news_date: parsed.data.news_date,
      source_url: parsed.data.source_url,
      published: parsed.data.published,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the article." };
  }

  await syncTags(supabase, inserted.id, parsed.data.tags);

  revalidatePath("/admin/news");
  revalidatePath("/");
  redirect("/admin/news");
}

export async function updateNewsAction(
  id: string,
  _prevState: NewsFormState,
  formData: FormData
): Promise<NewsFormState> {
  const parsed = readNewsForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("news")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      company_id: parsed.data.company_id || null,
      news_date: parsed.data.news_date,
      source_url: parsed.data.source_url,
      published: parsed.data.published,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await syncTags(supabase, id, parsed.data.tags);

  revalidatePath("/admin/news");
  revalidatePath("/");
  redirect("/admin/news");
}

// Returns {error?} rather than void so callers can tell a real failure
// apart from success -- existing callers (via ConfirmDeleteButton) don't
// read the resolved value, so this is a non-breaking widening.
export async function deleteNewsAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("news").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/news");
  revalidatePath("/");
  return {};
}

export async function toggleNewsPublishedAction(id: string, nextPublished: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("news").update({ published: nextPublished }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/news");
  revalidatePath("/");
  return {};
}
