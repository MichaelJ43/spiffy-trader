import axios from "axios";
import { couchRequest } from "../db/couch.js";
import { listDocs } from "../db/documents.js";
import { OLLAMA_GENERATE_TIMEOUT_MS, OLLAMA_MODEL, OLLAMA_URL } from "../server/config.js";
import { getGeminiClient } from "./gemini.js";

/**
 * Intelligently find new RSS feeds based on current market trends
 */
export async function discoverNewSources() {
  console.log("Spiffy Trader: Attempting to discover new news sources...");
  const prompt = `Based on current global financial trends and prediction markets (Polymarket, Kalshi), suggest 3 high-quality RSS feed URLs that provide fast-breaking news. 
    Return ONLY a JSON array of strings: ["url1", "url2", "url3"]`;

  let discovered: string[] = [];
  try {
    const ollamaResponse = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: "json"
      },
      { timeout: OLLAMA_GENERATE_TIMEOUT_MS }
    );
    discovered = JSON.parse(ollamaResponse.data.response || "[]");
  } catch {
    const currentAi = getGeminiClient();
    if (!currentAi) {
      console.error("Source discovery: Ollama failed and no Gemini API key.");
      return;
    }
    try {
      console.log("Source discovery: using Gemini after Ollama failed...");
      const result = await currentAi.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      discovered = JSON.parse(result.text || "[]");
    } catch (e) {
      console.error("Source discovery failed:", e);
      return;
    }
  }

  const known = new Set(
    (await listDocs("news_sources")).map((d: any) => d.url).filter(Boolean) as string[]
  );
  for (const url of discovered) {
    if (typeof url !== "string" || !url.startsWith("http")) continue;
    if (known.has(url)) continue;
    console.log(`Discovered new source: ${url}`);
    await couchRequest("POST", "/news_sources", {
      type: "rss",
      url,
      origin: "llm",
      createdAt: new Date().toISOString()
    });
    known.add(url);
  }
}
