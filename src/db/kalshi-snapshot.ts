import {
  KALSHI_DB_CHUNK_SIZE,
  KALSHI_MARKETS_DB,
  KALSHI_SNAPSHOT_LEGACY_ID
} from "../server/config.js";
import type { KalshiMarketLite } from "../kalshi/types.js";
import { couchRequest, ensureDb } from "./couch.js";

export async function loadKalshiMarketsSnapshotFromDb(): Promise<{
  markets: KalshiMarketLite[];
  fetchedAtMs: number;
} | null> {
  try {
    const meta = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/meta`);
    const fetchedAtMs = Number(meta.fetchedAtMs);
    const n = Math.max(0, Math.floor(Number(meta.chunks) || 0));
    if (!Number.isFinite(fetchedAtMs) || fetchedAtMs <= 0 || n === 0) return null;
    const all: KalshiMarketLite[] = [];
    for (let i = 0; i < n; i++) {
      const ch = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/c${i}`);
      if (!Array.isArray(ch.items)) continue;
      for (const it of ch.items) {
        if (it?.ticker) {
          all.push({
            ticker: it.ticker,
            title: String(it.title || ""),
            event_ticker: it.event_ticker
          });
        }
      }
    }
    const expected = Math.max(0, Math.floor(Number(meta.total) || 0));
    if (expected > 0 && all.length === 0) return null;
    return { markets: all, fetchedAtMs };
  } catch (e: any) {
    if (e?.response?.status === 404) {
      try {
        const doc = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/${KALSHI_SNAPSHOT_LEGACY_ID}`);
        const items = doc.items;
        if (!Array.isArray(items)) return null;
        const fetchedAtMs = Date.parse(doc.updatedAt || "") || 0;
        if (!fetchedAtMs) return null;
        return {
          markets: items.filter((it: any) => it?.ticker),
          fetchedAtMs
        };
      } catch {
        return null;
      }
    }
    throw e;
  }
}

export async function saveKalshiMarketsSnapshotToDb(markets: KalshiMarketLite[]) {
  try {
    await ensureDb(KALSHI_MARKETS_DB);
  } catch (e) {
    console.warn("Kalshi DB: ensureDb failed:", e);
    return;
  }

  const chunkSize = KALSHI_DB_CHUNK_SIZE;
  const chunks: KalshiMarketLite[][] = [];
  if (markets.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < markets.length; i += chunkSize) {
      chunks.push(markets.slice(i, i + chunkSize));
    }
  }

  let metaRev: string | undefined;
  let oldChunkCount = 0;
  try {
    const m = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/meta`);
    metaRev = m._rev;
    oldChunkCount = Math.max(0, Math.floor(Number(m.chunks) || 0));
  } catch (e: any) {
    if (e?.response?.status !== 404) {
      console.warn("Kalshi DB: read meta failed:", e?.message || e);
      return;
    }
  }

  try {
    const leg = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/${KALSHI_SNAPSHOT_LEGACY_ID}`);
    await couchRequest(
      "DELETE",
      `/${KALSHI_MARKETS_DB}/${KALSHI_SNAPSHOT_LEGACY_ID}?rev=${encodeURIComponent(leg._rev)}`
    );
  } catch {
    /* no legacy single-doc snapshot */
  }

  const newChunkCount = chunks.length;
  for (let i = 0; i < newChunkCount; i++) {
    try {
      let rev: string | undefined;
      try {
        const ex = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/c${i}`);
        rev = ex._rev;
      } catch (e: any) {
        if (e?.response?.status !== 404) throw e;
      }
      await couchRequest(
        "PUT",
        `/${KALSHI_MARKETS_DB}/c${i}`,
        {
          _id: `c${i}`,
          ...(rev ? { _rev: rev } : {}),
          type: "kalshi_chunk",
          items: chunks[i]
        },
        undefined,
        120_000
      );
    } catch (e: any) {
      console.warn(`Kalshi DB: failed writing chunk c${i}:`, e?.message || e);
      return;
    }
  }

  for (let i = newChunkCount; i < oldChunkCount; i++) {
    try {
      const ex = await couchRequest("GET", `/${KALSHI_MARKETS_DB}/c${i}`);
      await couchRequest("DELETE", `/${KALSHI_MARKETS_DB}/c${i}?rev=${encodeURIComponent(ex._rev)}`);
    } catch {
      /* gone */
    }
  }

  try {
    await couchRequest(
      "PUT",
      `/${KALSHI_MARKETS_DB}/meta`,
      {
        _id: "meta",
        ...(metaRev ? { _rev: metaRev } : {}),
        type: "kalshi_meta",
        updatedAt: new Date().toISOString(),
        fetchedAtMs: Date.now(),
        chunks: newChunkCount,
        total: markets.length
      },
      undefined,
      30_000
    );
  } catch (e: any) {
    console.warn("Kalshi DB: failed writing meta:", e?.message || e);
  }
}
