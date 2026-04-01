import { describe, expect, it } from "vitest";
import { kalshiYesMidProbability } from "../../src/kalshi/pricing.js";

describe("kalshiYesMidProbability", () => {
  it("averages dollar bids in 0–1", () => {
    expect(
      kalshiYesMidProbability({
        yes_bid_dollars: "0.40",
        yes_ask_dollars: "0.60"
      })
    ).toBeCloseTo(0.5, 6);
  });

  it("averages cent-style bids", () => {
    expect(
      kalshiYesMidProbability({
        yes_bid: 40,
        yes_ask: 60
      })
    ).toBeCloseTo(0.5, 6);
  });

  it("returns 0.5 when bids invalid", () => {
    expect(kalshiYesMidProbability({})).toBe(0.5);
  });
});
