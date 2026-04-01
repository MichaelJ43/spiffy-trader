import { describe, expect, it } from "vitest";
import { normalizeTradeDecisionAnalysis } from "../../src/kalshi/prompts.js";

describe("normalizeTradeDecisionAnalysis", () => {
  it("returns null for non-objects", () => {
    expect(normalizeTradeDecisionAnalysis(null)).toBeNull();
    expect(normalizeTradeDecisionAnalysis(undefined)).toBeNull();
    expect(normalizeTradeDecisionAnalysis("x")).toBeNull();
    expect(normalizeTradeDecisionAnalysis([])).toBeNull();
  });

  it("parses full schema and derives impactScore", () => {
    const out = normalizeTradeDecisionAnalysis({
      scratchpad: {
        whatTheHeadlineAsserts: "Rates unchanged.",
        bestTickerRationale: "KX matches.",
        feesAndBankrollNote: "Small size.",
        whyNotTrading: ""
      },
      relatedNarrativeVerdict: "new_fact",
      relatedNarrativeWhatChanged: "New dot plot.",
      relevanceScore: 80,
      edgeScore: 40,
      shouldTrade: true,
      suggestedTicker: "KX1",
      tradeAmount: 10,
      sentiment: "Positive",
      reasoning: "Go."
    });
    expect(out).not.toBeNull();
    expect(out!.impactScore).toBe(60);
    expect(out!.relevanceScore).toBe(80);
    expect(out!.edgeScore).toBe(40);
    expect(out!.relatedNarrativeVerdict).toBe("new_fact");
  });

  it("maps legacy impactScore when rel/edge missing", () => {
    const out = normalizeTradeDecisionAnalysis({
      shouldTrade: false,
      suggestedTicker: "",
      impactScore: 72,
      sentiment: "Neutral",
      reasoning: "Legacy."
    });
    expect(out!.relevanceScore).toBe(72);
    expect(out!.edgeScore).toBe(72);
    expect(out!.impactScore).toBe(72);
  });

  it("fills missing edge from relevance", () => {
    const out = normalizeTradeDecisionAnalysis({
      relevanceScore: 55,
      shouldTrade: false,
      sentiment: "Neutral",
      reasoning: "x"
    });
    expect(out!.relevanceScore).toBe(55);
    expect(out!.edgeScore).toBe(55);
  });

  it("backfills whyNotTrading from reasoning when skipping", () => {
    const out = normalizeTradeDecisionAnalysis({
      shouldTrade: false,
      sentiment: "Neutral",
      reasoning: "Fees eat edge.",
      suggestedTicker: ""
    });
    expect(out!.scratchpad.whyNotTrading).toContain("Fees eat edge");
  });

  it("uses legacy impactScore when model echoes 0/0 for rel and edge", () => {
    const out = normalizeTradeDecisionAnalysis({
      relevanceScore: 0,
      edgeScore: 0,
      impactScore: 55,
      shouldTrade: false,
      sentiment: "Neutral",
      reasoning: "Skip."
    });
    expect(out!.relevanceScore).toBe(55);
    expect(out!.edgeScore).toBe(55);
    expect(out!.impactScore).toBe(55);
  });
});
