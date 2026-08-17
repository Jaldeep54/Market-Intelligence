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
});

export type SourceInput = z.infer<typeof sourceSchema>;
