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

/**
 * Apply a Kalshi WebSocket `ticker` channel payload to the in-memory position snapshot (merge bid/ask).
 * Works even before REST has populated the market; improves mark-to-market between REST refreshes.
 */
export function applyKalshiWsTickerMessage(msg: any): void {
  const ticker = msg?.market_ticker;
  if (!ticker || typeof ticker !== "string") return;

  const snap = snapshots.get(ticker);
  const base = snap?.market ? { ...snap.market } : { ticker };

  if (msg.yes_bid_dollars != null) base.yes_bid_dollars = msg.yes_bid_dollars;
  if (msg.yes_ask_dollars != null) base.yes_ask_dollars = msg.yes_ask_dollars;
  if (msg.yes_bid != null && base.yes_bid_dollars == null && base.yes_bid == null) base.yes_bid = msg.yes_bid;
  if (msg.yes_ask != null && base.yes_ask_dollars == null && base.yes_ask == null) base.yes_ask = msg.yes_ask;
  if (msg.last_price_dollars != null) base.last_price_dollars = msg.last_price_dollars;
  if (msg.volume_24h != null) base.volume_24h = msg.volume_24h;
  if (msg.open_interest != null) base.open_interest = msg.open_interest;

  const yesMid = kalshiYesMidProbability(base);
  snapshots.set(ticker, {
    ticker,
    fetchedAt: Date.now(),
    market: base,
    yesMid
  });
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

/**
 * Refresh Kalshi market docs for every distinct ticker in OPEN trades (throttled via kalshi client).
 * @param retainSnapshotTickers Keep these tickers in the snapshot map without requiring OPEN (e.g. watchlist fed by WebSocket).
 */
export async function refreshOpenPositionMarkets(retainSnapshotTickers: string[] = []): Promise<string[]> {
  let trades: any[];
  try {
    trades = await listDocs("trades");
  } catch (e) {
    console.warn("Position markets: could not list trades:", e);
    return [];
  }

  const retainExtra = [
    ...new Set(retainSnapshotTickers.map((t) => String(t).trim()).filter(Boolean))
  ];

  const open = trades.filter((t) => t.status === "OPEN" && t.ticker);
  const tickers = [...new Set(open.map((t) => String(t.ticker)))];
  if (tickers.length === 0) {
    if (retainExtra.length === 0) {
      snapshots.clear();
    } else {
      for (const key of [...snapshots.keys()]) {
        if (!retainExtra.includes(key)) snapshots.delete(key);
      }
    }
    return [];
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

  const retainSet = new Set<string>([...tickers, ...retainExtra]);
  for (const key of [...snapshots.keys()]) {
    if (!retainSet.has(key)) snapshots.delete(key);
  }

  return tickers;
}
