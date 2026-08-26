"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseExcludeUrlPatterns, sourceSchema } from "@/lib/validation/sources";
import {
  fetchAllActiveSources,
  fetchSingleSource,
  type BatchFetchSummary,
  type SourceFetchSummary,
} from "@/lib/automation/fetchSources";

export interface SourceFormState {
  error?: string;
}

function readSourceForm(formData: FormData) {
  return sourceSchema.safeParse({
    source_name: String(formData.get("source_name") ?? ""),
    website_url: String(formData.get("website_url") ?? ""),
    feed_url: String(formData.get("feed_url") ?? ""),
    source_type: String(formData.get("source_type") ?? ""),
    default_category: String(formData.get("default_category") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    fetch_interval_minutes: String(formData.get("fetch_interval_minutes") ?? "120"),
    active: formData.get("active") === "on",
    exclude_url_patterns: parseExcludeUrlPatterns(String(formData.get("exclude_urls") ?? "")),
  });
}

export async function createSourceAction(
  _prevState: SourceFormState,
  formData: FormData
): Promise<SourceFormState> {
  const parsed = readSourceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("news_sources").insert({
    source_name: parsed.data.source_name,
    website_url: parsed.data.website_url,
    feed_url: parsed.data.feed_url || null,
    source_type: parsed.data.source_type,
    default_category: parsed.data.default_category || null,
    priority: parsed.data.priority,
    fetch_interval_minutes: parsed.data.fetch_interval_minutes,
    active: parsed.data.active,
    exclude_url_patterns: parsed.data.exclude_url_patterns,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/sources");
  redirect("/admin/sources");
}

export async function updateSourceAction(
  id: string,
  _prevState: SourceFormState,
  formData: FormData
): Promise<SourceFormState> {
  const parsed = readSourceForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("news_sources")
    .update({
      source_name: parsed.data.source_name,
      website_url: parsed.data.website_url,
      feed_url: parsed.data.feed_url || null,
      source_type: parsed.data.source_type,
      default_category: parsed.data.default_category || null,
      priority: parsed.data.priority,
      fetch_interval_minutes: parsed.data.fetch_interval_minutes,
      active: parsed.data.active,
      exclude_url_patterns: parsed.data.exclude_url_patterns,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/sources");
  redirect("/admin/sources");
}

export async function deleteSourceAction(id: string) {
  const supabase = await createClient();
  await supabase.from("news_sources").delete().eq("id", id);
  revalidatePath("/admin/sources");
}

export async function toggleSourceActiveAction(id: string, nextActive: boolean) {
  const supabase = await createClient();
  await supabase.from("news_sources").update({ active: nextActive }).eq("id", id);
  revalidatePath("/admin/sources");
}

export async function fetchSourceNowAction(sourceId: string): Promise<SourceFetchSummary> {
  const supabase = await createClient();
  const result = await fetchSingleSource(supabase, sourceId, "manual_source");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/automation");
  revalidatePath("/admin/inbox");
  return result;
}

export async function fetchAllSourcesAction(): Promise<BatchFetchSummary> {
  const supabase = await createClient();
  const result = await fetchAllActiveSources(supabase, "manual_all");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/automation");
  revalidatePath("/admin/inbox");
  return result;
}
