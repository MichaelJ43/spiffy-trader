import { resolveOllamaModelFromHardware } from "./gemma4-hardware.js";

export const PORT = 3000;

/**
 * Simulation-only: first idle-narrative tier boundary (minutes). Second tier = 2×, third = 6×
 * (same relative spacing as 24h / 72h). Raise this when wiring to real trading cadence.
 */
export const IDLE_NARRATIVE_FIRST_TIER_MINUTES = 30;

/**
 * Business, markets, and political / policy headlines.
 * Same monitor → LLM → Kalshi curation path as sports and entertainment seeds.
 */
export const SEED_NEWS_SOURCE_URLS_GENERAL = [
  "https://feeds.reuters.com/reuters/businessNews",
  "https://feeds.reuters.com/reuters/topNews",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://www.marketwatch.com/rss/topstories",
  "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
  "https://feeds.bloomberg.com/markets/news.rss",
  "https://feeds.apnews.com/apf-business",
  "https://feeds.npr.org/1007/rss.xml",
  "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
  "https://www.federalreserve.gov/feeds/press_all.xml",
  "https://thehill.com/feed/",
  "https://www.politico.com/rss/politicopicks.xml",
  "https://www.politico.com/rss/congress.xml",
  "https://cointelegraph.com/rss",
  "http://feeds.bbci.co.uk/news/business/rss.xml"
] as const;

/** Sports — merged into {@link SEED_NEWS_SOURCE_URLS} (no separate trading logic). */
export const SEED_NEWS_SOURCE_URLS_SPORTS = [
  "https://feeds.reuters.com/reuters/sportsNews",
  "http://feeds.bbci.co.uk/sport/rss.xml",
  "https://www.espn.com/espn/rss/news",
  "https://www.cbssports.com/rss/headlines/",
  "https://www.theguardian.com/sport/rss"
] as const;

/** Entertainment / arts / culture — merged into {@link SEED_NEWS_SOURCE_URLS}. */
export const SEED_NEWS_SOURCE_URLS_ENTERTAINMENT = [
  "https://feeds.reuters.com/reuters/artsNews",
  "https://variety.com/feed/",
  "https://deadline.com/feed/",
  "https://www.hollywoodreporter.com/feed/",
  "https://www.theguardian.com/film/rss"
] as const;

/**
 * Tabloid / gossip / high-churn celebrity sources — same pipeline as other seeds, but a **lower**
 * default recency prior (faster, less verified; still moves public attention).
 */
export const SEED_NEWS_SOURCE_URLS_TABLOID = [
  "https://www.tmz.com/rss.xml",
  "https://nypost.com/feed/",
  "https://pagesix.com/feed/",
  "https://radaronline.com/feed/",
  "https://www.usmagazine.com/feed/",
  "https://www.eonline.com/news/rss",
  "https://www.etonline.com/news/rss",
  "https://hollywoodlife.com/feed/",
  "https://www.dailymail.co.uk/tvshowbiz/index.rss",
  "https://www.thesun.co.uk/showbiz/feed/",
  "https://www.nationalenquirer.com/feed/"
] as const;

export const SEED_NEWS_SOURCE_URLS_TABLOID_SET = new Set<string>(SEED_NEWS_SOURCE_URLS_TABLOID);

/** Default RSS seeds: general + sports + entertainment + tabloid (single monitor loop and seed routine). */
export const SEED_NEWS_SOURCE_URLS = [
  ...SEED_NEWS_SOURCE_URLS_GENERAL,
  ...SEED_NEWS_SOURCE_URLS_SPORTS,
  ...SEED_NEWS_SOURCE_URLS_ENTERTAINMENT,
  ...SEED_NEWS_SOURCE_URLS_TABLOID
] as const;

export const SEED_NEWS_SOURCE_URL_SET = new Set<string>(SEED_NEWS_SOURCE_URLS);

/** Default recency when no CLOSED trade ratings yet: seed list = trusted; discovered = neutral. */
export const SEED_SOURCE_DEFAULT_RECENCY_SCORE = 80;
/** Tabloid / gossip seeds — lower prior so feed weight and confidence inputs stay skeptical until trade history proves otherwise. */
export const TABLOID_SEED_DEFAULT_RECENCY_SCORE = 30;
export const NON_SEED_SOURCE_DEFAULT_RECENCY_SCORE = 50;

