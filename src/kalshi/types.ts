export type KalshiMarketLite = {
  ticker: string;
  title: string;
  event_ticker?: string;
  /** Contracts traded in the last 24h (Kalshi list/detail API). */
  volume_24h?: number;
  /** Lifetime volume when provided. */
  volume?: number;
  /** Open interest (contracts). */
  open_interest?: number;
};
