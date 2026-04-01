import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/config.js", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../src/server/config.js")>();
  return {
    ...m,
    RSS_BACKOFF_RESET_MS: 72 * 3_600_000,
    RSS_BACKOFF_MAX_SKIP_CYCLES: 63
  };
});

import {
  applyRssBackoffWindowReset,
  applyRssFetchFailureWithBackoff,
  applyRssFetchSuccessWithBackoff,
  planRssFetchAttempt
} from "../../src/rss/backoff.js";

describe("RSS backoff", () => {
  const base = { _id: "s1", url: "https://example.com/feed" };

  it("72h window resets streak and skips", () => {
    const stale = { ...base, rssBackoffLastResetAt: 0, rssConsecutiveFailures: 3, rssSkipsRemaining: 7 };
    const now = 100 + 72 * 3_600_000;
    const out = applyRssBackoffWindowReset(stale, now);
    expect(out.rssConsecutiveFailures).toBe(0);
    expect(out.rssSkipsRemaining).toBe(0);
    expect(out.rssBackoffLastResetAt).toBe(now);
  });

  it("planRssFetch decrements skip without fetching", () => {
    const doc = { ...base, rssBackoffLastResetAt: 1_000_000, rssSkipsRemaining: 2 };
    const a = planRssFetchAttempt(doc, 2_000_000);
    expect(a.shouldFetch).toBe(false);
    expect(a.doc.rssSkipsRemaining).toBe(1);
  });

  it("failure sets exponential skips", () => {
    let d: any = { ...base, rssBackoffLastResetAt: 1e12 };
    d = applyRssFetchFailureWithBackoff(d, 1e12 + 1000);
    expect(d.rssConsecutiveFailures).toBe(1);
    expect(d.rssSkipsRemaining).toBe(1);
    d = applyRssFetchFailureWithBackoff(d, 1e12 + 2000);
    expect(d.rssConsecutiveFailures).toBe(2);
    expect(d.rssSkipsRemaining).toBe(3);
  });

  it("success clears streak and skips", () => {
    const d = applyRssFetchSuccessWithBackoff({
      ...base,
      rssConsecutiveFailures: 2,
      rssSkipsRemaining: 3,
      rssFetchAttempts: 0,
      rssFetchFailures: 0
    });
    expect(d.rssConsecutiveFailures).toBe(0);
    expect(d.rssSkipsRemaining).toBe(0);
    expect(d.rssFetchAttempts).toBe(1);
  });
});