/**
 * Prior recency score blended with per-source trade ratings in {@link getNewsSourcesWeighted}.
 * Tabloid seeds are checked first (they are also members of {@link SEED_NEWS_SOURCE_URL_SET}).
 */
export function defaultRecencyPriorForNewsSourceUrl(url: string): number {
  if (SEED_NEWS_SOURCE_URLS_TABLOID_SET.has(url)) return TABLOID_SEED_DEFAULT_RECENCY_SCORE;
  if (SEED_NEWS_SOURCE_URL_SET.has(url)) return SEED_SOURCE_DEFAULT_RECENCY_SCORE;
  return NON_SEED_SOURCE_DEFAULT_RECENCY_SCORE;
}

export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

const ollamaModelEnv = process.env.OLLAMA_MODEL?.trim();
/** Set when the operator pinned `OLLAMA_MODEL` (skips RAM/VRAM auto-sizing). */
export const OLLAMA_MODEL_FROM_ENV = ollamaModelEnv ? ollamaModelEnv : null;

/**
 * Chat model for `/api/generate` (trade JSON, source discovery). Set `OLLAMA_MODEL` to pin a tag;
 * otherwise the tag is chosen from RAM/VRAM + CPU/GPU heuristics (see `src/server/gemma4-hardware.ts`).
 */
export const OLLAMA_MODEL = ollamaModelEnv || resolveOllamaModelFromHardware();

/** Upper bound for Ollama /api/generate; resolves as soon as the model responds (not a 5-minute wait). */
export const OLLAMA_GENERATE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.OLLAMA_GENERATE_TIMEOUT_MS) || 300_000
);

/** Ollama embedding model for news↔market matching (`/api/embeddings`). Set to off/none to disable. */
export const OLLAMA_EMBED_MODEL = (() => {
  const v = process.env.OLLAMA_EMBED_MODEL?.trim();
  if (v === "" || v === "off" || v === "none") return "";
  if (v === undefined) return "nomic-embed-text";
  return v;
})();

export const OLLAMA_EMBED_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.OLLAMA_EMBED_TIMEOUT_MS) || 60_000
);

/** Parallel Ollama embed calls while indexing market titles. */
export const KALSHI_EMBED_CONCURRENCY = Math.max(
  1,
  Math.min(16, Number(process.env.KALSHI_EMBED_CONCURRENCY) || 4)
);

/** Cap how many open markets get embedded (rest use token fallback if needed). */
export const KALSHI_EMBED_MAX_MARKETS = Math.max(
  100,
  Number(process.env.KALSHI_EMBED_MAX_MARKETS) || 4000
);

/** Public trade API (listing + market lookup). Legacy host redirects here. */
export const KALSHI_API_BASE =
  process.env.KALSHI_API_BASE || "https://api.elections.kalshi.com/trade-api/v2";

/** WebSocket URL (production default). Demo: wss://demo-api.kalshi.co/trade-api/ws/v2 */
export const KALSHI_WS_URL =
  process.env.KALSHI_WS_URL || "wss://api.elections.kalshi.com/trade-api/ws/v2";

/** Path used in the signed message for WS connect (timestamp + "GET" + this path). Must match Kalshi docs. */
export const KALSHI_WS_SIGN_PATH = "/trade-api/ws/v2";

/** API key id from Kalshi account (Profile → API Keys). */
export const KALSHI_ACCESS_KEY_ID = (process.env.KALSHI_ACCESS_KEY_ID || "").trim();

/** RSA private key PEM file path (recommended). */
export const KALSHI_PRIVATE_KEY_PATH = (process.env.KALSHI_PRIVATE_KEY_PATH || "").trim();

/**
 * Inline PEM (optional). Use literal newlines or \n escapes. Prefer KALSHI_PRIVATE_KEY_PATH in production.
 */
export const KALSHI_PRIVATE_KEY_PEM = (process.env.KALSHI_PRIVATE_KEY_PEM || "").trim();

export function kalshiPrivateKeyConfigured(): boolean {
  return Boolean(KALSHI_PRIVATE_KEY_PATH || KALSHI_PRIVATE_KEY_PEM);
}

