import { describe, expect, it } from "vitest";
import {
  computeEffectiveBudgetGb,
  GEMMA4_OLLAMA_MODEL_TABLE,
  recommendGemma4Model,
  type HardwareLlmProfile
} from "../../src/server/gemma4-hardware.js";

function makeProfile(over: Partial<HardwareLlmProfile>): HardwareLlmProfile {
  const defaults: HardwareLlmProfile = {
    platform: "linux",
    totalRamGb: 32,
    freeRamGb: 16,
    cpuModel: "AMD Ryzen 9",
    cpuKind: "amd",
    gpuKind: "unknown",
    nvidiaVramGb: null,
    effectiveBudgetGb: 12,
    budgetRule: "cpu_ram"
  };
  return { ...defaults, ...over };
}

describe("GEMMA4_OLLAMA_MODEL_TABLE", () => {
  it("is ordered by increasing capability (min memory)", () => {
    for (let i = 1; i < GEMMA4_OLLAMA_MODEL_TABLE.length; i++) {
      expect(GEMMA4_OLLAMA_MODEL_TABLE[i].minMemoryGb).toBeGreaterThanOrEqual(
        GEMMA4_OLLAMA_MODEL_TABLE[i - 1].minMemoryGb
      );
    }
  });
});

describe("computeEffectiveBudgetGb", () => {
  it("uses NVIDIA VRAM when available", () => {
    const b = computeEffectiveBudgetGb({
      platform: "win32",
      totalRamGb: 64,
      freeRamGb: 32,
      cpuModel: "Intel",
      cpuKind: "intel",
      gpuKind: "nvidia",
      nvidiaVramGb: 24
    });
    expect(b.budgetRule).toBe("nvidia_vram");
    expect(b.effectiveBudgetGb).toBeLessThanOrEqual(24 * 0.88);
    expect(b.effectiveBudgetGb).toBeGreaterThan(10);
  });

  it("uses Apple unified rule on Apple Silicon", () => {
    const b = computeEffectiveBudgetGb({
      platform: "darwin",
      totalRamGb: 32,
      freeRamGb: 16,
      cpuModel: "Apple M2",
      cpuKind: "apple_silicon",
      gpuKind: "apple_unified",
      nvidiaVramGb: null
    });
    expect(b.budgetRule).toBe("apple_unified");
    expect(b.effectiveBudgetGb).toBeCloseTo(32 * 0.52, 5);
  });

  it("uses conservative RAM for Intel without NVIDIA", () => {
    const b = computeEffectiveBudgetGb({
      platform: "linux",
      totalRamGb: 32,
      freeRamGb: 16,
      cpuModel: "Intel Core i7",
      cpuKind: "intel",
      gpuKind: "unknown",
      nvidiaVramGb: null
    });
    expect(b.budgetRule).toBe("cpu_ram");
    expect(b.effectiveBudgetGb).toBeCloseTo(32 * 0.42, 5);
  });
});

describe("recommendGemma4Model", () => {
  it("picks the largest tier that fits the budget", () => {
    const p = makeProfile({
      totalRamGb: 64,
      effectiveBudgetGb: 20,
      budgetRule: "apple_unified",
      cpuKind: "apple_silicon",
      gpuKind: "apple_unified",
      platform: "darwin",
      cpuModel: "Apple M1"
    });
    const r = recommendGemma4Model(p);
    expect(r.ollamaTag).toBe("gemma4:26b-a4b-it-q4_K_M");
  });

  it("falls back to smallest tier when budget is tiny", () => {
    const p = makeProfile({
      totalRamGb: 4,
      effectiveBudgetGb: 4,
      budgetRule: "cpu_ram"
    });
    const r = recommendGemma4Model(p);
    expect(r.ollamaTag).toBe("gemma4:e2b");
    expect(r.fittingTiers.length).toBe(0);
  });
});
