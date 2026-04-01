import type { RelatedStoryPromptSlice } from "../news/related-stories.js";
import { IDLE_NARRATIVE_FIRST_TIER_MINUTES } from "../server/config.js";
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
   * Hours since the **newest** simulated trade was opened (`timestamp` in DB). `null` if no trades yet.
   * Used to nudge participation upward after long quiet periods (no fixed trade quota).
   */
  hoursSinceLastTrade: number | null;
  /** OPEN positions right now. */
  openPositionCount: number;
  /** CLOSED trades that have a `tradeRating` (outcome feedback for learning). */
  ratedClosedTradeCount: number;
  /**
   * Compact view of recent closed trades (ticker, rating, PnL). Empty string if none.
   */
  recentTradeLearningSummary: string;
  /**
   * Recent stored headlines with high token overlap and close timestamps (same narrative).
   * Used to avoid double-counting stale angles; a clearly new development can still justify action.
   */
  relatedStories?: RelatedStoryPromptSlice[];
};

/**
 * Derive idle / learning fields from Couch trade docs for the LLM prompt.
 */
export function buildSimulationIdleContext(trades: any[]): Pick<
  TradeDecisionContext,
  "hoursSinceLastTrade" | "openPositionCount" | "ratedClosedTradeCount" | "recentTradeLearningSummary"
