import { discoverNewSources } from "../ai/source-discovery.js";
import { generateJsonWithLlm } from "../ai/llm-json.js";
import { getGeminiClient } from "../ai/gemini.js";
import { couchRequest, upsertStatus } from "../db/couch.js";
import { listDocs } from "../db/documents.js";
import {
  blendRecencyPrior,
  getReasoningKey,
  recencyWeightedRatingStatsByKey
} from "../lib/trade-ratings.js";
import { checkOllamaReachable } from "../ollama/embed.js";
import { getNewsSourcesWeighted } from "../performance/news-sources.js";
import { findRelatedNewsStories } from "../news/related-stories.js";
import {
  applyRssFetchFailureWithBackoff,
  applyRssFetchSuccessWithBackoff,
  planRssFetchAttempt
} from "../rss/backoff.js";
import { fetchRssFeed } from "../rss/fetch.js";
import { curateMarketsForNews } from "../kalshi/curate.js";
import { ensureKalshiMarketsCache } from "../kalshi/cache.js";
import { kalshiOpenMarketsCache } from "../kalshi/market-state.js";
import { buildKalshiTradeDecisionPrompt } from "../kalshi/prompts.js";
import {
  estimateKalshiTakerFeeUsd,
  maxAffordableNotionalWorstCase
} from "../kalshi/fees.js";
import { executeTradeOnPlatform, resolveTrades } from "../trading/platform.js";
import {
  clamp,
  KALSHI_CURATED_MARKETS_FOR_LLM,
  MONITOR_MIN_PERIOD_MS,
  MONITOR_POST_LOOP_MS,
  OLLAMA_URL,
  OLLAMA_MODEL,
  SOURCE_RATING_PRIOR_MIN_TRADES,
  TRADE_BOOTSTRAP_UNTIL_RATED
} from "./config.js";
import { applyPortfolioDepletionIfNeeded } from "./portfolio-halt.js";
import { botStatus, monitorLoopBusy, setMonitorLoopBusy } from "./state.js";

