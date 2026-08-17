// Deno port of src/lib/automation/duplicate.ts for the scheduled Edge
// Function (supabase/functions/fetch-sources). Identical logic to the
// Next.js copy, EXCEPT contentHash uses the Web Crypto API (crypto.subtle,
// global in Deno) instead of Node's `crypto` module, since Deno has no
// Node `crypto` import. If you change the duplicate-detection logic, update
// both copies -- see the header comment in the Next.js original for why
// these aren't a single shared file.

// Query params that identify tracking/campaign noise rather than the article
// itself. Stripped so "same article, different marketing link" collapses to
// one canonical URL (Level 1 duplicate detection).
const TRACKING_PARAM_PREFIXES = ["utm_", "fbclid", "gclid", "mc_", "icid", "ito", "ns_", "cmpid"];
const TRACKING_PARAM_EXACT = new Set(["ref", "source", "amp", "share", "spref"]);

export function canonicalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  url.hash = "";
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  const keep = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAM_EXACT.has(lowerKey)) continue;
    if (TRACKING_PARAM_PREFIXES.some((p) => lowerKey.startsWith(p))) continue;
    keep.append(key, value);
  }
  keep.sort();
  url.search = keep.toString();

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "") pathname = "/";
  url.pathname = pathname;

  return url.toString();
}

export async function contentHash(title: string, canonicalUrl: string): Promise<string> {
  const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, " ");
  const data = new TextEncoder().encode(`${normalizedTitle}::${canonicalUrl}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with",
  "is", "are", "was", "were", "be", "as", "by", "from", "its", "it", "this", "that",
  "will", "has", "have", "had", "after", "over", "into", "amid", "amid", "up",
]);

function significantWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9%.\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

// Level 2 "possible duplicate" heuristic: Jaccard similarity of significant
// title words. Cheap, no external API calls, deliberately conservative --
// this only ever *flags* a candidate for human review, never deletes it.
export function titleSimilarity(a: string, b: string): number {
  const setA = significantWords(a);
  const setB = significantWords(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const POSSIBLE_DUPLICATE_THRESHOLD = 0.45;
