import {
  botStatus,
  readCashFromStatusDoc,
  replaceBotStatus,
  type BotStatus
} from "../server/state.js";
import { couchRequest, ensureDb, upsertStatus } from "./couch.js";
import { listDocs, repairNewsSourcesDbIfBroken, seedNewsSourcesIfNeeded } from "./documents.js";
import { ensureMarketWatchlistDb } from "./market-watchlist.js";

function statusFromCouchDoc(current: any): BotStatus {
  return {
    cashBalance: readCashFromStatusDoc(current, 250.0),
    survivalStatus: current.survivalStatus ?? "Healthy",
    lastUpdate: current.lastUpdate ?? new Date().toISOString(),
    totalPnL: current.totalPnL ?? 0.0,
    portfolioHalted: current.portfolioHalted === true
  };
}

export async function initializeDatabase() {
  await ensureDb("trades");
  await ensureDb("news");
  await ensureDb("kalshi_markets");
  await ensureMarketWatchlistDb();
  await ensureDb("status");
  await repairNewsSourcesDbIfBroken();
  await seedNewsSourcesIfNeeded();

  const existingStatus = await listDocs("status");
  if (existingStatus.length === 0) {
    await upsertStatus(botStatus);
  } else {
    const current = existingStatus.find((doc: any) => doc._id === "current") || existingStatus[0];
    replaceBotStatus(statusFromCouchDoc(current));
  }

  const existingNews = await listDocs("news");
  if (existingNews.length === 0) {
    await couchRequest("POST", "/news", {
      source: "System",
      content: "Spiffy Trader Core initialized. Monitoring configured RSS sources.",
      timestamp: new Date().toISOString(),
      sentiment: "Neutral",
      impactScore: 0,
      reasoning: "System startup event."
    });
  }
}
