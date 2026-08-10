"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent, type WheelEvent } from "react";

interface SwipeStageProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
}

const SWIPE_THRESHOLD_PX = 40;
const WHEEL_THRESHOLD = 24;
const WHEEL_COOLDOWN_MS = 550;

// Note: pass a `key` prop from the caller (e.g. key={filtersSignature}) to
// reset paging to the first item whenever the underlying item set changes
// for a new reason (new filter applied) rather than just shrinking/growing.
export function SwipeStage<T>({ items, itemKey, renderItem, emptyMessage }: SwipeStageProps<T>) {
  const [index, setIndex] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const wheelLocked = useRef(false);

  const safeIndex = items.length === 0 ? 0 : Math.min(index, items.length - 1);

  const goNext = useCallback(() => {
    setIndex(Math.min(safeIndex + 1, Math.max(items.length - 1, 0)));
  }, [safeIndex, items.length]);

  const goPrev = useCallback(() => {
    setIndex(Math.max(safeIndex - 1, 0));
  }, [safeIndex]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev]);

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (wheelLocked.current) return;
    if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
    wheelLocked.current = true;
    if (e.deltaY > 0) goNext();
    else goPrev();
    setTimeout(() => {
      wheelLocked.current = false;
    }, WHEEL_COOLDOWN_MS);
  }

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (touchStartY.current === null) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;
    const delta = touchStartY.current - endY;
    touchStartY.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta > 0) goNext();
    else goPrev();
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
        {emptyMessage ?? "Nothing to show here yet."}
      </div>
    );
  }

  const current = items[safeIndex];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="flex flex-1 items-center justify-center overflow-hidden px-4 py-4 sm:px-8"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div key={itemKey(current, safeIndex)} className="w-full max-w-2xl">
          {renderItem(current, safeIndex)}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 border-t border-border bg-surface py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted">
          {safeIndex + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex === items.length - 1}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
