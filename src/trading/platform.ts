import { calculateTradeRating } from "../lib/trade-ratings.js";
import { couchRequest, upsertStatus } from "../db/couch.js";
import { listDocs } from "../db/documents.js";
import { botStatus } from "../server/state.js";
import { getKalshiMarketData, kalshiYesMidProbability } from "../kalshi/pricing.js";

export async function executeTradeOnPlatform(trade: any) {
  console.log(`[SIMULATION] Placing trade on ${trade.market}: ${trade.event}`);

  const ticker = trade.ticker;
  if (!ticker) {
    return { success: false, txHash: "", price: 0, ticker: "", error: "missing ticker" };
  }
  const marketData = await getKalshiMarketData(ticker);

  const executionPrice = marketData ? kalshiYesMidProbability(marketData) : 0.5;

  return {
    success: true,
    txHash: "sim_" + Math.random().toString(16).substr(2, 10),
    price: executionPrice,
    ticker
  };
}

export async function resolveTrades() {
  console.log("Spiffy Trader: Resolving open trades against Kalshi data...");

  const trades = await listDocs("trades");
  for (const trade of trades) {
    if (trade.status === "OPEN") {
      const marketData = await getKalshiMarketData(trade.ticker);
      if (marketData) {
        const currentPrice = kalshiYesMidProbability(marketData);
        const pnl = (currentPrice - trade.price) * (trade.amount / trade.price);
        trade.currentPnL = pnl;

        if (marketData.status === "settled") {
          trade.status = "CLOSED";
          trade.finalPrice = marketData.result === "yes" ? 1.0 : 0.0;
          trade.pnl = (trade.finalPrice - trade.price) * (trade.amount / trade.price);
          trade.tradeRating = calculateTradeRating(trade);
          botStatus.cashBalance += trade.amount + trade.pnl;
          botStatus.totalPnL += trade.pnl;
        }

        await couchRequest("PUT", `/trades/${trade._id}`, trade);
      }
    }
  }

  await upsertStatus(botStatus);
}

/**
 * Simulated early exit at current YES mid (not settlement). Skips if market is already settled (resolution path owns that).
 */
export async function applyDiscretionaryExit(
  couchId: string,
  marketData: any,
  aiReason: string,
  closedReason: string = "discretionary_ai"
): Promise<boolean> {
  if (!marketData || marketData.status === "settled") return false;

  let trade: any;
  try {
    trade = await couchRequest("GET", `/trades/${encodeURIComponent(couchId)}`);
  } catch {
    return false;
  }
  if (trade.status !== "OPEN") return false;

  const currentPrice = kalshiYesMidProbability(marketData);
  const entry = Number(trade.price);
  const amt = Number(trade.amount) || 0;
  const pnl =
    entry > 0 && Number.isFinite(entry) ? (currentPrice - entry) * (amt / entry) : 0;

  trade.status = "CLOSED";
  trade.finalPrice = currentPrice;
  trade.pnl = pnl;
  trade.currentPnL = pnl;
  trade.closedReason = closedReason;
  trade.exitReasoning = String(aiReason || "").slice(0, 2000);
  trade.tradeRating = calculateTradeRating(trade);
  botStatus.cashBalance += amt + pnl;
  botStatus.totalPnL += pnl;

  await couchRequest("PUT", `/trades/${encodeURIComponent(couchId)}`, trade);
  await upsertStatus(botStatus);
  console.log(
    `Discretionary exit: ${trade.ticker} (${trade.id}) @ YES mid ${currentPrice.toFixed(4)}, pnl $${pnl.toFixed(2)}`
  );
  return true;
}

/** Close every OPEN trade: at settlement price if market settled, else at current YES mid. */
export async function forceSellAllOpenPositions(): Promise<{ closed: number; skipped: number }> {
  const trades = await listDocs("trades");
  const open = trades.filter((t) => t.status === "OPEN" && t._id && t.ticker);
  let closed = 0;
  let skipped = 0;

  for (const t of open) {
    const marketData = await getKalshiMarketData(String(t.ticker));
    if (!marketData) {
      console.warn(`Force sell all: no market data for ${t.ticker}`);
      skipped++;
      continue;
    }

    if (marketData.status === "settled") {
      let trade: any;
      try {
        trade = await couchRequest("GET", `/trades/${encodeURIComponent(t._id)}`);
      } catch {
        skipped++;
        continue;
      }
      if (trade.status !== "OPEN") continue;

      trade.status = "CLOSED";
      trade.finalPrice = marketData.result === "yes" ? 1.0 : 0.0;
      trade.pnl = (trade.finalPrice - trade.price) * (trade.amount / trade.price);
      trade.currentPnL = trade.pnl;
      trade.closedReason = "manual_force_all";
      trade.exitReasoning = "Manual force sell all (market settled)";
      trade.tradeRating = calculateTradeRating(trade);
      const amt = Number(trade.amount) || 0;
      botStatus.cashBalance += amt + trade.pnl;
      botStatus.totalPnL += trade.pnl;
      await couchRequest("PUT", `/trades/${encodeURIComponent(t._id)}`, trade);
      closed++;
      console.log(`Force sell all: settled ${trade.ticker} (${trade.id})`);
    } else {
      const ok = await applyDiscretionaryExit(
        t._id,
        marketData,
        "Manual: force sell all (current YES mid)",
        "manual_force_all"
      );
      if (ok) closed++;
      else skipped++;
    }
  }

  await upsertStatus(botStatus);
  return { closed, skipped };
}
