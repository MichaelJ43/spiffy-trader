import { describe, expect, it } from "vitest";
import {
  kalshiMarketEmbeddingByTicker,
  kalshiOpenMarketsCache,
  kalshiOpenMarketsFetchedAt,
  setKalshiMarketsCache,
  setKalshiMarketsRefreshInFlight
} from "../../src/kalshi/market-state.js";

describe("market-state", () => {
  it("setKalshiMarketsCache updates cache and timestamp", () => {
    setKalshiMarketsCache(
      [{ ticker: "A", title: "t", event_ticker: "e" }],
      12345
    );
    expect(kalshiOpenMarketsCache).toHaveLength(1);
    expect(kalshiOpenMarketsFetchedAt).toBe(12345);
  });

  it("embedding map can be cleared via public map ref", () => {
    kalshiMarketEmbeddingByTicker.set("X", [1, 2]);
    expect(kalshiMarketEmbeddingByTicker.size).toBeGreaterThan(0);
    kalshiMarketEmbeddingByTicker.clear();
    expect(kalshiMarketEmbeddingByTicker.size).toBe(0);
  });

  it("setKalshiMarketsRefreshInFlight stores promise", async () => {
    let resolve!: () => void;
    const p = new Promise<void>((r) => {
      resolve = r;
    });
    setKalshiMarketsRefreshInFlight(p);
    resolve();
    await p;
    setKalshiMarketsRefreshInFlight(null);
  });
});
