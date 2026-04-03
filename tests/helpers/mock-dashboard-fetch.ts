import { vi } from "vitest";

export type DashboardFetchMockOptions = {
  newsItems?: unknown[];
  trades?: unknown[];
};

/** Minimal JSON responses so Dashboard can mount without a running server. */
export function createDashboardFetchMock(options?: DashboardFetchMockOptions) {
  const newsItems = options?.newsItems ?? [];
  const trades = options?.trades ?? [];

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/status")) {
      return new Response(
        JSON.stringify({
          cashBalance: 250,
          survivalStatus: "Healthy",
          lastUpdate: new Date().toISOString(),
          totalPnL: 0,
          portfolioHalted: false,
          totalPortfolioValue: 250,
          holdingsValue: 0,
          aiInitialized: true,
          aiProvider: "Test",
          ollamaReachable: true,
          geminiConfigured: false
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/api/trades")) {
      return new Response(JSON.stringify(trades), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.includes("/api/news")) {
      return new Response(JSON.stringify(newsItems), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.includes("/api/trigger") && init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.includes("/api/performance-model")) {
      return new Response(
        JSON.stringify({ avgRating: 50, ratingDelta: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("not found", { status: 404 });
  });
}
