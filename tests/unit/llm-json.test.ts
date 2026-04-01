import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

import { generateJsonWithLlm } from "../../src/ai/llm-json.js";

describe("generateJsonWithLlm", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("parses Ollama JSON response", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { response: '{"shouldTrade":false}' }
    });
    const out = await generateJsonWithLlm("{}", null);
    expect(out).toEqual({ shouldTrade: false });
  });

  it("returns null when Ollama returns empty and no Gemini", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { response: "   " } });
    const out = await generateJsonWithLlm("{}", null);
    expect(out).toBeNull();
  });

  it("falls back to Gemini when Ollama fails", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("down"));
    const gemini = {
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: '{"x":1}' })
      }
    };
    const out = await generateJsonWithLlm("prompt", gemini as any);
    expect(out).toEqual({ x: 1 });
  });
});
