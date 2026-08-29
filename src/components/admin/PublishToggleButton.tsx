"use client";

import { useTransition } from "react";

export function PublishToggleButton({
  action,
  published,
}: {
  action: () => Promise<void | { error?: string }>;
  published: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await action();
        })
      }
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        published
          ? "bg-accent/10 text-accent hover:bg-accent/20"
          : "bg-border/60 text-muted hover:bg-border"
      }`}
    >
      {pending ? "…" : published ? "Published" : "Unpublished"}
    </button>
  );
}
