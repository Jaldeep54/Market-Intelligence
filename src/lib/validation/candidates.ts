import { z } from "zod";
import { NEWS_CATEGORIES } from "@/lib/types/database";
import { parseTagsInput } from "@/lib/validation/news";

// Shared by "Save" and "Approve & Publish" on the News Inbox review page --
// the same fields the existing manual News Form validates, since publishing
// ultimately writes into the same `news` table.
export const candidatePrepSchema = z
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
    tags: z.array(z.string().trim().min(1)).max(6, "Use at most a handful of tags"),
    // Optional: most candidates never get a Gujarati translation. Left
    // blank (rather than validated like title/description above) so saving
    // never fails just because no one has translated this article yet.
    title_gu: z.string().trim().optional(),
    description_gu: z.string().trim().optional(),
  })
  .refine((data) => data.category !== "Top Company News" || Boolean(data.company_id), {
    message: "Company is required for Top Company News",
    path: ["company_id"],
  });

export type CandidatePrepInput = z.infer<typeof candidatePrepSchema>;

export function readCandidatePrepForm(formData: FormData) {
  return candidatePrepSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    company_id: String(formData.get("company_id") ?? ""),
    news_date: String(formData.get("news_date") ?? ""),
    tags: parseTagsInput(String(formData.get("tags") ?? "")),
    title_gu: String(formData.get("title_gu") ?? ""),
    description_gu: String(formData.get("description_gu") ?? ""),
  });
}
