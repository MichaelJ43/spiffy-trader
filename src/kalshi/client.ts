import axios from "axios";
import {
  KALSHI_429_BACKOFF_CAP_MS,
  KALSHI_API_BASE,
  KALSHI_MAX_RETRIES,
  KALSHI_MIN_INTERVAL_MS
} from "../server/config.js";

let kalshiLastRequestAt = 0;

function kalshiSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function kalshiThrottle(): Promise<void> {
  if (KALSHI_MIN_INTERVAL_MS <= 0) return;
  const now = Date.now();
  const wait = kalshiLastRequestAt + KALSHI_MIN_INTERVAL_MS - now;
  if (wait > 0) await kalshiSleep(wait);
  kalshiLastRequestAt = Date.now();
}

function kalshi429BackoffMs(attempt: number, headers: Record<string, unknown>): number {
  const raRaw = headers["retry-after"] ?? headers["Retry-After"];
  const raSec = parseInt(String(raRaw ?? ""), 10);
  if (Number.isFinite(raSec) && raSec > 0) {
    return Math.min(KALSHI_429_BACKOFF_CAP_MS, raSec * 1000);
  }
  return Math.min(KALSHI_429_BACKOFF_CAP_MS, 1000 * 2 ** attempt);
}

/** Throttled GET to Kalshi with 429 retries (honors Retry-After when present). */
export async function kalshiGet(path: string, config?: Record<string, unknown>): Promise<any> {
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  const url = `${KALSHI_API_BASE}${pathPart}`;
  let attempt = 0;

  for (;;) {
    await kalshiThrottle();
    try {
      const response = await axios.get(url, {
        timeout: 90_000,
        ...config
      });
      return response.data;
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429 && attempt < KALSHI_MAX_RETRIES) {
        attempt++;
        const backoff = kalshi429BackoffMs(attempt, e?.response?.headers || {});
        console.warn(`Kalshi rate limit (429), waiting ${backoff}ms (retry ${attempt}/${KALSHI_MAX_RETRIES})`);
        await kalshiSleep(backoff);
        continue;
      }
      throw e;
    }
  }
}
