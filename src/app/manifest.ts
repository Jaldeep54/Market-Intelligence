import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Market Intelligence",
    short_name: "Market Intelligence",
    // "standalone" is required for Web Push to work at all on iOS Safari --
    // the permission prompt only succeeds once the app is running as an
    // installed, standalone app (see PushNotificationManager).
    display: "standalone",
    start_url: "/",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
