import { format } from "date-fns";

/** Must match default in `src/server/state.ts` (starting cash before any trades). */
export const DEFAULT_STARTING_CASH_USD = 250;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Match `estimateKalshiTakerFeeUsd` when entry fee not stored on the trade doc. */
function estimatedEntryFeeUsd(amount: number, yesPrice01: number): number {
  const a = Math.max(0, amount);
  if (a <= 0) return 0;
  const coeff = 0.07;
  const p = clamp(Number(yesPrice01) || 0.5, 0.01, 0.99);
  const rawUsd = coeff * a * (1 - p);
  return Math.ceil(rawUsd * 100) / 100;
}

function entryOutlayUsd(trade: any): number {
  const amount = Number(trade.amount) || 0;
  const price = Number(trade.price) || 0.5;
  if (typeof trade.totalOutlayUsd === "number" && Number.isFinite(trade.totalOutlayUsd)) {
    return Math.max(0, trade.totalOutlayUsd);
  }
  const fee =
    typeof trade.entryFeeUsd === "number" && Number.isFinite(trade.entryFeeUsd)
      ? trade.entryFeeUsd
      : estimatedEntryFeeUsd(amount, price);
  return amount + fee;
}

export type PortfolioPoint = { ts: number; value: number };

/**
 * Replay trades in chronological order: portfolio ≈ cash + cost basis of open positions.
 * CLOSED trades apply entry and exit in one step (close time is not stored on docs).
 */
export function buildPortfolioValueSeries(trades: unknown[]): PortfolioPoint[] {
  const sorted = [...trades].sort(
    (a: any, b: any) => Date.parse(a.timestamp || "") - Date.parse(b.timestamp || "")
  );
  let cash = DEFAULT_STARTING_CASH_USD;
  let holdings = 0;
  const points: PortfolioPoint[] = [];

  for (const raw of sorted) {
    const t = raw as Record<string, unknown>;
    const ts = Date.parse(String(t.timestamp || ""));
    if (!Number.isFinite(ts)) continue;

    const amount = Number(t.amount) || 0;
    const outlay = entryOutlayUsd(t);
    const status = String(t.status || "").toUpperCase();

    if (status === "OPEN") {
      cash -= outlay;
      holdings += amount;
    } else if (status === "CLOSED") {
      const pnl = Number(t.pnl);
      cash -= outlay;
      cash += amount + (Number.isFinite(pnl) ? pnl : 0);
    } else {
      continue;
    }

    const value = cash + holdings;
    points.push({ ts, value });
  }

  return points;
}

export type ChartWindow = "1h" | "3h" | "6h" | "12h" | "1d" | "5d" | "1mo" | "lifetime";

export const CHART_WINDOW_OPTIONS: { id: ChartWindow; label: string; ms: number | null }[] = [
  { id: "1h", label: "1H", ms: 60 * 60 * 1000 },
  { id: "3h", label: "3H", ms: 3 * 60 * 60 * 1000 },
  { id: "6h", label: "6H", ms: 6 * 60 * 60 * 1000 },
  { id: "12h", label: "12H", ms: 12 * 60 * 60 * 1000 },
  { id: "1d", label: "1D", ms: 24 * 60 * 60 * 1000 },
  { id: "5d", label: "5D", ms: 5 * 24 * 60 * 60 * 1000 },
  { id: "1mo", label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "lifetime", label: "All", ms: null }
];

function dedupeByTs(points: PortfolioPoint[]): PortfolioPoint[] {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const out: PortfolioPoint[] = [];
  for (const p of sorted) {
    if (out.length && out[out.length - 1].ts === p.ts) {
      out[out.length - 1] = p;
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * Windowed series: flat carry from last point before cutoff, trade points inside window, live value at `nowMs`.
 */
export function slicePortfolioSeriesForWindow(
  seriesAsc: PortfolioPoint[],
  windowMs: number | null,
  nowMs: number,
  livePortfolioValue: number
): PortfolioPoint[] {
  if (windowMs === null) {
    if (seriesAsc.length === 0) {
      return [
        { ts: nowMs - 1, value: livePortfolioValue },
        { ts: nowMs, value: livePortfolioValue }
      ];
    }
    const first = seriesAsc[0];
    const out: PortfolioPoint[] = [{ ts: first.ts - 1, value: DEFAULT_STARTING_CASH_USD }];
    out.push(...seriesAsc.map((p) => ({ ...p })));
    out.push({ ts: nowMs, value: livePortfolioValue });
    return dedupeByTs(out);
  }

  const cutoff = nowMs - windowMs;

  if (seriesAsc.length === 0) {
    return dedupeByTs([
      { ts: cutoff, value: livePortfolioValue },
      { ts: nowMs, value: livePortfolioValue }
    ]);
  }

  const strictlyBefore = seriesAsc.filter((p) => p.ts < cutoff);
  const startVal =
    strictlyBefore.length > 0
      ? strictlyBefore[strictlyBefore.length - 1].value
      : DEFAULT_STARTING_CASH_USD;

  const out: PortfolioPoint[] = [{ ts: cutoff, value: startVal }];
  for (const p of seriesAsc) {
    if (p.ts >= cutoff && p.ts <= nowMs) out.push({ ...p });
  }
  const last = out[out.length - 1];
  if (last.ts < nowMs) {
    out.push({ ts: nowMs, value: livePortfolioValue });
  } else {
    out[out.length - 1] = { ts: nowMs, value: livePortfolioValue };
  }
  return dedupeByTs(out);
}

/** Label for X axis / tooltip based on span. */
export function formatPortfolioChartTime(ts: number, windowMs: number | null): string {
  const d = new Date(ts);
  if (windowMs === null) {
    const span = Date.now() - ts;
    if (span > 120 * 24 * 60 * 60 * 1000) return format(d, "MMM d, yyyy");
    if (span > 2 * 24 * 60 * 60 * 1000) return format(d, "MMM d HH:mm");
  } else if (windowMs <= 12 * 60 * 60 * 1000) {
    return format(d, "HH:mm");
  } else if (windowMs <= 24 * 60 * 60 * 1000) {
    return format(d, "MMM d HH:mm");
  }
  return format(d, "MMM d");
}
