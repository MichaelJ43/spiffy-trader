import WebSocket from "ws";
import {
  KALSHI_WS_MAX_SUBSCRIBED_TICKERS,
  KALSHI_WS_URL,
  kalshiWsAuthConfigured
} from "../server/config.js";
import { applyKalshiWsTickerMessage } from "./position-markets.js";
import { createKalshiWsHandshakeHeaders } from "./ws-auth.js";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

export type KalshiWsPublicStatus = {
  configured: boolean;
  connected: boolean;
  lastConnectAttemptAt: number | null;
  lastMessageAt: number | null;
  lastError: string | null;
  subscribedTickers: string[];
  openTickerCount: number;
  watchlistTickerCount: number;
  watchlistTickersDropped: number;
};

let desiredTickers: string[] = [];
let lastOpenTickerCount = 0;
let lastWatchlistTickerCount = 0;
let lastWatchlistTickersDropped = 0;
let subscribedKey = "";

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectInFlight = false;

let lastConnectAttemptAt: number | null = null;
let lastMessageAt: number | null = null;
let lastError: string | null = null;

function sortedKey(tickers: string[]): string {
  return [...new Set(tickers.map((t) => String(t).trim()).filter(Boolean))].sort().join(",");
}

/**
 * Prefer every OPEN position ticker, then add watchlist tickers not already open, up to KALSHI_WS_MAX_SUBSCRIBED_TICKERS.
 * If OPEN alone meets or exceeds the cap, all watchlist entries are dropped for WS (positions win).
 */
export function mergeOpenAndWatchlistTickersForWs(
  openTickers: string[],
  watchlistTickers: string[]
): { tickers: string[]; openCount: number; watchlistCount: number; watchlistDropped: number } {
  const openU = [...new Set(openTickers.map((t) => String(t).trim()).filter(Boolean))];
  const watchU = [
    ...new Set(
      watchlistTickers
        .map((t) => String(t).trim())
        .filter(Boolean)
        .filter((t) => !openU.includes(t))
    )
  ];
  const max = KALSHI_WS_MAX_SUBSCRIBED_TICKERS;

  if (openU.length >= max) {
    return {
      tickers: openU,
      openCount: openU.length,
      watchlistCount: 0,
      watchlistDropped: watchU.length
    };
  }

  const room = max - openU.length;
  const takeWatch = watchU.slice(0, room);
  return {
    tickers: [...openU, ...takeWatch],
    openCount: openU.length,
    watchlistCount: takeWatch.length,
    watchlistDropped: watchU.length - takeWatch.length
  };
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!kalshiWsAuthConfigured()) return;
  if (sortedKey(desiredTickers) === "") return;
  clearReconnectTimer();
  const delay = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** Math.min(reconnectAttempt, 6)
  );
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void openOrRefreshWebSocket();
  }, delay);
}

function sendSubscribe(socket: WebSocket, tickers: string[]) {
  const unique = [...new Set(tickers.map((t) => String(t).trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const id = Math.floor(Math.random() * 1_000_000_000);
  const payload = {
    id,
    cmd: "subscribe",
    params: {
      channels: ["ticker"],
      market_tickers: unique
    }
  };
  socket.send(JSON.stringify(payload));
}

function attachHandlers(socket: WebSocket, tickers: string[]) {
  socket.on("message", (data) => {
    lastMessageAt = Date.now();
    let raw: string;
    try {
      raw = typeof data === "string" ? data : data.toString("utf8");
    } catch {
      return;
    }
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type === "ticker" && msg.msg) {
      applyKalshiWsTickerMessage(msg.msg);
    } else if (msg?.type === "error") {
      const code = msg.msg?.code;
      const m = msg.msg?.msg;
      lastError = `ws error ${code ?? "?"}: ${m ?? JSON.stringify(msg.msg)}`;
      console.warn("Kalshi WS:", lastError);
    }
  });

  socket.on("open", () => {
    reconnectAttempt = 0;
    lastError = null;
    sendSubscribe(socket, tickers);
  });

  socket.on("close", () => {
    if (ws === socket) ws = null;
    if (sortedKey(desiredTickers) !== "") scheduleReconnect();
  });

  socket.on("error", (err: Error) => {
    lastError = err?.message || String(err);
    console.warn("Kalshi WS socket error:", lastError);
  });
}

async function openOrRefreshWebSocket(): Promise<void> {
  if (!kalshiWsAuthConfigured()) return;

  const key = sortedKey(desiredTickers);
  if (key === "") {
    clearReconnectTimer();
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      ws = null;
    }
    subscribedKey = "";
    return;
  }

  if (connectInFlight) return;
  if (key === subscribedKey && ws?.readyState === WebSocket.OPEN) return;

  connectInFlight = true;
  lastConnectAttemptAt = Date.now();
  try {
    if (ws) {
      const old = ws;
      ws = null;
      old.removeAllListeners();
      old.close();
    }

    const headers = createKalshiWsHandshakeHeaders();
    if (!headers) {
      lastError = "missing auth headers";
      connectInFlight = false;
      return;
    }

    const socket = new WebSocket(KALSHI_WS_URL, { headers });
    ws = socket;
    subscribedKey = key;
    attachHandlers(socket, desiredTickers);

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("WebSocket open timeout")), 20_000);
      socket.once("open", () => {
        clearTimeout(t);
        resolve();
      });
      socket.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  } catch (e: any) {
    lastError = e?.message || String(e);
    console.warn("Kalshi WS connect failed:", lastError);
    subscribedKey = "";
    scheduleReconnect();
  } finally {
    connectInFlight = false;
  }
}

/**
 * Merge OPEN + watchlist tickers, then subscribe. No-op if API keys are not configured.
 */
export function syncKalshiWsOpenAndWatchlist(openTickers: string[], watchlistTickers: string[]): void {
  const merged = mergeOpenAndWatchlistTickersForWs(openTickers, watchlistTickers);
  lastOpenTickerCount = merged.openCount;
  lastWatchlistTickerCount = merged.watchlistCount;
  lastWatchlistTickersDropped = merged.watchlistDropped;
  if (merged.watchlistDropped > 0) {
    console.warn(
      `Kalshi WS: ${merged.watchlistDropped} watchlist ticker(s) not subscribed (cap ${KALSHI_WS_MAX_SUBSCRIBED_TICKERS}; OPEN uses ${merged.openCount}).`
    );
  }
  syncKalshiWsMarketTickers(merged.tickers);
}

/**
 * Raw ticker list for WebSocket subscription (internal / tests).
 */
export function syncKalshiWsMarketTickers(tickers: string[]): void {
  desiredTickers = tickers;
  if (!kalshiWsAuthConfigured()) return;

  const key = sortedKey(tickers);
  if (key === "") {
    clearReconnectTimer();
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      ws = null;
    }
    subscribedKey = "";
    return;
  }

  if (key !== subscribedKey || ws?.readyState !== WebSocket.OPEN) {
    void openOrRefreshWebSocket();
  }
}

export function getKalshiWsStatus(): KalshiWsPublicStatus {
  return {
    configured: kalshiWsAuthConfigured(),
    connected: ws?.readyState === WebSocket.OPEN,
    lastConnectAttemptAt,
    lastMessageAt,
    lastError,
    subscribedTickers: sortedKey(desiredTickers)
      .split(",")
      .filter(Boolean),
    openTickerCount: lastOpenTickerCount,
    watchlistTickerCount: lastWatchlistTickerCount,
    watchlistTickersDropped: lastWatchlistTickersDropped
  };
}
