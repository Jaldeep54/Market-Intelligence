"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { newsSchema, parseTagsInput } from "@/lib/validation/news";
import { syncTags } from "@/lib/utils/tags";

export interface NewsFormState {
  error?: string;
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

export async function deleteNewsAction(id: string) {
  const supabase = await createClient();
  await supabase.from("news").delete().eq("id", id);
  revalidatePath("/admin/news");
  revalidatePath("/");
}

export async function toggleNewsPublishedAction(id: string, nextPublished: boolean) {
  const supabase = await createClient();
  await supabase.from("news").update({ published: nextPublished }).eq("id", id);
  revalidatePath("/admin/news");
  revalidatePath("/");
}
