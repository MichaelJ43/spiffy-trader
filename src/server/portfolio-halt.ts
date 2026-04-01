import { listDocs } from "../db/documents.js";
import { upsertStatus } from "../db/couch.js";
import { getPositionMarketSnapshots } from "../kalshi/position-markets.js";
import { PORTFOLIO_DEPLETED_THRESHOLD_USD } from "./config.js";
import { markToMarketOpenHoldings } from "./portfolio-metrics.js";
import { botStatus } from "./state.js";

/** Cash + mark-to-market of open positions (same idea as GET /api/status). */
export async function getTotalPortfolioValueUsd(): Promise<number> {
  const trades = await listDocs("trades");
  const open = trades.filter((t: any) => t.status === "OPEN");
  const holdingsValue = markToMarketOpenHoldings(open, getPositionMarketSnapshots());
  return botStatus.cashBalance + holdingsValue;
}

/**
 * When total portfolio value is at or below the threshold, persist halt and return true.
 * Idempotent if already halted.
 */
export async function applyPortfolioDepletionIfNeeded(): Promise<boolean> {
  const total = await getTotalPortfolioValueUsd();
  if (total > PORTFOLIO_DEPLETED_THRESHOLD_USD) {
    return false;
  }
  if (!botStatus.portfolioHalted) {
    botStatus.portfolioHalted = true;
    botStatus.survivalStatus = "Halted (Portfolio depleted — POST /api/trading/resume)";
    botStatus.lastUpdate = new Date().toISOString();
    try {
      await upsertStatus(botStatus);
    } catch (e) {
      console.error("Failed to persist portfolio halt:", e);
    }
    console.warn(
      `Spiffy Trader: portfolio value $${total.toFixed(4)} ≤ $${PORTFOLIO_DEPLETED_THRESHOLD_USD} — halting monitor, RSS/LLM, and position AI. Resume after funding via POST /api/trading/resume.`
    );
  }
  return true;
}
