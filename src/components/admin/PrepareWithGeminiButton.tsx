"use client";

import { useState, useTransition } from "react";
import type { CandidateActionState } from "@/lib/actions/candidates";

export function PrepareWithGeminiButton({
  action,
  label = "Prepare with Gemini",
}: {
  action: () => Promise<CandidateActionState>;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setError(result.error ?? null);
          })
        }
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Preparing…" : label}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
