import { afterEach, describe, expect, it, vi } from "vitest";

describe("getGeminiClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns null when no API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("API_KEY", "");
    const { getGeminiClient } = await import("../../src/ai/gemini.js");
    expect(getGeminiClient()).toBeNull();
  });

  it("returns null for placeholder or short keys", async () => {
    vi.stubEnv("GEMINI_API_KEY", "MY_GEMINI_API_KEY");
    const { getGeminiClient } = await import("../../src/ai/gemini.js");
    expect(getGeminiClient()).toBeNull();
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "short");
    const { getGeminiClient: g2 } = await import("../../src/ai/gemini.js");
    expect(g2()).toBeNull();
  });
});
