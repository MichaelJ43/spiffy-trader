/**
 * "Live dependency" style: project code runs as-is; only outbound HTTP (axios)
 * is stubbed to deterministic fixtures — no real Kalshi, RSS hosts, or Ollama.
 */
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

/** Hostname-safe allowlist (avoids substring checks that CodeQL flags as SSRF-prone). */
function isKalshiFixtureHost(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return host === "kalshi.com" || host.endsWith(".kalshi.com");
  } catch {
    return false;
  }
}

function isRssFixtureHost(urlStr: string): boolean {
  try {
    return new URL(urlStr).hostname.toLowerCase() === "rss.example.com";
  } catch {
    return false;
  }
}

function isOllamaFixtureUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return local && (u.port === "11434" || u.pathname.includes("/api/generate"));
  } catch {
    return false;
  }
}

describe("external HTTP boundaries", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (isKalshiFixtureHost(url)) {
        return {
          data: {
            market: {
              ticker: "KX-LIVE-TEST",
              yes_bid_dollars: "0.48",
              yes_ask_dollars: "0.52"
            }
          }
        };
      }
      if (isRssFixtureHost(url)) {
        return {
          data: `<?xml version="1.0"?><rss version="2.0"><channel>
            <item><title>External item</title><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
          </channel></rss>`
        };
      }
      if (isOllamaFixtureUrl(url)) {
        return { data: { response: "{}" } };
      }
      throw new Error(`Unexpected URL in external-http test: ${url}`);
    });
  });

  it("Kalshi-shaped response flows through kalshiGet", async () => {
    const { kalshiGet } = await import("../../src/kalshi/client.js");
    const data = await kalshiGet("/markets/KX-LIVE-TEST");
    expect(data.market.ticker).toBe("KX-LIVE-TEST");
  });

  it("RSS-shaped XML flows through fetchRssFeed", async () => {
    const { fetchRssFeed } = await import("../../src/rss/fetch.js");
    const feed = await fetchRssFeed("https://rss.example.com/news.xml");
    expect(feed.items?.[0]?.title).toBe("External item");
  });
});
