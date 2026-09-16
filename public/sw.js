// Minimal service worker for Web Push only -- no offline caching/asset
// strategy, since that isn't part of what this app needs. Two jobs: show a
// notification when a push arrives, and deep-link into the app when the
// user taps it.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: event.data.text() };
  }

  const title = payload.title || "Market Intelligence";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focuses an already-open tab on the target URL if one exists, otherwise
// opens a new one -- standard "deep link from a notification" pattern that
// works the same in Android Chrome and iOS Safari's standalone mode.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const newsId = event.notification.data && event.notification.data.newsId;
  const targetUrl = newsId ? `/news/${newsId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
