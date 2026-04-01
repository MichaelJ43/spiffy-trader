import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));

const couchRequest = vi.fn();
const listDocs = vi.fn();

vi.mock("../../src/db/couch.js", () => ({
  couchRequest: (...a: unknown[]) => couchRequest(...a)
}));

vi.mock("../../src/db/documents.js", () => ({
  listDocs: (...a: unknown[]) => listDocs(...a)
}));

vi.mock("../../src/ai/gemini.js", () => ({
  getGeminiClient: vi.fn(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: '["https://discovered.example/feed.xml"]'
      })
    }
  }))
}));

import { discoverNewSources } from "../../src/ai/source-discovery.js";

describe("discoverNewSources", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
    couchRequest.mockReset();
    listDocs.mockResolvedValue([]);
  });

  it("uses Gemini when Ollama fails and posts new URL", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("ollama down"));

    await discoverNewSources();

    expect(couchRequest).toHaveBeenCalledWith(
      "POST",
      "/news_sources",
      expect.objectContaining({
        url: "https://discovered.example/feed.xml",
        origin: "llm"
      })
    );
  });
});
