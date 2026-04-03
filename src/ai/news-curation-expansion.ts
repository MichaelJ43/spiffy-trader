import { generateJsonWithLlm } from "./llm-json.js";
import { getGeminiClient } from "./gemini.js";

type GeminiClient = NonNullable<ReturnType<typeof getGeminiClient>>;

const MAX_CHANNELS_LEN = 1200;

/**
 * Parse LLM JSON for {@link expandNewsForMarketCuration}.
 */
export function parseNewsCurationExpansion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const ch = (raw as { transmissionChannels?: unknown }).transmissionChannels;
  if (typeof ch !== "string") return null;
  const t = ch.trim();
  if (!t) return null;
  return t.length <= MAX_CHANNELS_LEN ? t : t.slice(0, MAX_CHANNELS_LEN);
}

/**
 * Prompt: one JSON object with plausible second-/third-order market themes (no trade advice).
 */
export function buildNewsCurationExpansionPrompt(headline: string): string {
  return `You help match news headlines to prediction-market contracts (Kalshi-style titles).

Headline: ${JSON.stringify(headline.slice(0, 4000))}

Task: In ONE short paragraph, name plausible **transmission paths** from this story to themes that **prediction markets** often list — not only direct entities in the headline.

Include where relevant:
- **Commodities & logistics** (e.g. oil, gas, diesel, shipping, insurance, agriculture)
- **Macro** (rates, inflation, FX, recession risk)
- **Sectors** (energy, transport, chemicals/plastics/rubber as downstream of oil, defense, tech supply chains)
- **Geopolitical risk** spillovers beyond the primary country (sanctions, trade routes, safe havens)

Rules:
- Use **concrete nouns** that could appear in market titles.
- Do **not** recommend trades, sizes, or probabilities.
- Do **not** repeat the entire headline; add **linkage** and **knock-on** channels.

Return ONE JSON object only (no markdown), exactly this shape:
{"transmissionChannels":"<single paragraph, max ~600 characters>"}`;
}

/**
 * LLM call before market curation: broaden keyword-poor headlines toward economically linked themes.
 */
export async function expandNewsForMarketCuration(
  headline: string,
  gemini: GeminiClient | null
): Promise<string | null> {
  const h = headline?.trim();
  if (!h) return null;
  try {
    const raw = await generateJsonWithLlm(buildNewsCurationExpansionPrompt(h), gemini);
    return parseNewsCurationExpansion(raw);
  } catch {
    return null;
  }
}
