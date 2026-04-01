import { describe, expect, it } from "vitest";
import {
  curateMarketsForNewsByTokens,
  scoreMarketAgainstNews,
  tokenizeForMatch
} from "../../src/lib/text-match.js";
import type { KalshiMarketLite } from "../../src/kalshi/types.js";

describe("text-match", () => {
  it("tokenizeForMatch strips noise and stopwords", () => {
    const t = tokenizeForMatch("The FED will raise rates!!!");
    expect(t.some((w) => w.includes("fed") || w === "raise")).toBe(true);
    expect(t).not.toContain("the");
  });

  it("scoreMarketAgainstNews counts overlapping tokens", () => {
    const set = new Set(["inflation", "cpi"]);
    expect(scoreMarketAgainstNews(set, "CPI inflation report")).toBeGreaterThan(0);
  });

  it("curateMarketsForNewsByTokens returns empty for empty pool", () => {
    expect(curateMarketsForNewsByTokens("hello", [], 5)).toEqual([]);
  });

  it("curateMarketsForNewsByTokens uses filler when scores are zero", () => {
    const pool: KalshiMarketLite[] = [
      { ticker: "A", title: "zzz unrelated zzz" },
      { ticker: "B", title: "aaa also unrelated" }
    ];
    const out = curateMarketsForNewsByTokens("xyzabcnomatch", pool, 2);
    expect(out.length).toBe(2);
  });

  it("curateMarketsForNewsByTokens boosts ticker substring matches", () => {
    const pool: KalshiMarketLite[] = [{ ticker: "KXINFLATION-1", title: "x" }];
    const out = curateMarketsForNewsByTokens("inflation headline", pool, 5);
    expect(out[0]?.ticker).toBe("KXINFLATION-1");
  });
});
