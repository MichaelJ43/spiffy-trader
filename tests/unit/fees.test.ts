import { describe, expect, it } from "vitest";
import {
  estimateKalshiTakerFeeUsd,
  KALSHI_TAKER_FEE_COEFFICIENT,
  maxAffordableNotionalWorstCase
} from "../../src/kalshi/fees.js";

describe("estimateKalshiTakerFeeUsd", () => {
  it("returns 0 for zero notional", () => {
    expect(estimateKalshiTakerFeeUsd(0, 0.5)).toBe(0);
  });

  it("uses coeff × amount × (1−P) at 50¢ YES", () => {
    const raw = KALSHI_TAKER_FEE_COEFFICIENT * 100 * (1 - 0.5);
    expect(estimateKalshiTakerFeeUsd(100, 0.5)).toBe(Math.ceil(raw * 100) / 100);
  });
});

describe("maxAffordableNotionalWorstCase", () => {
  it("returns 0 for non-positive cash", () => {
    expect(maxAffordableNotionalWorstCase(0)).toBe(0);
  });

  it("is strictly below cash for positive balance", () => {
    const cap = maxAffordableNotionalWorstCase(250);
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(250);
  });
});
