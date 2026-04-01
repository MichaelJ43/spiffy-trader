import React, { useState, useEffect, useMemo } from "react";
import { 
  TrendingUp, 
  Newspaper, 
  Activity, 
  AlertTriangle, 
  DollarSign, 
  History,
  ShieldAlert,
  Cpu,
  ExternalLink
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { kalshiBrowseUrlFromTrade, pickTickerLabel } from "../lib/kalshi-links.js";
import {
  buildPortfolioValueSeries,
  CHART_WINDOW_OPTIONS,
  formatPortfolioChartTime,
  slicePortfolioSeriesForWindow,
  type ChartWindow
} from "../lib/portfolio-series.js";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Kalshi YES mid / settlement stored as 0–1 probability */
function formatYesPrice(p: unknown): string {
  const n = Number(p);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/** 0–100 impact / relevance / edge scores stored as numbers */
function formatScorePct(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x)}%`;
}

/** Thresholds vs ~60s server monitor loop: under 90s fresh, under 3m lagging, else stale. */
function formatSyncLag(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `+${s}s`;
  return `+${m}m ${s.toString().padStart(2, "0")}s`;
}

function syncLagColorClass(lagMs: number): string {
  if (!Number.isFinite(lagMs) || lagMs < 0) return "text-white/35";
  const sec = lagMs / 1000;
  if (sec < 90) return "text-emerald-400";
  if (sec < 180) return "text-amber-400";
  return "text-red-400";
}

type DashboardProps = {
  onOpenDocs?: () => void;
};

export default function Dashboard({ onOpenDocs }: DashboardProps) {
  const [status, setStatus] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [forceSelling, setForceSelling] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  const [chartWindow, setChartWindow] = useState<ChartWindow>("1d");

  const fetchData = async () => {
    try {
      const [statusRes, tradesRes, newsRes, perfRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/trades"),
        fetch("/api/news"),
        fetch("/api/performance-model")
      ]);
      
      if (!statusRes.ok || !tradesRes.ok || !newsRes.ok || !perfRes.ok) {
        throw new Error("One or more API requests failed");
      }

      const statusData = await statusRes.json();
      const tradesData = await tradesRes.json();
      const newsData = await newsRes.json();
      const perfData = await perfRes.json();
      const sortedTrades = [...tradesData].sort(
        (a, b) => Date.parse(b.timestamp || "") - Date.parse(a.timestamp || "")
      );
      
      setStatus(statusData);
      setTrades(sortedTrades);
      setNews(newsData);
      setPerformance(perfData);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await fetch("/api/trigger", { method: "POST" });
      setTimeout(fetchData, 2000); // Refresh after 2s
    } catch (e) {
      console.error("Trigger failed:", e);
    } finally {
      setTimeout(() => setTriggering(false), 5000);
    }
  };

  const handleForceSellAll = async () => {
    if (
      !window.confirm(
        "Close all open positions now? Open trades will exit at the current YES mid (or settlement if already resolved)."
      )
    ) {
      return;
    }
    setForceSelling(true);
    try {
      const res = await fetch("/api/force-sell-all", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Force sell all failed:", data);
        return;
      }
      if (data.message) console.info(data.message);
      setTimeout(fetchData, 500);
    } catch (e) {
      console.error("Force sell all failed:", e);
    } finally {
      setForceSelling(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cashDisplay =
    typeof status?.cashBalance === "number"
      ? status.cashBalance
      : typeof status?.currentBalance === "number"
        ? status.currentBalance
        : 0;
  const totalPortfolioDisplay =
    typeof status?.totalPortfolioValue === "number"
      ? status.totalPortfolioValue
      : cashDisplay;

  const portfolioSeries = useMemo(() => buildPortfolioValueSeries(trades), [trades]);
  const chartWindowMs = CHART_WINDOW_OPTIONS.find((o) => o.id === chartWindow)?.ms ?? null;
  const portfolioChartData = useMemo(() => {
    const now = Date.now();
    return slicePortfolioSeriesForWindow(
      portfolioSeries,
      chartWindowMs,
      now,
      totalPortfolioDisplay
    ).map((p) => ({
      ts: p.ts,
      val: p.value
    }));
  }, [portfolioSeries, chartWindowMs, totalPortfolioDisplay, clockTick]);

  const lastUpdateParsed = status?.lastUpdate ? Date.parse(status.lastUpdate) : NaN;
  const syncLagMs = Number.isFinite(lastUpdateParsed)
    ? Math.max(0, Date.now() - lastUpdateParsed)
    : NaN;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-12 h-12 animate-pulse text-orange-500" />
          <p className="text-sm font-mono tracking-widest uppercase opacity-50">Initializing Spiffy Trader...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-sm flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-bold tracking-tighter uppercase italic">Spiffy Trader</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTrigger}
                disabled={triggering || forceSelling}
                className={cn(
                  "px-3 py-1.5 rounded-sm text-[10px] uppercase tracking-widest font-bold border transition-all",
                  triggering || forceSelling
                    ? "bg-orange-500/10 border-orange-500/20 text-orange-500/50 cursor-not-allowed"
                    : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 active:scale-95"
                )}
              >
                {triggering ? "Analyzing..." : "Force Analysis"}
              </button>
              <button
                type="button"
                onClick={handleForceSellAll}
                disabled={triggering || forceSelling}
                className={cn(
                  "px-3 py-1.5 rounded-sm text-[10px] uppercase tracking-widest font-bold border transition-all",
                  triggering || forceSelling
                    ? "bg-red-500/10 border-red-500/20 text-red-500/50 cursor-not-allowed"
                    : "bg-red-950/40 border-red-500/30 text-red-200 hover:bg-red-900/50 hover:border-red-400/40 active:scale-95"
                )}
              >
                {forceSelling ? "Selling..." : "Force sell all"}
              </button>
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-40">AI Engine</span>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", status?.aiInitialized ? "bg-green-500" : "bg-orange-500")} />
                <span className="text-sm font-mono font-bold">{status?.aiProvider}</span>
              </div>
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-40">System Status</span>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", status?.survivalStatus === "Healthy" ? "bg-green-500" : "bg-red-500")} />
                <span className="text-sm font-mono font-bold">{status?.survivalStatus}</span>
              </div>
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-40">Avg Trade Score</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold">
                  {typeof performance?.avgRating === "number" ? performance.avgRating.toFixed(1) : "--"}
                </span>
                <span className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded",
                  (performance?.ratingDelta ?? 0) >= 0 ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"
                )}>
                  {(performance?.ratingDelta ?? 0) >= 0 ? "+" : ""}
                  {typeof performance?.ratingDelta === "number" ? performance.ratingDelta.toFixed(1) : "0.0"}
                </span>
              </div>
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-40">Last Sync</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono">{format(new Date(status?.lastUpdate), "HH:mm:ss")}</span>
                <span
                  className={cn(
                    "text-[10px] font-mono font-bold tabular-nums px-2 py-0.5 rounded border border-white/10 bg-white/[0.03]",
                    syncLagColorClass(syncLagMs)
                  )}
                  title="Time since last bot status update. Green under 90s, yellow under 3 min, red after (expect ~60s loop)."
                >
                  {Number.isFinite(syncLagMs) ? formatSyncLag(syncLagMs) : "+—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            label="Portfolio value"
            value={`$${totalPortfolioDisplay.toFixed(2)}`}
            icon={<DollarSign className="w-5 h-5" />}
            subValue={
              trades.some((t) => t.status === "OPEN") && typeof status?.holdingsValue === "number"
                ? `Open positions ~$${status.holdingsValue.toFixed(2)}`
                : undefined
            }
          />
          <StatCard
            label="Cash"
            value={`$${cashDisplay.toFixed(2)}`}
            icon={<TrendingUp className="w-5 h-5" />}
            subValue="Available to allocate"
          />
          <StatCard 
            label="Active Trades" 
            value={trades.filter(t => t.status === "OPEN").length.toString()} 
            icon={<Activity className="w-5 h-5" />}
            subValue="Pending Resolution"
          />
        </div>

        {/* Charts & News Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Chart */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#111] border border-white/5 rounded-xl p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4 text-orange-500" />
                  Portfolio Performance
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {CHART_WINDOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChartWindow(opt.id)}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors border",
                        chartWindow === opt.id
                          ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                          : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[300px] w-full relative z-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolioChartData}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      stroke="#ffffff20"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(ts) =>
                        typeof ts === "number"
                          ? formatPortfolioChartTime(ts, chartWindowMs)
                          : ""
                      }
                    />
                    <YAxis
                      stroke="#ffffff20"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111", border: "1px solid #ffffff10", fontSize: "12px" }}
                      itemStyle={{ color: "#f97316" }}
                      labelFormatter={(ts) =>
                        typeof ts === "number" ? format(new Date(ts), "MMM d, yyyy HH:mm:ss") : ""
                      }
                      formatter={(value: number | string) => [`$${Number(value).toFixed(2)}`, "Portfolio"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="val"
                      stroke="#f97316"
                      fillOpacity={1}
                      fill="url(#colorVal)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Trades — z-10 so Recharts wrapper cannot intercept row clicks */}
            <div className="bg-[#111] border border-white/5 rounded-xl overflow-hidden relative z-10">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <History className="w-4 h-4 text-orange-500" />
                  Execution History
                </h2>
              </div>
              <div className="divide-y divide-white/5">
                {trades.length === 0 ? (
                  <div className="p-10 text-center opacity-30 italic text-sm">No trades executed yet...</div>
                ) : (
                  trades.map((trade) => {
                    const marketHref = kalshiBrowseUrlFromTrade(trade);
                    const rowClass =
                      "p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between group";
                    const body = (
                      <>
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 shrink-0 rounded bg-white/5 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                            <TrendingUp className="w-5 h-5 text-orange-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold flex items-center gap-1.5">
                              <span className="truncate">{trade.event}</span>
                              {marketHref ? (
                                <ExternalLink
                                  className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-70"
                                  aria-hidden
                                />
                              ) : null}
                            </div>
                            <div className="text-[10px] uppercase tracking-widest opacity-40 truncate">
                              {trade.market} • {trade.outcome}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono">
                              <span className="opacity-50">Buy</span>
                              <span className="text-white/90">{formatYesPrice(trade.price)}</span>
                              <span className="opacity-30">→</span>
                              <span className="opacity-50">Sell</span>
                              <span className="text-white/90">
                                {trade.status === "OPEN"
                                  ? "—"
                                  : formatYesPrice(trade.finalPrice)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 pl-3">
                          <div className="text-sm font-mono font-bold">${trade.amount.toFixed(2)}</div>
                          {typeof trade.entryFeeUsd === "number" && trade.entryFeeUsd > 0 && (
                            <div className="text-[10px] font-mono opacity-50">
                              + fee ${trade.entryFeeUsd.toFixed(2)}
                              {typeof trade.totalOutlayUsd === "number" && (
                                <> → ${trade.totalOutlayUsd.toFixed(2)} out</>
                              )}
                            </div>
                          )}
                          <div className="text-[10px] font-mono">
                            Score: {typeof trade.tradeRating === "number" ? trade.tradeRating.toFixed(1) : "Pending"}
                          </div>
                          <div className="text-[10px] opacity-40">{format(new Date(trade.timestamp), "MMM dd, HH:mm")}</div>
                        </div>
                      </>
                    );
                    return (
                      <div key={trade.id}>
                        {marketHref ? (
                          <a
                            href={marketHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              rowClass,
                              "text-inherit no-underline block cursor-pointer pointer-events-auto relative z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-inset"
                            )}
                            title={`Open on Kalshi (${pickTickerLabel(trade)})`}
                            aria-label={`Open Kalshi market ${pickTickerLabel(trade)} in a new tab`}
                          >
                            {body}
                          </a>
                        ) : (
                          <div className={rowClass}>{body}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* News Sidebar */}
          <div className="space-y-6">
            <div className="bg-[#111] border border-white/5 rounded-xl h-full flex flex-col">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-orange-500" />
                  News Feed
                </h2>
                <Cpu className="w-4 h-4 text-white/20" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[800px]">
                {news.length === 0 ? (
                  <div className="p-10 text-center opacity-30 italic text-sm">Monitoring news channels...</div>
                ) : (
                  news.map((item, idx) => (
                    <div key={idx} className="p-4 bg-white/5 rounded-lg border border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-orange-500/20 text-orange-500 rounded">
                          {item.source}
                        </span>
                        <span className="text-[10px] opacity-40">{format(new Date(item.timestamp), "HH:mm")}</span>
                      </div>
                      <p className="text-xs leading-relaxed opacity-80">{item.content}</p>
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              item.sentiment === "Positive"
                                ? "bg-green-500"
                                : item.sentiment === "Negative"
                                  ? "bg-red-500"
                                  : "bg-white/35"
                            )}
                          />
                          <span className="text-[10px] font-mono uppercase">{item.sentiment}</span>
                        </div>
                        <div className="text-[10px] font-mono flex items-center justify-end gap-1.5 min-w-0">
                          {Number.isFinite(Number(item.relevanceScore)) &&
                            Number.isFinite(Number(item.edgeScore)) && (
                              <>
                                <span className="text-white/45 whitespace-nowrap">
                                  Rel: {formatScorePct(item.relevanceScore)}
                                </span>
                                <span className="text-white/30 select-none" aria-hidden>
                                  ·
                                </span>
                                <span className="text-white/45 whitespace-nowrap">
                                  Edge: {formatScorePct(item.edgeScore)}
                                </span>
                                <span className="text-white/30 select-none" aria-hidden>
                                  ·
                                </span>
                              </>
                            )}
                          <span className="font-bold text-white whitespace-nowrap">
                            Impact: {formatScorePct(item.impactScore)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 opacity-30 text-[10px] uppercase tracking-[0.2em]">
          <div className="flex items-center gap-4">
            <span>© 2026 Spiffy Autonomous Systems</span>
            <div className="w-1 h-1 bg-white rounded-full" />
            <span>Local LLM Enabled</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenDocs?.()}
            className="text-[10px] uppercase tracking-[0.2em] opacity-30 hover:opacity-100 hover:text-white transition-colors"
          >
            Documentation
          </button>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, icon, trend, subValue }: any) {
  return (
    <div className="bg-[#111] border border-white/5 rounded-xl p-6 space-y-4 hover:border-orange-500/30 transition-colors group">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center group-hover:bg-orange-500/10 transition-colors">
          {React.cloneElement(icon, { className: "w-5 h-5 text-orange-500" })}
        </div>
        {trend && (
          <span className="text-[10px] font-mono text-green-500 bg-green-500/10 px-2 py-1 rounded">
            {trend}
          </span>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest opacity-40 mb-1">{label}</div>
        <div className="text-2xl font-bold font-mono">{value}</div>
        {subValue && <div className="text-[10px] opacity-30 mt-1">{subValue}</div>}
      </div>
    </div>
  );
}
