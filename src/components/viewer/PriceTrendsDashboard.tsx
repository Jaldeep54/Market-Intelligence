"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PriceLineChart, type ChartSeries } from "@/components/viewer/PriceLineChart";
import { formatCurrencyUnit, priceInCurrency, weekOverWeekChange } from "@/lib/utils/priceCalculations";
import { CURRENCIES, type Currency, type PriceCategory, type PriceProduct, type WeeklyPriceWithWeek } from "@/lib/types/database";

interface CategoryData {
  category: PriceCategory;
  products: { product: PriceProduct; history: WeeklyPriceWithWeek[] }[];
}

const CHART_COLORS = ["#0f766e", "#d97706", "#7c3aed", "#dc2626", "#2563eb", "#059669", "#db2777", "#65a30d", "#0891b2", "#9333ea"];

function formatMoney(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function latestPriceDate(categories: CategoryData[]): string | null {
  let latest: string | null = null;
  for (const c of categories) {
    for (const p of c.products) {
      const last = p.history[p.history.length - 1];
      if (last && (!latest || last.week.price_date > latest)) latest = last.week.price_date;
    }
  }
  return latest;
}

function ChangeBadge({ amount, percent }: { amount: number; percent: number }) {
  const positive = amount > 0;
  const flat = amount === 0;
  return (
    <span
      className={`text-xs font-medium ${flat ? "text-muted" : positive ? "text-danger" : "text-accent"}`}
      title="Change vs. the previous recorded week"
    >
      {flat ? "No change" : `${positive ? "+" : ""}${amount.toFixed(2)} (${positive ? "+" : ""}${percent.toFixed(1)}%)`}
    </span>
  );
}

function ProductPriceCard({
  category,
  product,
  history,
  currency,
}: {
  category: PriceCategory;
  product: PriceProduct;
  history: WeeklyPriceWithWeek[];
  currency: Currency;
}) {
  const latest = history[history.length - 1] ?? null;
  const previous = history.length > 1 ? history[history.length - 2] : null;

  if (!latest) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="font-medium text-foreground">{product.name}</div>
        <p className="mt-2 text-xs text-muted">No price entered yet.</p>
      </div>
    );
  }

  const currentValue = priceInCurrency(currency, latest.base_price_rmb, latest.china_fob_usd, latest.china_fob_inr);
  const previousValue = previous
    ? priceInCurrency(currency, previous.base_price_rmb, previous.china_fob_usd, previous.china_fob_inr)
    : null;
  const change = weekOverWeekChange(currentValue, previousValue);

  const landingChange =
    category.has_landing_price && latest.india_landing_inr !== null
      ? weekOverWeekChange(latest.india_landing_inr, previous?.india_landing_inr ?? null)
      : null;

  return (
    <Link
      href={`/prices/${category.slug}/${product.slug}`}
      className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="font-medium text-foreground">{product.name}</div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-foreground">{formatMoney(currentValue)}</span>
        <span className="text-xs text-muted">{formatCurrencyUnit(currency, category.unit)}</span>
      </div>
      {category.has_landing_price && <p className="mt-0.5 text-xs text-muted">China FOB</p>}
      {change && (
        <div className="mt-1">
          <ChangeBadge amount={change.amount} percent={change.percent} />
        </div>
      )}

      {category.has_landing_price && latest.india_landing_inr !== null && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-accent">₹{formatMoney(latest.india_landing_inr)}</span>
            <span className="text-xs text-muted">
              /{category.unit.split("/")[1] ?? category.unit} · India Landing Price
            </span>
          </div>
          <p className="text-[11px] text-muted">Always shown in INR, regardless of currency selected above</p>
          {landingChange && (
            <div className="mt-1">
              <ChangeBadge amount={landingChange.amount} percent={landingChange.percent} />
            </div>
          )}
        </div>
      )}
    </Link>
  );
}

function CategorySection({ data, currency }: { data: CategoryData; currency: Currency }) {
  const { category, products } = data;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  const compareSeries: ChartSeries[] = useMemo(() => {
    return products
      .filter((p) => selected.has(p.product.id))
      .map((p, i) => ({
        id: p.product.id,
        label: p.product.name,
        color: CHART_COLORS[i % CHART_COLORS.length],
        data: p.history.map((h) => ({
          date: h.week.price_date,
          value: priceInCurrency(currency, h.base_price_rmb, h.china_fob_usd, h.china_fob_inr),
        })),
      }));
  }, [products, selected, currency]);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{category.name}</h2>
        <p className="text-xs text-muted">{formatCurrencyUnit(currency, category.unit)} · China FOB</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductPriceCard
            key={p.product.id}
            category={category}
            product={p.product}
            history={p.history}
            currency={currency}
          />
        ))}
      </div>

      {products.length > 1 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-medium text-foreground">{category.name} Price Trends</h3>
          <p className="mb-3 text-xs text-muted">Select products to compare their history on one chart.</p>
          <div className="mb-4 flex flex-wrap gap-3">
            {products.map((p) => (
              <label key={p.product.id} className="flex items-center gap-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={selected.has(p.product.id)}
                  onChange={() => toggle(p.product.id)}
                  className="h-4 w-4 rounded border-border"
                />
                {p.product.name}
              </label>
            ))}
          </div>
          {compareSeries.length > 0 ? (
            <PriceLineChart series={compareSeries} yUnit={formatCurrencyUnit(currency, category.unit)} />
          ) : (
            <p className="text-xs text-muted">Select at least one product above to see its trend.</p>
          )}
        </div>
      )}
    </section>
  );
}

export function PriceTrendsDashboard({ categories }: { categories: CategoryData[] }) {
  const [currency, setCurrency] = useState<Currency>("RMB");
  const latestDate = latestPriceDate(categories);

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Price Trends</h1>
          <p className="mt-1 text-sm text-muted">
            {latestDate
              ? `Latest Weekly Price: ${new Date(`${latestDate}T00:00:00`).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}`
              : "No prices entered yet."}
          </p>
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

      {categories.map((data) => (
        <CategorySection key={data.category.id} data={data} currency={currency} />
      ))}
    </div>
  );
}
