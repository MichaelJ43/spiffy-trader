import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/kalshi/client.js", () => ({
  kalshiGet: vi.fn().mockResolvedValue({
    market: {
      ticker: "KX-T",
      yes_bid_dollars: "0.45",
      yes_ask_dollars: "0.55"
    }
  })
}));

import { kalshiGet } from "../../src/kalshi/client.js";
import { getKalshiMarketData } from "../../src/kalshi/pricing.js";

describe("getKalshiMarketData", () => {
  it("delegates to kalshiGet and unwraps market", async () => {
    const m = await getKalshiMarketData("KX-T");
    expect(m?.ticker).toBe("KX-T");
    expect(kalshiGet).toHaveBeenCalled();
  });
});
