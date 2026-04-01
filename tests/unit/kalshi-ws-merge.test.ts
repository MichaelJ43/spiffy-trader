import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return { ...m, KALSHI_WS_MAX_SUBSCRIBED_TICKERS: 5 };
});

import { mergeOpenAndWatchlistTickersForWs } from "../../src/kalshi/ws-client.js";

describe("mergeOpenAndWatchlistTickersForWs", () => {
  it("dedupes and prefers open not duplicated from watchlist", () => {
    const r = mergeOpenAndWatchlistTickersForWs(["KX-A", "KX-B"], ["KX-B", "KX-C"]);
    expect(r.tickers).toEqual(["KX-A", "KX-B", "KX-C"]);
    expect(r.openCount).toBe(2);
    expect(r.watchlistCount).toBe(1);
    expect(r.watchlistDropped).toBe(0);
  });

  it("fills watchlist only up to cap after open", () => {
    const r = mergeOpenAndWatchlistTickersForWs(
      ["O1", "O2"],
      ["W1", "W2", "W3", "W4"]
    );
    expect(r.tickers).toEqual(["O1", "O2", "W1", "W2", "W3"]);
    expect(r.watchlistCount).toBe(3);
    expect(r.watchlistDropped).toBe(1);
  });

  it("drops all watchlist when open meets cap", () => {
    const r = mergeOpenAndWatchlistTickersForWs(
      ["a", "b", "c", "d", "e"],
      ["w1", "w2"]
    );
    expect(r.tickers).toEqual(["a", "b", "c", "d", "e"]);
    expect(r.watchlistCount).toBe(0);
    expect(r.watchlistDropped).toBe(2);
  });
});
