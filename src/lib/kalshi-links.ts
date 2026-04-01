/**
 * Kalshi web URLs: the public site routes by event ticker more reliably than bare
 * `/markets/{ticker}` (which may 404 or require extra path segments). Prefer event
 * page when we know `eventTicker`; otherwise fall back to `/markets/{ticker}`.
 */
const KALSHI_ORIGIN = "https://kalshi.com";

export function pickMarketTicker(trade: { ticker?: unknown; suggestedTicker?: unknown }): string {
  const t =
    (typeof trade.ticker === "string" && trade.ticker.trim()) ||
    (typeof trade.suggestedTicker === "string" && trade.suggestedTicker.trim()) ||
    "";
  return t;
}

export function pickEventTicker(trade: {
  eventTicker?: unknown;
  event_ticker?: unknown;
}): string {
  const t =
    (typeof trade.eventTicker === "string" && trade.eventTicker.trim()) ||
    (typeof trade.event_ticker === "string" && trade.event_ticker.trim()) ||
    "";
  return t;
}

export function pickTickerLabel(trade: {
  ticker?: unknown;
  suggestedTicker?: unknown;
  eventTicker?: unknown;
  event_ticker?: unknown;
}): string {
  return pickMarketTicker(trade) || pickEventTicker(trade) || "market";
}

export function kalshiBrowseUrlFromTrade(trade: {
  ticker?: unknown;
  suggestedTicker?: unknown;
  eventTicker?: unknown;
  event_ticker?: unknown;
}): string | null {
  const marketTicker = pickMarketTicker(trade);
  const eventTicker = pickEventTicker(trade);
  if (!marketTicker && !eventTicker) return null;
  if (eventTicker) {
    return `${KALSHI_ORIGIN}/events/${encodeURIComponent(eventTicker)}`;
  }
  return `${KALSHI_ORIGIN}/markets/${encodeURIComponent(marketTicker)}`;
}
