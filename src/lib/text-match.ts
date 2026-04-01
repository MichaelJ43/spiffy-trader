import { STOPWORDS } from "../server/config.js";
import type { KalshiMarketLite } from "../kalshi/types.js";

export function tokenizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function scoreMarketAgainstNews(newsTokenSet: Set<string>, title: string): number {
  let s = 0;
  for (const t of tokenizeForMatch(title)) {
    if (newsTokenSet.has(t)) s += 1;
  }
  return s;
}

/** Token overlap fallback when embeddings are off or unavailable. */
export function curateMarketsForNewsByTokens(
  newsContent: string,
  pool: KalshiMarketLite[],
  maxPick: number
): KalshiMarketLite[] {
  if (pool.length === 0) return [];
  const tokens = tokenizeForMatch(newsContent);
  if (tokens.length === 0) return pool.slice(0, maxPick);

  const newsSet = new Set(tokens);
  const scored = pool
    .map((m) => {
      const title = m.title || "";
      let score = scoreMarketAgainstNews(newsSet, title);
      const tick = m.ticker.toLowerCase();
      for (const tok of newsSet) {
        if (tick.includes(tok)) score += 0.5;
      }
      return { m, score };
    })
    .sort((a, b) => b.score - a.score || (a.m.title || "").localeCompare(b.m.title || ""));

  const strong = scored
    .filter((x) => x.score > 0)
    .slice(0, maxPick)
    .map((x) => x.m);
  if (strong.length >= Math.min(12, maxPick)) return strong;

  const seen = new Set(strong.map((m) => m.ticker));
  const filler = pool.filter((m) => !seen.has(m.ticker)).slice(0, maxPick - strong.length);
  return [...strong, ...filler].slice(0, maxPick);
}
