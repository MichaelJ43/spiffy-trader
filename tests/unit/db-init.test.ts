import { beforeEach, describe, expect, it, vi } from "vitest";

const couchRequest = vi.fn();
const ensureDb = vi.fn();
const upsertStatus = vi.fn();
const listDocs = vi.fn();
const repairNewsSourcesDbIfBroken = vi.fn();
const seedNewsSourcesIfNeeded = vi.fn();
const replaceBotStatus = vi.fn();

vi.mock("../../src/db/couch.js", () => ({
  couchRequest: (...a: unknown[]) => couchRequest(...a),
  ensureDb: (...a: unknown[]) => ensureDb(...a),
  upsertStatus: (...a: unknown[]) => upsertStatus(...a)
}));

vi.mock("../../src/db/documents.js", () => ({
  listDocs: (...a: unknown[]) => listDocs(...a),
  repairNewsSourcesDbIfBroken: (...a: unknown[]) => repairNewsSourcesDbIfBroken(...a),
  seedNewsSourcesIfNeeded: (...a: unknown[]) => seedNewsSourcesIfNeeded(...a)
}));

vi.mock("../../src/server/state.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/server/state.js")>(
    "../../src/server/state.js"
  );
  return {
    ...actual,
    replaceBotStatus: (...a: unknown[]) => replaceBotStatus(...a)
  };
});

import { initializeDatabase } from "../../src/db/init.js";

describe("initializeDatabase", () => {
  beforeEach(() => {
    couchRequest.mockReset();
    ensureDb.mockReset().mockResolvedValue(undefined);
    upsertStatus.mockReset().mockResolvedValue(undefined);
    listDocs.mockReset();
    repairNewsSourcesDbIfBroken.mockReset().mockResolvedValue(undefined);
    seedNewsSourcesIfNeeded.mockReset().mockResolvedValue(undefined);
    replaceBotStatus.mockReset();
  });

  it("seeds status when empty and seeds news when empty", async () => {
    listDocs.mockImplementation(async (name: string) => {
      if (name === "status") return [];
      if (name === "news") return [];
      return [];
    });
    couchRequest.mockResolvedValue({});

    await initializeDatabase();

    expect(ensureDb).toHaveBeenCalledWith("trades");
    expect(ensureDb).toHaveBeenCalledWith("market_watchlist");
    expect(upsertStatus).toHaveBeenCalled();
    expect(couchRequest).toHaveBeenCalledWith("POST", "/news", expect.any(Object));
  });

  it("loads bot status from existing couch doc", async () => {
    listDocs.mockImplementation(async (name: string) => {
      if (name === "status")
        return [{ _id: "current", cashBalance: 400, survivalStatus: "Healthy", totalPnL: 1, portfolioHalted: false }];
      if (name === "news") return [{ _id: "n1" }];
      return [];
    });

    await initializeDatabase();

    expect(replaceBotStatus).toHaveBeenCalledWith(
      expect.objectContaining({ cashBalance: 400 })
    );
    expect(couchRequest).not.toHaveBeenCalledWith("POST", "/news", expect.any(Object));
  });
});
