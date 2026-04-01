import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/documents.js", () => ({
  listDocs: vi.fn()
}));

import { listDocs } from "../../src/db/documents.js";
import { getActiveWatchlistTickers } from "../../src/db/market-watchlist.js";

describe("getActiveWatchlistTickers", () => {
  it("returns distinct tickers excluding archived and expired", async () => {
    vi.mocked(listDocs).mockResolvedValueOnce([
      { _id: "1", ticker: "KX-KEEP" },
      { _id: "2", ticker: "KX-OLD", watchUntil: "2020-01-01T00:00:00.000Z" },
      { _id: "3", ticker: "KX-GONE", archived: true },
      { _id: "4", ticker: "KX-OFF", active: false },
      { _id: "5", ticker: "KX-FUTURE", watchUntil: "2099-01-01T00:00:00.000Z" },
      { _id: "_design/x" },
      { _id: "6", nope: true }
    ]);

    const out = await getActiveWatchlistTickers();
    expect(out.sort()).toEqual(["KX-FUTURE", "KX-KEEP"].sort());
  });

  it("returns empty on list failure", async () => {
    vi.mocked(listDocs).mockRejectedValueOnce(new Error("db"));
    expect(await getActiveWatchlistTickers()).toEqual([]);
  });
});
