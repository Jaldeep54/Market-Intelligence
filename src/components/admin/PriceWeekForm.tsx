"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import {
  addPriceProductAction,
  deactivatePriceProductAction,
  productHasHistoryAction,
  saveWeeklyPricesAction,
  type PriceFormState,
} from "@/lib/actions/prices";
import { calculateLandingInr, toChinaFobInr, toChinaFobUsd } from "@/lib/utils/priceCalculations";
import type { LandingInputs, PriceCategory, PriceProduct, WeeklyPriceWithWeek } from "@/lib/types/database";

interface CategoryWithProducts extends PriceCategory {
  products: PriceProduct[];
}

interface EditingWeek {
  id: string;
  week_number: number;
  price_date: string;
  rmb_to_usd: number;
  rmb_to_inr: number;
}

function n(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "mb-1 block text-xs font-medium text-muted";

// Lets the admin add a new product to a category inline, without leaving the
// form or losing prices already typed for other products. Local-only state
// (name/error/pending) -- success is reported to the parent via `onAdded`,
// which is what actually makes the new product show up in the category list.
//
// submittingRef is a synchronous guard against a click firing this twice: a
// `useTransition` `pending` flag is state, so it can lag a tick behind a
// fast second click/Enter combo, but a plain ref is set/read immediately
// with no render in between, so it can never miss an overlapping call.
function AddProductRow({ categoryId, onAdded }: { categoryId: string; onAdded: (product: PriceProduct) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await addPriceProductAction(categoryId, trimmed);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.product) {
          onAdded(result.product);
          setName("");
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className={labelClass} htmlFor={`new-product-${categoryId}`}>
            New product name
          </label>
          <input
            id={`new-product-${categoryId}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. M10 Mono PERC"
            className={inputClass}
          />
        </div>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={submit}
          className="min-h-[40px] rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-opacity hover:bg-background disabled:opacity-50"
        >
          {pending ? "Adding…" : "+ Add Product"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

// Soft-deletes (deactivates) one product from its category, after a confirm
// dialog whose wording depends on whether the product already has saved
// weekly prices -- checked with a quick on-demand query right before
// confirming, rather than plumbing that flag through both admin pages.
// Same submittingRef guard as AddProductRow, for the same reason.
function RemoveProductControl({ product, onRemoved }: { product: PriceProduct; onRemoved: (productId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function handleClick() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        const hasHistory = await productHasHistoryAction(product.id);
        const message = hasHistory
          ? `"${product.name}" has historical price data. Removing it will hide it from future weeks; past data will be kept. Remove it anyway?`
          : `Remove "${product.name}" from this category?`;
        if (!window.confirm(message)) return;

        setError(null);
        const result = await deactivatePriceProductAction(product.id);
        if (result.error) {
          setError(result.error);
          return;
        }
        onRemoved(product.id);
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && <p className="mt-1 max-w-[10rem] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

export function PriceWeekForm({
  categories,
  defaultLandingInputs,
  editingWeek,
  existingPrices,
}: {
  categories: CategoryWithProducts[];
  defaultLandingInputs: Record<string, LandingInputs>;
  editingWeek?: EditingWeek;
  existingPrices?: Record<string, WeeklyPriceWithWeek>;
}) {
  const boundAction = saveWeeklyPricesAction.bind(null, editingWeek?.id ?? null);
  const [state, formAction, pending] = useActionState<PriceFormState, FormData>(boundAction, {});

  // Products added mid-session via "+ Add Product", keyed by category id --
  // merged into `categories` below so a newly added product immediately
  // renders with an empty price input (and landing inputs, if applicable)
  // alongside the products seeded via migration, in both new-week and
  // edit-week mode. Never mutates the props passed in.
  const [addedProducts, setAddedProducts] = useState<Record<string, PriceProduct[]>>({});
  // Products removed mid-session via "Remove" -- tracked separately from
  // `addedProducts` because a product hidden here might have come from
  // either source.
  const [removedProductIds, setRemovedProductIds] = useState<Set<string>>(new Set());

  // Merged by product id (not just concatenated): calling any Server Action
  // makes Next.js refresh this route's Server Components in the background,
  // which re-fetches `categories` with the just-added product already in
  // it -- while `addedProducts` (this component's own optimistic state)
  // still also holds it. Without deduping by id here, that refresh alone
  // would render the same product twice from one "Add Product" click.
  const categoriesWithAdded = useMemo(() => {
    return categories.map((category) => {
      const merged = new Map<string, PriceProduct>();
      for (const product of category.products) merged.set(product.id, product);
      for (const product of addedProducts[category.id] ?? []) merged.set(product.id, product);
      for (const id of removedProductIds) merged.delete(id);
      return { ...category, products: Array.from(merged.values()) };
    });
  }, [categories, addedProducts, removedProductIds]);

  function handleProductAdded(categoryId: string, product: PriceProduct) {
    setAddedProducts((prev) => ({ ...prev, [categoryId]: [...(prev[categoryId] ?? []), product] }));
  }

  function handleProductRemoved(productId: string) {
    setRemovedProductIds((prev) => new Set(prev).add(productId));
  }

  const [weekNumber, setWeekNumber] = useState(String(editingWeek?.week_number ?? ""));
  const [priceDate, setPriceDate] = useState(editingWeek?.price_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [rmbToUsd, setRmbToUsd] = useState(String(editingWeek?.rmb_to_usd ?? ""));
  const [rmbToInr, setRmbToInr] = useState(String(editingWeek?.rmb_to_inr ?? ""));

  const [basePrices, setBasePrices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const category of categories) {
      for (const product of category.products) {
        const existing = existingPrices?.[product.id];
        initial[product.id] = existing ? String(existing.base_price_rmb) : "";
      }
    }
    return initial;
  });

  const [landingInputs, setLandingInputs] = useState<Record<string, LandingInputs>>(() => {
    const initial: Record<string, LandingInputs> = {};
    for (const category of categories) {
      if (!category.has_landing_price) continue;
      for (const product of category.products) {
        const existing = existingPrices?.[product.id];
        if (existing && existing.landing_freight !== null) {
          initial[product.id] = {
            freight: existing.landing_freight ?? 0,
            insurance_pct: existing.landing_insurance_pct ?? 0,
            duty_pct: existing.landing_duty_pct ?? 0,
            port_cha: existing.landing_port_cha ?? 0,
            inland: existing.landing_inland ?? 0,
          };
        } else {
          initial[product.id] = defaultLandingInputs[product.id] ?? {
            freight: 0,
            insurance_pct: 0,
            duty_pct: 0,
            port_cha: 0,
            inland: 0,
          };
        }
      }
    }
    return initial;
  });

  const rates = { usd: n(rmbToUsd), inr: n(rmbToInr) };

  const preview = useMemo(() => {
    const result: Record<string, { fobUsd: number; fobInr: number; landingInr?: number }> = {};
    for (const category of categoriesWithAdded) {
      for (const product of category.products) {
        const base = n(basePrices[product.id] ?? "");
        const fobUsd = toChinaFobUsd(base, rates.usd);
        const fobInr = toChinaFobInr(base, rates.inr);
        if (category.has_landing_price) {
          const inputs = landingInputs[product.id];
          result[product.id] = {
            fobUsd,
            fobInr,
            landingInr: inputs ? calculateLandingInr(category.slug as "wafer" | "cell", fobInr, inputs) : undefined,
          };
        } else {
          result[product.id] = { fobUsd, fobInr };
        }
      }
    }
    return result;
  }, [categoriesWithAdded, basePrices, landingInputs, rates.usd, rates.inr]);

  function updateLanding(productId: string, field: keyof LandingInputs, value: string) {
    setLandingInputs((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: n(value) },
    }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
          {editingWeek ? `Edit Week ${editingWeek.week_number}` : "Add Weekly Price"}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="week_number">
              Week
            </label>
            <input
              id="week_number"
              name="week_number"
              type="number"
              min={1}
              required
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="price_date">
              Price Date
            </label>
            <input
              id="price_date"
              name="price_date"
              type="date"
              required
              value={priceDate}
              onChange={(e) => setPriceDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="rmb_to_usd">
              RMB → USD
            </label>
            <input
              id="rmb_to_usd"
              name="rmb_to_usd"
              type="number"
              step="0.0001"
              min={0}
              required
              value={rmbToUsd}
              onChange={(e) => setRmbToUsd(e.target.value)}
              className={inputClass}
              placeholder="e.g. 0.1432"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="rmb_to_inr">
              RMB → INR
            </label>
            <input
              id="rmb_to_inr"
              name="rmb_to_inr"
              type="number"
              step="0.0001"
              min={0}
              required
              value={rmbToInr}
              onChange={(e) => setRmbToInr(e.target.value)}
              className={inputClass}
              placeholder="e.g. 12.90"
            />
          </div>
        </div>
      </section>

      {categoriesWithAdded.map((category) => (
        <section key={category.id} className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{category.name}</h2>
          <p className="mb-4 text-xs text-muted">China FOB price in {category.unit}</p>
          <div className="flex flex-col gap-3">
            {category.products.map((product) => {
              const p = preview[product.id];
              const priceValue = basePrices[product.id] ?? "";
              // Blank means "not published this week" -- whether that's
              // because the admin just cleared it, or (in edit mode) it
              // loaded blank since no existingPrices row exists for this
              // product/week. Either way saveWeeklyPricesAction skips this
              // product entirely (parseNumberField -> null -> continue), so
              // the same not-published cue below is accurate in both cases
              // and needs no new-week/edit-week branching.
              const hasPrice = priceValue.trim() !== "";
              return (
                <div key={product.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[12rem] flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <label className="text-xs font-medium text-muted" htmlFor={`price_${product.id}`}>
                          {product.name} ({category.unit})
                        </label>
                        <RemoveProductControl product={product} onRemoved={handleProductRemoved} />
                      </div>
                      <input
                        id={`price_${product.id}`}
                        name={`price_${product.id}`}
                        type="number"
                        step="0.0001"
                        min={0}
                        value={priceValue}
                        onChange={(e) => setBasePrices((prev) => ({ ...prev, [product.id]: e.target.value }))}
                        className={inputClass}
                      />
                      {!hasPrice && (
                        <p className="mt-1 text-[11px] text-muted">
                          Not published this week — will show as a gap in the trend chart.
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      <div>USD: {fmt(p?.fobUsd ?? 0)}</div>
                      <div>INR: {fmt(p?.fobInr ?? 0)}</div>
                      {category.has_landing_price && (
                        <div className="font-medium text-accent">India Landing: ₹{fmt(p?.landingInr ?? 0)}</div>
                      )}
                    </div>
                  </div>

                  {category.has_landing_price &&
                    (hasPrice ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-5">
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Freight (₹/unit)</label>
                          <input
                            type="number"
                            step="0.0001"
                            min={0}
                            name={`landing_freight_${product.id}`}
                            value={landingInputs[product.id]?.freight ?? 0}
                            onChange={(e) => updateLanding(product.id, "freight", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Insurance (decimal, e.g. 0.0015)</label>
                          <input
                            type="number"
                            step="0.0001"
                            min={0}
                            max={2}
                            name={`landing_insurance_${product.id}`}
                            value={landingInputs[product.id]?.insurance_pct ?? 0}
                            onChange={(e) => updateLanding(product.id, "insurance_pct", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Duty (decimal, e.g. 0.275)</label>
                          <input
                            type="number"
                            step="0.0001"
                            min={0}
                            max={2}
                            name={`landing_duty_${product.id}`}
                            value={landingInputs[product.id]?.duty_pct ?? 0}
                            onChange={(e) => updateLanding(product.id, "duty_pct", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Port/CHA (₹/unit)</label>
                          <input
                            type="number"
                            step="0.0001"
                            min={0}
                            name={`landing_portcha_${product.id}`}
                            value={landingInputs[product.id]?.port_cha ?? 0}
                            onChange={(e) => updateLanding(product.id, "port_cha", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-muted">Inland (₹/unit)</label>
                          <input
                            type="number"
                            step="0.0001"
                            min={0}
                            name={`landing_inland_${product.id}`}
                            value={landingInputs[product.id]?.inland ?? 0}
                            onChange={(e) => updateLanding(product.id, "inland", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    ) : (
                      // No base price -> saveWeeklyPricesAction skips this
                      // product wholesale, landing inputs included, so
                      // there's nothing for them to affect this week.
                      <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted">
                        Import/landing cost inputs are hidden until a price is entered for this product.
                      </p>
                    ))}
                </div>
              );
            })}
            <AddProductRow categoryId={category.id} onAdded={(product) => handleProductAdded(category.id, product)} />
          </div>
        </section>
      ))}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] rounded-lg bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : editingWeek ? "Save Changes" : "Save Week"}
        </button>
      </div>
    </form>
  );
}
