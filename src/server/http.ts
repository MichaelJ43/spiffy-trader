import express from "express";
import path from "path";
import { buildPerformanceSnapshot, getNewsSourcesWeighted } from "../performance/news-sources.js";
import { checkOllamaReachable } from "../ollama/embed.js";
import { getGeminiClient } from "../ai/gemini.js";
import { couchRequest, upsertStatus } from "../db/couch.js";
import { listDocs } from "../db/documents.js";
import { initializeDatabase } from "../db/init.js";
import { runAiExitReview } from "../ai/exit-review.js";
import { ensureKalshiMarketsCache } from "../kalshi/cache.js";
import { kalshiOpenMarketsCache } from "../kalshi/market-state.js";
import { getPositionMarketSnapshots, refreshOpenPositionMarkets } from "../kalshi/position-markets.js";
import { getActiveWatchlistTickers } from "../db/market-watchlist.js";
import { getKalshiWsStatus, syncKalshiWsOpenAndWatchlist } from "../kalshi/ws-client.js";
import {
  KALSHI_OPEN_POSITION_REFRESH_MS,
  PORT,
  PORTFOLIO_DEPLETED_THRESHOLD_USD,
  kalshiWsAuthConfigured
} from "./config.js";
import { markToMarketOpenHoldings } from "./portfolio-metrics.js";
import { getTotalPortfolioValueUsd } from "./portfolio-halt.js";
import { monitorAndTrade } from "./monitor.js";
import { forceSellAllOpenPositions } from "../trading/platform.js";
import {
  botStatus,
  readCashFromStatusDoc,
  replaceBotStatus,
  type BotStatus
} from "./state.js";

function mergeStatusFromCouchDoc(statusDoc: any): BotStatus {
  return {
    cashBalance: readCashFromStatusDoc(statusDoc, botStatus.cashBalance),
    survivalStatus: statusDoc.survivalStatus ?? botStatus.survivalStatus,
    lastUpdate: statusDoc.lastUpdate ?? botStatus.lastUpdate,
    totalPnL: statusDoc.totalPnL ?? botStatus.totalPnL,
    portfolioHalted: statusDoc.portfolioHalted === true
  };
}

