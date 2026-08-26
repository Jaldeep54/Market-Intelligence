import "server-only";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/types/database";

// Single isolated module for all Gemini access (spec section 35). Nothing
// else in the app talks to the Google GenAI SDK directly -- callers use
// prepareNewsWithGemini() / generateNewsDraftFromUrl() below. Swapping
// providers or SDK versions later only touches this file.
//
// The exact model is never hard-coded beyond this default fallback -- set
// GEMINI_MODEL to override. Google retires/renames model ids over time
// (gemini-2.5-flash was retired for new API keys in favor of
// gemini-3.6-flash, confirmed via a live 404 from the Gemini API), so this
// default may need updating again later; GEMINI_MODEL always takes
// precedence over it when set.
const DEFAULT_MODEL = "gemini-3.6-flash";

// Hard cap enforced both in the prompt and after parsing Gemini's response --
// Gemini is asked for <=70 words, but the limit is only real once the
// application checks it and refuses to save anything over it.
const MAX_DESCRIPTION_WORDS = 70;
// One retry with explicit feedback is enough for a well-instructed model to
// self-correct; a longer loop just burns quota for a summary nobody asked for.
const MAX_GENERATION_ATTEMPTS = 2;

export type GeminiErrorKind =
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "invalid_response"
  | "model_unavailable"
  | "unknown";

