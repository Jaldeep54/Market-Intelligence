"use client";

import { useState, useTransition } from "react";
import type { CandidateTranslateState } from "@/lib/actions/candidates";

export function TranslateToGujaratiButton({
  action,
  label = "Translate to Gujarati",
  disabled = false,
}: {
  action: () => Promise<CandidateTranslateState>;
  label?: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setError(result.error ?? null);
          })
        }
        className="min-h-[44px] rounded-lg border border-accent px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {pending ? "Translating…" : label}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
