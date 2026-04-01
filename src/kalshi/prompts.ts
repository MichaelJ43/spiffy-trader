import type { RelatedStoryPromptSlice } from "../news/related-stories.js";
import { KALSHI_TAKER_FEE_COEFFICIENT } from "./fees.js";
import type { KalshiMarketLite } from "./types.js";

/** @deprecated Use RelatedStoryPromptSlice; kept alias for imports */
export type RelatedStoryBrief = RelatedStoryPromptSlice;

export type TradeDecisionContext = {
  /** 0–100 heuristic from RSS source historical quality (not from the headline). */
  confidenceScore: number;
  /** Same source’s weight used for feed ordering (informational). */
  feedWeight: number;
  /** True while the bot is still bootstrapping rated trade history. */
  tradingBootstrap: boolean;
  /** Current simulated balance — max dollars allocatable on a new trade. */
  availableBalance: number;
  /**
   * Recent stored headlines with high token overlap and close timestamps (same narrative).
   * Used to avoid double-counting stale angles; a clearly new development can still justify action.
   */
  relatedStories?: RelatedStoryPromptSlice[];
};

/** Structured scratchpad inside the LLM JSON (Ollama `format: "json"` allows one object only). */
export type TradeDecisionScratchpad = {
  whatTheHeadlineAsserts: string;
  bestTickerRationale: string;
  feesAndBankrollNote: string;
  /**
   * When shouldTrade is false: 1–3 sentences on why not (priced in, weak edge, duplicate narrative, etc.).
   * When shouldTrade is true: use empty string.
   */
  whyNotTrading: string;
};

export type RelatedNarrativeVerdict = "same_narrative" | "new_fact" | "unclear";

export type NormalizedTradeDecision = {
  scratchpad: TradeDecisionScratchpad;
  relatedNarrativeVerdict: RelatedNarrativeVerdict | null;
  relatedNarrativeWhatChanged: string | null;
  relevanceScore: number;
  edgeScore: number;
  /** Average of relevance and edge for legacy fields / UI. */
  impactScore: number;
  shouldTrade: boolean;
  suggestedTicker: string;
  tradeAmount: number | null;
  sentiment: string;
  reasoning: string;
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const RELATED_VERDICTS = ["same_narrative", "new_fact", "unclear"] as const;

/**
 * Coerce LLM output into a stable shape; supports legacy `{ impactScore }` only responses.
 */
export function normalizeTradeDecisionAnalysis(raw: any): NormalizedTradeDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const sp = raw.scratchpad;
  const scratchpad: TradeDecisionScratchpad = {
    whatTheHeadlineAsserts: String(sp?.whatTheHeadlineAsserts ?? "").slice(0, 2000),
    bestTickerRationale: String(sp?.bestTickerRationale ?? "").slice(0, 2000),
    feesAndBankrollNote: String(sp?.feesAndBankrollNote ?? "").slice(0, 2000),
    whyNotTrading: String(sp?.whyNotTrading ?? "").slice(0, 2000)
  };

  const verdictRaw = raw.relatedNarrativeVerdict;
  let relatedNarrativeVerdict: RelatedNarrativeVerdict | null = null;
  if (verdictRaw != null && verdictRaw !== "") {
    relatedNarrativeVerdict = RELATED_VERDICTS.some((x) => x === verdictRaw)
      ? (verdictRaw as RelatedNarrativeVerdict)
      : "unclear";
  }

  let relatedNarrativeWhatChanged: string | null = null;
  if (raw.relatedNarrativeWhatChanged != null && raw.relatedNarrativeWhatChanged !== "") {
    relatedNarrativeWhatChanged = String(raw.relatedNarrativeWhatChanged).slice(0, 2000);
  }

  const relRaw = Number(raw.relevanceScore);
  const edgeRaw = Number(raw.edgeScore);
  const hasRel = Number.isFinite(relRaw);
  const hasEdge = Number.isFinite(edgeRaw);
  const legacyImpact = clampScore(Number(raw.impactScore));

  let relevanceScore = hasRel ? clampScore(relRaw) : 0;
  let edgeScore = hasEdge ? clampScore(edgeRaw) : 0;

  if (!hasRel && !hasEdge && legacyImpact > 0) {
    relevanceScore = legacyImpact;
    edgeScore = legacyImpact;
  } else if (!hasRel && hasEdge) {
    relevanceScore = edgeScore;
  } else if (hasRel && !hasEdge) {
    edgeScore = relevanceScore;
  }

  const impactScore = Math.round((relevanceScore + edgeScore) / 2);

  const shouldTrade = raw.shouldTrade === true;
  const suggestedTicker = String(raw.suggestedTicker ?? "").trim();
  let tradeAmount: number | null = null;
  const rawAmt = raw.tradeAmount;
  if (rawAmt !== null && rawAmt !== undefined && rawAmt !== "") {
    const n = typeof rawAmt === "number" ? rawAmt : Number(rawAmt);
    if (Number.isFinite(n)) tradeAmount = n;
  }

  const sentiment = String(raw.sentiment ?? "Neutral").trim() || "Neutral";
  let reasoning = String(raw.reasoning ?? "").slice(0, 4000);

  if (!shouldTrade && !scratchpad.whyNotTrading.trim() && reasoning.trim()) {
    scratchpad.whyNotTrading = reasoning.slice(0, 500);
  } else if (shouldTrade) {
    scratchpad.whyNotTrading = "";
  }

  return {
    scratchpad,
    relatedNarrativeVerdict,
    relatedNarrativeWhatChanged,
    relevanceScore,
    edgeScore,
    impactScore,
    shouldTrade,
    suggestedTicker,
    tradeAmount,
    sentiment,
    reasoning
  };
}

