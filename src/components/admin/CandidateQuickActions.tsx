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
  onDeleted,
  onRejected,
  onKept,
  onMarkedDuplicate,
}: {
  candidateId: string;
  hasPossibleDuplicate: boolean;
  // Called after each action's server call resolves successfully, so the
  // caller (InboxList) can update its local list immediately instead of
  // waiting on revalidatePath to refresh the already-mounted list.
  onDeleted?: (candidateId: string) => void;
  onRejected?: (candidateId: string) => void;
  onKept?: (candidateId: string) => void;
  onMarkedDuplicate?: (candidateId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {hasPossibleDuplicate && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await keepCandidateAction(candidateId);
                onKept?.(candidateId);
              })
            }
            className="min-h-[36px] rounded-lg px-2 font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markDuplicateCandidateAction(candidateId);
                onMarkedDuplicate?.(candidateId);
              })
            }
            className="min-h-[36px] rounded-lg px-2 font-medium text-muted hover:bg-background disabled:opacity-50"
          >
            Mark Duplicate
          </button>
        </>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await rejectCandidateAction(candidateId);
            if (!result.error) onRejected?.(candidateId);
          })
        }
        className="min-h-[36px] rounded-lg px-2 font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
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
        className="min-h-[36px] rounded-lg px-2 font-medium text-danger/80 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
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
            className="min-h-[44px] rounded-lg border border-border px-4 text-sm text-foreground hover:bg-background"
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
                onDeleted?.(candidateId);
              })
            }
            className="min-h-[44px] rounded-lg bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
