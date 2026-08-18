import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsSource } from "@/lib/types/database";

export async function getSources(supabase: SupabaseClient): Promise<NewsSource[]> {
  const { data, error } = await supabase
    .from("news_sources")
    .select("*")
    .order("source_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NewsSource[];
}

export async function getActiveSources(supabase: SupabaseClient): Promise<NewsSource[]> {
  const { data, error } = await supabase
    .from("news_sources")
    .select("*")
    .eq("active", true)
    .order("source_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NewsSource[];
}

export async function getSourceById(supabase: SupabaseClient, id: string): Promise<NewsSource | null> {
  const { data, error } = await supabase.from("news_sources").select("*").eq("id", id).single();
  if (error) return null;
  return data as NewsSource;
}
