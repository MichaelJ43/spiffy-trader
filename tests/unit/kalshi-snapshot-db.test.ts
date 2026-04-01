import { beforeEach, describe, expect, it, vi } from "vitest";

const couchRequest = vi.fn();
const ensureDb = vi.fn();

vi.mock("../../src/db/couch.js", () => ({
  couchRequest: (...a: unknown[]) => couchRequest(...a),
  ensureDb: (...a: unknown[]) => ensureDb(...a)
}));

import {
  loadKalshiMarketsSnapshotFromDb,
  saveKalshiMarketsSnapshotToDb
} from "../../src/db/kalshi-snapshot.js";

describe("loadKalshiMarketsSnapshotFromDb", () => {
  beforeEach(() => {
    couchRequest.mockReset();
  });

  it("returns null when meta invalid", async () => {
    couchRequest.mockResolvedValueOnce({ fetchedAtMs: 0, chunks: 0 });
    await expect(loadKalshiMarketsSnapshotFromDb()).resolves.toBeNull();
  });

  it("loads chunked snapshot", async () => {
    const t = Date.now();
    couchRequest
      .mockResolvedValueOnce({ fetchedAtMs: t, chunks: 1, total: 1 })
      .mockResolvedValueOnce({
        items: [{ ticker: "ABC", title: "Market", event_ticker: "E" }]
      });
    const out = await loadKalshiMarketsSnapshotFromDb();
    expect(out?.markets).toHaveLength(1);
    expect(out?.markets[0].ticker).toBe("ABC");
    expect(out?.fetchedAtMs).toBe(t);
  });

  it("falls back to legacy single doc on 404", async () => {
    const ts = Date.UTC(2024, 0, 1);
    couchRequest
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({
        items: [{ ticker: "L", title: "legacy" }],
        updatedAt: new Date(ts).toISOString()
      });
    const out = await loadKalshiMarketsSnapshotFromDb();
    expect(out?.markets.some((m) => m.ticker === "L")).toBe(true);
    expect(out?.fetchedAtMs).toBe(ts);
  });
});

describe("saveKalshiMarketsSnapshotToDb", () => {
  beforeEach(() => {
    couchRequest.mockReset();
    ensureDb.mockReset();
    ensureDb.mockResolvedValue(undefined);
  });

  it("writes meta and chunk for non-empty markets", async () => {
    couchRequest
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    await saveKalshiMarketsSnapshotToDb([{ ticker: "Z", title: "z" }]);
    expect(ensureDb).toHaveBeenCalled();
    expect(couchRequest).toHaveBeenCalledWith(
      "PUT",
      expect.stringMatching(/\/c0$/),
      expect.objectContaining({ items: [{ ticker: "Z", title: "z" }] }),
      undefined,
      120_000
    );
    expect(couchRequest).toHaveBeenCalledWith(
      "PUT",
      expect.stringMatching(/\/meta$/),
      expect.objectContaining({ type: "kalshi_meta", total: 1 }),
      undefined,
      30_000
    );
  });
});
