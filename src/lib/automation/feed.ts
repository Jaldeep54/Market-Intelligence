import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  link: string;
  guid: string | null;
  description: string | null;
  contentEncoded: string | null;
  author: string | null;
  publishedAt: string | null; // ISO 8601, or null if unparseable/absent
  imageUrl: string | null;
}

export interface FeedFetchResult {
  ok: boolean;
  items: FeedItem[];
  error: string | null;
  resolvedFeedUrl: string | null;
}

const FETCH_TIMEOUT_MS = 15_000;
// Identifies the bot honestly in the User-Agent, per spec section 4/48: this
// monitors public RSS/Atom feeds and public pages only, never bypasses
// paywalls, logins, CAPTCHAs, or robots restrictions.
const USER_AGENT = "MarketIntelligenceNewsBot/1.0 (+internal solar market intelligence source monitor)";

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Best-effort feed autodiscovery from a website's public HTML <head> (link
// rel="alternate") or common conventional feed paths. Only reads publicly
// served HTML -- no login, no CAPTCHA-solving, no anti-bot bypass.
export async function discoverFeedUrl(websiteUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(websiteUrl);
    if (res.ok) {
      const html = await res.text();
      const linkTags = html.match(/<link\s+[^>]*>/gi) ?? [];
      for (const tag of linkTags) {
        if (!/rel=["']alternate["']/i.test(tag)) continue;
        if (!/type=["'](application\/rss\+xml|application\/atom\+xml|application\/xml)["']/i.test(tag)) {
          continue;
        }
        const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          try {
            return new URL(hrefMatch[1], websiteUrl).toString();
          } catch {
            // ignore malformed href, keep scanning
          }
        }
      }
    }
  } catch {
    // fall through to convention guesses
  }

  const base = websiteUrl.replace(/\/+$/, "");
  const guesses = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/feed/", "/rss/", "/index.xml"];
  for (const guess of guesses) {
    try {
      const res = await fetchWithTimeout(`${base}${guess}`);
      if (!res.ok) continue;
      const text = await res.text();
      if (/<rss[\s>]|<feed[\s>]/i.test(text)) return `${base}${guess}`;
    } catch {
      continue;
    }
  }

  return null;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"].trim() || null;
  }
  return null;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function rssItemToFeedItem(item: Record<string, unknown>): FeedItem | null {
  const title = textOf(item.title);
  const link = textOf(item.link) ?? textOf((item as Record<string, unknown>).guid);
  if (!title || !link) return null;

  const enclosure = item.enclosure as Record<string, unknown> | undefined;
  const mediaContent = (item["media:content"] ?? item["media:thumbnail"]) as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | undefined;
  const mediaFirst = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;

  const imageUrl =
    (enclosure?.["@_url"] as string | undefined) ??
    (mediaFirst?.["@_url"] as string | undefined) ??
    null;

  return {
    title,
    link,
    guid: textOf(item.guid),
    description: stripHtml(textOf(item.description)),
    contentEncoded: stripHtml(textOf(item["content:encoded"])),
    author: textOf(item.author) ?? textOf(item["dc:creator"]),
    publishedAt: parseDate(textOf(item.pubDate) ?? textOf(item["dc:date"])),
    imageUrl,
  };
}

function atomEntryToFeedItem(entry: Record<string, unknown>): FeedItem | null {
  const title = textOf(entry.title);
  if (!title) return null;

  const links = asArray(entry.link as Record<string, unknown> | Record<string, unknown>[]);
  const alternate =
    links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  const link = (alternate?.["@_href"] as string | undefined) ?? textOf(entry.id);
  if (!link) return null;

  const author = entry.author as Record<string, unknown> | undefined;

  return {
    title,
    link,
    guid: textOf(entry.id),
    description: stripHtml(textOf(entry.summary)),
    contentEncoded: stripHtml(textOf(entry.content)),
    author: textOf(author?.name) ?? null,
    publishedAt: parseDate(textOf(entry.published) ?? textOf(entry.updated)),
    imageUrl: null,
  };
}

export function parseFeed(xml: string): FeedItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;

  const rss = parsed.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    const items = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);
    return items
      .map(rssItemToFeedItem)
      .filter((i): i is FeedItem => i !== null);
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (feed?.entry) {
    const entries = asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[]);
    return entries
      .map(atomEntryToFeedItem)
      .filter((i): i is FeedItem => i !== null);
  }

  const rdf = parsed["rdf:RDF"] as Record<string, unknown> | undefined;
  if (rdf?.item) {
    const items = asArray(rdf.item as Record<string, unknown> | Record<string, unknown>[]);
    return items
      .map(rssItemToFeedItem)
      .filter((i): i is FeedItem => i !== null);
  }

  return [];
}

// Fetches and parses a source's feed. If feedUrl is not provided, attempts
// autodiscovery from websiteUrl first. Never falls back to scraping HTML
// article listings -- if no feed can be found, returns a clear error instead
// of attempting anything that risks bypassing site protections.
export async function fetchFeed(websiteUrl: string, feedUrl: string | null): Promise<FeedFetchResult> {
  let resolvedFeedUrl = feedUrl;

  if (!resolvedFeedUrl) {
    resolvedFeedUrl = await discoverFeedUrl(websiteUrl);
    if (!resolvedFeedUrl) {
      return {
        ok: false,
        items: [],
        error:
          "No RSS/Atom feed could be found for this source automatically. Add the feed URL manually in the source's settings.",
        resolvedFeedUrl: null,
      };
    }
  }

  try {
    const res = await fetchWithTimeout(resolvedFeedUrl);
    if (!res.ok) {
      return {
        ok: false,
        items: [],
        error: `Source returned HTTP ${res.status} ${res.statusText}.`,
        resolvedFeedUrl,
      };
    }
    const xml = await res.text();
    const items = parseFeed(xml);
    if (items.length === 0) {
      return {
        ok: false,
        items: [],
        error: "The feed responded but no articles could be read from it.",
        resolvedFeedUrl,
      };
    }
    return { ok: true, items, error: null, resolvedFeedUrl };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      items: [],
      error: isAbort ? "Timed out while checking this source." : "Could not reach this source.",
      resolvedFeedUrl,
    };
  }
}
