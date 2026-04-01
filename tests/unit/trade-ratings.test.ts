import { describe, expect, it } from "vitest";
import {
  blendRecencyPrior,
  calculateTradeRating,
  getReasoningKey,
  recencyWeightedRatingStatsByKey
} from "../../src/lib/trade-ratings.js";

describe("trade-ratings", () => {
  it("getReasoningKey normalizes whitespace", () => {
    expect(getReasoningKey("  Hello   World  ")).toBe("hello world");
  });

  it("calculateTradeRating clamps to 0–100", () => {
    const hi = calculateTradeRating({
      amount: 10,
      pnl: 100,
      impactScore: 100,
      confidenceScore: 100
    });
    expect(hi).toBe(100);
    const low = calculateTradeRating({
      amount: 10,
      pnl: -100,
      impactScore: 0,
      confidenceScore: 0
    });
    expect(low).toBe(0);
  });

  it("recencyWeightedRatingStatsByKey aggregates closed rated trades", () => {
    const now = Date.now();
    const trades = [
      {
        status: "CLOSED",
        tradeRating: 80,
        timestamp: new Date(now).toISOString(),
        reasoning: "alpha"
      },
      {
        status: "OPEN",
        tradeRating: 10,
        timestamp: new Date(now).toISOString(),
        reasoning: "beta"
      }
    ];
    const m = recencyWeightedRatingStatsByKey(trades, (t) =>
      getReasoningKey(t.reasoning || "")
    );
    expect(m.has("alpha")).toBe(true);
    expect(m.get("alpha")?.count).toBe(1);
  });

  it("blendRecencyPrior ramps from prior to avg", () => {
    expect(blendRecencyPrior(undefined, 50, 5)).toBe(50);
    expect(blendRecencyPrior({ avg: 70, count: 10 }, 50, 5)).toBe(70);
    expect(blendRecencyPrior({ avg: 70, count: 2 }, 50, 5)).toBeGreaterThan(50);
    expect(blendRecencyPrior({ avg: 70, count: 2 }, 50, 5)).toBeLessThan(70);
  });
});
