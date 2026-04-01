import { listDocs } from "../db/documents.js";
import { kalshiGet } from "./client.js";
import { kalshiYesMidProbability } from "./pricing.js";

export type PositionMarketSnapshot = {
  ticker: string;
  fetchedAt: number;
  market: any;
  yesMid: number;
};

const snapshots = new Map<string, PositionMarketSnapshot>();

export function getPositionMarketSnapshots(): ReadonlyMap<string, PositionMarketSnapshot> {
  return snapshots;
}

export function summarizeMarketForRisk(m: any, ticker: string) {
  if (!m) return { ticker, error: "no_data" };
  return {
    ticker,
    title: String(m.title || m.yes_sub_title || m.no_sub_title || "").slice(0, 200),
    status: m.status,
    result: m.result,
    yesMid: kalshiYesMidProbability(m),
    yesBid: m.yes_bid_dollars ?? m.yes_bid,
    yesAsk: m.yes_ask_dollars ?? m.yes_ask,
    volume24h: m.volume_24h ?? m.volume,
    openInterest: m.open_interest,
    closeTime: m.close_time ?? m.expiration_time
  };
}

/** Refresh Kalshi market docs for every distinct ticker in OPEN trades (throttled via kalshi client). */
export async function refreshOpenPositionMarkets(): Promise<void> {
  let trades: any[];
  try {
    trades = await listDocs("trades");
  } catch (e) {
    console.warn("Position markets: could not list trades:", e);
    return;
  }

  const open = trades.filter((t) => t.status === "OPEN" && t.ticker);
  const tickers = [...new Set(open.map((t) => String(t.ticker)))];
  if (tickers.length === 0) {
    snapshots.clear();
    return;
  }

  for (const ticker of tickers) {
    try {
      const enc = encodeURIComponent(ticker);
      const data = await kalshiGet(`/markets/${enc}`);
      const market = data?.market;
      if (market) {
        snapshots.set(ticker, {
          ticker,
          fetchedAt: Date.now(),
          market,
          yesMid: kalshiYesMidProbability(market)
        });
      }
    } catch (e: any) {
      console.warn(`Position markets: fetch failed for ${ticker}:`, e?.message || e);
    }
  }

  for (const key of [...snapshots.keys()]) {
    if (!tickers.includes(key)) snapshots.delete(key);
  }
}
