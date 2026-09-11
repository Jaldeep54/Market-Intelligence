"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Matches the resend cooldown Supabase enforces server-side for OTP emails,
// so the button can't be clicked into a rate-limit error in the normal case.
const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // Starts at RESEND_COOLDOWN_SECONDS on mount, not 0 -- signUpAction already
  // sent the first code before this page ever loaded, so Supabase's own
  // cooldown window is already running from that send.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);

    // Browser client so a successful verification's session lands in this
    // browser's cookies immediately -- router.refresh() + router.push()
    // below then carries that into the next server-rendered request, same
    // pattern LoginForm uses after signInWithPassword.
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    setVerifying(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    router.refresh();
    router.push("/");
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    setResending(true);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);

    if (resendError) {
      setError(resendError.message);
      return;
    }

    setResendMessage("A new code has been sent.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Market Intelligence
        </h1>
        <p className="mt-1 text-sm text-muted">
          Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label htmlFor="token" className="mb-1 block text-sm font-medium text-foreground">
              Verification code
            </label>
            <input
              id="token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.5em] text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="000000"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {resendMessage && !error && <p className="text-sm text-foreground">{resendMessage}</p>}

          <button
            type="submit"
            disabled={verifying || token.length !== 6}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {verifying ? "Verifying…" : "Verify"}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-opacity hover:bg-background disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : resending ? "Sending…" : "Resend code"}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Back to sign up
        </Link>
      </p>
    </div>
  );
}
