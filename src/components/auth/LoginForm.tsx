"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", data.user.id)
      .single();

    if (profile?.status !== "approved") {
      // Sign back out rather than leaving a live session sitting unused
      // behind this message -- middleware would bounce them to
      // /pending-approval on any navigation attempt anyway, but there's no
      // reason to hold a session open for an account that can't do
      // anything with it.
      await supabase.auth.signOut();
      setError(
        profile?.status === "rejected"
          ? "Your registration request was not approved. Contact your administrator for details."
          : "Your registration is still awaiting admin approval. You'll be able to sign in once it's approved."
      );
      setLoading(false);
      return;
    }

    router.refresh();

    const redirectTo = searchParams.get("redirectTo");
    if (redirectTo && redirectTo !== "/login") {
      router.push(redirectTo);
    } else {
      router.push(profile?.role === "admin" ? "/admin" : "/");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Market Intelligence
        </h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Register with your goldisolar.com email
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted">
        Forgot your password? Contact your administrator to have it reset.
      </p>
    </div>
  );
}
