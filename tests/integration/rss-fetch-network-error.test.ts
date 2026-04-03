import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRssFeed } from "../../src/rss/fetch.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

describe("fetchRssFeed — network / HTTP failures", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it("propagates axios errors (timeout, 5xx, connection refused)", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("network down"));

    await expect(fetchRssFeed("https://example.com/feed.xml")).rejects.toThrow("network down");
  });
});
