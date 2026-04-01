import type { KalshiMarketLite } from "./types.js";

/** Parse numeric fields from Kalshi GET /markets rows; undefined if absent or invalid. */
export function parseKalshiOptionalNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * True if we should consider this market for trading. Kalshi may omit activity fields on older
 * snapshots; in that case we keep the row (backward compatibility). If any metric is present,
 * require at least one of 24h volume, lifetime volume, or open interest to be > 0.
 */
export function marketHasObservableActivity(m: KalshiMarketLite): boolean {
  const v24 = m.volume_24h;
  const vol = m.volume;
  const oi = m.open_interest;
  if (v24 === undefined && vol === undefined && oi === undefined) return true;
  return (v24 ?? 0) > 0 || (vol ?? 0) > 0 || (oi ?? 0) > 0;
}

/**
 * Map a Kalshi open-market list row to our lite type. Returns null when the market has no
 * ticker or when all present activity metrics are zero (dead market).
 */
export function kalshiMarketLiteFromListApiRow(raw: any): KalshiMarketLite | null {
  const ticker = raw?.ticker;
  if (!ticker) return null;
  const title = String(raw.title || raw.yes_sub_title || raw.no_sub_title || "").slice(0, 600);
  const event_ticker = raw.event_ticker;
  const volume_24h = parseKalshiOptionalNumber(raw.volume_24h);
  const volume = parseKalshiOptionalNumber(raw.volume);
  const open_interest = parseKalshiOptionalNumber(raw.open_interest);
  const m: KalshiMarketLite = { ticker, title, event_ticker, volume_24h, volume, open_interest };
  if (!marketHasObservableActivity(m)) return null;
  return m;
}
