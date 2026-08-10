"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/shared/Modal";

export function ConfirmDeleteButton({
  action,
  itemLabel,
}: {
  action: () => Promise<void>;
  itemLabel: string;
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
            onClick={() =>
              startTransition(async () => {
                await action();
                setOpen(false);
              })
            }
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </>
  );
}
