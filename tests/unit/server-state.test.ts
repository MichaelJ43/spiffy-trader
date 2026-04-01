import { describe, expect, it } from "vitest";
import { readCashFromStatusDoc, replaceBotStatus, botStatus } from "../../src/server/state.js";

describe("server state", () => {
  it("readCashFromStatusDoc prefers cashBalance", () => {
    expect(readCashFromStatusDoc({ cashBalance: 12 }, 0)).toBe(12);
  });

  it("readCashFromStatusDoc falls back to currentBalance", () => {
    expect(readCashFromStatusDoc({ currentBalance: 7 }, 99)).toBe(7);
  });

  it("readCashFromStatusDoc uses fallback", () => {
    expect(readCashFromStatusDoc({}, 3)).toBe(3);
  });

  it("replaceBotStatus mutates exported botStatus", () => {
    replaceBotStatus({
      cashBalance: 1,
      survivalStatus: "X",
      lastUpdate: "t",
      totalPnL: 0,
      portfolioHalted: false
    });
    expect(botStatus.cashBalance).toBe(1);
  });
});
