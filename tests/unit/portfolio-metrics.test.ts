import { describe, expect, it } from "vitest";
import type { PositionMarketSnapshot } from "../../src/kalshi/position-markets.js";
import { markToMarketOpenHoldings } from "../../src/server/portfolio-metrics.js";

describe("markToMarketOpenHoldings", () => {
  it("values position at mid/entry ratio when snapshot exists", () => {
    const snap = new Map<string, PositionMarketSnapshot>([
      ["T1", { ticker: "T1", yesMid: 0.6, market: {}, fetchedAt: Date.now() }]
    ]);
    const v = markToMarketOpenHoldings([{ ticker: "T1", price: 0.5, amount: 100 }], snap);
    expect(v).toBeCloseTo(120, 5);
  });

  it("falls back to entry price when no snapshot", () => {
    const v = markToMarketOpenHoldings([{ ticker: "T1", price: 0.4, amount: 50 }], new Map());
    expect(v).toBeCloseTo(50, 5);
  });
});
