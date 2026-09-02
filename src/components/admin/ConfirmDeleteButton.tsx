"use client";

import { useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { Modal } from "@/components/shared/Modal";

export function ConfirmDeleteButton({
  action,
  itemLabel,
  onConfirm,
}: {
  action: () => Promise<void | { error?: string }>;
  itemLabel: string;
  // Called synchronously (wrapped in flushSync) the moment deletion is
  // confirmed, *before* starting the transition that calls `action` -- lets
  // a caller apply an optimistic UI change (e.g. removing a row) that
  // commits and paints immediately. React defers committing anything from
  // inside a transition until every promise reachable from it settles, so
  // without flushSync this would get batched into the same update as the
  // transition below (both fire in this one click handler) and sit
  // invisible until the real network call finishes -- the exact "feels
  // like a refresh" delay this callback exists to avoid.
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-danger hover:underline"
      >
        Delete
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirm deletion">
        <p className="text-sm text-foreground/90">
          Delete <strong>{itemLabel}</strong>? This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              flushSync(() => {
                onConfirm?.();
                setOpen(false);
              });
              startTransition(async () => {
                await action();
              });
            }}
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </>
  );
}
