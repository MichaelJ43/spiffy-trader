import axios from "axios";
import {
  KALSHI_EMBED_CONCURRENCY,
  KALSHI_EMBED_MAX_MARKETS,
  OLLAMA_EMBED_MODEL,
  OLLAMA_EMBED_TIMEOUT_MS,
  OLLAMA_URL
} from "../server/config.js";
import { runWithConcurrency } from "../lib/utils.js";
import {
  kalshiMarketEmbeddingByTicker,
  kalshiOpenMarketsCache
} from "../kalshi/market-state.js";

export async function ollamaEmbed(text: string, quiet = false): Promise<number[] | null> {
  if (!OLLAMA_EMBED_MODEL) return null;
  try {
    const { data } = await axios.post(
      `${OLLAMA_URL}/api/embeddings`,
      { model: OLLAMA_EMBED_MODEL, prompt: text.slice(0, 8192) },
      { timeout: OLLAMA_EMBED_TIMEOUT_MS }
    );
    const emb = data.embedding;
    if (!Array.isArray(emb) || emb.length === 0) return null;
    return emb;
  } catch (e: any) {
    if (!quiet) {
      const msg = e?.response?.data?.error || e?.message || e;
      console.error("Ollama /api/embeddings failed:", msg);
    }
    return null;
  }
}

export async function checkOllamaReachable() {
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function rebuildKalshiMarketEmbeddings(): Promise<void> {
  kalshiMarketEmbeddingByTicker.clear();
  if (!OLLAMA_EMBED_MODEL || kalshiOpenMarketsCache.length === 0) {
    if (OLLAMA_EMBED_MODEL) {
      console.log("Kalshi embeddings: skipped (empty market cache).");
    }
    return;
  }

  const slice = kalshiOpenMarketsCache.slice(0, KALSHI_EMBED_MAX_MARKETS);
  console.log(
    `Kalshi embeddings: indexing ${slice.length} markets via Ollama (${OLLAMA_EMBED_MODEL}, concurrency ${KALSHI_EMBED_CONCURRENCY})...`
  );

  let failed = 0;
  await runWithConcurrency(slice, KALSHI_EMBED_CONCURRENCY, async (m) => {
    const text = `${m.ticker} ${m.title}`.trim();
    const vec = await ollamaEmbed(text, true);
    if (vec) kalshiMarketEmbeddingByTicker.set(m.ticker, vec);
    else failed++;
  });

  console.log(
    `Kalshi embeddings: ${kalshiMarketEmbeddingByTicker.size} vectors stored${failed ? `, ${failed} failed` : ""}.`
  );
}
