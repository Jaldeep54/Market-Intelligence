"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUpAction, type AuthFormState } from "@/lib/actions/auth";
import { isAllowedSignupEmail } from "@/lib/validation/auth";

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Instant feedback only -- signUpAction re-checks this server-side and is
  // what actually enforces it, since the client-side check here can always
  // be bypassed.
  const emailTouched = email.trim().length > 0;
  const domainLooksValid = !emailTouched || isAllowedSignupEmail(email);
  const passwordsTouched = confirmPassword.length > 0;
  const passwordsMatch = !passwordsTouched || password === confirmPassword;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Market Intelligence
        </h1>
        <p className="mt-1 text-sm text-muted">Register with your goldisolar.com email</p>
      </div>

      {state.info ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm text-foreground">{state.info}</p>
        </div>
      ) : (
        <form action={formAction} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="you@goldisolar.com"
              />
              {!domainLooksValid && (
                <p className="mt-1 text-xs text-danger">Must be a goldisolar.com email address.</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                name="password"
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
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="••••••••"
              />
              {!passwordsMatch && <p className="mt-1 text-xs text-danger">Passwords do not match.</p>}
            </div>

            {state.error && <p className="text-sm text-danger">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Creating account…" : "Create account"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
