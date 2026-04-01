import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/documents.js", () => ({
  listDocs: vi.fn()
}));

vi.mock("../../src/db/couch.js", () => ({
  upsertStatus: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../src/kalshi/position-markets.js", () => ({
  getPositionMarketSnapshots: vi.fn(() => new Map())
}));

import { listDocs } from "../../src/db/documents.js";
import { applyPortfolioDepletionIfNeeded } from "../../src/server/portfolio-halt.js";
import { PORTFOLIO_DEPLETED_THRESHOLD_USD } from "../../src/server/config.js";
import { replaceBotStatus, botStatus } from "../../src/server/state.js";

describe("applyPortfolioDepletionIfNeeded", () => {
  beforeEach(() => {
    replaceBotStatus({
      cashBalance: 0,
      survivalStatus: "Healthy",
      lastUpdate: new Date().toISOString(),
      totalPnL: 0,
      portfolioHalted: false
    });
    vi.mocked(listDocs).mockResolvedValue([]);
  });

  it("sets halt when total value is at or below threshold", async () => {
    const halted = await applyPortfolioDepletionIfNeeded();
    expect(halted).toBe(true);
    expect(botStatus.portfolioHalted).toBe(true);
    expect(botStatus.survivalStatus).toContain("Halted");
  });

  it("does not halt when cash above threshold", async () => {
    replaceBotStatus({
      ...botStatus,
      cashBalance: PORTFOLIO_DEPLETED_THRESHOLD_USD + 100,
      portfolioHalted: false
    });
    const halted = await applyPortfolioDepletionIfNeeded();
    expect(halted).toBe(false);
    expect(botStatus.portfolioHalted).toBe(false);
  });
});
