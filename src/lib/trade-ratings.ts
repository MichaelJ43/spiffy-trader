import { clamp, SOURCE_RATING_HALF_LIFE_DAYS } from "../server/config.js";

export function getReasoningKey(reasoning: string) {
  return (reasoning || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
}

export function calculateTradeRating(trade: any) {
  const amount = Math.max(1, Number(trade.amount) || 1);
  const pnl = Number(trade.pnl) || 0;
  const roi = pnl / amount;
  const impact = Number(trade.impactScore) || 0;
  const confidence = Number(trade.confidenceScore) || 50;
  const score = 50 + roi * 220 + (impact - 50) * 0.15 + (confidence - 50) * 0.1;
  return Math.round(clamp(score, 0, 100));
}

export type RecencyRatingStats = { avg: number; count: number };

/** Per-key time-decayed average tradeRating and raw count of rated CLOSED trades. */
export function recencyWeightedRatingStatsByKey(
  trades: any[],
  keyFn: (trade: any) => string | null
): Map<string, RecencyRatingStats> {
  const buckets = new Map<string, { rating: number; timeMs: number }[]>();
  const now = Date.now();
  const decay = Math.LN2 / SOURCE_RATING_HALF_LIFE_DAYS;

  for (const trade of trades) {
    if (trade.status !== "CLOSED" || typeof trade.tradeRating !== "number") continue;
    const key = keyFn(trade);
    if (!key) continue;
    const timeMs = Date.parse(trade.timestamp || "") || now;
    const list = buckets.get(key) || [];
    list.push({ rating: trade.tradeRating, timeMs });
    buckets.set(key, list);
  }

  const out = new Map<string, RecencyRatingStats>();
  for (const [key, list] of buckets) {
    let wSum = 0;
    let wrSum = 0;
    for (const { rating, timeMs } of list) {
      const ageDays = Math.max(0, (now - timeMs) / 86400000);
      const w = Math.exp(-decay * ageDays);
      wSum += w;
      wrSum += w * rating;
    }
    const avg = wSum > 0 ? clamp(wrSum / wSum, 0, 100) : 50;
    out.set(key, { avg, count: list.length });
  }
  return out;
}

/** Mix prior with observed average until `count` reaches minTrades (linear ramp). */
export function blendRecencyPrior(
  stats: RecencyRatingStats | undefined,
  prior: number,
  minTrades: number
): number {
  if (!stats || stats.count < 1) return prior;
  if (minTrades <= 1) return stats.avg;
  if (stats.count >= minTrades) return stats.avg;
  const w = stats.count / minTrades;
  return prior * (1 - w) + stats.avg * w;
}
