import { beforeEach, describe, expect, it, vi } from "vitest";

const couchRequest = vi.fn();
const ensureDb = vi.fn();

vi.mock("../../src/db/couch.js", () => ({
  couchRequest: (...a: unknown[]) => couchRequest(...a),
  ensureDb: (...a: unknown[]) => ensureDb(...a)
}));

import { listDocs } from "../../src/db/documents.js";

describe("listDocs", () => {
  beforeEach(() => {
    couchRequest.mockReset();
  });

  it("maps _all_docs rows to docs", async () => {
    couchRequest.mockResolvedValueOnce({
      rows: [{ doc: { _id: "a", foo: 1 } }, { doc: null }]
    });
    const docs = await listDocs("trades");
    expect(docs).toEqual([{ _id: "a", foo: 1 }]);
  });

  it("retries without include_docs on 500 and fetches each id", async () => {
    couchRequest
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ rows: [{ id: "x" }] })
      .mockResolvedValueOnce({ _id: "x", v: 2 });
    const docs = await listDocs("trades");
    expect(docs).toEqual([{ _id: "x", v: 2 }]);
  });
});