function tradeDecisionJsonSchemaExample(hasRelated: boolean): string {
  const relatedLines = hasRelated
    ? `
  "relatedNarrativeVerdict": "unclear",
  "relatedNarrativeWhatChanged": "One or two sentences: what changed vs related excerpts, or that this is largely a rehash (replace this placeholder text).",`
    : `
  "relatedNarrativeVerdict": null,
  "relatedNarrativeWhatChanged": null,`;

  return `{
  "scratchpad": {
    "whatTheHeadlineAsserts": "1–3 sentences: factual claims the headline makes (not your trade opinion).",
    "bestTickerRationale": "1–3 sentences: which candidate ticker best matches those claims, or why none fit.",
    "feesAndBankrollNote": "1–2 sentences: fee drag at plausible YES price + why size is safe vs available cash.",
    "whyNotTrading": "If shouldTrade is false: 1–3 sentences on why you are skipping. If shouldTrade is true: empty string \"\"."
  },${relatedLines}
  "relevanceScore": 0,
  "edgeScore": 0,
  "shouldTrade": false,
  "suggestedTicker": "",
  "tradeAmount": null,
  "sentiment": "Neutral",
  "reasoning": "Short final rationale (tie scratchpad + scores to shouldTrade and size)."
}`;
}

/**
 * One LLM call: structured scratchpad, narrative disambiguation, relevance/edge scores, then trade fields.
 * Server enforces curated tickers and clamps size to [0, availableBalance].
 */
