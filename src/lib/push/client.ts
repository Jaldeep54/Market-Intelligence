"use client";

import type { PushLang } from "@/lib/types/database";

// Standard boilerplate for turning a VAPID public key (base64url, as
// web-push CLI prints it) into the Uint8Array applicationServerKey the
// Push API actually wants.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" with touch support -- maxTouchPoints
  // is 0 on an actual Mac, so this only matches a touch-capable "Mac".
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Whether it's appropriate to even ASK for permission right now.
// - Feature-detect via PushManager, not iOS version sniffing, so old/
//   unsupported browsers are silently skipped.
// - Never re-ask once the user has denied.
// - Android/desktop: no standalone requirement.
// - iOS: the permission prompt only succeeds in standalone (home-screen
//   installed) mode -- outside of it, stay completely silent (no banner,
//   no "add to home screen" instructions).
export function canOfferPush(): boolean {
  if (typeof window === "undefined") return false;
  if (!("PushManager" in window) || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (Notification.permission === "denied" || Notification.permission === "granted") return false;
  if (isIOS() && !isStandalone()) return false;
  return true;
}

// Permission already granted in an earlier session -- re-run silently (no
// prompt) to keep the subscription/language in sync on this device.
export function hasPushPermission(): boolean {
  if (typeof window === "undefined") return false;
  if (!("PushManager" in window) || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  return Notification.permission === "granted";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

function toPayload(subscription: PushSubscription): PushSubscriptionPayload | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;
  if (!json.endpoint || !p256dh || !authKey) return null;
  return { endpoint: json.endpoint, p256dh, authKey };
}

export type SubscribeResult = { ok: true } | { ok: false; reason: "unsupported" | "permission_denied" | "error" };

// Requests permission (if needed) and subscribes, persisting the result via
// `save`. Used both for the first-time "Enable notifications" tap (permission
// is "default" going in) and for silently re-syncing an already-granted
// subscription (e.g. after a language change) -- in the latter case
// `Notification.requestPermission()` resolves immediately without a prompt
// since the browser already has an answer.
export async function subscribeToPush(
  lang: PushLang,
  save: (payload: PushSubscriptionPayload, lang: PushLang) => Promise<{ error?: string }>
): Promise<SubscribeResult> {
  if (typeof window === "undefined" || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { ok: false, reason: "error" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission_denied" };

  const registration = await registerServiceWorker();
  if (!registration) return { ok: false, reason: "error" };

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const payload = toPayload(subscription);
    if (!payload) return { ok: false, reason: "error" };

    const result = await save(payload, lang);
    return result.error ? { ok: false, reason: "error" } : { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