> {
  const open = trades.filter((t: any) => t.status === "OPEN");
  let maxTs = 0;
  for (const t of trades) {
    const ms = Date.parse(t.timestamp || "");
    if (Number.isFinite(ms) && ms > maxTs) maxTs = ms;
  }
  const hoursSinceLastTrade =
    trades.length === 0 || maxTs === 0 ? null : (Date.now() - maxTs) / 3_600_000;

  const ratedClosed = trades.filter(
    (t: any) => t.status === "CLOSED" && typeof t.tradeRating === "number"
  );
  const sortedClosed = [...ratedClosed].sort(
    (a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || "")
  );
  const recent = sortedClosed.slice(0, 5);
  const recentTradeLearningSummary =
    recent.length === 0
      ? ""
      : recent
          .map((t: any) => {
            const tick = String(t.ticker || "?");
            const r = t.tradeRating;
            const pnl =
              typeof t.pnl === "number" && Number.isFinite(t.pnl)
                ? `$${t.pnl.toFixed(0)}`
                : "—";
            return `${tick} rating ${r} PnL ${pnl}`;
          })
          .join(" · ");

  return {
    hoursSinceLastTrade,
    openPositionCount: open.length,
    ratedClosedTradeCount: ratedClosed.length,
    recentTradeLearningSummary
  };
}

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
  const hasRelated = Boolean(ctx.relatedStories && ctx.relatedStories.length > 0);

  if (curated.length === 0) {
    return `You are deciding whether a simulated Kalshi trade should open from this headline. No candidate markets are loaded.

Headline: ${JSON.stringify(itemContent)}

Context: confidenceScore=${ctx.confidenceScore} (RSS source track record only), tradingBootstrap=${ctx.tradingBootstrap}, availableBalance=${ctx.availableBalance.toFixed(2)} (cash before fees). Simulation activity: hoursSinceLastTrade=${ctx.hoursSinceLastTrade === null ? "null (no trades yet)" : ctx.hoursSinceLastTrade.toFixed(1)}, openPositions=${ctx.openPositionCount}, ratedClosedTrades=${ctx.ratedClosedTradeCount}. Buys also pay an estimated Kalshi-style taker fee ~ ${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price).

**Priority:** The simulation ends badly if cash hits zero—you must NOT run out of money. With no markets here, do not trade.

Return ONE JSON object only (no markdown). Use relevanceScore 0, edgeScore 0, shouldTrade false, empty suggestedTicker, tradeAmount null, scratchpad filled honestly, and set reasoning to state that no candidate markets are available (e.g. "No markets available."). Fill every key like the shape below; use null only where shown.

${tradeDecisionJsonSchemaExample(hasRelated, itemContent, { zeroScores: true })}`;
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

  const idleTier1Hours = IDLE_NARRATIVE_FIRST_TIER_MINUTES / 60;
  const idleTier2Hours = (2 * IDLE_NARRATIVE_FIRST_TIER_MINUTES) / 60;
  const idleTier3Hours = (6 * IDLE_NARRATIVE_FIRST_TIER_MINUTES) / 60;
  const h = ctx.hoursSinceLastTrade;
  const idleNarrative =
    h == null
      ? "You have **not opened any position yet**—outcome learning (trade ratings) only accrues after you take **measured** risk when a ticker fits."
      : h >= idleTier3Hours
        ? "It has been **roughly three hours or more** since the last new position—actively ask whether repeated **pass** decisions are **too risk-averse** for a learning sim (still never reckless)."
        : h >= idleTier2Hours
          ? "**Several hours** without a new open—bias slightly toward **shouldTrade: true** with **modest size** when relevance is solid and fees allow, instead of holding out for perfect edge."
          : h >= idleTier1Hours
            ? "**About an hour or less** without a new open—lean slightly toward **shouldTrade: true** with **modest size** when fit is plausible and fees allow."
            : "Recent trading activity—**do not** force a trade; staying flat is fine when the thesis is weak.";

  const learningLine =
    ctx.recentTradeLearningSummary.trim() === ""
      ? "No rated closed trades yet (ratings appear after exits)."
      : `Recent closed (newest first, for calibration): ${ctx.recentTradeLearningSummary}`;

  return `You are the trading agent for a Kalshi simulation. You must decide whether to open a YES position and how large, using ONLY the evidence below.

Work **stepwise inside the JSON**: fill \`scratchpad\` first (factual and cautious; **whyNotTrading** when skipping), then narrative verdict fields (if applicable), then **relevanceScore** and **edgeScore**, then \`shouldTrade\` / \`suggestedTicker\` / \`tradeAmount\` / \`sentiment\` / \`reasoning\`. The server only accepts valid JSON — your entire reply must be one JSON object.

**TOP PRIORITY — DO NOT RUN OUT OF MONEY:** The bot halts if portfolio value collapses; going to ~$0 is a failure mode you must actively avoid. Treat **capital preservation** as more important than squeezing every headline for action. Prefer **shouldTrade: false** or **small tradeAmount** when edge is unclear, fees eat the trade, or available cash is low (${ctx.availableBalance.toFixed(2)}). Never behave as if you have unlimited bankroll—leave a **cash buffer** (do not deploy everything on one headline unless conviction and edge are exceptionally strong). If in doubt, **skip the trade.**

**BALANCE — participation, learning, and “quiet” periods:** This is a **learning simulation**, not a contest to minimize trade count. You receive **feedback** from **closed** trades (see \`tradeRating\` in recent history below). There is **no** daily quota or required number of trades—only the solvency rule above is hard. As **hours since the last new position** grows, you should become **more willing** to take **smaller, fee-aware** positions when headline–market fit is **plausible**, rather than waiting indefinitely for certainty. ${idleNarrative} When you **pass**, use **scratchpad.whyNotTrading** to briefly note whether **over-caution** might be a factor after a long dry spell (honest self-check, not theater). When you **trade**, \`reasoning\` can tie to what past outcomes suggest about similar theses.

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
- **hoursSinceLastTrade:** ${ctx.hoursSinceLastTrade === null ? "null (no trades opened yet)" : ctx.hoursSinceLastTrade.toFixed(1) + " h"} — longer quiet → stronger nudge to consider **modest** participation when fit is reasonable (see BALANCE above).
- **openPositionCount:** ${ctx.openPositionCount} — how many simulated positions are already open.
- **ratedClosedTradeCount:** ${ctx.ratedClosedTradeCount} — closed trades with ratings (learning signal density).
- **recentTradeLearningSummary:** ${learningLine}

Scores (0–100 integers):
- **relevanceScore**: how **material** the headline is for the **best-matching** candidate contract—importance of the news **plus** how well it maps to that market (wrong ticker → low even if the headline is loud). Calibrate like the old single “impact” for UX: consequential stories that clearly tie to a listed market are usually **~40–85**; only weak or off-topic fits belong below **~30**.
- **edgeScore**: conditional on relevance, how much **actionable** mispricing vs likely consensus / Kalshi YES. Use **low edge** if the information is probably priced in or redundant (**same_narrative**). This is often **lower** than relevance when the move is priced in, fees dominate edge, or the narrative is stale—**that is expected** and does not force relevance down.
- **Do not** copy numbers from the JSON template below. **relevanceScore** and **edgeScore** must reflect **this** headline and your chosen ticker. Use **both 0** only if no candidate market fits at all; otherwise typical news has mixed scores (relevance often **mid–high**, edge varies).

Rules:
- **scratchpad**: complete all four fields before deciding. **whyNotTrading** must be non-empty when shouldTrade is false (unless you already said everything in reasoning—then a short echo is fine); use "" when shouldTrade is true.
- **relatedNarrativeVerdict** / **relatedNarrativeWhatChanged**: if there is **no** “Possibly related headlines” section above, set both to **null**. If that section **is** present, set verdict and what-changed per its instructions (do not leave them null).
- shouldTrade: true only if you want a new simulated position **and** the trade still makes sense after fees and bankroll risk (see TOP PRIORITY above). High **relevanceScore** alone is not enough — need **edgeScore** that clears fees and uncertainty—but if **hoursSinceLastTrade** is very large and edge is **merely uncertain** (not zero), prefer **small** size over another reflex **pass** when the market maps cleanly to the headline.
- Open positions are reviewed on a timer: the bot may exit early at the then-current YES mid, or hold until Kalshi settlement. Trade size and conviction can reflect whether you intend a shorter scalp or a hold-to-resolution thesis.
- suggestedTicker: must be exactly one "t" from the list, or "".
- **Trading fees (simulated Kalshi taker-style):** On each buy, cash drops by **tradeAmount + fee**, not just tradeAmount. Estimated taker fee ≈ **${(KALSHI_TAKER_FEE_COEFFICIENT * 100).toFixed(2)}% × tradeAmount × (1 − YES_price_at_fill)**, with YES price in 0–1 (same as Kalshi’s P×(1−P) weighting: **highest near 50¢ YES**, much lower near 0¢ or 99¢). Fees are rounded up to cents. **Low edge trades lose to fees—skip or size smaller.** Your tradeAmount limit is before fees; the server reserves headroom so notional + worst-case fee does not exceed cash.
- tradeAmount: dollars of notional to allocate from 0 up to a safe cap below availableBalance (${ctx.availableBalance.toFixed(2)}) after fee headroom, or null if shouldTrade is false. Prefer **granular** dollar amounts (not only round tens). **Do not** pick a tradeAmount that assumes zero fees. **Bias toward smaller size** when balance is modest or uncertainty is high.
- sentiment: Positive | Negative | Neutral
- reasoning: concise synthesis tying scratchpad, scores, and trade decision together.

Return ONE JSON object only, matching this shape. **Replace every example string and number** (including **relevanceScore** and **edgeScore**) with values derived from the headline above—not literal copies of the template.

${tradeDecisionJsonSchemaExample(hasRelated, itemContent)}`;
}
