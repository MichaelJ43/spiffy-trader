import {
  KALSHI_MARKETS_MAX_TOTAL,
  KALSHI_MARKETS_PAGE_LIMIT,
  KALSHI_MARKETS_REFRESH_MS
} from "../server/config.js";
import { loadKalshiMarketsSnapshotFromDb, saveKalshiMarketsSnapshotToDb } from "../db/kalshi-snapshot.js";
import { rebuildKalshiMarketEmbeddings } from "../ollama/embed.js";
import { kalshiGet } from "./client.js";
import {
  kalshiMarketsRefreshInFlight,
  kalshiOpenMarketsCache,
  kalshiOpenMarketsFetchedAt,
  setKalshiMarketsCache,
  setKalshiMarketsRefreshInFlight
} from "./market-state.js";
import { kalshiMarketLiteFromListApiRow } from "./activity.js";
import type { KalshiMarketLite } from "./types.js";

async function refreshKalshiOpenMarketsInternal(): Promise<void> {
  const collected: KalshiMarketLite[] = [];
  let cursor: string | undefined;
  const pageLimit = KALSHI_MARKETS_PAGE_LIMIT;

  for (;;) {
    const params: Record<string, string> = {
      status: "open",
      limit: String(pageLimit)
    };
    if (cursor) params.cursor = cursor;

    const data = await kalshiGet("/markets", { params });

    const markets = data.markets || [];
    for (const raw of markets) {
      const lite = kalshiMarketLiteFromListApiRow(raw);
      if (lite) collected.push(lite);
    }

    cursor = typeof data.cursor === "string" && data.cursor.length > 0 ? data.cursor : undefined;
    if (!cursor || collected.length >= KALSHI_MARKETS_MAX_TOTAL) break;
  }

  setKalshiMarketsCache(collected, Date.now());
  console.log(
    `Kalshi: cached ${collected.length} open markets (refresh every ${KALSHI_MARKETS_REFRESH_MS / 1000}s).`
  );
  await saveKalshiMarketsSnapshotToDb(collected);
  await rebuildKalshiMarketEmbeddings();
}

export async function ensureKalshiMarketsCache(): Promise<void> {
  const stale =
    kalshiOpenMarketsCache.length === 0 ||
    Date.now() - kalshiOpenMarketsFetchedAt > KALSHI_MARKETS_REFRESH_MS;
  if (!stale) return;

  if (kalshiMarketsRefreshInFlight) {
    await kalshiMarketsRefreshInFlight;
    return;
  }

  const job = (async () => {
    try {
      const needsFetch =
        kalshiOpenMarketsCache.length === 0 ||
        Date.now() - kalshiOpenMarketsFetchedAt > KALSHI_MARKETS_REFRESH_MS;
      if (needsFetch) {
        try {
          const fromDb = await loadKalshiMarketsSnapshotFromDb();
          if (
            fromDb &&
            fromDb.markets.length > 0 &&
            Date.now() - fromDb.fetchedAtMs <= KALSHI_MARKETS_REFRESH_MS
          ) {
            setKalshiMarketsCache(fromDb.markets, fromDb.fetchedAtMs);
            console.log(
              `Kalshi: restored ${fromDb.markets.length} open markets from CouchDB (snapshot ${Math.round((Date.now() - fromDb.fetchedAtMs) / 1000)}s old).`
            );
            await rebuildKalshiMarketEmbeddings();
            return;
          }
        } catch (dbErr: any) {
          console.warn(
            "Kalshi: CouchDB snapshot unreadable, fetching from API:",
            dbErr?.message || dbErr
          );
        }
      }
      await refreshKalshiOpenMarketsInternal();
    } catch (e) {
      console.error("Kalshi: failed to refresh open markets cache:", e);
    } finally {
      setKalshiMarketsRefreshInFlight(null);
    }
  })();

  setKalshiMarketsRefreshInFlight(job);
  await job;
}
