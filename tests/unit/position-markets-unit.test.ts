import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/documents.js", () => ({
  listDocs: vi.fn()
}));

vi.mock("../../src/kalshi/client.js", () => ({
  kalshiGet: vi.fn()
}));

import { listDocs } from "../../src/db/documents.js";
import { kalshiGet } from "../../src/kalshi/client.js";
import {
  getPositionMarketSnapshots,
  refreshOpenPositionMarkets,
  summarizeMarketForRisk
} from "../../src/kalshi/position-markets.js";

describe("summarizeMarketForRisk", () => {
  it("returns error when no market", () => {
    expect(summarizeMarketForRisk(null, "KX")).toMatchObject({ ticker: "KX", error: "no_data" });
  });

  it("summarizes active market", () => {
    const s = summarizeMarketForRisk(
      {
        title: "Hello",
        status: "open",
        yes_bid_dollars: "0.4",
        yes_ask_dollars: "0.6"
      },
      "KX"
    );
    expect(s.ticker).toBe("KX");
    expect(s.yesMid).toBeCloseTo(0.5, 5);
    expect(s.status).toBe("open");
  });
});

describe("refreshOpenPositionMarkets", () => {
  beforeEach(() => {
    vi.mocked(listDocs).mockReset();
    vi.mocked(kalshiGet).mockReset();
  });

  it("lists tickers and fetches market docs", async () => {
    vi.mocked(listDocs).mockResolvedValueOnce([
      { status: "OPEN", ticker: "T1", _id: "1" }
    ]);
    vi.mocked(kalshiGet).mockResolvedValueOnce({
      market: {
        title: "M",
        status: "open",
        yes_bid_dollars: "0.5",
        yes_ask_dollars: "0.5"
      }
    });
    await refreshOpenPositionMarkets();
    const snaps = getPositionMarketSnapshots();
    expect(snaps.has("T1")).toBe(true);
  });

  it("returns early when listDocs fails", async () => {
    vi.mocked(listDocs).mockRejectedValueOnce(new Error("db"));
    await refreshOpenPositionMarkets();
    expect(kalshiGet).not.toHaveBeenCalled();
  });
});
