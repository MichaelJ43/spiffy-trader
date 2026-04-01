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
  /**
   * UI / legacy “impact”: blend leaning on relevance (headline importance + fit).
   * Not a plain average—edge is often low on purpose and would drag the number down vs the old single score.
   */
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

/** Relevance-heavy blend so Impact stays on a similar scale to the legacy single score (edge is often conservative). */
const IMPACT_WEIGHT_RELEVANCE = 0.7;
const IMPACT_WEIGHT_EDGE = 0.3;

function deriveImpactScore(relevanceScore: number, edgeScore: number): number {
  return clampScore(
    IMPACT_WEIGHT_RELEVANCE * relevanceScore + IMPACT_WEIGHT_EDGE * edgeScore
  );
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

  // Models often echo template 0/0; if they still emit legacy impactScore, trust it.
  if (relevanceScore === 0 && edgeScore === 0 && legacyImpact > 0) {
    relevanceScore = legacyImpact;
    edgeScore = legacyImpact;
  }

  const impactScore = deriveImpactScore(relevanceScore, edgeScore);

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

/** Stable per-headline illustrative scores so the template isn't always the same pair (reduces blind copying). */
function exampleScoresFromHeadline(seed: string): { rel: number; edge: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rel = 32 + (Math.abs(h) % 49); // 32–80
  const edge = 22 + (Math.abs(h >> 16) % 54); // 22–75
  return { rel, edge };
}

function tradeDecisionJsonSchemaExample(
  hasRelated: boolean,
  headlineSeed: string,
  opts?: { zeroScores?: boolean }
): string {
  const relatedLines = hasRelated
    ? `
  "relatedNarrativeVerdict": "unclear",
  "relatedNarrativeWhatChanged": "One or two sentences: what changed vs related excerpts, or that this is largely a rehash (replace this placeholder text).",`
    : `
  "relatedNarrativeVerdict": null,
  "relatedNarrativeWhatChanged": null,`;

  const { rel: exRel, edge: exEdge } = opts?.zeroScores
    ? { rel: 0, edge: 0 }
    : exampleScoresFromHeadline(headlineSeed);
  return `{
  "scratchpad": {
    "whatTheHeadlineAsserts": "1–3 sentences: factual claims the headline makes (not your trade opinion).",
    "bestTickerRationale": "1–3 sentences: which candidate ticker best matches those claims, or why none fit.",
    "feesAndBankrollNote": "1–2 sentences: fee drag at plausible YES price + why size is safe vs available cash.",
    "whyNotTrading": "If shouldTrade is false: 1–3 sentences on why you are skipping. If shouldTrade is true: empty string \"\"."
  },${relatedLines}
  "relevanceScore": ${exRel},
  "edgeScore": ${exEdge},
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
  const hasRelated = false;

  if (curated.length === 0) {
    return `You are deciding whether a simulated Kalshi trade should open from this headline. No candidate markets are loaded.

Headline: ${JSON.stringify(itemContent)}

Context: confidenceScore=${ctx.confidenceScore} (RSS source track record only), tradingBootstrap=${ctx.tradingBootstrap}, availableBalance=${ctx.availableBalance.toFixed(2)} (cash before fees). Buys also pay an estimated Kalshi-style taker fee ~ ${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price).

**Priority:** The simulation ends badly if cash hits zero—you must NOT run out of money. With no markets here, do not trade.

Return JSON only with the full schema below. Use relevanceScore 0, edgeScore 0, shouldTrade false, empty suggestedTicker, tradeAmount null, scratchpad filled honestly, and set reasoning to state that no candidate markets are available (e.g. "No markets available.").

${tradeDecisionJsonSchemaExample(hasRelated, itemContent, { zeroScores: true })}`;
  }

  const candidatesPayload = curated.map((m) => ({
    t: m.ticker,
    d: (m.title || "").slice(0, 220)
  }));
  const candidatesJson = JSON.stringify(candidatesPayload);

  return `You are the trading agent for a Kalshi simulation. You must decide whether to open a YES position and how large, using ONLY the evidence below.

**TOP PRIORITY — DO NOT RUN OUT OF MONEY:** The bot halts if portfolio value collapses; going to ~$0 is a failure mode you must actively avoid. Treat **capital preservation** as more important than squeezing every headline for action. Prefer **shouldTrade: false** or **small tradeAmount** when edge is unclear, fees eat the trade, or available cash is low (${ctx.availableBalance.toFixed(2)}). Never behave as if you have unlimited bankroll—leave a **cash buffer** (do not deploy everything on one headline unless conviction and edge are exceptionally strong). If in doubt, **skip the trade.**

Headline: ${JSON.stringify(itemContent)}

Curated open markets (choose suggestedTicker from "t" only, or leave empty if none fit):
${candidatesJson}

Signals passed to you (do not ignore them, but you make the final decision):
- confidenceScore: ${ctx.confidenceScore} (0–100, from historical RSS source quality — not a prediction of this headline)
- feedWeight: ${ctx.feedWeight.toFixed(2)} (relative priority of this feed)
- tradingBootstrap: ${ctx.tradingBootstrap} (few rated closed trades yet; be appropriately cautious if true)
- **availableBalance (cash before this trade): ${ctx.availableBalance.toFixed(2)}** — size and frequency must keep the account viable; avoid bet-the-farm sizing.

Scores (0–100 integers):
- **relevanceScore**: how **material** the headline is for the **best-matching** candidate contract—importance of the news **plus** how well it maps to that market (wrong ticker → low even if the headline is loud). Calibrate like the old single “impact” for UX: consequential stories that clearly tie to a listed market are usually **~40–85**; only weak or off-topic fits belong below **~30**.
- **edgeScore**: conditional on relevance, how much **actionable** mispricing vs likely consensus / Kalshi YES. This is often **lower** than relevance when the move is priced in, fees dominate edge, or the narrative is stale—**that is expected** and does not force relevance down.
- **Do not** copy numbers from the JSON template below. **relevanceScore** and **edgeScore** must reflect **this** headline and your chosen ticker. Use **both 0** only if no candidate market fits at all; otherwise typical news has mixed scores (relevance often **mid–high**, edge varies).

Rules:
- **scratchpad**: complete all four fields before deciding. **whyNotTrading** must be non-empty when shouldTrade is false (unless you already said everything in reasoning—then a short echo is fine); use "" when shouldTrade is true.
- **relatedNarrativeVerdict** / **relatedNarrativeWhatChanged**: in this prompt there is no related-headline block—set both to null.
- shouldTrade: true only if you want a new simulated position **and** the trade still makes sense after fees and bankroll risk (see TOP PRIORITY above).
- Open positions are reviewed on a timer: the bot may exit early at the then-current YES mid, or hold until Kalshi settlement. Trade size and conviction can reflect whether you intend a shorter scalp or a hold-to-resolution thesis.
- suggestedTicker: must be exactly one "t" from the list, or "".
- **Trading fees (simulated Kalshi taker-style):** On each buy, cash drops by **tradeAmount + fee**, not just tradeAmount. Estimated taker fee ≈ **${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price_at_fill)**, with YES price in 0–1 (same as Kalshi’s P×(1−P) weighting: **highest near 50¢ YES**, much lower near 0¢ or 99¢). Fees are rounded up to cents. **Low-conviction or tiny-edge trades lose a visible slice to fees—skip or size smaller when expected edge does not clear fees.** Your tradeAmount limit is before fees; the server reserves headroom so notional + worst-case fee does not exceed cash.
- tradeAmount: dollars of notional to allocate from 0 up to a safe cap below availableBalance (${ctx.availableBalance.toFixed(2)}) after fee headroom, or null if shouldTrade is false. Prefer **granular** dollar amounts (not only round tens). **Do not** pick a tradeAmount that assumes zero fees. **Bias toward smaller size** when balance is modest or uncertainty is high.
- sentiment: Positive | Negative | Neutral
- reasoning: concise synthesis tying scratchpad, scores, and trade decision together.

Return ONLY valid JSON matching this shape (illustrative numbers—compute your own for this headline):
${tradeDecisionJsonSchemaExample(hasRelated, itemContent)}`;
}
