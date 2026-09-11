"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resetPasswordSchema } from "@/lib/validation/auth";

const GENERIC_MESSAGE = "If that email is registered, a code has been sent to it.";
const RESEND_COOLDOWN_SECONDS = 60;

export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // verifyOtp establishes the session (via this browser's cookies) that
    // updateUser then needs -- no session exists yet at this point, unlike
    // the earlier link-based design.
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (verifyError) {
      setLoading(false);
      setError(verifyError.message);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.refresh();
    router.push("/login");
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    setResending(true);

    // auth.resend() only covers "signup"/"email_change" OTPs -- a fresh
    // recovery code is just another resetPasswordForEmail() call.
    const supabase = createClient();
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setResendMessage("A new code has been sent.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Market Intelligence
        </h1>
        <p className="mt-1 text-sm text-muted">Choose a new password</p>
      </div>

      <p className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm text-foreground">
        {GENERIC_MESSAGE} Enter the code and your new password for{" "}
        <span className="font-medium">{email}</span> below.
      </p>

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
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-foreground">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {resendMessage && !error && <p className="text-sm text-foreground">{resendMessage}</p>}

          <button
            type="submit"
            disabled={loading || token.length !== 6}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save new password"}
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
    </div>
  );
}
