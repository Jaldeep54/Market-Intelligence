"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Modal } from "@/components/shared/Modal";
import { AdminNewsCard } from "@/components/admin/AdminNewsCard";
import { deleteNewsAction, toggleNewsPublishedAction } from "@/lib/actions/news";
import type { NewsWithRelations } from "@/lib/types/database";

// Horizontal swipe for the Admin News card view -- deliberately NOT built on
// top of src/components/shared/SwipeStage.tsx, which is vertical (swipe up
// = next, down = previous) for the Viewer. Reusing it here would mean
// either fighting those vertical gestures or changing SwipeStage's meaning
// under the Viewer too. This component owns its own horizontal drag
// handling instead, and keeps the same Previous / X of Y / Next footer for
// a consistent feel with the Viewer's paging.
const SWIPE_THRESHOLD_PX = 100;
const DIRECTION_LOCK_PX = 10;
const DELETE_HOLD_OFFSET_PX = 140;

// Pass a `key` prop from the caller (e.g. key={resetKey} derived from the
// filter params, same convention as viewer/NewsFeed + SwipeStage) to reset
// paging to the first article whenever the filters change rather than just
// the list shrinking/growing.
export function AdminNewsFeed({ items: initialItems }: { items: NewsWithRelations[] }) {
  const [items, setItems] = useState(initialItems);
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

  function handleUpdated(id: string, patch: Partial<NewsWithRelations>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  // Used for both an actual delete and a reject: either way the article no
  // longer belongs in the current pass, so it's removed from `items` and
  // whatever was next slides into the same index automatically (see the
  // safeIndex clamp above) -- no separate "advance to next" step needed.
  function removeFromList(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
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
      // Lock to whichever axis dominates the gesture so a mostly-vertical
      // scroll inside the card is never hijacked as a horizontal swipe.
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
      // Destructive -- hold the card pulled aside and confirm before
      // actually deleting anything.
      setDragX(-DELETE_HOLD_OFFSET_PX);
      setConfirmDeleteOpen(true);
    } else if (finalDragX >= SWIPE_THRESHOLD_PX) {
      // Reject is reversible (just published: false, same as the Publish
      // menu action in reverse) -- no confirmation needed to keep the
      // read-and-triage workflow fast.
      await commitReject();
    } else {
      setDragX(0);
    }
  }

  async function commitReject() {
    if (!current) return;
    setPendingAction(true);
    const result = await toggleNewsPublishedAction(current.id, false);
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
    const result = await deleteNewsAction(current.id);
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
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-sm text-muted">
        No articles match these filters.
      </div>
    );
  }

  const dragProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD_PX, 1);
  const direction = dragX <= -DIRECTION_LOCK_PX ? "delete" : dragX >= DIRECTION_LOCK_PX ? "reject" : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 py-4 sm:px-8">
        <div className="relative w-full max-w-4xl">
          {direction && (
            <div
              aria-hidden="true"
              className={`absolute inset-0 flex items-center overflow-hidden rounded-2xl px-8 text-lg font-semibold text-white ${
                direction === "delete" ? "justify-end bg-danger" : "justify-start bg-amber-500"
              }`}
              style={{ opacity: dragProgress }}
            >
              {direction === "delete" ? "Delete" : "Reject"}
            </div>
          )}

          <div
            key={current.id}
            className="relative"
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
            <AdminNewsCard news={current} onUpdated={handleUpdated} onDeleted={removeFromList} />
          </div>
        </div>
      </div>

      {swipeError && <p className="px-4 pb-2 text-center text-sm text-danger">{swipeError}</p>}

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
          Delete <strong>{current.title}</strong>? This cannot be undone.
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
