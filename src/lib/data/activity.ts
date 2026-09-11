import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserActivity } from "@/lib/types/database";

export interface ViewerActivityRow {
  id: string;
  email: string;
  status: string;
  created_at: string;
  news_swipes: number;
  price_trends_visits: number;
  company_profile_visits: number;
}

// Every registered viewer (role = 'viewer'), left-joined with their usage
// counters -- a viewer who has never triggered a tracked event has no row
// in user_activity yet, and should still show up here with zero counts
// rather than being silently omitted (a viewer who never engages is itself
// useful information). Sorted by total activity, most-active first.
export async function getViewerActivity(supabase: SupabaseClient): Promise<ViewerActivityRow[]> {
  const [{ data: viewers, error: viewersError }, { data: activity, error: activityError }] = await Promise.all([
    supabase.from("profiles").select("id, email, status, created_at").eq("role", "viewer"),
    supabase.from("user_activity").select("*"),
  ]);
  if (viewersError) throw viewersError;
  if (activityError) throw activityError;

  const activityByUser = new Map((activity ?? []).map((row: UserActivity) => [row.user_id, row]));

  const rows = (viewers ?? []).map((viewer) => {
    const counts = activityByUser.get(viewer.id);
    return {
      ...viewer,
      news_swipes: counts?.news_swipes ?? 0,
      price_trends_visits: counts?.price_trends_visits ?? 0,
      company_profile_visits: counts?.company_profile_visits ?? 0,
    };
  });

  return rows.sort(
    (a, b) =>
      b.news_swipes +
      b.price_trends_visits +
      b.company_profile_visits -
      (a.news_swipes + a.price_trends_visits + a.company_profile_visits)
  );
}
