import "server-only";

// Lightweight, dependency-free HTML->text extraction for the "Add News ->
// Generate with Gemini" flow, which (unlike the automated source monitor in
// src/lib/automation/feed.ts) needs the readable content of a single
// arbitrary article page the user pastes in, not an RSS/Atom feed. Kept
// deliberately simple: strips script/style/nav/etc. and tags, no
// readability heuristics -- Gemini itself does the summarizing.

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TEXT_LENGTH = 8000;
// Same honest bot identification as the feed fetcher, per spec section 4/48:
// public pages only, never a paywall/login/CAPTCHA bypass.
const USER_AGENT = "MarketIntelligenceNewsBot/1.0 (+internal solar market intelligence source monitor)";

export interface ArticleExtractResult {
  ok: boolean;
  title: string | null;
  text: string;
  error: string | null;
}

export async function extractArticleText(url: string): Promise<ArticleExtractResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return { ok: false, title: null, text: "", error: `The source URL returned an error (HTTP ${res.status}).` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return { ok: false, title: null, text: "", error: "The source URL did not return a readable web page." };
    }

    html = await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, title: null, text: "", error: "Timed out while fetching the source URL." };
    }
    return { ok: false, title: null, text: "", error: "Could not reach the source URL." };
  } finally {
    clearTimeout(timeout);
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() || null : null;

  const text = htmlToText(html).slice(0, MAX_TEXT_LENGTH);
  if (!text) {
    return { ok: false, title, text: "", error: "Could not extract readable content from this URL." };
  }

  return { ok: true, title, text, error: null };
}

function htmlToText(html: string): string {
  let body = html;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, " ");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, " ");
  body = body.replace(/<(nav|header|footer|form|noscript)[\s\S]*?<\/\1>/gi, " ");
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<[^>]+>/g, " ");
  body = decodeHtmlEntities(body);
  return body.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}
