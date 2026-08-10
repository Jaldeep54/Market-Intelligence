"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-foreground">Something went wrong loading this page.</p>
      <p className="max-w-sm text-xs text-muted">
        This usually means the app can&apos;t reach Supabase right now, or a save failed. Try
        again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
