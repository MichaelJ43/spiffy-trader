import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return {
    ...m,
    KALSHI_MIN_INTERVAL_MS: 0,
    KALSHI_MAX_RETRIES: 3,
    KALSHI_429_BACKOFF_CAP_MS: 5000,
    KALSHI_API_BASE: "https://api.test"
  };
});

import { kalshiGet } from "../../src/kalshi/client.js";

describe("kalshiGet", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries on 429 then returns data", async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({
        response: { status: 429, headers: { "retry-after": "1" } }
      })
      .mockResolvedValueOnce({ data: { markets: [] } });

    const p = kalshiGet("/markets");
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toEqual({ markets: [] });
    expect(axios.get).toHaveBeenCalledTimes(2);
  });
});
