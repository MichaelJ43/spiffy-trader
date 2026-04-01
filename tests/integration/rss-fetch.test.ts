import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRssFeed } from "../../src/rss/fetch.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Ch</title>
<item><title>Headline A</title><pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate></item>
</channel></rss>`;

describe("fetchRssFeed (axios + rss-parser)", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({ data: rssXml });
  });

  it("returns parsed items from mocked RSS body", async () => {
    const feed = await fetchRssFeed("https://example.com/feed.xml");
    expect(feed.items?.[0]?.title).toBe("Headline A");
  });
});
