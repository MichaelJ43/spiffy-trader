import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return {
    ...m,
    OLLAMA_EMBED_MODEL: "embed-model",
    OLLAMA_URL: "http://127.0.0.1:11434",
    OLLAMA_EMBED_TIMEOUT_MS: 5000,
    KALSHI_EMBED_CONCURRENCY: 2,
    KALSHI_EMBED_MAX_MARKETS: 100
  };
});

import { checkOllamaReachable, ollamaEmbed, rebuildKalshiMarketEmbeddings } from "../../src/ollama/embed.js";
import { kalshiMarketEmbeddingByTicker, setKalshiMarketsCache } from "../../src/kalshi/market-state.js";

describe("ollamaEmbed", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("returns embedding vector on success", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { embedding: [0.1, 0.2] } });
    const v = await ollamaEmbed("hello");
    expect(v).toEqual([0.1, 0.2]);
  });

  it("returns null on HTTP error", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("econnrefused"));
    const v = await ollamaEmbed("hello");
    expect(v).toBeNull();
  });
});

describe("checkOllamaReachable", () => {
  it("returns true when /api/tags succeeds", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
    await expect(checkOllamaReachable()).resolves.toBe(true);
  });

  it("returns false on failure", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("down"));
    await expect(checkOllamaReachable()).resolves.toBe(false);
  });
});

describe("rebuildKalshiMarketEmbeddings", () => {
  it("indexes markets and stores vectors", async () => {
    kalshiMarketEmbeddingByTicker.clear();
    setKalshiMarketsCache([{ ticker: "T1", title: "title" }], Date.now());
    vi.mocked(axios.post).mockResolvedValue({ data: { embedding: [1, 0, 0] } });
    await rebuildKalshiMarketEmbeddings();
    expect(kalshiMarketEmbeddingByTicker.get("T1")).toEqual([1, 0, 0]);
  });
});
