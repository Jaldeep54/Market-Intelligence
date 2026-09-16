"use server";

import { createClient } from "@/lib/supabase/server";
import type { PushLang } from "@/lib/types/database";

export interface SavePushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

// Upserts on `endpoint` (unique per browser/device subscription): the same
// device calling this again -- e.g. after switching the language toggle --
// updates its existing row's `lang` instead of creating a duplicate. Each
// device/subscription therefore tracks its own language independently, per
// spec. user_id is always taken from the authenticated session, never from
// the client, so this can only ever write the caller's own subscriptions
// (RLS enforces the same thing server-side as defense-in-depth).
export async function savePushSubscriptionAction(
  subscription: SavePushSubscriptionInput,
  lang: PushLang
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in to enable notifications." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userData.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth_key: subscription.authKey,
      lang,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { error: error.message };
  return {};
}
