import { z } from "zod";
import { NEWS_CATEGORIES } from "@/lib/types/database";

export const newsSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300, "Title is too long"),
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(3000, "Description is too long"),
    category: z.enum(NEWS_CATEGORIES as [string, ...string[]], {
      message: "Select a category",
    }),
    company_id: z.string().trim().optional(),
    news_date: z.string().trim().min(1, "News date is required"),
    source_url: z.string().trim().url("Enter a valid source URL"),
    published: z.boolean(),
    tags: z.array(z.string().trim().min(1)).max(6, "Use at most a handful of tags"),
  })
  .refine((data) => data.category !== "Top Company News" || Boolean(data.company_id), {
    message: "Company is required for Top Company News",
    path: ["company_id"],
  });

export type NewsInput = z.infer<typeof newsSchema>;

export function parseTagsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}