/** True when both key id and private key material are set (WebSocket + signed REST ready). */
export function kalshiWsAuthConfigured(): boolean {
  return Boolean(KALSHI_ACCESS_KEY_ID && kalshiPrivateKeyConfigured());
}

/**
 * Max distinct tickers on one Kalshi WS `ticker` subscription (OPEN positions + watchlist).
 * Open positions are always included; watchlist entries are trimmed if the union exceeds this.
 * If the number of OPEN tickers alone exceeds this, all OPEN tickers are still kept (no cap on positions).
 */
export const KALSHI_WS_MAX_SUBSCRIBED_TICKERS = Math.max(
  32,
  Math.min(2000, Number(process.env.KALSHI_WS_MAX_SUBSCRIBED_TICKERS) || 200)
);

/** Paginated GET /markets page size (Kalshi caps per request; default 200). */
export const KALSHI_MARKETS_PAGE_LIMIT = Math.min(
  1000,
  Math.max(50, Number(process.env.KALSHI_MARKETS_PAGE_LIMIT) || 200)
);

/** Max open markets to keep in memory (pagination stops after this many). */
export const KALSHI_MARKETS_MAX_TOTAL = Math.max(500, Number(process.env.KALSHI_MARKETS_MAX_TOTAL) || 8000);

/** How often to refetch the full open-market list (longer default reduces 429 risk). */
export const KALSHI_MARKETS_REFRESH_MS = Math.max(
  120_000,
  Number(process.env.KALSHI_MARKETS_REFRESH_MS) || 1_200_000
);

/** How often to refetch Kalshi market details for tickers with OPEN positions (AI exit review + live marks). */
export const KALSHI_OPEN_POSITION_REFRESH_MS = Math.max(
  15_000,
  Number(process.env.KALSHI_OPEN_POSITION_REFRESH_MS) || 60_000
);

/** Ask the LLM whether to close OPEN trades early (after each position-market refresh). Set false to disable. */
export const AI_EXIT_REVIEW_ENABLED = !["0", "false", "no", "off"].includes(
  String(process.env.AI_EXIT_REVIEW_ENABLED || "true").toLowerCase()
);

/** How many candidate tickers to pass into the LLM per news item (token overlap + fill). */
export const KALSHI_CURATED_MARKETS_FOR_LLM = Math.min(
  80,
  Math.max(8, Number(process.env.KALSHI_CURATED_MARKETS_FOR_LLM) || 35)
);

/** Minimum gap between Kalshi HTTP calls (pagination + per-ticker quotes). */
export const KALSHI_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.KALSHI_MIN_INTERVAL_MS) || 300
);

/** Retries after HTTP 429 (rate limit). */
export const KALSHI_MAX_RETRIES = Math.max(0, Math.min(25, Number(process.env.KALSHI_MAX_RETRIES) || 8));

/** Max wait for one 429 backoff when Retry-After is missing (exponential, capped). */
export const KALSHI_429_BACKOFF_CAP_MS = Math.max(
  2_000,
  Number(process.env.KALSHI_429_BACKOFF_CAP_MS) || 120_000
);

export const KALSHI_MARKETS_DB = "kalshi_markets";
export const KALSHI_SNAPSHOT_LEGACY_ID = "open_markets_snapshot";

/** CouchDB doc size safety: markets stored as c0, c1, … + meta. */
export const KALSHI_DB_CHUNK_SIZE = Math.max(
  100,
  Math.min(800, Number(process.env.KALSHI_DB_CHUNK_SIZE) || 450)
);

export const STOPWORDS = new Set(
  `the and for that with this from are was were has have had but not you all can her one our out day get use any may way she per new who web also than into only over such then them these some what time will about there when your how its more most much many other`.split(
    /\s+/
  )
);

export const COUCHDB_URL = (process.env.COUCHDB_URL || "http://localhost:5984").replace(/\/+$/, "");
export const COUCHDB_USER = process.env.COUCHDB_USER || "admin";
export const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD || "password";
export const COUCHDB_AUTH = { username: COUCHDB_USER, password: COUCHDB_PASSWORD };

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Confidence bar to open a trade (after source/reasoning tweak). Default lowered from 80 — see bootstrap below. */
export const BASE_TRADE_THRESHOLD = clamp(
  Number(process.env.BASE_TRADE_THRESHOLD) || 74,
  40,
  95
);

