import {
  clamp,
  defaultRecencyPriorForNewsSourceUrl,
  SOURCE_RATING_HALF_LIFE_DAYS,
  SOURCE_RATING_PRIOR_MIN_TRADES
} from "../server/config.js";
import {
  blendRecencyPrior,
  recencyWeightedRatingStatsByKey
} from "../lib/trade-ratings.js";
import { listDocs } from "../db/documents.js";

export function applyRssFetchStats(doc: any, ok: boolean) {
  const attempts = (doc.rssFetchAttempts || 0) + 1;
  const failures = (doc.rssFetchFailures || 0) + (ok ? 0 : 1);
  return {
    ...doc,
    rssFetchAttempts: attempts,
    rssFetchFailures: failures,
    rejectionRate: attempts > 0 ? Math.round((100 * failures) / attempts) : 0
  };
}

export type NewsSourceWeighted = {
  url: string;
  weight: number;
  recencyScore: number;
  rejectionRate: number;
  rssFetchAttempts: number;
  rssFetchFailures: number;
};

export async function getNewsSourcesWeighted(trades: any[]): Promise<NewsSourceWeighted[]> {
  const docs = await listDocs("news_sources");
  const docByUrl = new Map<string, any>();
  const urlList: string[] = [];
  for (const d of docs) {
    const row = d as any;
    if (row.url && typeof row.url === "string" && !String(row._id).startsWith("_design")) {
      urlList.push(row.url);
      docByUrl.set(row.url, row);
    }
  }
  const urls: string[] = [...new Set(urlList)];
  const sourceRatingStats = recencyWeightedRatingStatsByKey(trades, (t) => t.sourceUrl || null);
  return urls.map((url) => {
    const doc = docByUrl.get(url);
    const prior = defaultRecencyPriorForNewsSourceUrl(url);
    const recencyScore = blendRecencyPrior(
      sourceRatingStats.get(url),
      prior,
      SOURCE_RATING_PRIOR_MIN_TRADES
    );
    const weight = clamp(0.35 + (recencyScore / 100) * 1.9, 0.35, 2.4);
    const rssFetchAttempts = doc?.rssFetchAttempts ?? 0;
    const rssFetchFailures = doc?.rssFetchFailures ?? 0;
    const rejectionRate =
      typeof doc?.rejectionRate === "number"
        ? doc.rejectionRate
        : rssFetchAttempts > 0
          ? Math.round((100 * rssFetchFailures) / rssFetchAttempts)
          : 0;
    return { url, weight, recencyScore, rejectionRate, rssFetchAttempts, rssFetchFailures };
  });
}

export function buildPerformanceSnapshot(trades: any[], newsWeighted: NewsSourceWeighted[]) {
  const ratedClosedTrades = trades.filter(
    (trade: any) => trade.status === "CLOSED" && typeof trade.tradeRating === "number"
  );
  const sortedRatedTrades = [...ratedClosedTrades].sort(
    (a: any, b: any) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || "")
  );

  const avgRating =
    sortedRatedTrades.length > 0
      ? sortedRatedTrades.reduce((sum: number, trade: any) => sum + trade.tradeRating, 0) /
        sortedRatedTrades.length
      : 0;

  const windowSize = Math.max(3, Math.floor(sortedRatedTrades.length / 3));
  const recent = sortedRatedTrades.slice(-windowSize);
  const prior = sortedRatedTrades.slice(-windowSize * 2, -windowSize);

  const recentAvg =
    recent.length > 0
      ? recent.reduce((sum: number, trade: any) => sum + trade.tradeRating, 0) / recent.length
      : avgRating;
  const priorAvg =
    prior.length > 0
      ? prior.reduce((sum: number, trade: any) => sum + trade.tradeRating, 0) / prior.length
      : recentAvg;

  const sourceScores = newsWeighted.map((source) => ({
    sourceUrl: source.url,
    weight: Number(source.weight.toFixed(2)),
    score: Number(source.recencyScore.toFixed(2)),
    rejectionRate: source.rejectionRate,
    rssFetchAttempts: source.rssFetchAttempts,
    rssFetchFailures: source.rssFetchFailures
  }));

  return {
    avgRating: Number(avgRating.toFixed(2)),
    recentAvgRating: Number(recentAvg.toFixed(2)),
    priorAvgRating: Number(priorAvg.toFixed(2)),
    ratingDelta: Number((recentAvg - priorAvg).toFixed(2)),
    ratedTradeCount: sortedRatedTrades.length,
    sourceScores,
    sourceRatingHalfLifeDays: SOURCE_RATING_HALF_LIFE_DAYS
  };
}
