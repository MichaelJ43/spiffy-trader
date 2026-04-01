import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return {
    ...m,
    NEWS_RELATED_MIN_OVERLAP_PCT: 30,
    NEWS_RELATED_MAX_DELTA_MS: 72 * 3_600_000,
    NEWS_RELATED_MAX_LINKS: 5,
    NEWS_RELATED_LOOKBACK: 50
  };
});

import {
  buildRelatedStoryPromptSlice,
  findRelatedNewsStories,
  type RelatedNewsMatch
} from "../../src/news/related-stories.js";

describe("findRelatedNewsStories", () => {
  const t0 = "2026-04-01T12:00:00.000Z";

  it("returns empty when nothing recent matches", () => {
    const existing = [
      {
        _id: "a",
        source: "X",
        content: "crypto regulation bill passes",
        timestamp: "2026-04-01T10:00:00.000Z"
      }
    ];
    expect(findRelatedNewsStories(existing, "Olympics venue announced for 2030", t0)).toEqual([]);
  });

  it("links high token overlap within time window", () => {
    const existing = [
      {
        _id: "a",
        source: "Wire",
        content: "troops deployment middle east escalation tensions",
        timestamp: "2026-04-01T11:00:00.000Z"
      },
      {
        _id: "b",
        source: "Wire",
        content: "unrelated earnings beat expectations stock rally",
        timestamp: "2026-04-01T11:30:00.000Z"
      }
    ];
    const out = findRelatedNewsStories(
      existing,
      "thousands troops deployment middle east continued tensions",
      t0
    );
    expect(out.some((x) => x.id === "a")).toBe(true);
    expect(out.some((x) => x.id === "b")).toBe(false);
  });

  it("does not link beyond max delta", () => {
    const existing = [
      {
        _id: "old",
        source: "Wire",
        content: "troops deployment middle east escalation tensions",
        timestamp: "2026-03-20T12:00:00.000Z"
      }
    ];
    const out = findRelatedNewsStories(
      existing,
      "troops deployment middle east escalation tensions continued",
      t0
    );
    expect(out).toEqual([]);
  });
});

describe("buildRelatedStoryPromptSlice", () => {
  const baseMatch: RelatedNewsMatch = {
    id: "n1",
    source: "Wire",
    content: "troops deployment middle east tensions",
    timestamp: "2026-04-01T11:00:00.000Z",
    overlapPercent: 55,
    deltaMs: 3_600_000
  };

  it("includes prior no-trade context from Couch doc", () => {
    const doc = {
      _id: "n1",
      shouldTrade: false,
      reasoning: "Priced in.",
      scratchpad: { whyNotTrading: "Duplicate headline; no new catalyst." }
    };
    const slice = buildRelatedStoryPromptSlice(baseMatch, doc);
    expect(slice.priorShouldTrade).toBe(false);
    expect(slice.priorDecisionSummary).toContain("Duplicate headline");
  });

  it("includes prior trade context when shouldTrade true", () => {
    const doc = {
      _id: "n1",
      shouldTrade: true,
      suggestedTicker: "KX-MIDEAST",
      reasoning: "Escalation thesis."
    };
    const slice = buildRelatedStoryPromptSlice(baseMatch, doc);
    expect(slice.priorShouldTrade).toBe(true);
    expect(slice.priorSuggestedTicker).toBe("KX-MIDEAST");
    expect(slice.priorDecisionSummary).toContain("KX-MIDEAST");
  });

  it("leaves prior fields empty when doc not analyzed", () => {
    const slice = buildRelatedStoryPromptSlice(baseMatch, { _id: "n1", content: "x" });
    expect(slice.priorShouldTrade).toBeNull();
    expect(slice.priorDecisionSummary).toBe("");
  });
});
