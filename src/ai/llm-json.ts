import axios from "axios";
import {
  OLLAMA_GENERATE_TIMEOUT_MS,
  OLLAMA_MODEL,
  OLLAMA_URL
} from "../server/config.js";
import { getGeminiClient } from "./gemini.js";

type GeminiClient = NonNullable<ReturnType<typeof getGeminiClient>>;

/**
 * Single JSON-object completion: Ollama first, optional Gemini fallback.
 */
export async function generateJsonWithLlm(
  prompt: string,
  gemini: GeminiClient | null
): Promise<any | null> {
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
    const raw = ollamaResponse.data?.response;
    if (typeof raw === "string" && raw.trim()) {
      return JSON.parse(raw);
    }
  } catch (e: any) {
    const errMsg =
      e?.code === "ECONNABORTED" ? `timeout after ${OLLAMA_GENERATE_TIMEOUT_MS}ms` : (e?.message || e);
    console.error("LLM JSON: Ollama generate failed:", errMsg);
  }

  if (!gemini) return null;
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    const text = result.text || "{}";
    return JSON.parse(text);
  } catch (e: any) {
    console.error("LLM JSON: Gemini failed:", e?.message || e);
    return null;
  }
}
