import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { kalshiGet } from "../../src/kalshi/client.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

describe("kalshiGet", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { markets: [{ ticker: "KXMOCK" }] }
    });
  });

  it("returns JSON data from mocked Kalshi API response", async () => {
    const data = await kalshiGet("/markets");
    expect(data.markets[0].ticker).toBe("KXMOCK");
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/markets"),
      expect.any(Object)
    );
  });
});
