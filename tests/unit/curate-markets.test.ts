import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return { ...m, OLLAMA_EMBED_MODEL: "nomic-embed-text" };
});

vi.mock("../../src/ollama/embed.js", () => ({
  ollamaEmbed: vi.fn().mockResolvedValue([1, 0, 0])
}));

import { kalshiMarketEmbeddingByTicker, setKalshiMarketsCache } from "../../src/kalshi/market-state.js";
import { curateMarketsForNews } from "../../src/kalshi/curate.js";

const pool = [
  { ticker: "KX-A", title: "Fed raises rates", event_ticker: "EVT", volume_24h: 50 },
  { ticker: "KX-B", title: "Unrelated sports", event_ticker: "EVT2", volume_24h: 30 }
];

describe("curateMarketsForNews", () => {
  it("uses token fallback when embeddings missing for a ticker", async () => {
    kalshiMarketEmbeddingByTicker.clear();
    kalshiMarketEmbeddingByTicker.set("KX-A", [1, 0, 0]);
    const out = await curateMarketsForNews("Fed policy news", pool, 2);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((m) => m.ticker === "KX-A")).toBe(true);
  });

  it("falls back when ollama returns empty embedding", async () => {
    const { ollamaEmbed } = await import("../../src/ollama/embed.js");
    vi.mocked(ollamaEmbed).mockResolvedValueOnce(null);
    kalshiMarketEmbeddingByTicker.set("KX-A", [1, 0, 0]);
    const out = await curateMarketsForNews("headline", pool, 1);
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns empty pool as empty", async () => {
    expect(await curateMarketsForNews("x", [], 3)).toEqual([]);
  });

  it("excludes zero-activity markets from curation", async () => {
    kalshiMarketEmbeddingByTicker.clear();
    const mixed = [
      { ticker: "DEAD", title: "Fed policy match", volume_24h: 0, volume: 0, open_interest: 0 },
      { ticker: "LIVE", title: "Fed policy rates", volume_24h: 100, volume: 200, open_interest: 10 }
    ];
    kalshiMarketEmbeddingByTicker.set("LIVE", [1, 0, 0]);
    const out = await curateMarketsForNews("Fed policy news", mixed, 5);
    expect(out.some((m) => m.ticker === "DEAD")).toBe(false);
    expect(out.some((m) => m.ticker === "LIVE")).toBe(true);
  });
});
