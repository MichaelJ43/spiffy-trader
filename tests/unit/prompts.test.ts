import { describe, expect, it } from "vitest";
import {
  buildKalshiTradeDecisionPrompt,
  buildSimulationIdleContext
} from "../../src/kalshi/prompts.js";

const idleDefaults = {
  hoursSinceLastTrade: 3,
  openPositionCount: 0,
  ratedClosedTradeCount: 0,
  recentTradeLearningSummary: ""
} as const;

describe("buildSimulationIdleContext", () => {
  it("reports null hours when no trades", () => {
    const x = buildSimulationIdleContext([]);
    expect(x.hoursSinceLastTrade).toBeNull();
    expect(x.openPositionCount).toBe(0);
    expect(x.recentTradeLearningSummary).toBe("");
  });

  it("computes hours from newest trade timestamp", () => {
    const past = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const x = buildSimulationIdleContext([{ status: "OPEN", timestamp: past, ticker: "KX1" }]);
    expect(x.hoursSinceLastTrade).not.toBeNull();
    expect(x.hoursSinceLastTrade!).toBeGreaterThan(40);
    expect(x.openPositionCount).toBe(1);
  });
});

describe("buildKalshiTradeDecisionPrompt", () => {
  it("includes TOP PRIORITY capital preservation when markets exist", () => {
    const p = buildKalshiTradeDecisionPrompt(
      "Fed holds rates",
      [{ ticker: "KXTEST-1", title: "Test market", event_ticker: "E1" }],
      {
        confidenceScore: 70,
        feedWeight: 1,
        tradingBootstrap: false,
        availableBalance: 200,
        ...idleDefaults
      }
    );
    expect(p).toContain("TOP PRIORITY");
    expect(p).toContain("DO NOT RUN OUT OF MONEY");
    expect(p).toContain("KXTEST-1");
    expect(p).toContain("scratchpad");
    expect(p).toContain("relevanceScore");
    expect(p).toContain("edgeScore");
    expect(p).toContain("BALANCE");
    expect(p).toContain("hoursSinceLastTrade");
  });

  it("requires related narrative fields when relatedStories are passed", () => {
    const p = buildKalshiTradeDecisionPrompt(
      "Fed holds",
      [{ ticker: "KX1", title: "M", event_ticker: "E" }],
      {
        confidenceScore: 70,
        feedWeight: 1,
        tradingBootstrap: false,
        availableBalance: 200,
        ...idleDefaults,
        relatedStories: [
          {
            overlapPercent: 40,
            ageDeltaHours: 1,
            source: "X",
            excerpt: "Earlier headline",
            priorShouldTrade: false,
            priorSuggestedTicker: null,
            priorDecisionSummary: "Previously passed (no trade): weak edge."
          }
        ]
      }
    );
    expect(p).toContain("relatedNarrativeVerdict");
    expect(p).toContain("Possibly related headlines");
  });

  it("returns static JSON instruction when no curated markets", () => {
    const p = buildKalshiTradeDecisionPrompt(
      "Nothing",
      [],
      {
        confidenceScore: 50,
        feedWeight: 1,
        tradingBootstrap: true,
        availableBalance: 100,
        ...idleDefaults
      }
    );
    expect(p).toContain("shouldTrade");
    expect(p).toMatch(/no candidate markets/i);
    expect(p).toContain("scratchpad");
  });
});
