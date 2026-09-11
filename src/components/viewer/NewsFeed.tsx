"use client";

import { SwipeStage } from "@/components/shared/SwipeStage";
import { NewsCard } from "@/components/viewer/NewsCard";
import { recordActivityAction } from "@/lib/actions/activity";
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
      renderItem={(item, index) => <NewsCard news={item} index={index} />}
      // Fire-and-forget usage counter -- see recordActivityAction. Not
      // awaited: a swipe should never wait on this, and it should never be
      // able to interrupt the paging animation if it's slow or fails.
      onIndexChange={() => {
        void recordActivityAction("news_swipe");
      }}
    />
  );
}