/** While rated CLOSED trades count is below this, use BASE_TRADE_THRESHOLD_BOOTSTRAP (set to 0 to disable). */
export const TRADE_BOOTSTRAP_UNTIL_RATED = Math.max(
  0,
  Math.floor(Number(process.env.TRADE_BOOTSTRAP_UNTIL_RATED) || 8)
);

export const BASE_TRADE_THRESHOLD_BOOTSTRAP = clamp(
  Number(process.env.BASE_TRADE_THRESHOLD_BOOTSTRAP) || 58,
  35,
  90
);

export const DYNAMIC_THRESHOLD_FLOOR = clamp(
  Number(process.env.DYNAMIC_THRESHOLD_FLOOR) || 62,
  35,
  95
);

export const DYNAMIC_THRESHOLD_FLOOR_BOOTSTRAP = clamp(
  Number(process.env.DYNAMIC_THRESHOLD_FLOOR_BOOTSTRAP) || 52,
  30,
  90
);

export const DYNAMIC_THRESHOLD_CEIL = clamp(
  Number(process.env.DYNAMIC_THRESHOLD_CEIL) || 92,
  55,
  99
);

export const SOURCE_RATING_HALF_LIFE_DAYS = Math.max(
  0.5,
  Number(process.env.SOURCE_RATING_HALF_LIFE_DAYS) || 14
);

/**
 * Until this many CLOSED rated trades exist for a source (or reasoning cluster),
 * blend observed average with the prior instead of replacing it (avoids one bad trade dominating).
 */
export const SOURCE_RATING_PRIOR_MIN_TRADES = Math.max(
  1,
  Math.floor(Number(process.env.SOURCE_RATING_PRIOR_MIN_TRADES) || 5)
);

/** Earliest time between starts of consecutive monitor loops (floor cadence). */
export const MONITOR_MIN_PERIOD_MS = 60_000;

/** Minimum rest after a loop finishes before the next one starts. */
export const MONITOR_POST_LOOP_MS = 10_000;

/** At or below this total portfolio USD (cash + MTM open), trading halts until POST /api/trading/resume. */
export const PORTFOLIO_DEPLETED_THRESHOLD_USD = Math.max(
  0,
  Number(process.env.PORTFOLIO_DEPLETED_THRESHOLD_USD) || 0.01
);

/** HTTP timeout per RSS feed (parseURL has no timeout and can hang indefinitely). */
export const RSS_FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.RSS_FETCH_TIMEOUT_MS) || 20_000
);

/** After RSS failures, skip future monitor cycles: skips = min(max, 2^streak - 1). Resets on success or this window. */
export const RSS_BACKOFF_RESET_MS = Math.max(
  3_600_000,
  Number(process.env.RSS_BACKOFF_RESET_MS) || 72 * 3_600_000
);

export const RSS_BACKOFF_MAX_SKIP_CYCLES = Math.max(
  1,
  Math.min(127, Number(process.env.RSS_BACKOFF_MAX_SKIP_CYCLES) || 63)
);

/** Link other news items to the current headline when token overlap ≥ this (0–100) and timestamps within NEWS_RELATED_MAX_DELTA_MS. */
export const NEWS_RELATED_MIN_OVERLAP_PCT = Math.max(
  1,
  Math.min(100, Number(process.env.NEWS_RELATED_MIN_OVERLAP_PCT) || 38)
);

export const NEWS_RELATED_MAX_DELTA_MS = Math.max(
  3_600_000,
  Number(process.env.NEWS_RELATED_MAX_DELTA_MS) || 48 * 3_600_000
);

export const NEWS_RELATED_MAX_LINKS = Math.max(1, Math.min(12, Number(process.env.NEWS_RELATED_MAX_LINKS) || 5));

/** Only compare against this many most recent news docs (performance). */
export const NEWS_RELATED_LOOKBACK = Math.max(20, Math.min(2000, Number(process.env.NEWS_RELATED_LOOKBACK) || 400));
