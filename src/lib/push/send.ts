import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PublishNotificationInput {
  newsId: string;
  title: string;
  titleGu: string | null;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  lang: "en" | "gu";
}

function isVapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Called fire-and-forget (via next/server's after()) from performPublish --
// never awaited by the publish action, and never allowed to throw back into
// it. Sends every viewer's subscription the headline in their stored
// language (falling back to English when no Gujarati title exists, even for
// a "gu" subscriber), Inshorts-style: title only, no elaborate body, with
// just enough `data` for the service worker to deep-link to the article.
export async function sendPublishNotification(input: PublishNotificationInput): Promise<void> {
  if (!isVapidConfigured()) {
    console.warn("[sendPublishNotification] VAPID keys not configured -- skipping push send.");
    return;
  }

  webpush.setVapidDetails(
    "mailto:admin@goldisolar.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key, lang");

  if (error) {
    console.error("[sendPublishNotification] failed to load subscriptions:", error.message);
    return;
  }

  const subscriptions = (data ?? []) as SubscriptionRow[];
  if (subscriptions.length === 0) return;

  const results = await Promise.allSettled(
    subscriptions.map((row) => {
      const title = row.lang === "gu" && input.titleGu ? input.titleGu : input.title;
      const payload = JSON.stringify({
        title,
        data: { newsId: input.newsId },
      });

      return webpush
        .sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth_key },
          },
          payload
        )
        .catch((err) => {
          // 404/410 = the browser has invalidated this subscription
          // (uninstalled, permission revoked, endpoint expired) -- delete it
          // so future publishes stop paying for a dead send. Any other
          // failure (rate limit, transient network) is logged and left
          // alone to retry on the next publish.
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            return supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", row.id)
              .then(() => undefined);
          }
          console.error(`[sendPublishNotification] send failed for subscription ${row.id}:`, err);
          return undefined;
        });
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.error(`[sendPublishNotification] ${failed}/${subscriptions.length} sends threw unexpectedly.`);
  }
}
