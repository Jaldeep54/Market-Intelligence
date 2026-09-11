import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// /reset-password needs to be public: it's reached by a plain client-side
// redirect (from ForgotPasswordForm) *before* the recovery OTP has been
// entered, so there's no session yet at page-load time.
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not run any code between createServerClient and getUser().
  // A simple mistake could make it very hard to debug issues with users
  // being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    // A pending/rejected account is authenticated (it has a real session)
    // but not yet usable -- gate every route except the page that explains
    // why, checked before the /login and /admin rules below so it applies
    // regardless of which page they're trying to reach.
    if (profile?.status !== "approved") {
      if (pathname !== "/pending-approval") {
        return NextResponse.redirect(new URL("/pending-approval", request.url));
      }
      return response;
    }

    // An approved user has no reason to see either the sign-in form or the
    // pending-approval page -- send them where they actually belong.
    if (pathname === "/login" || pathname === "/pending-approval") {
      return NextResponse.redirect(
        new URL(profile?.role === "admin" ? "/admin" : "/", request.url)
      );
    }

    if (pathname.startsWith("/admin") && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}
