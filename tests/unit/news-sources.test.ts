import { describe, expect, it, vi } from "vitest";
import {
  applyRssFetchStats,
  buildPerformanceSnapshot,
  getNewsSourcesWeighted
} from "../../src/performance/news-sources.js";

vi.mock("../../src/db/documents.js", () => ({
  listDocs: vi.fn()
}));

import { listDocs } from "../../src/db/documents.js";

describe("applyRssFetchStats", () => {
  it("increments attempts and failures on error", () => {
    const out = applyRssFetchStats({ url: "u" }, false);
    expect(out.rssFetchAttempts).toBe(1);
    expect(out.rssFetchFailures).toBe(1);
    expect(out.rejectionRate).toBe(100);
  });

  it("tracks success streak", () => {
    const out = applyRssFetchStats({ rssFetchAttempts: 9, rssFetchFailures: 1 }, true);
    expect(out.rssFetchAttempts).toBe(10);
    expect(out.rssFetchFailures).toBe(1);
    expect(out.rejectionRate).toBe(10);
  });
});

describe("getNewsSourcesWeighted", () => {
  it("weights sources from docs and trades", async () => {
    vi.mocked(listDocs).mockResolvedValueOnce([
      { _id: "1", url: "https://feeds.reuters.com/reuters/businessNews" }
    ]);
    const trades = [
      {
        status: "CLOSED",
        tradeRating: 70,
        sourceUrl: "https://feeds.reuters.com/reuters/businessNews",
        timestamp: "2024-06-01T00:00:00.000Z"
      }
    ];
    const w = await getNewsSourcesWeighted(trades);
    expect(w.length).toBe(1);
    expect(w[0].url).toContain("reuters");
    expect(w[0].weight).toBeGreaterThan(0);
  });
});

describe("buildPerformanceSnapshot", () => {
  it("computes averages and source scores", () => {
    const snap = buildPerformanceSnapshot(
      [
        {
          status: "CLOSED",
          tradeRating: 80,
          timestamp: "2024-01-01T00:00:00.000Z"
        },
        {
          status: "CLOSED",
          tradeRating: 60,
          timestamp: "2024-02-01T00:00:00.000Z"
        }
      ],
      [
        {
          url: "https://a.test/rss",
          weight: 1,
          recencyScore: 55,
          rejectionRate: 0,
          rssFetchAttempts: 1,
          rssFetchFailures: 0
        }
      ]
    );
    expect(snap.ratedTradeCount).toBe(2);
    expect(snap.avgRating).toBeGreaterThan(0);
    expect(snap.sourceScores).toHaveLength(1);
    expect(snap.sourceScores[0].sourceUrl).toBe("https://a.test/rss");
  });
});