export function buildKalshiTradeDecisionPrompt(
  itemContent: string,
  curated: KalshiMarketLite[],
  ctx: TradeDecisionContext
): string {
  const hasRelated = Boolean(ctx.relatedStories && ctx.relatedStories.length > 0);

  if (curated.length === 0) {
    return `You are deciding whether a simulated Kalshi trade should open from this headline. No candidate markets are loaded.

Headline: ${JSON.stringify(itemContent)}

Context: confidenceScore=${ctx.confidenceScore} (RSS source track record only), tradingBootstrap=${ctx.tradingBootstrap}, availableBalance=${ctx.availableBalance.toFixed(2)} (cash before fees). Buys also pay an estimated Kalshi-style taker fee ~ ${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price).

**Priority:** The simulation ends badly if cash hits zero—you must NOT run out of money. With no markets here, do not trade.

Return ONE JSON object only (no markdown). Fill every key exactly like the shape below. Use null only where shown.

${tradeDecisionJsonSchemaExample(false)}`;
  }

  const candidatesPayload = curated.map((m) => ({
    t: m.ticker,
    d: (m.title || "").slice(0, 220),
    v24: m.volume_24h ?? 0,
    vol: m.volume ?? 0,
    oi: m.open_interest ?? 0
  }));
  const candidatesJson = JSON.stringify(candidatesPayload);

  const relatedBlock = hasRelated
    ? `

**Possibly related headlines already in memory** (token overlap % and hours apart — these are heuristics, not ground truth). Each item may include **priorShouldTrade**, **priorSuggestedTicker**, and **priorDecisionSummary**: reuse that context so you do not contradict a recent pass without a **new_fact**, and do not re-buy the same stale thesis unless something material changed.
${JSON.stringify(ctx.relatedStories)}

You **must** set \`relatedNarrativeVerdict\` and \`relatedNarrativeWhatChanged\`:
- **same_narrative**: same story thread with no material new fact that would change a fair price; usually dampen **edgeScore**.
- **new_fact**: a clear incremental development vs the related excerpts; **edgeScore** may be higher if the market likely has not fully adjusted.
- **unclear**: cannot tell — be conservative on **edgeScore** and often **shouldTrade: false**.
`
    : "";

  return `You are the trading agent for a Kalshi simulation. You must decide whether to open a YES position and how large, using ONLY the evidence below.

Work **stepwise inside the JSON**: fill \`scratchpad\` first (factual and cautious; **whyNotTrading** when skipping), then narrative verdict fields (if applicable), then **relevanceScore** and **edgeScore**, then \`shouldTrade\` / \`suggestedTicker\` / \`tradeAmount\` / \`sentiment\` / \`reasoning\`. The server only accepts valid JSON — your entire reply must be one JSON object.

**TOP PRIORITY — DO NOT RUN OUT OF MONEY:** The bot halts if portfolio value collapses; going to ~$0 is a failure mode you must actively avoid. Treat **capital preservation** as more important than squeezing every headline for action. Prefer **shouldTrade: false** or **small tradeAmount** when edge is unclear, fees eat the trade, or available cash is low (${ctx.availableBalance.toFixed(2)}). Never behave as if you have unlimited bankroll—leave a **cash buffer** (do not deploy everything on one headline unless conviction and edge are exceptionally strong). If in doubt, **skip the trade.**

**Market activity:** Each candidate includes **v24** (24h volume, contracts), **vol** (lifetime volume), and **oi** (open interest). Markets with **higher v24 and oi** tend to have more trading interest, tighter price discovery, and better odds of moving to a fair price and exiting without getting stuck in a dead tape. When headline fit is similar between tickers, **prefer more active markets** (higher v24 / oi). Candidates with all zeros are not passed to you—the list is already filtered to markets with some activity.
${relatedBlock}

Headline: ${JSON.stringify(itemContent)}

Curated open markets (choose suggestedTicker from "t" only, or leave empty if none fit):
${candidatesJson}

Signals passed to you (do not ignore them, but you make the final decision):
- confidenceScore: ${ctx.confidenceScore} (0–100, from historical RSS source quality — not a prediction of this headline)
- feedWeight: ${ctx.feedWeight.toFixed(2)} (relative priority of this feed)
- tradingBootstrap: ${ctx.tradingBootstrap} (few rated closed trades yet; be appropriately cautious if true)
- **availableBalance (cash before this trade): ${ctx.availableBalance.toFixed(2)}** — size and frequency must keep the account viable; avoid bet-the-farm sizing.

Scores (0–100 integers):
- **relevanceScore**: how well the headline maps to the **chosen** market contract (wrong ticker → low even if the headline is loud).
- **edgeScore**: conditional on relevance, how much **actionable** mispricing vs likely market consensus / Kalshi YES (not just “news is big”). Use **low edge** if the information is probably priced in or redundant (**same_narrative**).

Rules:
- shouldTrade: true only if you want a new simulated position **and** the trade still makes sense after fees and bankroll risk (see TOP PRIORITY above). High **relevanceScore** alone is not enough — need **edgeScore** that clears fees and uncertainty.
- Open positions are reviewed on a timer: the bot may exit early at the then-current YES mid, or hold until Kalshi settlement. Trade size and conviction can reflect whether you intend a shorter scalp or a hold-to-resolution thesis.
- suggestedTicker: must be exactly one "t" from the list, or "".
- **Trading fees (simulated Kalshi taker-style):** On each buy, cash drops by **tradeAmount + fee**, not just tradeAmount. Estimated taker fee ≈ **${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price_at_fill)**, with YES price in 0–1 (same as Kalshi’s P×(1−P) weighting: **highest near 50¢ YES**, much lower near 0¢ or 99¢). Fees are rounded up to cents. **Low edge trades lose to fees—skip or size smaller.** Your tradeAmount limit is before fees; the server reserves headroom so notional + worst-case fee does not exceed cash.
- tradeAmount: dollars of notional to allocate from 0 up to a safe cap below availableBalance (${ctx.availableBalance.toFixed(2)}) after fee headroom, or null if shouldTrade is false. Prefer **granular** dollar amounts (not only round tens). **Do not** pick a tradeAmount that assumes zero fees. **Bias toward smaller size** when balance is modest or uncertainty is high.
- scratchpad.whyNotTrading: required **non-empty** string when \`shouldTrade\` is false (clear skip reason for future context). Must be **\"\"** when \`shouldTrade\` is true.
- sentiment: Positive | Negative | Neutral

Return ONE JSON object only, matching this shape (values are examples — replace with your judgment):

${tradeDecisionJsonSchemaExample(hasRelated)}`;
}
