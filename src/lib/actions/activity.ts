"use server";

import { createClient } from "@/lib/supabase/server";

export type ActivityKind = "news_swipe" | "price_trends_visit" | "company_profile_visit";

// Fire-and-forget usage counter for the current session's own user --
// record_activity() is a security-definer RPC keyed off auth.uid()
// *inside* the function (see the migration), so this can only ever
// increment the caller's own row, never anyone else's. Never throws: this
// is a side-channel usage counter, not something that should ever break a
// page render or a swipe gesture if it fails.
export async function recordActivityAction(kind: ActivityKind): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_activity", { kind });
  if (error) {
    console.error(`Failed to record "${kind}" activity`, error);
  }
}
