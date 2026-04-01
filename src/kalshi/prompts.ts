import { KALSHI_TAKER_FEE_COEFFICIENT } from "./fees.js";
import type { KalshiMarketLite } from "./types.js";

export type TradeDecisionContext = {
  /** 0–100 heuristic from RSS source historical quality (not from the headline). */
  confidenceScore: number;
  /** Same source’s weight used for feed ordering (informational). */
  feedWeight: number;
  /** True while the bot is still bootstrapping rated trade history. */
  tradingBootstrap: boolean;
  /** Current simulated balance — max dollars allocatable on a new trade. */
  availableBalance: number;
};

/**
 * One LLM call: model decides whether to trade, size, ticker, and qualitative fields.
 * Server enforces curated tickers and clamps size to [0, availableBalance].
 */
export function buildKalshiTradeDecisionPrompt(
  itemContent: string,
  curated: KalshiMarketLite[],
  ctx: TradeDecisionContext
): string {
  if (curated.length === 0) {
    return `You are deciding whether a simulated Kalshi trade should open from this headline. No candidate markets are loaded.

Headline: ${JSON.stringify(itemContent)}

Context: confidenceScore=${ctx.confidenceScore} (RSS source track record only), tradingBootstrap=${ctx.tradingBootstrap}, availableBalance=${ctx.availableBalance.toFixed(2)} (cash before fees). Buys also pay an estimated Kalshi-style taker fee ~ ${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price).

**Priority:** The simulation ends badly if cash hits zero—you must NOT run out of money. With no markets here, do not trade.

Return JSON only:
{ "shouldTrade": false, "suggestedTicker": "", "tradeAmount": null, "impactScore": 0, "sentiment": "Neutral", "reasoning": "No markets available." }`;
  }

  const candidatesPayload = curated.map((m) => ({
    t: m.ticker,
    d: (m.title || "").slice(0, 220),
    v24: m.volume_24h ?? 0,
    vol: m.volume ?? 0,
    oi: m.open_interest ?? 0
  }));
  const candidatesJson = JSON.stringify(candidatesPayload);

  return `You are the trading agent for a Kalshi simulation. You must decide whether to open a YES position and how large, using ONLY the evidence below.

**TOP PRIORITY — DO NOT RUN OUT OF MONEY:** The bot halts if portfolio value collapses; going to ~$0 is a failure mode you must actively avoid. Treat **capital preservation** as more important than squeezing every headline for action. Prefer **shouldTrade: false** or **small tradeAmount** when edge is unclear, fees eat the trade, or available cash is low (${ctx.availableBalance.toFixed(2)}). Never behave as if you have unlimited bankroll—leave a **cash buffer** (do not deploy everything on one headline unless conviction and edge are exceptionally strong). If in doubt, **skip the trade.**

**Market activity:** Each candidate includes **v24** (24h volume, contracts), **vol** (lifetime volume), and **oi** (open interest). Markets with **higher v24 and oi** tend to have more trading interest, tighter price discovery, and better odds of moving to a fair price and exiting without getting stuck in a dead tape. When headline fit is similar between tickers, **prefer more active markets** (higher v24 / oi). Candidates with all zeros are not passed to you—the list is already filtered to markets with some activity.

Headline: ${JSON.stringify(itemContent)}

Curated open markets (choose suggestedTicker from "t" only, or leave empty if none fit):
${candidatesJson}

Signals passed to you (do not ignore them, but you make the final decision):
- confidenceScore: ${ctx.confidenceScore} (0–100, from historical RSS source quality — not a prediction of this headline)
- feedWeight: ${ctx.feedWeight.toFixed(2)} (relative priority of this feed)
- tradingBootstrap: ${ctx.tradingBootstrap} (few rated closed trades yet; be appropriately cautious if true)
- **availableBalance (cash before this trade): ${ctx.availableBalance.toFixed(2)}** — size and frequency must keep the account viable; avoid bet-the-farm sizing.

Rules:
- shouldTrade: true only if you want a new simulated position **and** the trade still makes sense after fees and bankroll risk (see TOP PRIORITY above).
- Open positions are reviewed on a timer: the bot may exit early at the then-current YES mid, or hold until Kalshi settlement. Trade size and conviction can reflect whether you intend a shorter scalp or a hold-to-resolution thesis.
- suggestedTicker: must be exactly one "t" from the list, or "".
- **Trading fees (simulated Kalshi taker-style):** On each buy, cash drops by **tradeAmount + fee**, not just tradeAmount. Estimated taker fee ≈ **${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price_at_fill)**, with YES price in 0–1 (same as Kalshi’s P×(1−P) weighting: **highest near 50¢ YES**, much lower near 0¢ or 99¢). Fees are rounded up to cents. **Low-conviction or tiny-edge trades lose a visible slice to fees—skip or size smaller when expected edge does not clear fees.** Your tradeAmount limit is before fees; the server reserves headroom so notional + worst-case fee does not exceed cash.
- tradeAmount: dollars of notional to allocate from 0 up to a safe cap below availableBalance (${ctx.availableBalance.toFixed(2)}) after fee headroom, or null if shouldTrade is false. Prefer **granular** dollar amounts (not only round tens). **Do not** pick a tradeAmount that assumes zero fees. **Bias toward smaller size** when balance is modest or uncertainty is high.
- impactScore: your 0–100 view of market-moving strength of this news for the chosen market.
- sentiment: Positive | Negative | Neutral

Return ONLY valid JSON:
{ "shouldTrade": boolean, "suggestedTicker": string, "tradeAmount": number|null, "impactScore": number, "sentiment": string, "reasoning": string }`;
}
