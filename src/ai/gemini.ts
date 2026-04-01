import { GoogleGenAI } from "@google/genai";

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    return null;
  }

  if (apiKey === "MY_GEMINI_API_KEY" || apiKey === "MY_APP_URL" || apiKey.length < 10) {
    return null;
  }

  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.error("Failed to initialize Gemini:", e);
    return null;
  }
}
