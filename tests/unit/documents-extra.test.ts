import { beforeEach, describe, expect, it, vi } from "vitest";

const couchRequest = vi.fn();
const ensureDb = vi.fn();

vi.mock("../../src/db/couch.js", () => ({
  couchRequest: (...a: unknown[]) => couchRequest(...a),
  ensureDb: (...a: unknown[]) => ensureDb(...a)
}));

import {
  addNewsSourceIfMissing,
  recreateNewsSourcesDb,
  repairNewsSourcesDbIfBroken
} from "../../src/db/documents.js";

describe("recreateNewsSourcesDb", () => {
  beforeEach(() => {
    couchRequest.mockReset();
    ensureDb.mockReset();
    ensureDb.mockResolvedValue(undefined);
  });

  it("deletes db and ensures news_sources", async () => {
    couchRequest.mockResolvedValueOnce({});
    await recreateNewsSourcesDb();
    expect(couchRequest).toHaveBeenCalledWith("DELETE", "/news_sources");
    expect(ensureDb).toHaveBeenCalledWith("news_sources");
  });

  it("ignores 404 on delete", async () => {
    couchRequest.mockRejectedValueOnce({ response: { status: 404 } });
    await recreateNewsSourcesDb();
    expect(ensureDb).toHaveBeenCalled();
  });
});

describe("addNewsSourceIfMissing", () => {
  beforeEach(() => {
    couchRequest.mockReset();
  });

  it("posts when url not present", async () => {
    couchRequest.mockResolvedValueOnce({
      rows: [{ doc: { _id: "a", url: "https://other/feed" } }]
    });
    couchRequest.mockResolvedValueOnce({});
    await addNewsSourceIfMissing("https://new.example/feed", "llm");
    expect(couchRequest).toHaveBeenCalledWith(
      "POST",
      "/news_sources",
      expect.objectContaining({ url: "https://new.example/feed", origin: "llm" })
    );
  });

  it("skips when url exists", async () => {
    couchRequest.mockResolvedValueOnce({
      rows: [{ doc: { _id: "x", url: "https://exists/feed" } }]
    });
    await addNewsSourceIfMissing("https://exists/feed", "seed");
    expect(couchRequest).toHaveBeenCalledTimes(1);
    expect(couchRequest).not.toHaveBeenCalledWith(
      "POST",
      "/news_sources",
      expect.anything()
    );
  });
});

describe("repairNewsSourcesDbIfBroken", () => {
  beforeEach(() => {
    couchRequest.mockReset();
    ensureDb.mockReset();
    ensureDb.mockResolvedValue(undefined);
  });

  it("no-op when GET succeeds", async () => {
    couchRequest.mockResolvedValueOnce({ rows: [] });
    await repairNewsSourcesDbIfBroken();
    expect(couchRequest).toHaveBeenCalled();
  });

  it("recreates on 500 from _all_docs", async () => {
    couchRequest
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    await repairNewsSourcesDbIfBroken();
    expect(couchRequest).toHaveBeenCalledWith("DELETE", "/news_sources");
  });
});
