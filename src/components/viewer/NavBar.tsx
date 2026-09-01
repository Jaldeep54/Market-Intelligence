"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AdvancedFiltersModal } from "@/components/viewer/AdvancedFiltersModal";
import type { Company, NewsCategory } from "@/lib/types/database";

const CATEGORY_TABS: { label: string; category?: NewsCategory }[] = [
  { label: "Latest" },
  { label: "Global Market", category: "Global Market" },
  { label: "Indian Market", category: "Indian Market" },
  { label: "Top Company News", category: "Top Company News" },
  { label: "Analytical News", category: "Analytical News" },
];

export function NavBar({ companies }: { companies: Company[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCategory = searchParams.get("category");
  const hasCompanyFilter = searchParams.get("company");
  const onFeedRoute = pathname === "/";

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-3 py-2.5 sm:px-6">
          {CATEGORY_TABS.map((tab) => {
            const isActive =
              onFeedRoute && !hasCompanyFilter && (activeCategory ?? null) === (tab.category ?? null);
            return (
              <Link
                key={tab.label}
                href={tab.category ? `/?category=${encodeURIComponent(tab.category)}` : "/"}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}

          <Link
            href="/companies"
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/companies")
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            Top Company Profiles
          </Link>

          <Link
            href="/prices"
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              pathname.startsWith("/prices")
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            Price Trends
          </Link>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="ml-auto shrink-0 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            Advanced Filters
          </button>
        </div>
      </nav>

      <AdvancedFiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        companies={companies}
      />
    </>
  );
}
