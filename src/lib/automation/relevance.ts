// Preliminary relevance filter. This never rejects an article outright --
// it only scores it so the News Inbox can sort/badge, and anything uncertain
// is labelled "needs_review" rather than being dropped (spec section 12).

const STRONG_KEYWORDS = [
  "solar", "solar pv", "photovoltaic", "pv module", "solar module", "solar cell",
  "solar cells", "wafer", "ingot", "topcon", "mono-perc", "monoperc", "hjt",
  "heterojunction", "back contact", "polysilicon", "solar manufacturing",
  "cell manufacturing", "module manufacturing", "solar capacity", "solar efficiency",
  "solar tariff", "solar import", "solar export", "solar policy", "solar project",
  "solar demand", "solar investment", "solar supply chain", "gw of solar",
  "gigawatt solar", "renewable energy", "clean energy manufacturing",
];

const SUPPORTING_KEYWORDS = [
  "production capacity", "manufacturing expansion", "manufacturing facility",
  "silver", "supply chain", "tariffs", "imports", "exports", "capacity expansion",
  "gw capacity", "mw capacity", "gigafactory", "production line", "green energy",
  "renewable", "clean energy", "energy transition", "ppa", "power purchase agreement",
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function countMatches(haystack: string, needles: string[]): number {
  let count = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) count++;
  }
  return count;
}

export interface RelevanceResult {
  score: number;
  label: "high" | "medium" | "low" | "needs_review";
  matchedCompanyName: string | null;
}

export function scoreRelevance(
  title: string,
  description: string,
  companyNames: string[]
): RelevanceResult {
  const haystack = normalize(`${title} ${description}`);

  const strongMatches = countMatches(haystack, STRONG_KEYWORDS);
  const supportingMatches = countMatches(haystack, SUPPORTING_KEYWORDS);

  let matchedCompanyName: string | null = null;
  for (const name of companyNames) {
    const normalizedName = normalize(name);
    // Guard against 1-2 char company fragments matching everything.
    if (normalizedName.length < 3) continue;
    if (haystack.includes(normalizedName)) {
      matchedCompanyName = name;
      break;
    }
  }

  let score = strongMatches * 25 + supportingMatches * 10;
  if (matchedCompanyName) score += 35;
  score = Math.min(100, score);

  let label: RelevanceResult["label"];
  if (matchedCompanyName || strongMatches >= 1) {
    label = score >= 60 ? "high" : "medium";
  } else if (supportingMatches >= 2) {
    label = "medium";
  } else if (supportingMatches === 1) {
    label = "needs_review";
  } else {
    // No strong signal at all -- still surfaced in the Inbox (never silently
    // dropped), just flagged so the admin knows to give it a closer look.
    label = "needs_review";
  }

  return { score, label, matchedCompanyName };
}
