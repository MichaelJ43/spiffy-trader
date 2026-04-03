import { cosineSimilarity } from "../lib/utils.js";
import { curateMarketsForNewsByTokens } from "../lib/text-match.js";
import { OLLAMA_EMBED_MODEL } from "../server/config.js";
import { ollamaEmbed } from "../ollama/embed.js";
import { kalshiMarketEmbeddingByTicker } from "./market-state.js";
import { marketHasObservableActivity } from "./activity.js";
import type { KalshiMarketLite } from "./types.js";

export type CurateMarketsForNewsOptions = {
  /**
   * LLM-derived transmission channels (commodities, macro, downstream themes).
   * Used for a second embedding query and richer token overlap vs the headline alone.
   */
  expansionText?: string | null;
};

function dualEmbeddingScore(
  newsVec: number[],
  expansionVec: number[] | null,
  marketVec: number[]
): number {
  const a = cosineSimilarity(newsVec, marketVec);
  if (!expansionVec || expansionVec.length !== marketVec.length) return a;
  return Math.max(a, cosineSimilarity(expansionVec, marketVec));
}

/**
 * Rank open markets for this headline: cosine similarity in embedding space when available,
 * else token overlap. Optional `expansionText` merges a second embedding (max similarity) so
 * indirect / butterfly links surface. Fills with token-curated picks if the embedding shortlist is thin.
 */
export async function curateMarketsForNews(
  newsContent: string,
  pool: KalshiMarketLite[],
  maxPick: number,
  opts?: CurateMarketsForNewsOptions
): Promise<KalshiMarketLite[]> {
  const poolActive = pool.filter(marketHasObservableActivity);
  if (poolActive.length === 0) return [];

  const expansionTrim = opts?.expansionText?.trim() ?? "";
  const textForTokens =
    expansionTrim.length > 0 ? `${newsContent}\n\n${expansionTrim}` : newsContent;

  const tokenFallback = () => curateMarketsForNewsByTokens(textForTokens, poolActive, maxPick);

  if (!OLLAMA_EMBED_MODEL || kalshiMarketEmbeddingByTicker.size === 0) {
    return tokenFallback();
  }

  const queryNews = await ollamaEmbed(newsContent.slice(0, 4000));
  if (!queryNews || queryNews.length === 0) {
    return tokenFallback();
  }

  let queryExpansion: number[] | null = null;
  if (expansionTrim.length > 0) {
    queryExpansion = await ollamaEmbed(expansionTrim.slice(0, 4000));
    if (!queryExpansion || queryExpansion.length !== queryNews.length) {
      queryExpansion = null;
    }
  }

  const scored: { m: KalshiMarketLite; score: number }[] = [];
  for (const m of poolActive) {
    const v = kalshiMarketEmbeddingByTicker.get(m.ticker);
    if (!v || v.length !== queryNews.length) continue;
    scored.push({ m, score: dualEmbeddingScore(queryNews, queryExpansion, v) });
  }
  scored.sort(
    (a, b) => b.score - a.score || (a.m.title || "").localeCompare(b.m.title || "")
  );

  if (scored.length === 0) {
    return tokenFallback();
  }

  const topEmb = scored.slice(0, maxPick).map((s) => s.m);
  if (topEmb.length >= maxPick) return topEmb;

  const seen = new Set(topEmb.map((m) => m.ticker));
  const extra = curateMarketsForNewsByTokens(textForTokens, poolActive, maxPick).filter(
    (m) => !seen.has(m.ticker)
  );
  return [...topEmb, ...extra].slice(0, maxPick);
}
