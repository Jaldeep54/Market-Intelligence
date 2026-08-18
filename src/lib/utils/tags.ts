import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by manual news creation/editing and the automated pipeline's
// Approve & Publish action -- both write into the same `news`/`news_tags`
// tables and must sync tags identically.
export async function syncTags(
  supabase: SupabaseClient,
  newsId: string,
  tagNames: string[]
): Promise<void> {
  await supabase.from("news_tags").delete().eq("news_id", newsId);
  if (tagNames.length === 0) return;

  const { data: tagRows, error } = await supabase
    .from("tags")
    .upsert(
      tagNames.map((name) => ({ name })),
      { onConflict: "name", ignoreDuplicates: false }
    )
    .select("id,name");

  if (error || !tagRows) return;

  await supabase
    .from("news_tags")
    .insert((tagRows as { id: string; name: string }[]).map((t) => ({ news_id: newsId, tag_id: t.id })));
}
