import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ai/llm-json.js", () => ({
  generateJsonWithLlm: vi.fn()
}));

vi.mock("../../src/ai/gemini.js", () => ({
  getGeminiClient: vi.fn(() => null)
}));

const listDocs = vi.fn();
vi.mock("../../src/db/documents.js", () => ({
  listDocs: (...a: unknown[]) => listDocs(...a)
}));

const applyDiscretionaryExit = vi.fn();
vi.mock("../../src/trading/platform.js", () => ({
  applyDiscretionaryExit: (...a: unknown[]) => applyDiscretionaryExit(...a)
}));

vi.mock("../../src/kalshi/position-markets.js", () => {
  const m = new Map<string, any>();
  m.set("KX", {
    ticker: "KX",
    fetchedAt: 1,
    yesMid: 0.55,
    market: {
      status: "open",
      yes_bid_dollars: "0.5",
      yes_ask_dollars: "0.6",
      title: "Test"
    }
  });
  return {
    getPositionMarketSnapshots: () => m,
    summarizeMarketForRisk: (market: any, ticker: string) => ({
      ticker,
      yesMid: 0.55,
      status: market?.status,
      title: market?.title
    })
  };
});

import { generateJsonWithLlm } from "../../src/ai/llm-json.js";
import { replaceBotStatus } from "../../src/server/state.js";
import { runAiExitReview } from "../../src/ai/exit-review.js";

describe("runAiExitReview", () => {
  beforeEach(() => {
    listDocs.mockReset();
    applyDiscretionaryExit.mockReset().mockResolvedValue(true);
    vi.mocked(generateJsonWithLlm).mockReset();
    replaceBotStatus({
      cashBalance: 100,
      survivalStatus: "Healthy",
      lastUpdate: new Date().toISOString(),
      totalPnL: 0,
      portfolioHalted: false
    });
  });

  it("applies exit when LLM requests exitNow", async () => {
    listDocs.mockResolvedValue([
      {
        status: "OPEN",
        ticker: "KX",
        id: "trade-1",
        _id: "couch-1",
        price: 0.5,
        amount: 10
      }
    ]);
    vi.mocked(generateJsonWithLlm).mockResolvedValue({
      decisions: [{ tradeId: "trade-1", exitNow: true, reasoning: "take profit" }]
    });

    await runAiExitReview();

    expect(applyDiscretionaryExit).toHaveBeenCalledWith(
      "couch-1",
      expect.objectContaining({ status: "open" }),
      "take profit"
    );
  });

  it("no-op when no open trades with snapshots", async () => {
    listDocs.mockResolvedValue([]);
    await runAiExitReview();
    expect(generateJsonWithLlm).not.toHaveBeenCalled();
  });
});
