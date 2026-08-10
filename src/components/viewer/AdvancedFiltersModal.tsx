"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/Modal";
import { signOutAction } from "@/lib/actions/auth";
import { NEWS_CATEGORIES, type Company, type NewsCategory } from "@/lib/types/database";
import type { DateMode } from "@/lib/data/news";

const DATE_OPTIONS: { value: DateMode; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "custom_date", label: "Custom Date" },
  { value: "custom_range", label: "Custom Date Range" },
];

type Route = "date-category" | "company";

export function AdvancedFiltersModal({
  open,
  onClose,
  companies,
}: {
  open: boolean;
  onClose: () => void;
  companies: Company[];
}) {
  const router = useRouter();
  const [route, setRoute] = useState<Route>("date-category");

  const [dateMode, setDateMode] = useState<DateMode | null>(null);
  const [category, setCategory] = useState<NewsCategory | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const [showCompanies, setShowCompanies] = useState(false);

  function reset() {
    setRoute("date-category");
    setDateMode(null);
    setCategory(null);
    setCustomDate("");
    setRangeFrom("");
    setRangeTo("");
    setShowCompanies(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function applyDateCategory() {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (dateMode) {
      params.set("date_mode", dateMode);
      if (dateMode === "custom_date" && customDate) params.set("date", customDate);
      if (dateMode === "custom_range") {
        if (rangeFrom) params.set("from", rangeFrom);
        if (rangeTo) params.set("to", rangeTo);
      }
    }
    router.push(params.toString() ? `/?${params.toString()}` : "/");
    handleClose();
  }

  function applyCompany(slug: string) {
    router.push(`/?company=${encodeURIComponent(slug)}`);
    handleClose();
  }

  const canApplyDateCategory =
    Boolean(category) ||
    dateMode === "today" ||
    dateMode === "yesterday" ||
    (dateMode === "custom_date" && Boolean(customDate)) ||
    (dateMode === "custom_range" && Boolean(rangeFrom || rangeTo));

  return (
    <Modal open={open} onClose={handleClose} title="Advanced Filters">
      <div className="mb-4 flex rounded-lg border border-border p-1 text-sm">
        <button
          type="button"
          onClick={() => setRoute("date-category")}
          className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
            route === "date-category" ? "bg-accent text-accent-foreground" : "text-muted"
          }`}
        >
          Date &amp; Category
        </button>
        <button
          type="button"
          onClick={() => setRoute("company")}
          className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
            route === "company" ? "bg-accent text-accent-foreground" : "text-muted"
          }`}
        >
          Company
        </button>
      </div>

      {route === "date-category" ? (
        <div className="space-y-5">
          <p className="text-xs text-muted">
            Date and Category can be combined. Company filtering is a separate route.
          </p>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Date
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {DATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDateMode(dateMode === opt.value ? null : opt.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    dateMode === opt.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-foreground hover:bg-background"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {dateMode === "custom_date" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            )}

            {dateMode === "custom_range" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  aria-label="To date"
                />
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Category
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {NEWS_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(category === cat ? null : cat)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    category === cat
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-foreground hover:bg-background"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!canApplyDateCategory}
            onClick={applyDateCategory}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Company filtering cannot be combined with Date or Category.
          </p>
          {!showCompanies ? (
            <button
              type="button"
              onClick={() => setShowCompanies(true)}
              className="w-full rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Top Companies
            </button>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {companies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyCompany(c.slug)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-accent hover:bg-accent/10"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <form action={signOutAction} className="mt-6 border-t border-border pt-4">
        <button type="submit" className="text-xs font-medium text-muted hover:text-foreground">
          Sign out
        </button>
      </form>
    </Modal>
  );
}
