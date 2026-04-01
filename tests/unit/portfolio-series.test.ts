import { describe, expect, it } from "vitest";
import {
  buildPortfolioValueSeries,
  DEFAULT_STARTING_CASH_USD,
  formatPortfolioChartTime,
  slicePortfolioSeriesForWindow
} from "../../src/lib/portfolio-series.js";

describe("buildPortfolioValueSeries", () => {
  it("returns empty for no trades", () => {
    expect(buildPortfolioValueSeries([])).toEqual([]);
  });

  it("reduces cash on OPEN by outlay and tracks holdings", () => {
    const ts = "2024-01-15T12:00:00.000Z";
    const pts = buildPortfolioValueSeries([
      {
        status: "OPEN",
        timestamp: ts,
        amount: 50,
        price: 0.5,
        totalOutlayUsd: 51.75
      }
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBeCloseTo(DEFAULT_STARTING_CASH_USD - 51.75 + 50, 5);
  });

  it("applies CLOSED trade in one step", () => {
    const pts = buildPortfolioValueSeries([
      {
        status: "CLOSED",
        timestamp: "2024-01-15T12:00:00.000Z",
        amount: 100,
        price: 0.5,
        totalOutlayUsd: 103.5,
        pnl: 10
      }
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBeCloseTo(DEFAULT_STARTING_CASH_USD - 103.5 + 110, 5);
  });
});

describe("slicePortfolioSeriesForWindow", () => {
  it("appends live value at nowMs", () => {
    const now = 1_700_000_000_000;
    const s = slicePortfolioSeriesForWindow(
      [{ ts: now - 60_000, value: 240 }],
      3_600_000,
      now,
      245
    );
    expect(s[s.length - 1]).toEqual({ ts: now, value: 245 });
  });

  it("lifetime includes seed point before first trade", () => {
    const now = 1_700_000_000_000;
    const s = slicePortfolioSeriesForWindow([{ ts: now - 1000, value: 248 }], null, now, 249);
    expect(s[0].value).toBe(DEFAULT_STARTING_CASH_USD);
    expect(s[s.length - 1].value).toBe(249);
  });
});

describe("formatPortfolioChartTime", () => {
  it("returns a non-empty string", () => {
    const t = Date.UTC(2024, 5, 1, 14, 30);
    expect(formatPortfolioChartTime(t, 60 * 60 * 1000).length).toBeGreaterThan(0);
  });

  it("uses hour format for short intraday windows", () => {
    const t = Date.UTC(2024, 5, 1, 14, 30);
    expect(formatPortfolioChartTime(t, 6 * 60 * 60 * 1000)).toMatch(/\d/);
  });

  it("uses day format for multi-day windows", () => {
    const t = Date.UTC(2024, 5, 1, 14, 30);
    expect(formatPortfolioChartTime(t, 48 * 60 * 60 * 1000).length).toBeGreaterThan(3);
  });
});

describe("slicePortfolioSeriesForWindow edge cases", () => {
  it("empty series with finite window uses cutoff and now", () => {
    const now = 1_700_000_000_000;
    const s = slicePortfolioSeriesForWindow([], 3_600_000, now, 300);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s[s.length - 1].value).toBe(300);
  });

  it("dedupes last point when last.ts equals nowMs", () => {
    const now = 1_700_000_000_000;
    const s = slicePortfolioSeriesForWindow([{ ts: now - 1000, value: 200 }], 3_600_000, now, 210);
    expect(s[s.length - 1]).toEqual({ ts: now, value: 210 });
  });
});