export async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/status", async (_req, res) => {
    try {
      const statusDoc = await couchRequest("GET", "/status/current");
      replaceBotStatus(mergeStatusFromCouchDoc(statusDoc));
    } catch (error) {
      console.error("Failed to load status:", error);
    }

    const geminiReady = !!getGeminiClient();
    const ollamaReady = await checkOllamaReachable();
    let aiProvider: string;
    if (ollamaReady && geminiReady) {
      aiProvider = "Ollama (Gemini backup)";
    } else if (ollamaReady) {
      aiProvider = "Ollama";
    } else if (geminiReady) {
      aiProvider = "Gemini (Ollama unreachable)";
    } else {
      aiProvider = "None";
    }
    let holdingsValue = 0;
    try {
      const trades = await listDocs("trades");
      const open = trades.filter((t: any) => t.status === "OPEN");
      holdingsValue = markToMarketOpenHoldings(open, getPositionMarketSnapshots());
    } catch (e) {
      console.warn("GET /api/status: portfolio mark failed:", e);
    }
    const cashBalance = botStatus.cashBalance;
    const totalPortfolioValue = cashBalance + holdingsValue;

    res.json({
      ...botStatus,
      totalPortfolioValue,
      holdingsValue,
      aiInitialized: ollamaReady || geminiReady,
      aiProvider,
      ollamaReachable: ollamaReady,
      geminiConfigured: geminiReady,
      kalshiWs: getKalshiWsStatus()
    });
  });
  app.post("/api/trading/resume", async (req, res) => {
    try {
      const force = req.body?.force === true;
      const newCash = req.body?.cashBalance;
      if (typeof newCash === "number" && Number.isFinite(newCash)) {
        botStatus.cashBalance = Math.max(0, newCash);
      }
      if (!force) {
        const total = await getTotalPortfolioValueUsd();
        if (total <= PORTFOLIO_DEPLETED_THRESHOLD_USD) {
          return res.status(400).json({
            success: false,
            error:
              "Portfolio still at or below depletion threshold. Pass cashBalance (e.g. 250) or force:true to clear halt anyway."
          });
        }
      }
      botStatus.portfolioHalted = false;
      botStatus.survivalStatus = "Healthy";
      botStatus.lastUpdate = new Date().toISOString();
      await upsertStatus(botStatus);
      void monitorAndTrade();
      res.json({
        success: true,
        message: "Trading resumed. Monitor loop and position AI re-enabled."
      });
    } catch (e: any) {
      console.error("POST /api/trading/resume failed:", e);
      res.status(500).json({ success: false, error: e?.message || "Resume failed" });
    }
  });
  app.post("/api/trigger", async (_req, res) => {
    if (botStatus.portfolioHalted) {
      return res.status(403).json({
        success: false,
        error: "Trading halted (portfolio depleted). POST /api/trading/resume with cashBalance after funding."
      });
    }
    console.log("Manual trigger received...");
    void monitorAndTrade();
    res.json({ success: true, message: "Monitoring loop triggered" });
  });
  app.post("/api/force-sell-all", async (_req, res) => {
    try {
      const { closed, skipped } = await forceSellAllOpenPositions();
      res.json({
        success: true,
        closed,
        skipped,
        message:
          closed === 0 && skipped === 0
            ? "No open positions"
            : `Closed ${closed} position(s)${skipped ? `, skipped ${skipped}` : ""}`
      });
    } catch (e: any) {
      console.error("Force sell all failed:", e);
      res.status(500).json({ success: false, error: e?.message || "Force sell all failed" });
    }
  });
  app.get("/api/trades", async (_req, res) => {
    console.log("GET /api/trades");
    try {
      const trades = await listDocs("trades");
      const eventByMarketTicker = new Map(
        kalshiOpenMarketsCache.map((m) => [m.ticker, m.event_ticker])
      );
      res.json(
        trades.map((trade: any) => {
          const { _id, _rev, ...rest } = trade;
          const tick = String(rest.ticker || "");
          const fromCache = tick ? eventByMarketTicker.get(tick) : undefined;
          if (fromCache && rest.eventTicker == null && rest.event_ticker == null) {
            return { ...rest, eventTicker: String(fromCache) };
          }
          return rest;
        })
      );
    } catch (error) {
      console.error("Failed to load trades:", error);
      res.status(500).json({ error: "Failed to load trades" });
    }
  });
  app.get("/api/performance-model", async (_req, res) => {
    try {
      const trades = await listDocs("trades");
      const newsWeighted = await getNewsSourcesWeighted(trades);
      const snapshot = buildPerformanceSnapshot(trades, newsWeighted);
      res.json(snapshot);
    } catch (error) {
      console.error("Failed to load performance model:", error);
      res.status(500).json({ error: "Failed to load performance model" });
    }
  });
  app.get("/api/news", async (_req, res) => {
    console.log("GET /api/news");
    try {
      const news = await listDocs("news");
      news.sort((a: any, b: any) => {
        const left = Date.parse(a.timestamp || "");
        const right = Date.parse(b.timestamp || "");
        return Number.isNaN(right - left) ? 0 : right - left;
      });
      res.json(
        news.map((item: any) => {
          const { _id, _rev, ...rest } = item;
          return rest;
        })
      );
    } catch (error) {
      console.error("Failed to load news:", error);
      res.status(500).json({ error: "Failed to load news" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  await initializeDatabase();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Spiffy Trader running on http://localhost:${PORT}`);
    console.log(
      kalshiWsAuthConfigured()
        ? "Kalshi WebSocket: enabled (OPEN positions + market_watchlist tickers, within cap)."
        : "Kalshi WebSocket: off (set KALSHI_ACCESS_KEY_ID + KALSHI_PRIVATE_KEY_PATH in .env.local)."
    );
    void ensureKalshiMarketsCache();
    void monitorAndTrade();

    const positionWatchTick = async () => {
      if (botStatus.portfolioHalted) return;
      try {
        const watchTickers = await getActiveWatchlistTickers();
        const openTickers = await refreshOpenPositionMarkets(watchTickers);
        syncKalshiWsOpenAndWatchlist(openTickers, watchTickers);
        await runAiExitReview();
      } catch (e) {
        console.error("Open-position market watch failed:", e);
      }
    };
    void positionWatchTick();
    setInterval(() => void positionWatchTick(), KALSHI_OPEN_POSITION_REFRESH_MS);
  });
}
