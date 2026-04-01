import type { PositionMarketSnapshot } from "../kalshi/position-markets.js";

/**
 * Mark-to-market USD value of OPEN YES positions: sum of amount * (currentMid / entryPrice).
 * Uses live snapshots when present; otherwise falls back to entry price (no extra Kalshi calls).
 */
export function markToMarketOpenHoldings(
  openTrades: any[],
  snapshots: ReadonlyMap<string, PositionMarketSnapshot>
): number {
  let sum = 0;
  for (const t of openTrades) {
    const entry = Number(t.price) || 0;
    const amt = Number(t.amount) || 0;
    if (amt <= 0) continue;
    const ticker = String(t.ticker || "");
    const snap = snapshots.get(ticker);
    const mid =
      snap != null && Number.isFinite(snap.yesMid)
        ? snap.yesMid
        : entry > 0
          ? entry
          : 0.5;
    if (entry > 0) sum += amt * (mid / entry);
    else sum += amt;
  }
  return sum;
}
