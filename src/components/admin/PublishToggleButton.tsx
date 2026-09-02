"use client";

export function PublishToggleButton({
  action,
  published,
  onOptimisticStart,
}: {
  action: () => Promise<void | { error?: string }>;
  published: boolean;
  // Called synchronously before `action`, so a caller can apply an
  // optimistic UI change (flip this row's published state) that paints
  // immediately rather than waiting on the network. This component holds no
  // local state of its own: `published` is fully owned by the parent
  // (NewsTable), which flips it via onOptimisticStart and reverts it if
  // `action` reports an error. Introducing any local state here that's
  // updated in the same click handler as calling `action` (a real Server
  // Action) -- even just a `pending` boolean -- causes React to re-render
  // this button from a stale pre-click snapshot right after the Server
  // Action starts, which clobbers the parent's optimistic update until the
  // network call resolves. Keeping this component fully stateless avoids
  // that entirely.
  onOptimisticStart?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onOptimisticStart?.();
        void action();
      }}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        published
          ? "bg-accent/10 text-accent hover:bg-accent/20"
          : "bg-border/60 text-muted hover:bg-border"
      }`}
    >
      {published ? "Published" : "Unpublished"}
    </button>
  );
}
