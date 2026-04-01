import { describe, expect, it } from "vitest";
import {
  kalshiMarketLiteFromListApiRow,
  marketHasObservableActivity,
  parseKalshiOptionalNumber
} from "../../src/kalshi/activity.js";

describe("parseKalshiOptionalNumber", () => {
  it("returns undefined for missing or invalid", () => {
    expect(parseKalshiOptionalNumber(undefined)).toBeUndefined();
    expect(parseKalshiOptionalNumber("x")).toBeUndefined();
  });
  it("parses finite numbers", () => {
    expect(parseKalshiOptionalNumber(42)).toBe(42);
    expect(parseKalshiOptionalNumber("10")).toBe(10);
  });
});

describe("marketHasObservableActivity", () => {
  it("returns true when all activity fields are absent (legacy rows)", () => {
    expect(marketHasObservableActivity({ ticker: "X", title: "t" })).toBe(true);
  });
  it("returns false when all present metrics are zero", () => {
    expect(
      marketHasObservableActivity({
        ticker: "X",
        title: "t",
        volume_24h: 0,
        volume: 0,
        open_interest: 0
      })
    ).toBe(false);
  });
  it("returns true if any metric is positive", () => {
    expect(
      marketHasObservableActivity({ ticker: "X", title: "t", volume_24h: 1, volume: 0, open_interest: 0 })
    ).toBe(true);
    expect(
      marketHasObservableActivity({ ticker: "X", title: "t", open_interest: 5 })
    ).toBe(true);
  });
});

describe("kalshiMarketLiteFromListApiRow", () => {
  it("returns null for all-zero activity", () => {
    expect(
      kalshiMarketLiteFromListApiRow({
        ticker: "Z",
        title: "z",
        volume_24h: 0,
        volume: 0,
        open_interest: 0
      })
    ).toBeNull();
  });
  it("returns lite object when activity exists", () => {
    const m = kalshiMarketLiteFromListApiRow({ ticker: "Z", title: "z", volume_24h: 3 });
    expect(m?.ticker).toBe("Z");
    expect(m?.volume_24h).toBe(3);
  });
});
