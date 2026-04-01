import { applyRssFetchStats } from "../performance/news-sources.js";
import {
  RSS_BACKOFF_MAX_SKIP_CYCLES,
  RSS_BACKOFF_RESET_MS
} from "../server/config.js";

/**
 * Rolling window: reset consecutive failure streak and skip counter every RSS_BACKOFF_RESET_MS
 * so flaky feeds get another chance.
 */
export function applyRssBackoffWindowReset(doc: any, now: number): any {
  const lastRaw = doc.rssBackoffLastResetAt;
  const last =
    typeof lastRaw === "number" && lastRaw > 0 ? lastRaw : 0;

  if (now - last >= RSS_BACKOFF_RESET_MS) {
    return {
      ...doc,
      rssBackoffLastResetAt: now,
      rssConsecutiveFailures: 0,
      rssSkipsRemaining: 0
    };
  }

  if (!(typeof lastRaw === "number" && lastRaw > 0)) {
    return { ...doc, rssBackoffLastResetAt: now };
  }

  return doc;
}

/**
 * If skips remain from a previous failure, consume one and do not fetch this cycle.
 */
export function planRssFetchAttempt(doc: any, now: number): { doc: any; shouldFetch: boolean } {
  const afterWindow = applyRssBackoffWindowReset({ ...doc }, now);
  const skips = afterWindow.rssSkipsRemaining ?? 0;
  if (skips > 0) {
    return {
      doc: { ...afterWindow, rssSkipsRemaining: skips - 1 },
      shouldFetch: false
    };
  }
  return { doc: afterWindow, shouldFetch: true };
}

export function applyRssFetchSuccessWithBackoff(doc: any): any {
  const base = applyRssFetchStats(doc, true);
  return {
    ...base,
    rssConsecutiveFailures: 0,
    rssSkipsRemaining: 0
  };
}

/** On HTTP/parse failure: streak++, skips = min(cap, 2^streak - 1). */
export function applyRssFetchFailureWithBackoff(doc: any, now: number): any {
  const d0 = applyRssBackoffWindowReset({ ...doc }, now);
  const streak = (d0.rssConsecutiveFailures ?? 0) + 1;
  const base = applyRssFetchStats(d0, false);
  const skips = Math.min(RSS_BACKOFF_MAX_SKIP_CYCLES, 2 ** streak - 1);
  return {
    ...base,
    rssConsecutiveFailures: streak,
    rssSkipsRemaining: skips
  };
}
