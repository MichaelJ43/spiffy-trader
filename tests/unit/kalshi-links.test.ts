import { describe, expect, it } from "vitest";
import {
  kalshiBrowseUrlFromTrade,
  pickEventTicker,
  pickMarketTicker,
  pickTickerLabel
} from "../../src/lib/kalshi-links.js";

describe("kalshi-links", () => {
  it("prefers event URL when eventTicker is present", () => {
    expect(
      kalshiBrowseUrlFromTrade({
        ticker: "KXFOO-BAR",
        eventTicker: "EVT-1"
      })
    ).toBe("https://kalshi.com/events/EVT-1");
  });

  it("falls back to markets URL with market ticker only", () => {
    expect(kalshiBrowseUrlFromTrade({ ticker: "KXONLY" })).toBe("https://kalshi.com/markets/KXONLY");
  });

  it("encodes tickers for URL", () => {
    expect(kalshiBrowseUrlFromTrade({ eventTicker: "EVT TEST" })).toBe(
      "https://kalshi.com/events/EVT%20TEST"
    );
  });

  it("returns null when no identifiers", () => {
    expect(kalshiBrowseUrlFromTrade({})).toBeNull();
  });

  it("pickMarketTicker uses suggestedTicker fallback", () => {
    expect(pickMarketTicker({ suggestedTicker: "SUG" })).toBe("SUG");
  });

  it("pickEventTicker reads snake_case", () => {
    expect(pickEventTicker({ event_ticker: "E1" })).toBe("E1");
  });

  it("pickTickerLabel combines sensibly", () => {
    expect(pickTickerLabel({ ticker: "T1" })).toBe("T1");
    expect(pickTickerLabel({ eventTicker: "E1" })).toBe("E1");
    expect(pickTickerLabel({})).toBe("market");
  });
});
