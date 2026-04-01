import { kalshiGet } from "./client.js";

/** Mid price of YES in 0–1 probability units (supports dollars API + legacy cent bids). */
export function kalshiYesMidProbability(marketData: any): number {
  const bidRaw = marketData?.yes_bid_dollars ?? marketData?.yes_bid;
  const askRaw = marketData?.yes_ask_dollars ?? marketData?.yes_ask;
  const bid = Number(bidRaw);
  const ask = Number(askRaw);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return 0.5;
  if (bid >= 0 && bid <= 1 && ask >= 0 && ask <= 1) return (bid + ask) / 2;
  return (bid + ask) / 200;
}

export async function getKalshiMarketData(ticker: string) {
  try {
    const enc = encodeURIComponent(ticker);
    const data = await kalshiGet(`/markets/${enc}`);
    return data?.market ?? null;
  } catch {
    return null;
  }
}
