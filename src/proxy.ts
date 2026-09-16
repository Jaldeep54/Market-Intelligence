import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, the web app manifest, the service worker, etc.
     *
     * The manifest and icons must stay reachable without a session --
     * a phone's "Add to Home Screen" flow fetches them unauthenticated,
     * and a login-page redirect there isn't valid manifest/icon content.
     * The service worker (public/sw.js) needs the same treatment: a
     * redirect response for a service-worker script is invalid and the
     * browser refuses to install it (see PushNotificationManager).
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|js)$).*)",
  ],
};
