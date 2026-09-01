import { z } from "zod";

// Percentages are decimals throughout (0.275 = 27.5%), matching the workbook
// and the admin form's own "%" hint text -- capped well above any realistic
// duty/insurance rate purely to catch a stray "27.5" typed instead of
// "0.275".
const percentSchema = z.coerce.number().min(0, "Must be 0 or greater").max(2, "Enter as a decimal, e.g. 0.275 for 27.5%");
const nonNegativeSchema = z.coerce.number().min(0, "Must be 0 or greater");
const positiveSchema = z.coerce.number().positive("Must be greater than 0");

export const weekHeaderSchema = z.object({
  week_number: z.coerce.number().int().positive("Enter a valid week number"),
  price_date: z.string().trim().min(1, "Price date is required"),
  rmb_to_usd: positiveSchema,
  rmb_to_inr: positiveSchema,
});

export const landingInputsSchema = z.object({
  freight: nonNegativeSchema,
  insurance_pct: percentSchema,
  duty_pct: percentSchema,
  port_cha: nonNegativeSchema,
  inland: nonNegativeSchema,
});

export const basePriceSchema = nonNegativeSchema;

export function parseNumberField(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
