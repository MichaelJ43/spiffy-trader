export type BotStatus = {
  /** Unencumbered cash (not in open positions). */
  cashBalance: number;
  survivalStatus: string;
  lastUpdate: string;
  totalPnL: number;
  /**
   * When true, the monitor loop does not reschedule, RSS/LLM and position AI timers no-op.
   * Cleared only by POST /api/trading/resume (after funding).
   */
  portfolioHalted: boolean;
};

export let botStatus: BotStatus = {
  cashBalance: 250.0,
  survivalStatus: "Healthy",
  lastUpdate: new Date().toISOString(),
  totalPnL: 0.0,
  portfolioHalted: false
};

/** Couch may still have legacy `currentBalance`. */
export function readCashFromStatusDoc(doc: any, fallback: number): number {
  if (typeof doc?.cashBalance === "number" && Number.isFinite(doc.cashBalance)) {
    return doc.cashBalance;
  }
  if (typeof doc?.currentBalance === "number" && Number.isFinite(doc.currentBalance)) {
    return doc.currentBalance;
  }
  return fallback;
}

export function replaceBotStatus(next: BotStatus) {
  botStatus = next;
}

export let monitorLoopBusy = false;

export function setMonitorLoopBusy(v: boolean) {
  monitorLoopBusy = v;
}
