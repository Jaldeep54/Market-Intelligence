// India Landing Price calculation utility -- the single place these formulas
// live, so they stay auditable and are never re-derived ad hoc elsewhere.
//
// Both formulas are transcribed exactly from Price_analysis_wk 1-34.xlsx
// (sheets "wafer" and "Cells", column W/X/Y), verified cell-by-cell against
// the workbook's own cached calculated values before this code was written.
// Percentages throughout are decimals (0.275 = 27.5%), matching the
// workbook's "Inputs" sheet and the admin form.
//
// Wafer (workbook formula, e.g. cell W3):
//   =(FOB_INR + FOB_INR*Insurance% + Freight + Port/CHA + Inland)
//   Duty is not part of the wafer formula at all (the workbook's wafer duty
//   input is 0%, so historically it made no difference either way).
//
// Cell (workbook formula, e.g. cell W3) -- structurally different: duty is
// applied to the FOB+Freight+Insurance subtotal, and Port/CHA + Inland are
// added afterward, outside the duty base:
//   =(FOB_INR + Freight + Insurance%*FOB_INR) * (1 + Duty%) + Port/CHA + Inland

import type { Currency, LandingInputs } from "@/lib/types/database";

export function calculateWaferLandingInr(chinaFobInr: number, inputs: LandingInputs): number {
  return chinaFobInr + chinaFobInr * inputs.insurance_pct + inputs.freight + inputs.port_cha + inputs.inland;
}

export function calculateCellLandingInr(chinaFobInr: number, inputs: LandingInputs): number {
  const subtotal = chinaFobInr + inputs.freight + inputs.insurance_pct * chinaFobInr;
  return subtotal + subtotal * inputs.duty_pct + inputs.port_cha + inputs.inland;
}

export function calculateLandingInr(
  categorySlug: "wafer" | "cell",
  chinaFobInr: number,
  inputs: LandingInputs
): number {
  return categorySlug === "wafer"
    ? calculateWaferLandingInr(chinaFobInr, inputs)
    : calculateCellLandingInr(chinaFobInr, inputs);
}

export function toChinaFobUsd(basePriceRmb: number, rmbToUsd: number): number {
  return basePriceRmb * rmbToUsd;
}

export function toChinaFobInr(basePriceRmb: number, rmbToInr: number): number {
  return basePriceRmb * rmbToInr;
}

// Converts a China-FOB-style price already computed in RMB/USD/INR into the
// viewer's selected display currency. Never used for India Landing Price,
// which always stays in INR regardless of the selected currency (it's
// specifically an Indian-market INR metric, not a China FOB price).
export function priceInCurrency(
  currency: Currency,
  priceRmb: number,
  priceUsd: number,
  priceInr: number
): number {
  if (currency === "USD") return priceUsd;
  if (currency === "INR") return priceInr;
  return priceRmb;
}

export function formatCurrencyUnit(currency: Currency, unit: string): string {
  // unit looks like "RMB/kg" -- swap only the currency portion.
  const [, ...rest] = unit.split("/");
  return rest.length > 0 ? `${currency}/${rest.join("/")}` : `${currency} ${unit}`;
}

export function weekOverWeekChange(
  latest: number,
  previous: number | null
): { amount: number; percent: number } | null {
  if (previous === null || previous === 0) return null;
  const amount = latest - previous;
  const percent = (amount / previous) * 100;
  return { amount, percent };
}
