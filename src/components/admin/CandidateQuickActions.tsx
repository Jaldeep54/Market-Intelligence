"use client";

import { useState, useTransition } from "react";
import {
  deleteCandidateAction,
  keepCandidateAction,
  markDuplicateCandidateAction,
  rejectCandidateAction,
} from "@/lib/actions/candidates";
import { Modal } from "@/components/shared/Modal";

export function CandidateQuickActions({
  candidateId,
  hasPossibleDuplicate,
}: {
  candidateId: string;
  hasPossibleDuplicate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setDeleteError(null);
          setConfirmOpen(true);
        }}
        className="font-medium text-danger/80 underline decoration-dotted hover:text-danger disabled:opacity-50"
      >
        Delete
      </button>
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm deletion">
        <p className="text-sm text-foreground/90">
          Delete this article from the inbox? This removes the scraped article entirely and cannot be undone.
        </p>
        {deleteError && <p className="mt-2 text-sm text-danger">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteCandidateAction(candidateId);
                if (result.error) {
                  setDeleteError(result.error);
                  return;
                }
                setConfirmOpen(false);
              })
            }
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
