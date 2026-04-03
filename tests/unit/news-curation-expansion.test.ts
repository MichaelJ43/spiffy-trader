import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/ai/llm-json.js", () => ({
  generateJsonWithLlm: vi.fn()
}));

import { generateJsonWithLlm } from "../../src/ai/llm-json.js";
import {
  buildNewsCurationExpansionPrompt,
  expandNewsForMarketCuration,
  parseNewsCurationExpansion
} from "../../src/ai/news-curation-expansion.js";

describe("parseNewsCurationExpansion", () => {
  it("returns null for invalid input", () => {
    expect(parseNewsCurationExpansion(null)).toBeNull();
    expect(parseNewsCurationExpansion(undefined)).toBeNull();
    expect(parseNewsCurationExpansion("x")).toBeNull();
    expect(parseNewsCurationExpansion({})).toBeNull();
    expect(parseNewsCurationExpansion({ transmissionChannels: 1 })).toBeNull();
    expect(parseNewsCurationExpansion({ transmissionChannels: "" })).toBeNull();
    expect(parseNewsCurationExpansion({ transmissionChannels: "   " })).toBeNull();
  });

  it("trims and keeps short strings", () => {
    expect(parseNewsCurationExpansion({ transmissionChannels: "  oil gas  " })).toBe("oil gas");
  });

  it("clamps very long text", () => {
    const long = "a".repeat(2000);
    const out = parseNewsCurationExpansion({ transmissionChannels: long });
    expect(out?.length).toBe(1200);
  });
});

describe("buildNewsCurationExpansionPrompt", () => {
  it("embeds headline as JSON string", () => {
    const h = 'say "hello"';
    const p = buildNewsCurationExpansionPrompt(h);
    expect(p).toContain(JSON.stringify(h));
    expect(p).toContain("transmissionChannels");
  });
});

describe("expandNewsForMarketCuration", () => {
  it("returns null for empty headline", async () => {
    expect(await expandNewsForMarketCuration("", null)).toBeNull();
    expect(await expandNewsForMarketCuration("  ", null)).toBeNull();
  });

  it("returns null when LLM returns null", async () => {
    vi.mocked(generateJsonWithLlm).mockResolvedValueOnce(null);
    expect(await expandNewsForMarketCuration("hello", null)).toBeNull();
  });

  it("returns parsed channels when LLM responds", async () => {
    vi.mocked(generateJsonWithLlm).mockResolvedValueOnce({
      transmissionChannels: "Crude oil, refined products, shipping."
    });
    expect(await expandNewsForMarketCuration("Conflict in region X", null)).toBe(
      "Crude oil, refined products, shipping."
    );
  });
});
