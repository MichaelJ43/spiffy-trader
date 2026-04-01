import { tokenizeForMatch } from "../lib/text-match.js";
import {
  NEWS_RELATED_LOOKBACK,
  NEWS_RELATED_MAX_DELTA_MS,
  NEWS_RELATED_MAX_LINKS,
  NEWS_RELATED_MIN_OVERLAP_PCT
} from "../server/config.js";

export type RelatedNewsMatch = {
  id: string;
  source: string;
  content: string;
  timestamp: string;
  /** Jaccard on token sets, 0–100 (proxy for “likely same story”). */
  overlapPercent: number;
  /** |newTime - oldTime| in ms. */
  deltaMs: number;
};

/** One related row + prior model decision (for prompt reuse). */
export type RelatedStoryPromptSlice = {
  overlapPercent: number;
  ageDeltaHours: number;
  source: string;
  excerpt: string;
  /** null = no analyzed decision on the stored doc yet */
  priorShouldTrade: boolean | null;
  priorSuggestedTicker: string | null;
  /** Short line summarizing last action/no-action; empty if unknown */
  priorDecisionSummary: string;
};

/**
 * Merge token-related match with Couch `news` doc fields so the LLM can reuse skip/trade context.
 */
export function buildRelatedStoryPromptSlice(
  match: RelatedNewsMatch,
  doc: any | undefined
): RelatedStoryPromptSlice {
  const excerpt = match.content.slice(0, 220);
  const ageDeltaHours = Number((match.deltaMs / 3_600_000).toFixed(2));
  let priorShouldTrade: boolean | null = null;
  let priorSuggestedTicker: string | null = null;
  let priorDecisionSummary = "";

  if (doc && typeof doc.shouldTrade === "boolean") {
    priorShouldTrade = doc.shouldTrade;
    const tick = String(doc.suggestedTicker ?? "").trim();
    priorSuggestedTicker = tick.length > 0 ? tick : null;

    if (doc.shouldTrade === true) {
      priorDecisionSummary =
        `Previously chose to trade${priorSuggestedTicker ? ` (ticker ${priorSuggestedTicker})` : ""}. ${String(doc.reasoning ?? "").trim()}`.slice(
          0,
          320
        );
    } else {
      const why = String(doc.scratchpad?.whyNotTrading ?? "").trim();
      const reasoning = String(doc.reasoning ?? "").trim();
      const body = why || reasoning;
      priorDecisionSummary = (
        body ? `Previously passed (no trade): ${body}` : "Previously passed (no trade); no detailed rationale stored."
      ).slice(0, 320);
    }
  }

  return {
    overlapPercent: match.overlapPercent,
    ageDeltaHours,
    source: match.source,
    excerpt,
    priorShouldTrade,
    priorSuggestedTicker,
    priorDecisionSummary
  };
}

function tokenOverlapPercent(a: string, b: string): number {
  const ta = tokenizeForMatch(a);
  const tb = tokenizeForMatch(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : Math.round((100 * inter) / union);
}

function parseNewsTime(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Find older (or same-window) news rows that likely describe the same developing story.
 * Uses time proximity + token Jaccard; distinct events days apart stay unlinked.
 */
export function findRelatedNewsStories(
  existingDocs: any[],
  newContent: string,
  newTimestamp: string,
  opts?: Partial<{
    maxDeltaMs: number;
    minOverlapPct: number;
    maxLinks: number;
    lookback: number;
  }>
): RelatedNewsMatch[] {
  const maxDeltaMs = opts?.maxDeltaMs ?? NEWS_RELATED_MAX_DELTA_MS;
  const minOverlapPct = opts?.minOverlapPct ?? NEWS_RELATED_MIN_OVERLAP_PCT;
  const maxLinks = opts?.maxLinks ?? NEWS_RELATED_MAX_LINKS;
  const lookback = opts?.lookback ?? NEWS_RELATED_LOOKBACK;

  const tNew = parseNewsTime(newTimestamp);
  if (!tNew || !newContent.trim()) return [];

  const withTime = existingDocs
    .filter((d) => d && d._id && typeof d.content === "string" && d.content.trim())
    .map((d) => ({ d, t: parseNewsTime(d.timestamp) }))
    .filter((x) => x.t > 0)
    .sort((a, b) => b.t - a.t)
    .slice(0, lookback);

  const scored: RelatedNewsMatch[] = [];
  for (const { d, t: tOld } of withTime) {
    const deltaMs = Math.abs(tNew - tOld);
    if (deltaMs > maxDeltaMs) continue;
    const overlapPercent = tokenOverlapPercent(newContent, d.content);
    if (overlapPercent < minOverlapPct) continue;
    scored.push({
      id: String(d._id),
      source: String(d.source ?? "Unknown"),
      content: String(d.content),
      timestamp: String(d.timestamp ?? ""),
      overlapPercent,
      deltaMs
    });
  }

  scored.sort((a, b) => b.overlapPercent - a.overlapPercent || a.deltaMs - b.deltaMs);
  return scored.slice(0, maxLinks);
}
