"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";

interface SwipeStageProps<T> {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
}

const SWIPE_THRESHOLD_PX = 40;
const WHEEL_THRESHOLD = 24;
const WHEEL_COOLDOWN_MS = 550;
// Small buffer so a scroll position that's off-by-a-fraction-of-a-pixel
// (common with fractional zoom levels / subpixel rendering) still counts
// as "at the edge" instead of silently blocking paging forever.
const EDGE_BUFFER_PX = 4;

type Direction = "next" | "prev";

// A two-sided "paper roll" -- both the outgoing and incoming item rotate
// around the leading edge (top for "next", bottom for "prev") at the same
// time, so it reads as one sheet rolling away while the next rolls into
// place rather than a plain slide/fade.
const rollVariants: Variants = {
  initial: (dir: Direction) => ({
    rotateX: dir === "next" ? -78 : 78,
    scaleY: 0.45,
    opacity: 0,
  }),
  animate: { rotateX: 0, scaleY: 1, opacity: 1 },
  exit: (dir: Direction) => ({
    rotateX: dir === "next" ? 78 : -78,
    scaleY: 0.45,
    opacity: 0,
  }),
};

// prefers-reduced-motion: skip the rotation entirely, just crossfade.
const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const ROLL_TRANSITION = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const };
const FADE_TRANSITION = { duration: 0.25, ease: "easeOut" as const };

function isAtTop(el: HTMLElement | null): boolean {
  if (!el) return true;
  return el.scrollTop <= EDGE_BUFFER_PX;
}

function isAtBottom(el: HTMLElement | null): boolean {
  if (!el) return true;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE_BUFFER_PX;
}

// Note: pass a `key` prop from the caller (e.g. key={filtersSignature}) to
// reset paging to the first item whenever the underlying item set changes
// for a new reason (new filter applied) rather than just shrinking/growing.
export function SwipeStage<T>({ items, itemKey, renderItem, emptyMessage }: SwipeStageProps<T>) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>("next");
  const touchStartY = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  // Ref to the scrollable element of whichever item is currently on stage --
  // used to gate paging on scroll position (see handleWheel/handleTouchEnd).
  // The callback ref only ever assigns on mount (never clears to null): with
  // AnimatePresence, the outgoing item stays mounted through its exit
  // animation, so a plain `ref={scrollRef}` would have its cleanup fire
  // *after* the incoming item already mounted and claimed the ref, wiping
  // it back to null right as the new item becomes current.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onChange(e: MediaQueryListEvent) {
      setReducedMotion(e.matches);
    }
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  // The `flex-1` on this component's own root relies on every ancestor up
  // to <body> actually shrinking to the viewport instead of growing to fit
  // content -- which isn't the case here (min-h-screen/min-h-full only set
  // a floor, not a cap, and none of those wrappers clip overflow), so a
  // flex-1 chain alone lets a long item just grow the whole page instead of
  // creating an internally-scrollable region. Measuring and pinning this
  // root's own height to "viewport height minus its own top offset" makes
  // it self-contained: it gets a real, bounded height regardless of what
  // ancestors do, so the item's own overflow-y-auto (and therefore the
  // isAtTop/isAtBottom checks below) actually has something to measure.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [stageHeight, setStageHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    function updateHeight() {
      if (!el) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top;
      setStageHeight(Math.max(viewportHeight - top, 0));
    }

    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
    };
  }, []);

  const safeIndex = items.length === 0 ? 0 : Math.min(index, items.length - 1);

  const goNext = useCallback(() => {
    setDirection("next");
    setIndex(Math.min(safeIndex + 1, Math.max(items.length - 1, 0)));
  }, [safeIndex, items.length]);

  const goPrev = useCallback(() => {
    setDirection("prev");
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

  // Only pages to the next/previous item once the current item's content is
  // already scrolled to the relevant edge -- otherwise this just lets the
  // native scroll happen, so a long article can always be read in full.
  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    if (wheelLocked.current) return;
    if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;

    const el = scrollRef.current;
    if (e.deltaY > 0) {
      if (!isAtBottom(el)) return;
      wheelLocked.current = true;
      goNext();
    } else {
      if (!isAtTop(el)) return;
      wheelLocked.current = true;
      goPrev();
    }
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

    const el = scrollRef.current;
    if (delta > 0) {
      if (isAtBottom(el)) goNext();
    } else {
      if (isAtTop(el)) goPrev();
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
        {emptyMessage ?? "Nothing to show here yet."}
      </div>
    );
  }

  const current = items[safeIndex];
  const progressPercent = ((safeIndex + 1) / items.length) * 100;

  return (
    <div
      ref={rootRef}
      className="flex flex-1 flex-col overflow-hidden"
      style={
        stageHeight !== null
          ? { height: stageHeight, maxHeight: stageHeight, minHeight: stageHeight }
          : undefined
      }
    >
      <div className="h-1 w-full shrink-0 bg-border/50">
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div
        className="relative flex flex-1 flex-col overflow-hidden px-4 py-4 sm:px-8"
        style={{ perspective: 1200 }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div
            key={itemKey(current, safeIndex)}
            custom={direction}
            variants={reducedMotion ? fadeVariants : rollVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={reducedMotion ? FADE_TRANSITION : ROLL_TRANSITION}
            style={{
              transformOrigin: direction === "next" ? "top center" : "bottom center",
            }}
            ref={(el: HTMLDivElement | null) => {
              // Only assign on mount -- see the scrollRef comment above.
              if (el) scrollRef.current = el;
            }}
            className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto"
          >
            {renderItem(current, safeIndex)}
          </motion.div>
        </AnimatePresence>
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
