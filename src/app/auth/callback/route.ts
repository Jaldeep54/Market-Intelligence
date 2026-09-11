import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only accept a same-origin relative path, never an absolute URL -- a "next"
// like "https://evil.com" or "//evil.com" would otherwise turn this into an
// open redirect.
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

// Exchanges the PKCE `code` (from a password-reset or, if email confirmation
// is enabled, a signup-confirmation link) for a session. The code_verifier
// this depends on was written to a cookie by whichever @supabase/ssr client
// started the flow (ForgotPasswordForm's browser client, or signUpAction's
// server client) -- it only exists in that same browser, so this can fail
// if the link is opened on a different browser/device than the one that
// requested it. That's an inherent PKCE + email-link limitation, not a bug.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=invalid_reset_link", origin));
}
