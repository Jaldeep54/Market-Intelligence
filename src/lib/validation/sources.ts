import { z } from "zod";
import { NEWS_CATEGORIES, SOURCE_PRIORITIES, SOURCE_TYPES } from "@/lib/types/database";

export const sourceSchema = z.object({
  source_name: z.string().trim().min(1, "Source name is required").max(200),
  website_url: z.string().trim().url("Enter a valid website URL"),
  feed_url: z
    .string()
    .trim()
    .url("Enter a valid feed URL")
    .optional()
    .or(z.literal("")),
  source_type: z.enum(SOURCE_TYPES as [string, ...string[]], { message: "Select a source type" }),
  default_category: z
    .enum(NEWS_CATEGORIES as [string, ...string[]])
    .optional()
    .or(z.literal("")),
  priority: z.enum(SOURCE_PRIORITIES as [string, ...string[]], { message: "Select a priority" }),
  fetch_interval_minutes: z.coerce.number().int().min(15).max(1440),
  active: z.boolean(),
  exclude_url_patterns: z.array(z.string().trim().min(1)).default([]),
});

// Splits the "Skip articles from these URLs" textarea into individual
// patterns: one per line, trimmed, blank lines dropped.
export function parseExcludeUrlPatterns(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export type SourceInput = z.infer<typeof sourceSchema>;
