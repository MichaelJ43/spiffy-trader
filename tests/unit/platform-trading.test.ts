import { beforeEach, describe, expect, it, vi } from "vitest";

const couchRequest = vi.fn();
const upsertStatus = vi.fn();
const listDocs = vi.fn();
const getKalshiMarketData = vi.fn();

vi.mock("../../src/db/couch.js", () => ({
  couchRequest: (...a: unknown[]) => couchRequest(...a),
  upsertStatus: (...a: unknown[]) => upsertStatus(...a)
}));

vi.mock("../../src/db/documents.js", () => ({
  listDocs: (...a: unknown[]) => listDocs(...a)
}));

vi.mock("../../src/kalshi/pricing.js", () => ({
  getKalshiMarketData: (...a: unknown[]) => getKalshiMarketData(...a),
  kalshiYesMidProbability: (m: any) => {
    const bid = Number(m?.yes_bid_dollars ?? m?.yes_bid ?? 0.5);
    const ask = Number(m?.yes_ask_dollars ?? m?.yes_ask ?? 0.5);
    if (bid <= 1 && ask <= 1) return (bid + ask) / 2;
    return (bid + ask) / 200;
  }
}));

import { replaceBotStatus, botStatus } from "../../src/server/state.js";
import {
  applyDiscretionaryExit,
  executeTradeOnPlatform,
  forceSellAllOpenPositions,
  resolveTrades
} from "../../src/trading/platform.js";

describe("executeTradeOnPlatform", () => {
  beforeEach(() => {
    getKalshiMarketData.mockReset();
    getKalshiMarketData.mockResolvedValue({
      yes_bid_dollars: "0.5",
      yes_ask_dollars: "0.5"
    });
  });

  it("fails without ticker", async () => {
    const r = await executeTradeOnPlatform({ market: "K", event: "E" });
    expect(r.success).toBe(false);
  });

  it("returns success with price from market", async () => {
    const r = await executeTradeOnPlatform({
      market: "Kalshi",
      event: "E",
      ticker: "KX-T"
    });
    expect(r.success).toBe(true);
    expect(r.price).toBeCloseTo(0.5, 5);
  });
});

describe("resolveTrades", () => {
  beforeEach(() => {
    replaceBotStatus({
      cashBalance: 100,
      survivalStatus: "Healthy",
      lastUpdate: new Date().toISOString(),
      totalPnL: 0,
      portfolioHalted: false
    });
    couchRequest.mockReset();
    upsertStatus.mockReset();
    listDocs.mockReset();
    getKalshiMarketData.mockReset();
  });

  it("settles OPEN trades when market is settled", async () => {
    const trade: any = {
      status: "OPEN",
      _id: "couch1",
      ticker: "KX",
      price: 0.5,
      amount: 100
    };
    listDocs.mockResolvedValue([trade]);
    getKalshiMarketData.mockResolvedValue({
      status: "settled",
      result: "yes",
      yes_bid_dollars: "1",
      yes_ask_dollars: "1"
    });
    couchRequest.mockResolvedValue({});

    await resolveTrades();

    expect(trade.status).toBe("CLOSED");
    expect(upsertStatus).toHaveBeenCalled();
    expect(botStatus.cashBalance).toBeGreaterThan(100);
  });
});

describe("applyDiscretionaryExit", () => {
  beforeEach(() => {
    replaceBotStatus({
      cashBalance: 50,
      survivalStatus: "Healthy",
      lastUpdate: new Date().toISOString(),
      totalPnL: 0,
      portfolioHalted: false
    });
    couchRequest.mockReset();
    upsertStatus.mockReset();
  });

  it("returns false when market settled", async () => {
    const ok = await applyDiscretionaryExit("id", { status: "settled" }, "reason");
    expect(ok).toBe(false);
  });

  it("closes trade at mid", async () => {
    couchRequest.mockResolvedValueOnce({
      status: "OPEN",
      id: "1",
      ticker: "KX",
      price: 0.5,
      amount: 100
    });
    couchRequest.mockResolvedValueOnce({});
    const ok = await applyDiscretionaryExit(
      "couch-id",
      { status: "active", yes_bid_dollars: "0.6", yes_ask_dollars: "0.6" },
      "exit"
    );
    expect(ok).toBe(true);
    expect(upsertStatus).toHaveBeenCalled();
  });

  it("returns false when trade GET fails", async () => {
    couchRequest.mockRejectedValueOnce(new Error("missing"));
    const ok = await applyDiscretionaryExit(
      "bad-id",
      { status: "active", yes_bid_dollars: "0.5", yes_ask_dollars: "0.5" },
      "r"
    );
    expect(ok).toBe(false);
  });
});

describe("forceSellAllOpenPositions", () => {
  beforeEach(() => {
    replaceBotStatus({
      cashBalance: 0,
      survivalStatus: "Healthy",
      lastUpdate: new Date().toISOString(),
      totalPnL: 0,
      portfolioHalted: false
    });
    listDocs.mockReset();
    getKalshiMarketData.mockReset();
    couchRequest.mockReset();
    upsertStatus.mockReset();
  });

  it("skips when no market data", async () => {
    listDocs.mockResolvedValue([{ status: "OPEN", _id: "1", ticker: "KX", price: 0.5, amount: 10 }]);
    getKalshiMarketData.mockResolvedValue(null);
    const r = await forceSellAllOpenPositions();
    expect(r.skipped).toBeGreaterThan(0);
  });

  it("closes settled markets at final price", async () => {
    listDocs.mockResolvedValue([
      { status: "OPEN", _id: "c1", ticker: "KX", price: 0.4, amount: 100, id: "t1" }
    ]);
    getKalshiMarketData.mockResolvedValue({ status: "settled", result: "yes" });
    couchRequest.mockResolvedValueOnce({
      status: "OPEN",
      _id: "c1",
      ticker: "KX",
      price: 0.4,
      amount: 100
    });
    couchRequest.mockResolvedValueOnce({});
    const r = await forceSellAllOpenPositions();
    expect(r.closed).toBe(1);
  });
});
