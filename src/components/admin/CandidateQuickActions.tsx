"use client";

import { useTransition } from "react";
import { keepCandidateAction, markDuplicateCandidateAction, rejectCandidateAction } from "@/lib/actions/candidates";

export function CandidateQuickActions({
  candidateId,
  hasPossibleDuplicate,
}: {
  candidateId: string;
  hasPossibleDuplicate: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {hasPossibleDuplicate && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => keepCandidateAction(candidateId))}
            className="font-medium text-accent hover:underline disabled:opacity-50"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => markDuplicateCandidateAction(candidateId))}
            className="font-medium text-muted hover:underline disabled:opacity-50"
          >
            Mark Duplicate
          </button>
        </>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => rejectCandidateAction(candidateId))}
        className="font-medium text-danger hover:underline disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
