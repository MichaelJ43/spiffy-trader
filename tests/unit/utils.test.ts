import { describe, expect, it } from "vitest";
import { cosineSimilarity, runWithConcurrency } from "../../src/lib/utils.js";

describe("cosineSimilarity", () => {
  it("is 1 for identical non-zero vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("handles length mismatch by min length", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBeCloseTo(1, 12);
  });
});

describe("runWithConcurrency", () => {
  it("runs all items with bounded concurrency", async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
  });
});
