import { cosineSimilarity } from "../lib/utils.js";
import { curateMarketsForNewsByTokens } from "../lib/text-match.js";
import { OLLAMA_EMBED_MODEL } from "../server/config.js";
import { ollamaEmbed } from "../ollama/embed.js";
import { kalshiMarketEmbeddingByTicker } from "./market-state.js";
import { marketHasObservableActivity } from "./activity.js";
import type { KalshiMarketLite } from "./types.js";

/**
 * Rank open markets for this headline: cosine similarity in embedding space when available,
 * else token overlap. Fills with token-curated picks if the embedding shortlist is thin.
 */
export async function curateMarketsForNews(
  newsContent: string,
  pool: KalshiMarketLite[],
  maxPick: number
): Promise<KalshiMarketLite[]> {
  const poolActive = pool.filter(marketHasObservableActivity);
  if (poolActive.length === 0) return [];

  const tokenFallback = () => curateMarketsForNewsByTokens(newsContent, poolActive, maxPick);

  if (!OLLAMA_EMBED_MODEL || kalshiMarketEmbeddingByTicker.size === 0) {
    return tokenFallback();
  }

  const query = await ollamaEmbed(newsContent.slice(0, 4000));
  if (!query || query.length === 0) {
    return tokenFallback();
  }

  const scored: { m: KalshiMarketLite; score: number }[] = [];
  for (const m of poolActive) {
    const v = kalshiMarketEmbeddingByTicker.get(m.ticker);
    if (!v || v.length !== query.length) continue;
    scored.push({ m, score: cosineSimilarity(query, v) });
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return tokenFallback();
  }

  const topEmb = scored.slice(0, maxPick).map((s) => s.m);
  if (topEmb.length >= maxPick) return topEmb;

  const seen = new Set(topEmb.map((m) => m.ticker));
  const extra = curateMarketsForNewsByTokens(newsContent, poolActive, maxPick).filter((m) => !seen.has(m.ticker));
  return [...topEmb, ...extra].slice(0, maxPick);
}
