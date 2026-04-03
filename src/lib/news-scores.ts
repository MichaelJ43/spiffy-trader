/** 0–100 scores for news/trade decision docs (aligned with `normalizeTradeDecisionAnalysis`). */

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const IMPACT_WEIGHT_RELEVANCE = 0.7;
const IMPACT_WEIGHT_EDGE = 0.3;

function deriveImpactScore(relevanceScore: number, edgeScore: number): number {
  return clampScore(
    IMPACT_WEIGHT_RELEVANCE * relevanceScore + IMPACT_WEIGHT_EDGE * edgeScore
  );
}

/**
 * Coerce relevance / edge / impact from a stored news doc or raw LLM object.
 * Use when fields may be missing (legacy rows, failure saves that only set impact).
 */
export function coerceStoredNewsScores(raw: {
  relevanceScore?: unknown;
  edgeScore?: unknown;
  impactScore?: unknown;
}): { relevanceScore: number; edgeScore: number; impactScore: number } {
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

  if (relevanceScore === 0 && edgeScore === 0 && legacyImpact > 0) {
    relevanceScore = legacyImpact;
    edgeScore = legacyImpact;
  }

  const impactScore = deriveImpactScore(relevanceScore, edgeScore);
  return { relevanceScore, edgeScore, impactScore };
}
