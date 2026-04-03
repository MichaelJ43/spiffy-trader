import { describe, expect, it } from "vitest";
import { coerceStoredNewsScores } from "../../src/lib/news-scores.js";

describe("coerceStoredNewsScores", () => {
  it("uses explicit relevance and edge", () => {
    const o = coerceStoredNewsScores({ relevanceScore: 80, edgeScore: 40, impactScore: 99 });
    expect(o.relevanceScore).toBe(80);
    expect(o.edgeScore).toBe(40);
    expect(o.impactScore).toBe(68);
  });

  it("fills from legacy impact when rel/edge missing", () => {
    const o = coerceStoredNewsScores({ impactScore: 72 });
    expect(o.relevanceScore).toBe(72);
    expect(o.edgeScore).toBe(72);
    expect(o.impactScore).toBe(72);
  });

  it("treats missing fields as zero (LLM failure row shape)", () => {
    const o = coerceStoredNewsScores({ impactScore: 0 });
    expect(o.relevanceScore).toBe(0);
    expect(o.edgeScore).toBe(0);
    expect(o.impactScore).toBe(0);
  });
});