export interface GeminiFailure {
  ok: false;
  errorKind: GeminiErrorKind;
  message: string;
  model: string;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// --- News Inbox "Prepare / Regenerate with Gemini" -------------------------

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

export type GeminiPrepareResult = GeminiPrepareSuccess | GeminiFailure;

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

// The description instruction is shared wording between this prompt and
// buildDraftPrompt() below -- both must enforce the exact same 70-word cap.
function describeWordLimitInstruction(retryWordCount: number | null): string {
  const base =
    'STRICT MAXIMUM of 70 words -- never exceed 70 words under any circumstances. Aim for approximately 60-70 words when the article provides enough information. Retain the most important facts, developments, companies, figures, and implications. Do not invent or add information that is not present in the source. Do not use unnecessary introductory phrases such as "This article discusses...", "According to the article...", or "The report highlights...". Write in a professional tone suitable for an internal market intelligence briefing.';
  if (!retryWordCount) return base;
  return `${base} Your previous attempt was ${retryWordCount} words, which exceeds the limit -- rewrite it so it is 70 words or fewer.`;
}

function buildPrompt(input: GeminiPrepareInput, retryWordCount: number | null): string {
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
- "description": ${describeWordLimitInstruction(retryWordCount)}
- "category": exactly one of "Global Market", "Indian Market", "Top Company News", "Analytical News".
- "company_name": the exact name of one tracked company from the list above if the article is clearly about it, otherwise null.
- "news_date": the article's publication date as YYYY-MM-DD (use ${fallbackNewsDate(input)} if the date is unclear).
- "tags": 2 to 4 short, useful lowercase tags, no hashtags.

Return only the JSON object.`;
}

// --- Add News "Generate with Gemini" (from a source URL) -------------------

export interface GeminiDraftInput {
  sourceUrl: string;
  pageTitle: string | null;
  pageText: string;
}

export interface GeminiDraftOutput {
  title: string;
  description: string;
  tags: string[];
}

export interface GeminiDraftSuccess {
  ok: true;
  data: GeminiDraftOutput;
  model: string;
}

export type GeminiDraftResult = GeminiDraftSuccess | GeminiFailure;

const geminiDraftOutputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(1200),
  tags: z.array(z.string().trim().min(1).max(40)).min(1).max(6),
});

function buildDraftPrompt(input: GeminiDraftInput, retryWordCount: number | null): string {
  const contentExcerpt = input.pageText.slice(0, 6000);

  return `You are drafting a solar-industry market intelligence news entry for a CTO-level executive dashboard, based on a source article a user is adding manually.

Source URL: ${input.sourceUrl}
${input.pageTitle ? `Page title: ${input.pageTitle}` : ""}

Article content:
"""
${contentExcerpt || "(no readable content extracted -- use the page title only)"}
"""

Return a JSON object with exactly these fields:
- "title": a concise, professional news headline based on the article. Avoid sensational language.
- "description": ${describeWordLimitInstruction(retryWordCount)} Capture the key development and its business/market relevance. Do not use bullet points -- return plain text suitable for directly placing into a description field.
- "tags": 2 to 4 short, relevant, lowercase tags useful for filtering and search on the platform, no hashtags.

Return only the JSON object.`;
}

// --- Shared low-level call/parse/validate + error classification -----------

// Shape of the errors the @google/genai SDK actually throws (an ApiError
// with a numeric HTTP `status`), as confirmed from a live production
// failure. Matching on `status` is far more reliable than matching
// substrings of `message`, which varies in exact wording/casing/punctuation
// (e.g. Google's own "NOT_FOUND" vs. a naive "not found" string check).
interface GeminiSdkErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusText?: unknown;
  cause?: unknown;
}

function classifyError(err: unknown, model: string): GeminiFailure {
  if (err instanceof Error && err.name === "AbortError") {
    return { ok: false, errorKind: "timeout", message: "Gemini took too long to respond. Please try again.", model };
  }

  const errObj = err as GeminiSdkErrorLike;
  const status = typeof errObj?.status === "number" ? errObj.status : undefined;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    status === 404 ||
    (lower.includes("model") && (lower.includes("not found") || lower.includes("not_found") || lower.includes("no longer available")))
  ) {
    return {
      ok: false,
      errorKind: "model_unavailable",
      message: `The configured Gemini model ("${model}") is unavailable. Ask the project owner to update GEMINI_MODEL.`,
      model,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid") ||
    lower.includes("permission_denied")
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

  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("rate limit")) {
    return {
      ok: false,
      errorKind: "rate_limited",
      message: "Gemini is temporarily rate-limited. Please wait a moment and try again.",
      model,
    };
  }

  return { ok: false, errorKind: "unknown", message: "Gemini could not prepare this article. Please try again.", model };
}

async function callGeminiJson<T>(params: {
  apiKey: string;
  model: string;
  prompt: string;
  responseSchema: object;
  zodSchema: z.ZodType<T>;
  logLabel: string;
}): Promise<{ ok: true; data: T } | GeminiFailure> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });

  let responseText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: params.model,
      contents: params.prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: params.responseSchema,
        temperature: 0.3,
      },
    });
    responseText = response.text;
  } catch (err) {
    // Kept permanently (not just for one-off diagnosis): classifyError()
    // below only ever returns a user-safe generic message when it can't
    // classify the error, so without this log line an unrecognized Gemini
    // failure is otherwise invisible in Vercel's logs. Logging structured
    // fields (rather than just the Error object) survives log-viewer
    // truncation/formatting better and never includes the API key, which
    // the SDK does not attach to the error object.
    const errObj = err as GeminiSdkErrorLike;
    console.error(`[Gemini diagnostic] ${params.logLabel} threw:`, {
      name: errObj?.name,
      message: errObj?.message,
      status: errObj?.status,
      statusText: errObj?.statusText,
      cause: errObj?.cause,
      model: params.model,
    });
    return classifyError(err, params.model);
  }

  if (!responseText) {
    return {
      ok: false,
      errorKind: "invalid_response",
      message: "Gemini returned an empty response. Please try again.",
      model: params.model,
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
      model: params.model,
    };
  }

  const validated = params.zodSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      ok: false,
      errorKind: "invalid_response",
      message: "Gemini's response did not match the required format. Please try again.",
      model: params.model,
    };
  }

  return { ok: true, data: validated.data };
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

  let retryWordCount: number | null = null;
  let lastFailure: GeminiFailure | null = null;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const result = await callGeminiJson({
      apiKey,
      model,
      prompt: buildPrompt(input, retryWordCount),
      logLabel: "prepareNewsWithGemini",
      zodSchema: geminiOutputSchema,
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
    });

    if (!result.ok) return result;

    const words = countWords(result.data.description);
    if (words > MAX_DESCRIPTION_WORDS) {
      retryWordCount = words;
      lastFailure = {
        ok: false,
        errorKind: "invalid_response",
        message: "Gemini could not summarize this article within the 70-word limit. Please try again.",
        model,
      };
      continue;
    }

    const companyName = result.data.company_name;
    const matchedCompany = companyName
      ? input.companyNames.find((n) => n.toLowerCase() === companyName.toLowerCase()) ?? null
      : null;

    return {
      ok: true,
      model,
      data: {
        title: result.data.title,
        description: result.data.description,
        category: result.data.category as NewsCategory,
        companyName: matchedCompany,
        newsDate: result.data.news_date,
        tags: result.data.tags,
      },
    };
  }

  return lastFailure!;
}

export async function generateNewsDraftFromUrl(input: GeminiDraftInput): Promise<GeminiDraftResult> {
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

  let retryWordCount: number | null = null;
  let lastFailure: GeminiFailure | null = null;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const result = await callGeminiJson({
      apiKey,
      model,
      prompt: buildDraftPrompt(input, retryWordCount),
      logLabel: "generateNewsDraftFromUrl",
      zodSchema: geminiDraftOutputSchema,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "description", "tags"],
      },
    });

    if (!result.ok) return result;

    const words = countWords(result.data.description);
    if (words > MAX_DESCRIPTION_WORDS) {
      retryWordCount = words;
      lastFailure = {
        ok: false,
        errorKind: "invalid_response",
        message: "Gemini could not summarize this article within the 70-word limit. Please try again.",
        model,
      };
      continue;
    }

    return {
      ok: true,
      model,
      data: {
        title: result.data.title,
        description: result.data.description,
        tags: result.data.tags,
      },
    };
  }

  return lastFailure!;
}
