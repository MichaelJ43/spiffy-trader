import { describe, expect, it } from "vitest";
import { buildKalshiTradeDecisionPrompt } from "../../src/kalshi/prompts.js";

describe("buildKalshiTradeDecisionPrompt", () => {
  it("includes TOP PRIORITY capital preservation when markets exist", () => {
    const p = buildKalshiTradeDecisionPrompt(
      "Fed holds rates",
      [{ ticker: "KXTEST-1", title: "Test market", event_ticker: "E1" }],
      {
        confidenceScore: 70,
        feedWeight: 1,
        tradingBootstrap: false,
        availableBalance: 200
      }
    );
    expect(p).toContain("TOP PRIORITY");
    expect(p).toContain("DO NOT RUN OUT OF MONEY");
    expect(p).toContain("KXTEST-1");
  });

  it("returns static JSON instruction when no curated markets", () => {
    const p = buildKalshiTradeDecisionPrompt(
      "Nothing",
      [],
      {
        confidenceScore: 50,
        feedWeight: 1,
        tradingBootstrap: true,
        availableBalance: 100
      }
    );
    expect(p).toContain("shouldTrade");
    expect(p).toContain("No markets available");
  });
});
