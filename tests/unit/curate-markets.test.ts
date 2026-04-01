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
  { ticker: "KX-A", title: "Fed raises rates", event_ticker: "EVT" },
  { ticker: "KX-B", title: "Unrelated sports", event_ticker: "EVT2" }
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
});
