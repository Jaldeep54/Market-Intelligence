"use client";

import { useTransition } from "react";

export function SourceActiveToggle({ action, active }: { action: () => Promise<void>; active: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(action)}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        active ? "bg-accent/10 text-accent hover:bg-accent/20" : "bg-border/60 text-muted hover:bg-border"
      }`}
    >
      {pending ? "…" : active ? "Active" : "Inactive"}
    </button>
  );
}
