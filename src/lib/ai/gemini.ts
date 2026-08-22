import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/types/database";

// Single isolated module for all Gemini access (spec section 35). Nothing
// else in the app talks to the Google GenAI SDK directly -- callers use
// prepareNewsWithGemini() below. Swapping providers or SDK versions later
// only touches this file.
//
// Compatible with the Gemini Free Tier; the exact model is never hard-coded
// beyond this default fallback -- set GEMINI_MODEL to override.
const DEFAULT_MODEL = "gemini-2.5-flash";

export type GeminiErrorKind =
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "invalid_response"
  | "model_unavailable"
  | "unknown";

export interface GeminiPrepareInput {
  sourceName: string;
  originalTitle: string;
  originalDescription: string | null;
  rawContent: string | null;
  publishedAt: string | null;
  sourceUrl: string;
  companyNames: string[];
}

export interface GeminiPrepareOutput {
  title: string;
  description: string;
  category: NewsCategory;
  companyName: string | null;
  newsDate: string;
  tags: string[];
}

export interface GeminiPrepareSuccess {
  ok: true;
  data: GeminiPrepareOutput;
  model: string;
}

export interface GeminiPrepareFailure {
  ok: false;
  errorKind: GeminiErrorKind;
  message: string;
  model: string;
}

export type GeminiPrepareResult = GeminiPrepareSuccess | GeminiPrepareFailure;

// Defense in depth: even though we ask Gemini for structured JSON, the raw
// response is always re-validated here before it can reach the review UI or
// (later) the `news` table (spec section 20/39).
const geminiOutputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(1200),
  category: z.enum(NEWS_CATEGORIES as [string, ...string[]]),
  company_name: z.string().trim().min(1).nullable(),
  news_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "news_date must be YYYY-MM-DD"),
  tags: z.array(z.string().trim().min(1).max(40)).max(6),
});

function resolveModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function fallbackNewsDate(input: GeminiPrepareInput): string {
  const source = input.publishedAt ? new Date(input.publishedAt) : new Date();
  if (Number.isNaN(source.getTime())) return new Date().toISOString().slice(0, 10);
  return source.toISOString().slice(0, 10);
}

function buildPrompt(input: GeminiPrepareInput): string {
  const contentExcerpt = (input.rawContent ?? input.originalDescription ?? "").slice(0, 6000);

  return `You are preparing a solar-industry market intelligence brief for a CTO-level executive dashboard.

Source: ${input.sourceName}
Original headline: ${input.originalTitle}
Published: ${input.publishedAt ?? "unknown"}
Original URL: ${input.sourceUrl}

Article excerpt/description:
"""
${contentExcerpt || "(no additional content available -- use the headline and description only)"}
"""

Tracked companies (choose one only if the article is clearly about it, otherwise use null -- never invent a company that isn't in this list):
${input.companyNames.length > 0 ? input.companyNames.map((n) => `- ${n}`).join("\n") : "(none configured)"}

Return a JSON object with exactly these fields:
- "title": a concise, professional headline suitable for a CTO-level dashboard. Avoid sensational language.
- "description": approximately 70 words. Accurately summarize the article, retain important facts, avoid unsupported claims, never invent information, and do not copy long passages from the source.
- "category": exactly one of "Global Market", "Indian Market", "Top Company News", "Analytical News".
- "company_name": the exact name of one tracked company from the list above if the article is clearly about it, otherwise null.
- "news_date": the article's publication date as YYYY-MM-DD (use ${fallbackNewsDate(input)} if the date is unclear).
- "tags": 2 to 4 short, useful lowercase tags, no hashtags.

Return only the JSON object.`;
}

function classifyError(err: unknown, model: string): GeminiPrepareFailure {
  if (err instanceof Error && err.name === "AbortError") {
    return { ok: false, errorKind: "timeout", message: "Gemini took too long to respond. Please try again.", model };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid") ||
    lower.includes("permission_denied") ||
    lower.includes(" 401") ||
    lower.includes(" 403")
  ) {
    return {
      ok: false,
      errorKind: "invalid_key",
      message: "Gemini rejected the configured API key. Ask the project owner to check GEMINI_API_KEY.",
      model,
    };
  }

  if (lower.includes("quota")) {
    return {
      ok: false,
      errorKind: "quota_exceeded",
      message:
        "Gemini free-tier quota has been reached. Please try again later or change the configured model.",
      model,
    };
  }

  if (lower.includes("429") || lower.includes("resource_exhausted") || lower.includes("rate limit")) {
    return {
      ok: false,
      errorKind: "rate_limited",
      message: "Gemini is temporarily rate-limited. Please wait a moment and try again.",
      model,
    };
  }

  if (lower.includes("not found") && lower.includes("model")) {
    return {
      ok: false,
      errorKind: "model_unavailable",
      message: `The configured Gemini model ("${model}") is unavailable. Ask the project owner to update GEMINI_MODEL.`,
      model,
    };
  }

  return { ok: false, errorKind: "unknown", message: "Gemini could not prepare this article. Please try again.", model };
}

export async function prepareNewsWithGemini(input: GeminiPrepareInput): Promise<GeminiPrepareResult> {
  const model = resolveModel();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      errorKind: "missing_key",
      message: "Gemini is not configured yet. Ask the project owner to set GEMINI_API_KEY.",
      model,
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  let responseText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: buildPrompt(input),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING, enum: [...NEWS_CATEGORIES] },
            company_name: { type: Type.STRING, nullable: true },
            news_date: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["title", "description", "category", "news_date", "tags"],
        },
        temperature: 0.3,
      },
    });
    responseText = response.text;
  } catch (err) {
    // Temporary diagnostic: classifyError() below only ever returns a
    // user-safe generic message, and nothing else in this path previously
    // logged the raw exception -- so a failure here was otherwise
    // invisible in Vercel's logs. Logging structured fields (rather than
    // just the Error object) survives log-viewer truncation/formatting
    // better and avoids ever leaking the API key, which the SDK does not
    // include on the error object.
    const errObj = err as { message?: unknown; name?: unknown; status?: unknown; statusText?: unknown; cause?: unknown };
    console.error("[Gemini diagnostic] prepareNewsWithGemini threw:", {
      name: errObj?.name,
      message: errObj?.message,
      status: errObj?.status,
      statusText: errObj?.statusText,
      cause: errObj?.cause,
      model,
    });
    return classifyError(err, model);
  }

  if (!responseText) {
    return {
      ok: false,
      errorKind: "invalid_response",
      message: "Gemini returned an empty response. Please try again.",
      model,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    return {
      ok: false,
      errorKind: "invalid_response",
      message: "Gemini's response could not be understood. Please try again.",
      model,
    };
  }

  const validated = geminiOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      ok: false,
      errorKind: "invalid_response",
      message: "Gemini's response did not match the required format. Please try again.",
      model,
    };
  }

  const companyName = validated.data.company_name;
  const matchedCompany = companyName
    ? input.companyNames.find((n) => n.toLowerCase() === companyName.toLowerCase()) ?? null
    : null;

  return {
    ok: true,
    model,
    data: {
      title: validated.data.title,
      description: validated.data.description,
      category: validated.data.category as NewsCategory,
      companyName: matchedCompany,
      newsDate: validated.data.news_date,
      tags: validated.data.tags,
    },
  };
}
