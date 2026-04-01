import { generateJsonWithLlm } from "./llm-json.js";
import { getGeminiClient } from "./gemini.js";
import { listDocs } from "../db/documents.js";
import { AI_EXIT_REVIEW_ENABLED } from "../server/config.js";
import { botStatus } from "../server/state.js";
import { applyDiscretionaryExit } from "../trading/platform.js";
import {
  getPositionMarketSnapshots,
  summarizeMarketForRisk,
  type PositionMarketSnapshot
} from "../kalshi/position-markets.js";

function buildExitReviewPrompt(
  openTrades: any[],
  snapMap: ReadonlyMap<string, PositionMarketSnapshot>
) {
  const positions = openTrades.map((t) => {
    const ticker = String(t.ticker);
    const snap = snapMap.get(ticker);
    const summary = snap?.market ? summarizeMarketForRisk(snap.market, ticker) : { ticker, error: "no_snapshot" };
    const entry = Number(t.price) || 0;
    const amt = Number(t.amount) || 0;
    const mid =
      typeof summary === "object" && "yesMid" in summary && typeof summary.yesMid === "number"
        ? summary.yesMid
        : null;
    const unrealized =
      entry > 0 && mid !== null && Number.isFinite(mid) ? (mid - entry) * (amt / entry) : null;

    return {
      tradeId: t.id,
      ticker,
      entryYesPrice: entry,
      amountUsd: amt,
      openedAt: t.timestamp,
      eventPreview: String(t.event || "").slice(0, 160),
      originalReasoning: String(t.reasoning || "").slice(0, 280),
      marketSummary: summary,
      unrealizedPnlUsdApprox: unrealized
    };
  });

  const payload = JSON.stringify(positions);

  return `You manage open simulated YES positions on Kalshi (play money). Each position can be held until official settlement OR closed early at the current market-implied YES probability (mid), like selling the position.

For every position below you must choose whether to EXIT NOW (lock in PnL at current mid) or HOLD for later / settlement.

Data (JSON array, one object per open trade):
${payload}

Rules:
- Prefer HOLD unless there is a clear reason to exit early: thesis broken, adverse price move, risk/reward no longer attractive, liquidity/spread concern, or you want to bank a quick gain from a short-term trade.
- You may exit some positions and hold others.
- tradeId in your response MUST match the "tradeId" field from the input exactly.
- Do not invent tradeIds.

Return ONLY valid JSON:
{ "decisions": [ { "tradeId": string, "exitNow": boolean, "reasoning": string } ] }

Include one object per position in "decisions" (same count and tradeIds as input).`;
}

let exitReviewInFlight = false;

export async function runAiExitReview(): Promise<void> {
  if (botStatus.portfolioHalted || !AI_EXIT_REVIEW_ENABLED || exitReviewInFlight) return;

  exitReviewInFlight = true;
  try {
    let trades: any[];
    try {
      trades = await listDocs("trades");
    } catch (e) {
      console.warn("AI exit review: list trades failed:", e);
      return;
    }

    const openTrades = trades.filter((t) => t.status === "OPEN" && t.ticker && t.id && t._id);
    const snapMap = getPositionMarketSnapshots();
    const withSnap = openTrades.filter((t) => snapMap.has(String(t.ticker)));
    if (withSnap.length === 0) return;

    const gemini = getGeminiClient();
    const prompt = buildExitReviewPrompt(withSnap, snapMap);
    const parsed = await generateJsonWithLlm(prompt, gemini);
    const decisions = parsed?.decisions;
    if (!Array.isArray(decisions)) {
      console.warn("AI exit review: missing decisions[]");
      return;
    }
    if (decisions.length !== withSnap.length) {
      console.warn(
        `AI exit review: expected ${withSnap.length} decisions, got ${decisions.length} (continuing with matches)`
      );
    }

    const byId = new Map(withSnap.map((t) => [String(t.id), t]));
    for (const d of decisions) {
      if (!d || typeof d !== "object") continue;
      const tradeId = String(d.tradeId || "");
      const exitNow = d.exitNow === true;
      const reasoning = String(d.reasoning || "").slice(0, 2000);
      if (!exitNow || !tradeId) continue;

      const trade = byId.get(tradeId);
      if (!trade?._id) continue;

      const snap = snapMap.get(String(trade.ticker));
      if (!snap?.market) continue;

      await applyDiscretionaryExit(trade._id, snap.market, reasoning);
    }
  } finally {
    exitReviewInFlight = false;
  }
}
