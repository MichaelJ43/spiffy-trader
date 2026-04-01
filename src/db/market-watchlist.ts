import { ensureDb } from "./couch.js";
import { listDocs } from "./documents.js";

/**
 * “Of-interest” Kalshi markets (e.g. headline fit but no trade yet).
 *
 * Couch fields (suggested):
 * - `ticker` (string, required)
 * - `watchUntil` (ISO datetime, optional) — ignored after this time
 * - `archived` (boolean) or `active: false` — excluded
 * - `reason`, `sourceNewsId`, `addedAt`, etc. — optional metadata
 */
export async function ensureMarketWatchlistDb() {
  await ensureDb("market_watchlist");
}

/** Tickers from non-archived watchlist rows that are not past `watchUntil`. */
export async function getActiveWatchlistTickers(): Promise<string[]> {
  try {
    const docs = await listDocs("market_watchlist");
    const now = Date.now();
    const out: string[] = [];
    for (const d of docs) {
      const row = d as any;
      if (!row || String(row._id || "").startsWith("_design")) continue;
      if (row.archived === true || row.active === false) continue;
      const t = row.ticker;
      if (!t || typeof t !== "string") continue;
      const tick = t.trim();
      if (!tick) continue;
      if (row.watchUntil != null && row.watchUntil !== "") {
        const until = Date.parse(String(row.watchUntil));
        if (Number.isFinite(until) && now > until) continue;
      }
      out.push(tick);
    }
    return [...new Set(out)];
  } catch {
    return [];
  }
}