export async function monitorAndTrade() {
  if (botStatus.portfolioHalted) {
    console.log(
      "Spiffy Trader: trading halted (portfolio depleted). No RSS/LLM until POST /api/trading/resume."
    );
    return;
  }
  if (monitorLoopBusy) {
    console.log("Spiffy Trader: monitor loop already running, skipping duplicate start.");
    return;
  }
  setMonitorLoopBusy(true);
  const monitorLoopStartedAt = Date.now();
  console.log("Spiffy Trader: Monitoring news feeds...");

  const currentAi = getGeminiClient();

  try {
    const ollamaReachable = await checkOllamaReachable();
    if (ollamaReachable) {
      console.log(`AI: Ollama first (${OLLAMA_URL}, ${OLLAMA_MODEL}); Gemini ${currentAi ? "backup" : "off"}`);
    } else {
      console.log(`AI: Ollama unreachable at ${OLLAMA_URL}; ${currentAi ? "using Gemini only" : "no LLM configured"}`);
    }

    await resolveTrades();
    if (await applyPortfolioDepletionIfNeeded()) {
      botStatus.lastUpdate = new Date().toISOString();
      await upsertStatus(botStatus);
      return;
    }

    const historicalTrades = await listDocs("trades");
    const newsSources = await getNewsSourcesWeighted(historicalTrades);
    const reasoningRatingStats = recencyWeightedRatingStatsByKey(historicalTrades, (t) =>
      getReasoningKey(t.reasoning || "") || null
    );
    const existingNews = await listDocs("news");
    const rssSourceDocsByUrl = new Map<string, any>();
    for (const d of await listDocs("news_sources")) {
      const row = d as any;
      if (row.url && typeof row.url === "string" && row._id && !String(row._id).startsWith("_design")) {
        rssSourceDocsByUrl.set(row.url, row);
      }
    }

    const sortedSources = [...newsSources].sort((a, b) => b.weight - a.weight);

    const feedResults = await Promise.all(
      sortedSources.map(async (source) => {
        const couchDoc = rssSourceDocsByUrl.get(source.url);
        const nowMs = Date.now();
        if (!couchDoc?._id) {
          try {
            const feed = await fetchRssFeed(source.url);
            return feed.items.slice(0, 2).map((item) => ({
              source: feed.title || "RSS Feed",
              sourceUrl: source.url,
              content: `${item.title}: ${item.contentSnippet || item.content}`,
              timestamp: item.pubDate || new Date().toISOString(),
              link: item.link
            }));
          } catch {
            return [];
          }
        }
        const { doc: readyDoc, shouldFetch } = planRssFetchAttempt(couchDoc, nowMs);
        if (!shouldFetch) {
          await couchRequest("PUT", `/news_sources/${readyDoc._id}`, readyDoc);
          rssSourceDocsByUrl.set(source.url, readyDoc);
          return [];
        }
        try {
          const feed = await fetchRssFeed(source.url);
          const latestItems = feed.items.slice(0, 2).map((item) => ({
            source: feed.title || "RSS Feed",
            sourceUrl: source.url,
            content: `${item.title}: ${item.contentSnippet || item.content}`,
            timestamp: item.pubDate || new Date().toISOString(),
            link: item.link
          }));
          const updated = applyRssFetchSuccessWithBackoff(readyDoc);
          await couchRequest("PUT", `/news_sources/${updated._id}`, updated);
          rssSourceDocsByUrl.set(source.url, updated);
          return latestItems;
        } catch {
          const updated = applyRssFetchFailureWithBackoff(readyDoc, nowMs);
          await couchRequest("PUT", `/news_sources/${updated._id}`, updated);
          rssSourceDocsByUrl.set(source.url, updated);
          return [];
        }
      })
    );
    const allNewsItems = feedResults.flat();

    const newItems = allNewsItems.filter((item) => !existingNews.some((n: any) => n.content === item.content));

    if (newItems.length > 0) {
      await ensureKalshiMarketsCache();
    }

    const ratedClosedCount = historicalTrades.filter(
      (t: any) => t.status === "CLOSED" && typeof t.tradeRating === "number"
    ).length;
    const tradingBootstrap =
      TRADE_BOOTSTRAP_UNTIL_RATED > 0 && ratedClosedCount < TRADE_BOOTSTRAP_UNTIL_RATED;

    let analysisCount = 0;
    let failureCount = 0;

    for (const item of newItems) {
      if (botStatus.portfolioHalted) break;

      const relatedRaw = findRelatedNewsStories(existingNews, item.content, item.timestamp);
      const relatedForPrompt = relatedRaw.map((r) => ({
        overlapPercent: r.overlapPercent,
        ageDeltaHours: Number((r.deltaMs / 3_600_000).toFixed(2)),
        source: r.source,
        excerpt: r.content.slice(0, 220)
      }));
      const relatedPersist = relatedRaw.map((r) => ({
        newsId: r.id,
        overlapPercent: r.overlapPercent,
        deltaMs: r.deltaMs
      }));

      const curatedMarkets = await curateMarketsForNews(
        item.content,
        kalshiOpenMarketsCache,
        KALSHI_CURATED_MARKETS_FOR_LLM
      );
      const allowedTickerSet = new Set(curatedMarkets.map((m) => m.ticker));
      const sourceRow = sortedSources.find((s) => s.url === item.sourceUrl);
      const sourceScore = sourceRow?.recencyScore ?? 50;
      const feedWeight = sourceRow?.weight ?? 1;

      const analysisPrompt = buildKalshiTradeDecisionPrompt(item.content, curatedMarkets, {
        confidenceScore: sourceScore,
        feedWeight,
        tradingBootstrap,
        availableBalance: Math.max(0, botStatus.cashBalance),
        relatedStories: relatedForPrompt.length > 0 ? relatedForPrompt : undefined
      });

      console.log(
        `Analyzing news from ${item.source} (Weight: ${sourceRow?.weight.toFixed(2) ?? "—"}; source confidence ${sourceScore})...`
      );
      let analysis: any = null;

      try {
        analysis = await generateJsonWithLlm(analysisPrompt, currentAi);
      } catch (e: any) {
        console.error("News trade decision: LLM failed:", e?.message || e);
        failureCount++;
      }

      if (!analysis) {
        failureCount++;
      }

      if (analysis) {
        analysisCount++;
        await couchRequest("POST", "/news", {
          ...item,
          sentiment: analysis.sentiment,
          impactScore: analysis.impactScore,
          reasoning: analysis.reasoning,
          suggestedTicker: analysis.suggestedTicker,
          shouldTrade: analysis.shouldTrade,
          tradeAmount: analysis.tradeAmount,
          sourceConfidenceScore: sourceScore,
          ...(relatedPersist.length > 0 ? { relatedStories: relatedPersist } : {})
        });

        const reasoningKey = getReasoningKey(analysis.reasoning || "");
        const reasoningScore = blendRecencyPrior(
          reasoningRatingStats.get(reasoningKey),
          50,
          SOURCE_RATING_PRIOR_MIN_TRADES
        );
        const recordConfidence = clamp(
          (Number(analysis.impactScore) || 0) * 0.6 + sourceScore * 0.25 + reasoningScore * 0.15,
          0,
          100
        );

        const wantsTrade = analysis.shouldTrade === true;
        const suggestedRaw = String(analysis.suggestedTicker ?? "").trim();
        const tickerAllowed =
          suggestedRaw !== "" && allowedTickerSet.size > 0 && allowedTickerSet.has(suggestedRaw);

        const balanceCap = Math.max(0, botStatus.cashBalance);
        const affordableCap = maxAffordableNotionalWorstCase(botStatus.cashBalance);
        const rawAmt = analysis.tradeAmount;
        let resolvedAmount: number | null = null;
        if (rawAmt !== null && rawAmt !== undefined && rawAmt !== "") {
          const n = typeof rawAmt === "number" ? rawAmt : Number(rawAmt);
          if (Number.isFinite(n)) {
            resolvedAmount = clamp(n, 0, Math.min(balanceCap, affordableCap));
          }
        }

        if (wantsTrade && !tickerAllowed) {
          const reason =
            suggestedRaw === ""
              ? "no ticker chosen"
              : `ticker "${suggestedRaw}" not in curated list`;
          console.log(
            `Skipping trade (${reason}; ${curatedMarkets.length} LLM candidates, ${kalshiOpenMarketsCache.length} open in cache).`
          );
        }

        if (wantsTrade && tickerAllowed) {
          if (resolvedAmount === null) {
            console.log("Skipping trade: shouldTrade but tradeAmount missing or invalid.");
          } else {
            const pickedMarket = curatedMarkets.find((m) => m.ticker === suggestedRaw);
            const trade = {
              id: Math.random().toString(36).substr(2, 9),
              market: "Kalshi",
              event: item.content.substring(0, 50) + "...",
              ticker: suggestedRaw,
              ...(pickedMarket?.event_ticker
                ? { eventTicker: String(pickedMarket.event_ticker) }
                : {}),
              outcome: "Yes",
              amount: Number(resolvedAmount.toFixed(2)),
              status: "OPEN",
              timestamp: new Date().toISOString(),
              reasoning: analysis.reasoning,
              sourceUrl: item.sourceUrl,
              currentPnL: 0,
              impactScore: analysis.impactScore,
              confidenceScore: Number(recordConfidence.toFixed(2)),
              sourcePerformanceScore: Number(sourceScore.toFixed(2)),
              reasoningPerformanceScore: Number(reasoningScore.toFixed(2)),
              tradeRating: null,
              triggeringNewsItems: [
                {
                  source: item.source,
                  sourceUrl: item.sourceUrl,
                  content: item.content,
                  timestamp: item.timestamp,
                  link: item.link || "",
                  impactScore: analysis.impactScore,
                  sentiment: analysis.sentiment
                }
              ]
            };

            const result = await executeTradeOnPlatform(trade);
            if (result.success) {
              const entryFeeUsd = estimateKalshiTakerFeeUsd(trade.amount, result.price);
              const totalOutlay = trade.amount + entryFeeUsd;
              if (totalOutlay > botStatus.cashBalance + 1e-6) {
                console.warn(
                  `Skipping trade ${trade.id}: need $${totalOutlay.toFixed(2)} (fee $${entryFeeUsd.toFixed(2)}) but cash $${botStatus.cashBalance.toFixed(2)}`
                );
              } else {
                await couchRequest("POST", "/trades", {
                  ...trade,
                  txHash: result.txHash,
                  price: result.price,
                  entryFeeUsd,
                  totalOutlayUsd: totalOutlay
                });
                botStatus.cashBalance -= totalOutlay;
                try {
                  await upsertStatus(botStatus);
                } catch (persistErr) {
                  console.error("Failed to persist status after trade:", persistErr);
                }
                console.log(
                  `Simulated trade ${trade.id}: notional $${trade.amount.toFixed(2)} + est. fee $${entryFeeUsd.toFixed(2)} = $${totalOutlay.toFixed(2)}`
                );
                if (await applyPortfolioDepletionIfNeeded()) break;
              }
            }
          }
        }
      } else {
        await couchRequest("POST", "/news", {
          ...item,
          sentiment: "Unknown",
          impactScore: 0,
          reasoning: "AI Analysis unavailable (Check API Key or Ollama connection).",
          ...(relatedPersist.length > 0 ? { relatedStories: relatedPersist } : {})
        });
      }
    }

    await resolveTrades();
    await applyPortfolioDepletionIfNeeded();

    if (!botStatus.portfolioHalted && Math.random() > 0.9 && (ollamaReachable || currentAi)) {
      await discoverNewSources();
    }

    botStatus.lastUpdate = new Date().toISOString();

    if (!botStatus.portfolioHalted) {
      if (botStatus.cashBalance < 20) {
        botStatus.survivalStatus = "Critical (Low Funds)";
      } else if (newItems.length > 0 && failureCount > 0 && analysisCount === 0) {
        botStatus.survivalStatus = "Degraded (LLM responses failed — check logs / timeout)";
      } else if (!ollamaReachable && !currentAi) {
        botStatus.survivalStatus = "Warning (No AI: Ollama unreachable, no Gemini key)";
      } else {
        botStatus.survivalStatus = "Healthy";
      }
    }

    await upsertStatus(botStatus);
  } catch (error) {
    console.error("Monitoring loop error:", error);
    botStatus.survivalStatus = "Error (Loop Failed)";
    botStatus.lastUpdate = new Date().toISOString();
    try {
      await upsertStatus(botStatus);
    } catch (upsertErr) {
      console.error("Failed to persist status after loop error:", upsertErr);
    }
  } finally {
    setMonitorLoopBusy(false);
    if (!botStatus.portfolioHalted) {
      const elapsedMs = Date.now() - monitorLoopStartedAt;
      const waitMs = Math.max(MONITOR_POST_LOOP_MS, MONITOR_MIN_PERIOD_MS - elapsedMs);
      setTimeout(monitorAndTrade, waitMs);
    }
  }
}
