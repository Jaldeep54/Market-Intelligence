"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/viewer/LanguageContext";
import { savePushSubscriptionAction } from "@/lib/actions/push";
import { canOfferPush, hasPushPermission, registerServiceWorker, subscribeToPush } from "@/lib/push/client";

// After this many articles viewed in a browsing session, offer the
// permission prompt (if eligible) -- not on first load. See
// NewsFeed.tsx, which dispatches "mi:article-viewed" on every swipe.
const VIEWS_BEFORE_PROMPT = 2;

async function save(payload: { endpoint: string; p256dh: string; authKey: string }, lang: "en" | "gu") {
  return savePushSubscriptionAction(payload, lang);
}

// Mounted once in the shared (viewer) layout. Three independent jobs:
// 1. Register the service worker eagerly (cheap, idempotent).
// 2. If permission was already granted in an earlier session, silently
//    re-sync the subscription/language -- no UI, no re-prompt.
// 3. Otherwise, after a couple of articles have been viewed this session,
//    show a single-line opt-in prompt (only when canOfferPush() allows it --
//    this already encodes "never on iOS outside standalone", "never once
//    denied", and "only if the browser supports Push at all").
export function PushNotificationManager() {
  const { lang } = useLanguage();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const viewCount = useRef(0);
  const resyncedForLang = useRef<string | null>(null);

  useEffect(() => {
    void registerServiceWorker();
  }, []);

  // Silent re-sync: already-granted permission, and either first mount or
  // the language toggle changed since the last sync -- keeps the stored
  // `lang` for this device's subscription current without ever prompting.
  useEffect(() => {
    if (!hasPushPermission()) return;
    if (resyncedForLang.current === lang) return;
    resyncedForLang.current = lang;
    void subscribeToPush(lang, save);
  }, [lang]);

  useEffect(() => {
    if (dismissed || showPrompt) return;

    function onArticleViewed() {
      viewCount.current += 1;
      if (viewCount.current >= VIEWS_BEFORE_PROMPT && canOfferPush()) {
        setShowPrompt(true);
      }
    }

    window.addEventListener("mi:article-viewed", onArticleViewed);
    return () => window.removeEventListener("mi:article-viewed", onArticleViewed);
  }, [dismissed, showPrompt]);

  if (!showPrompt) return null;

  async function handleEnable() {
    setPending(true);
    const result = await subscribeToPush(lang, save);
    setPending(false);
    setShowPrompt(false);
    if (result.ok) resyncedForLang.current = lang;
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg sm:px-6"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <p className="text-sm text-foreground">Get notified when new articles are published?</p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            setShowPrompt(false);
          }}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-background"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleEnable}
          className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Enabling…" : "Enable"}
        </button>
      </div>
    </div>
  );
}
