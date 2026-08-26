"use client";

import { useState } from "react";
import type { Company, NewsCandidateWithArticle } from "@/lib/types/database";
import { AdminReviewCard } from "@/components/admin/AdminReviewCard";

export function AdminReviewList({
  candidates,
  companies,
}: {
  candidates: NewsCandidateWithArticle[];
  companies: Company[];
}) {
  const [items, setItems] = useState(candidates);

  function handleRemove(candidateId: string) {
    setItems((prev) => prev.filter((c) => c.id !== candidateId));
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">No articles waiting for review.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((candidate) => (
        <AdminReviewCard key={candidate.id} candidate={candidate} companies={companies} onRemove={handleRemove} />
      ))}
    </div>
  );
}
