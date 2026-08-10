"use client";

import { SwipeStage } from "@/components/shared/SwipeStage";
import { CompanyProfileCard } from "@/components/viewer/CompanyProfileCard";
import type { Company, CompanyCapacity } from "@/lib/types/database";

export function CompanyProfileFeed({
  companies,
}: {
  companies: (Company & { capacity: CompanyCapacity | null })[];
}) {
  return (
    <SwipeStage
      items={companies}
      itemKey={(item) => item.id}
      emptyMessage="No companies configured yet."
      renderItem={(item) => <CompanyProfileCard company={item} />}
    />
  );
}
