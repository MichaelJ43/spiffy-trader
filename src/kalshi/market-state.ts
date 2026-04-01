import type { KalshiMarketLite } from "./types.js";

export let kalshiOpenMarketsCache: KalshiMarketLite[] = [];
export let kalshiOpenMarketsFetchedAt = 0;
export let kalshiMarketsRefreshInFlight: Promise<void> | null = null;

/** ticker -> embedding vector (Ollama); rebuilt when open-market cache refreshes. */
export const kalshiMarketEmbeddingByTicker = new Map<string, number[]>();

export function setKalshiMarketsCache(markets: KalshiMarketLite[], fetchedAtMs: number) {
  kalshiOpenMarketsCache = markets;
  kalshiOpenMarketsFetchedAt = fetchedAtMs;
}

export function setKalshiMarketsRefreshInFlight(p: Promise<void> | null) {
  kalshiMarketsRefreshInFlight = p;
}
