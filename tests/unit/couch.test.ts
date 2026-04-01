import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { couchRequest, ensureDb, upsertStatus } from "../../src/db/couch.js";

vi.mock("axios", () => {
  const fn = vi.fn();
  return { default: fn };
});

describe("couch", () => {
  beforeEach(() => {
    vi.mocked(axios).mockReset();
  });

  it("couchRequest returns response data", async () => {
    vi.mocked(axios).mockResolvedValueOnce({ data: { rows: [] } });
    const out = await couchRequest("GET", "/trades/_all_docs");
    expect(out).toEqual({ rows: [] });
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", url: expect.stringContaining("/trades/_all_docs") })
    );
  });

  it("ensureDb swallows 412", async () => {
    vi.mocked(axios).mockRejectedValueOnce({ response: { status: 412 } });
    await expect(ensureDb("trades")).resolves.toBeUndefined();
  });

  it("ensureDb rethrows non-412", async () => {
    vi.mocked(axios).mockRejectedValueOnce({ response: { status: 500 } });
    await expect(ensureDb("trades")).rejects.toMatchObject({ response: { status: 500 } });
  });

  it("upsertStatus merges rev from existing doc", async () => {
    const ax = vi.mocked(axios);
    ax.mockResolvedValueOnce({ data: { _rev: "rev1", cashBalance: 1 } });
    ax.mockResolvedValueOnce({ data: { ok: true } });
    await upsertStatus({ cashBalance: 99 });
    const put = ax.mock.calls.find((c) => (c[0] as { method?: string })?.method === "PUT");
    expect((put?.[0] as { data?: unknown })?.data).toMatchObject({
      _id: "current",
      _rev: "rev1",
      cashBalance: 99
    });
  });

  it("upsertStatus handles 404 on GET status", async () => {
    const ax = vi.mocked(axios);
    ax.mockRejectedValueOnce({ response: { status: 404 } });
    ax.mockResolvedValueOnce({ data: { ok: true } });
    await upsertStatus({ cashBalance: 2 });
    const put = ax.mock.calls.find((c) => (c[0] as { method?: string })?.method === "PUT");
    const body = (put?.[0] as { data?: { _rev?: string } })?.data;
    expect(body).toMatchObject({ _id: "current", cashBalance: 2 });
    expect(body?._rev).toBeUndefined();
  });
});
