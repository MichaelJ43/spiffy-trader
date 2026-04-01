import { beforeEach, describe, expect, it, vi } from "vitest";

const kalshiGet = vi.fn();
const loadKalshiMarketsSnapshotFromDb = vi.fn();
const saveKalshiMarketsSnapshotToDb = vi.fn();
const rebuildKalshiMarketEmbeddings = vi.fn();

vi.mock("../../src/kalshi/client.js", () => ({
  kalshiGet: (...a: unknown[]) => kalshiGet(...a)
}));

vi.mock("../../src/db/kalshi-snapshot.js", () => ({
  loadKalshiMarketsSnapshotFromDb: (...a: unknown[]) => loadKalshiMarketsSnapshotFromDb(...a),
  saveKalshiMarketsSnapshotToDb: (...a: unknown[]) => saveKalshiMarketsSnapshotToDb(...a)
}));

vi.mock("../../src/ollama/embed.js", () => ({
  rebuildKalshiMarketEmbeddings: (...a: unknown[]) => rebuildKalshiMarketEmbeddings(...a)
}));

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return {
    ...m,
    /** Short window so empty cache is stale; still allows DB restore when age is 0 ms. */
    KALSHI_MARKETS_REFRESH_MS: 60_000,
    KALSHI_MARKETS_PAGE_LIMIT: 100,
    KALSHI_MARKETS_MAX_TOTAL: 500
  };
});

import { ensureKalshiMarketsCache } from "../../src/kalshi/cache.js";
import {
  kalshiOpenMarketsCache,
  setKalshiMarketsCache,
  setKalshiMarketsRefreshInFlight
} from "../../src/kalshi/market-state.js";

describe("ensureKalshiMarketsCache", () => {
  beforeEach(() => {
    kalshiGet.mockReset();
    loadKalshiMarketsSnapshotFromDb.mockReset();
    saveKalshiMarketsSnapshotToDb.mockReset();
    rebuildKalshiMarketEmbeddings.mockReset();
    setKalshiMarketsRefreshInFlight(null);
    setKalshiMarketsCache([], 0);
    loadKalshiMarketsSnapshotFromDb.mockResolvedValue(null);
    rebuildKalshiMarketEmbeddings.mockResolvedValue(undefined);
    saveKalshiMarketsSnapshotToDb.mockResolvedValue(undefined);
  });

  it("fetches from API when DB snapshot missing", async () => {
    kalshiGet.mockResolvedValue({
      markets: [{ ticker: "M1", title: "T1", event_ticker: "E" }],
      cursor: undefined
    });

    await ensureKalshiMarketsCache();

    expect(kalshiGet).toHaveBeenCalled();
    expect(saveKalshiMarketsSnapshotToDb).toHaveBeenCalled();
    expect(rebuildKalshiMarketEmbeddings).toHaveBeenCalled();
    expect(kalshiOpenMarketsCache.some((m) => m.ticker === "M1")).toBe(true);
  });

  it("drops markets with zero volume and zero open interest", async () => {
    kalshiGet.mockResolvedValue({
      markets: [
        {
          ticker: "DEAD",
          title: "No trades",
          volume_24h: 0,
          volume: 0,
          open_interest: 0
        },
        { ticker: "LIVE", title: "Has flow", volume_24h: 12, volume: 100, open_interest: 0 }
      ],
      cursor: undefined
    });

    await ensureKalshiMarketsCache();

    expect(kalshiOpenMarketsCache.some((m) => m.ticker === "DEAD")).toBe(false);
    expect(kalshiOpenMarketsCache.some((m) => m.ticker === "LIVE")).toBe(true);
  });

  it("restores from DB when snapshot fresh", async () => {
    const t = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(t);
    loadKalshiMarketsSnapshotFromDb.mockResolvedValue({
      markets: [{ ticker: "DB", title: "db", event_ticker: "x" }],
      fetchedAtMs: t
    });

    await ensureKalshiMarketsCache();

    expect(kalshiGet).not.toHaveBeenCalled();
    expect(kalshiOpenMarketsCache[0]?.ticker).toBe("DB");
    vi.restoreAllMocks();
  });
});
