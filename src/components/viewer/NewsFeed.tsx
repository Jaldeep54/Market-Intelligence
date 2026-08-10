"use client";

import { SwipeStage } from "@/components/shared/SwipeStage";
import { NewsCard } from "@/components/viewer/NewsCard";
import type { NewsWithRelations } from "@/lib/types/database";

export function NewsFeed({
  items,
  resetKey,
  emptyMessage,
}: {
  items: NewsWithRelations[];
  resetKey: string;
  emptyMessage?: string;
}) {
  return (
    <SwipeStage
      key={resetKey}
      items={items}
      itemKey={(item) => item.id}
      emptyMessage={emptyMessage ?? "No published articles match this view yet."}
      renderItem={(item) => <NewsCard news={item} />}
    />
  );
}
