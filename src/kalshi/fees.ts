import { clamp } from "../server/config.js";

/**
 * Kalshi taker fee coefficient (see fee schedule). Fee per fill uses P × (1−P) weighting.
 * Override with KALSHI_TAKER_FEE_COEFFICIENT if the schedule changes.
 */
export const KALSHI_TAKER_FEE_COEFFICIENT = Math.max(
  0,
  Math.min(0.2, Number(process.env.KALSHI_TAKER_FEE_COEFFICIENT) || 0.07)
);

/**
 * YES price in 0–1 (contract dollar probability).
 * Our sim's `amount` is dollar notional at entry; contract-ish scaling matches PnL formulas using amount/price.
 * Kalshi: taker fee ≈ coeff × C × P × (1−P). With C ≈ amount/P, fee ≈ coeff × amount × (1−P).
 * Rounds up to the next cent (typical exchange rounding).
 */
export function estimateKalshiTakerFeeUsd(notionalUsd: number, yesPrice01: number): number {
  const a = Math.max(0, Number(notionalUsd) || 0);
  if (a <= 0) return 0;
  const p = clamp(Number(yesPrice01) || 0.5, 0.01, 0.99);
  const rawUsd = KALSHI_TAKER_FEE_COEFFICIENT * a * (1 - p);
  return Math.ceil(rawUsd * 100) / 100;
}

/** Conservative max notional such that notional + max fee ≤ cash (fee coeff × notional × 0.99 at P→0). */
export function maxAffordableNotionalWorstCase(cashUsd: number): number {
  const c = Math.max(0, Number(cashUsd) || 0);
  if (c <= 0) return 0;
  const denom = 1 + KALSHI_TAKER_FEE_COEFFICIENT * 0.99;
  return c / denom;
}
