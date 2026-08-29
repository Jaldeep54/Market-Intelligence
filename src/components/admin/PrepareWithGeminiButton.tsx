"use client";

import { useState, useTransition } from "react";
import type { CandidateActionState } from "@/lib/actions/candidates";

export function PrepareWithGeminiButton({
  action,
  label = "Prepare with Gemini",
  onSuccess,
  disabled = false,
}: {
  action: () => Promise<CandidateActionState>;
  label?: string;
  // Optional: lets a caller update its own fields directly from the
  // generated content (e.g. AdminReviewCard) instead of relying on
  // revalidatePath, which an already-mounted client component's local
  // state won't automatically pick up. The News Inbox review page doesn't
  // pass this and is unaffected.
  onSuccess?: (data: NonNullable<CandidateActionState["data"]>) => void;
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
            if (!result.error && result.data) {
              onSuccess?.(result.data);
            }
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
