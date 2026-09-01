"use client";

import { useState } from "react";
import { PriceLineChart } from "@/components/viewer/PriceLineChart";
import { formatCurrencyUnit, priceInCurrency, weekOverWeekChange } from "@/lib/utils/priceCalculations";
import { CURRENCIES, type Currency, type PriceCategory, type PriceProduct, type WeeklyPriceWithWeek } from "@/lib/types/database";

function formatMoney(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProductPriceDetail({
  category,
  product,
  history,
}: {
  category: PriceCategory;
  product: PriceProduct;
  history: WeeklyPriceWithWeek[];
}) {
  const [currency, setCurrency] = useState<Currency>("RMB");

  const latest = history[history.length - 1] ?? null;
  const previous = history.length > 1 ? history[history.length - 2] : null;

  const fobSeries = [
    {
      id: product.id,
      label: product.name,
      color: "#0f766e",
      data: history.map((h) => ({
        date: h.week.price_date,
        value: priceInCurrency(currency, h.base_price_rmb, h.china_fob_usd, h.china_fob_inr),
      })),
    },
  ];

  const landingSeries = category.has_landing_price
    ? [
        {
          id: `${product.id}-landing`,
          label: `${product.name} · India Landing`,
          color: "#d97706",
          data: history
            .filter((h) => h.india_landing_inr !== null)
            .map((h) => ({ date: h.week.price_date, value: h.india_landing_inr as number })),
        },
      ]
    : [];

  const currentFob = latest ? priceInCurrency(currency, latest.base_price_rmb, latest.china_fob_usd, latest.china_fob_inr) : null;
  const previousFob = previous
    ? priceInCurrency(currency, previous.base_price_rmb, previous.china_fob_usd, previous.china_fob_inr)
    : null;
  const fobChange = currentFob !== null ? weekOverWeekChange(currentFob, previousFob) : null;

  const landingChange =
    category.has_landing_price && latest?.india_landing_inr !== null && latest?.india_landing_inr !== undefined
      ? weekOverWeekChange(latest.india_landing_inr, previous?.india_landing_inr ?? null)
      : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{category.name}</p>
          <h1 className="text-lg font-semibold text-foreground">{product.name}</h1>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                currency === c ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {latest ? (
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-muted">China FOB ({formatCurrencyUnit(currency, category.unit)})</p>
            <p className="text-2xl font-semibold text-foreground">{currentFob !== null ? formatMoney(currentFob) : "—"}</p>
            {fobChange && (
              <p
                className={`text-xs font-medium ${
                  fobChange.amount === 0 ? "text-muted" : fobChange.amount > 0 ? "text-danger" : "text-accent"
                }`}
              >
                {fobChange.amount > 0 ? "+" : ""}
                {fobChange.amount.toFixed(2)} ({fobChange.amount > 0 ? "+" : ""}
                {fobChange.percent.toFixed(1)}%) vs. previous week
              </p>
            )}
          </div>

          {category.has_landing_price && latest.india_landing_inr !== null && (
            <div>
              <p className="text-xs text-muted">India Landing Price (always INR)</p>
              <p className="text-2xl font-semibold text-accent">₹{formatMoney(latest.india_landing_inr)}</p>
              {landingChange && (
                <p
                  className={`text-xs font-medium ${
                    landingChange.amount === 0 ? "text-muted" : landingChange.amount > 0 ? "text-danger" : "text-accent"
                  }`}
                >
                  {landingChange.amount > 0 ? "+" : ""}
                  {landingChange.amount.toFixed(2)} ({landingChange.amount > 0 ? "+" : ""}
                  {landingChange.percent.toFixed(1)}%) vs. previous week
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">No price history yet for this product.</p>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">China FOB Price History</h2>
        <PriceLineChart series={fobSeries} yUnit={formatCurrencyUnit(currency, category.unit)} />
      </section>

      {category.has_landing_price && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-medium text-foreground">India Landing Price History</h2>
          <p className="mb-3 text-xs text-muted">Always shown in INR, regardless of the currency selected above.</p>
          <PriceLineChart series={landingSeries} yUnit={`INR${category.unit.includes("/") ? "/" + category.unit.split("/")[1] : ""}`} />
        </section>
      )}
    </div>
  );
}
