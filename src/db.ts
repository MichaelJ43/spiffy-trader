export const localDbConfig = {
  provider: "couchdb",
  url: process.env.COUCHDB_URL || "http://localhost:5984",
  databases: {
    trades: "trades",
    news: "news",
    status: "status",
    news_sources: "news_sources",
    kalshi_markets: "kalshi_markets",
    market_watchlist: "market_watchlist"
  }
};
