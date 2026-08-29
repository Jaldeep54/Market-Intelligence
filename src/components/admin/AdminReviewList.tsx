"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Modal } from "@/components/shared/Modal";
import { AdminReviewCard } from "@/components/admin/AdminReviewCard";
import { deleteCandidateAction, rejectCandidateAction } from "@/lib/actions/candidates";
import type { Company, NewsCandidateWithArticle } from "@/lib/types/database";

// One candidate at a time with a Previous / X of Y / Next footer, plus
// horizontal swipe: left deletes (with a confirm step, same pattern used
// elsewhere), right rejects (reversible via the existing Reject button
// elsewhere in the app, so no confirmation needed). Deliberately its own
// drag handling rather than reusing src/components/shared/SwipeStage.tsx,
// which is vertical (swipe up/down = next/previous) for the Viewer --
// reusing it here would conflict with left/right-for-actions, or would
// change SwipeStage's meaning under the Viewer too. AdminReviewCard itself
// is unchanged: its own Publish/Reject/Delete buttons keep working exactly
// as before, and swipe is just a faster path to the same actions.
const SWIPE_THRESHOLD_PX = 100;
const DIRECTION_LOCK_PX = 10;
const DELETE_HOLD_OFFSET_PX = 140;

export function AdminReviewList({
  candidates,
  companies,
}: {
  candidates: NewsCandidateWithArticle[];
  companies: Company[];
}) {
  const [items, setItems] = useState(candidates);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const [swipeError, setSwipeError] = useState<string | null>(null);

  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragLocked = useRef<"horizontal" | "vertical" | null>(null);

  const safeIndex = items.length === 0 ? 0 : Math.min(index, items.length - 1);
  const current = items[safeIndex];

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Used by both the swipe gestures below and AdminReviewCard's own
  // Publish/Reject/Delete buttons (passed as the `onRemove` prop) -- either
  // path removes the candidate from `items`, and whatever was next slides
  // into the same index automatically via the safeIndex clamp above.
  function removeFromList(id: string) {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (pendingAction || confirmDeleteOpen) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragLocked.current = null;
    setSwipeError(null);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (dragLocked.current === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      // Lock to whichever axis dominates so scrolling inside the card
      // (title/description fields, long text) is never hijacked.
      dragLocked.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }

    if (dragLocked.current !== "horizontal") return;
    e.preventDefault();
    setDragX(dx);
  }

  async function handlePointerUp() {
    if (!dragStart.current) {
      setDragging(false);
      return;
    }
    const wasHorizontal = dragLocked.current === "horizontal";
    const finalDragX = dragX;
    dragStart.current = null;
    dragLocked.current = null;
    setDragging(false);

    if (!wasHorizontal) {
      setDragX(0);
      return;
    }

    if (finalDragX <= -SWIPE_THRESHOLD_PX) {
      setDragX(-DELETE_HOLD_OFFSET_PX);
      setConfirmDeleteOpen(true);
    } else if (finalDragX >= SWIPE_THRESHOLD_PX) {
      await commitReject();
    } else {
      setDragX(0);
    }
  }

  async function commitReject() {
    if (!current) return;
    setPendingAction(true);
    const result = await rejectCandidateAction(current.id);
    setPendingAction(false);

    if (result?.error) {
      setSwipeError(result.error);
      setDragX(0);
      return;
    }

    removeFromList(current.id);
    setDragX(0);
  }

  async function commitDelete() {
    if (!current) return;
    setPendingAction(true);
    const result = await deleteCandidateAction(current.id);
    setPendingAction(false);
    setConfirmDeleteOpen(false);

    if (result?.error) {
      setSwipeError(result.error);
      setDragX(0);
      return;
    }

    removeFromList(current.id);
    setDragX(0);
  }

  function cancelSwipeDelete() {
    setConfirmDeleteOpen(false);
    setDragX(0);
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">No articles waiting for review.</p>;
  }

  const dragProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD_PX, 1);
  const direction = dragX <= -DIRECTION_LOCK_PX ? "delete" : dragX >= DIRECTION_LOCK_PX ? "reject" : null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative">
        {direction && (
          <div
            aria-hidden="true"
            className={`absolute inset-0 flex items-center overflow-hidden rounded-xl px-8 text-lg font-semibold text-white ${
              direction === "delete" ? "justify-end bg-danger" : "justify-start bg-amber-500"
            }`}
            style={{ opacity: dragProgress }}
          >
            {direction === "delete" ? "Delete" : "Reject"}
          </div>
        )}

        <div
          key={current.id}
          style={{
            transform: `translateX(${dragX}px)`,
            transition: dragging ? "none" : "transform 0.2s ease",
            touchAction: "pan-y",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <AdminReviewCard candidate={current} companies={companies} onRemove={removeFromList} />
        </div>
      </div>

      {swipeError && <p className="text-center text-sm text-danger">{swipeError}</p>}

      <div className="flex items-center justify-center gap-4 border-t border-border bg-surface py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          className="min-h-[44px] rounded-full border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="min-w-[6rem] text-center text-xs font-medium text-muted">
          {safeIndex + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex === items.length - 1}
          className="min-h-[44px] rounded-full border border-border px-4 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <Modal open={confirmDeleteOpen} onClose={cancelSwipeDelete} title="Confirm deletion">
        <p className="text-sm text-foreground/90">
          Delete this article from the inbox? This removes the scraped article entirely and cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelSwipeDelete}
            className="min-h-[44px] rounded-lg border border-border px-4 text-sm text-foreground hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pendingAction}
            onClick={commitDelete}
            className="min-h-[44px] rounded-lg bg-danger px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pendingAction ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
