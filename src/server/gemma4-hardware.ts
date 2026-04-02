import { execSync } from "node:child_process";
import os from "node:os";

/**
 * Gemma 4 variants on Ollama (see https://ollama.com/library/gemma4).
 * `minMemoryGb` = conservative **system** budget to run generation comfortably (weights + KV + OS).
 * `diskGbApprox` = model download size (from Ollama library; quant tags vary).
 * When an NVIDIA GPU is present, we compare primarily against **VRAM**; otherwise **RAM** rules.
 */
export type Gemma4TierRow = {
  ollamaTag: string;
  label: string;
  diskGbApprox: number;
  /** Minimum recommended unified system RAM (CPU / Apple) or effective budget. */
  minMemoryGb: number;
  /** Minimum NVIDIA VRAM if running on GPU (rough; quants help). */
  minVramGbNvidia: number;
};

/** Ordered small → large by capability. */
export const GEMMA4_OLLAMA_MODEL_TABLE: readonly Gemma4TierRow[] = [
  {
    ollamaTag: "gemma4:e2b",
    label: "Gemma 4 E2B (effective ~2B edge)",
    diskGbApprox: 7.2,
    minMemoryGb: 8,
    minVramGbNvidia: 6
  },
  {
    ollamaTag: "gemma4:e4b",
    label: "Gemma 4 E4B (effective ~4B); `gemma4:latest` is the same size class on Ollama",
    diskGbApprox: 9.6,
    minMemoryGb: 11,
    minVramGbNvidia: 8
  },
  {
    ollamaTag: "gemma4:26b-a4b-it-q4_K_M",
    label: "Gemma 4 26B MoE IT Q4_K_M (quantized)",
    diskGbApprox: 14,
    minMemoryGb: 16,
    minVramGbNvidia: 14
  },
  {
    ollamaTag: "gemma4:26b",
    label: "Gemma 4 26B MoE (full tag)",
    diskGbApprox: 18,
    minMemoryGb: 22,
    minVramGbNvidia: 18
  },
  {
    ollamaTag: "gemma4:31b",
    label: "Gemma 4 31B dense",
    diskGbApprox: 20,
    minMemoryGb: 26,
    minVramGbNvidia: 22
  }
] as const;

export type CpuKind = "apple_silicon" | "intel" | "amd" | "unknown";
export type GpuKind = "nvidia" | "apple_unified" | "amd" | "intel_igpu" | "unknown";

export type HardwareLlmProfile = {
  platform: NodeJS.Platform;
  totalRamGb: number;
  freeRamGb: number;
  cpuModel: string;
  cpuKind: CpuKind;
  gpuKind: GpuKind;
  /** NVIDIA GPU memory, if `nvidia-smi` works. */
  nvidiaVramGb: number | null;
  /** Heuristic: budget for **largest** model weights + runtime (not 100% of RAM). */
  effectiveBudgetGb: number;
  /** How `effectiveBudgetGb` was derived (for logs / API). */
  budgetRule: "nvidia_vram" | "apple_unified" | "cpu_ram";
};

const GB = 1024 ** 3;

function firstCpuModel(): string {
  const cpus = os.cpus();
  return cpus.length > 0 ? cpus[0].model.trim() : "";
}

function detectCpuKind(model: string): CpuKind {
  const m = model.toLowerCase();
  if (m.includes("apple") || /\bm[0-9]\b/i.test(model)) return "apple_silicon";
  if (m.includes("intel")) return "intel";
  if (m.includes("amd") || m.includes("ryzen") || m.includes("epyc")) return "amd";
  return "unknown";
}

/** Best-effort NVIDIA VRAM via `nvidia-smi` (Windows + Linux). */
export function tryGetNvidiaVramGb(): number | null {
  try {
    const out = execSync(
      "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits",
      {
        encoding: "utf8",
        timeout: 2500,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );
    const firstLine = out.trim().split(/\r?\n/)[0]?.trim() ?? "";
    const mb = Number.parseFloat(firstLine.replace(/,/g, ""));
    if (!Number.isFinite(mb) || mb <= 0) return null;
    return mb / 1024;
  } catch {
    return null;
  }
}

function detectGpuKind(platform: NodeJS.Platform, cpuKind: CpuKind, nvidiaVramGb: number | null): GpuKind {
  if (nvidiaVramGb != null && nvidiaVramGb > 0.5) return "nvidia";
  if (platform === "darwin" && cpuKind === "apple_silicon") return "apple_unified";
  return "unknown";
}

/**
 * Maps hardware profile → inference budget (GB).
 * NVIDIA: prefer VRAM cap (Ollama usually uses the GPU), still cap by system RAM.
 * Apple Silicon: unified memory — one pool for CPU + GPU + model.
 * Intel / AMD (no NVIDIA): conservative RAM fraction for CPU-only inference.
 */
export function computeEffectiveBudgetGb(profile: Omit<HardwareLlmProfile, "effectiveBudgetGb" | "budgetRule">): {
  effectiveBudgetGb: number;
  budgetRule: HardwareLlmProfile["budgetRule"];
} {
  const { totalRamGb, nvidiaVramGb, gpuKind, cpuKind, platform } = profile;

  if (nvidiaVramGb != null && nvidiaVramGb >= 4) {
    const vramCap = nvidiaVramGb * 0.88;
    const ramCap = totalRamGb * 0.45;
    return {
      effectiveBudgetGb: Math.max(4, Math.min(vramCap, ramCap)),
      budgetRule: "nvidia_vram"
    };
  }

  if (gpuKind === "apple_unified" || (platform === "darwin" && cpuKind === "apple_silicon")) {
    return {
      effectiveBudgetGb: Math.max(4, totalRamGb * 0.52),
      budgetRule: "apple_unified"
    };
  }

  // Intel / AMD / unknown CPU — no discrete NVIDIA detected
  return {
    effectiveBudgetGb: Math.max(4, totalRamGb * 0.42),
    budgetRule: "cpu_ram"
  };
}

export function detectHardwareLlmProfile(): HardwareLlmProfile {
  const platform = process.platform;
  const totalRamGb = os.totalmem() / GB;
  const freeRamGb = os.freemem() / GB;
  const cpuModel = firstCpuModel();
  const cpuKind = detectCpuKind(cpuModel);
  const nvidiaVramGb = tryGetNvidiaVramGb();
  const gpuKind = detectGpuKind(platform, cpuKind, nvidiaVramGb);
  const base = {
    platform,
    totalRamGb,
    freeRamGb,
    cpuModel,
    cpuKind,
    gpuKind,
    nvidiaVramGb
  };
  const { effectiveBudgetGb, budgetRule } = computeEffectiveBudgetGb(base);
  return { ...base, effectiveBudgetGb, budgetRule };
}

export type Gemma4Recommendation = {
  ollamaTag: string;
  tier: Gemma4TierRow;
  /** Tiers that fit `effectiveBudgetGb` (same order as table). */
  fittingTiers: Gemma4TierRow[];
};

/**
 * Pick the **largest** Gemma 4 tier that still fits the budget.
 * Uses `minVramGbNvidia` when NVIDIA VRAM is known, else `minMemoryGb`.
 */
export function recommendGemma4Model(profile: HardwareLlmProfile): Gemma4Recommendation {
  const useVram = profile.nvidiaVramGb != null && profile.nvidiaVramGb >= 4;
  const budget = profile.effectiveBudgetGb;

  const fitting: Gemma4TierRow[] = [];
  for (const tier of GEMMA4_OLLAMA_MODEL_TABLE) {
    const need = useVram ? tier.minVramGbNvidia : tier.minMemoryGb;
    if (need <= budget) fitting.push(tier);
  }

  if (fitting.length === 0) {
    const fallback = GEMMA4_OLLAMA_MODEL_TABLE[0];
    return { ollamaTag: fallback.ollamaTag, tier: fallback, fittingTiers: [] };
  }

  const tier = fitting[fitting.length - 1];
  return { ollamaTag: tier.ollamaTag, tier, fittingTiers: fitting };
}

const FALLBACK_WHEN_UNSET = "gemma4:e4b";

/** Used when `OLLAMA_MODEL` is not set: hardware-sized Gemma 4 tag. */
export function resolveOllamaModelFromHardware(): string {
  const profile = detectHardwareLlmProfile();
  return recommendGemma4Model(profile).ollamaTag;
}

export type LlmCapacitySnapshot = {
  ollamaModelEffective: string;
  hardware: HardwareLlmProfile;
  recommendation: Gemma4Recommendation;
  gemma4Table: readonly Gemma4TierRow[];
  /** True when `OLLAMA_MODEL` env was set (caller responsibility). */
  envOverride: boolean;
};

export function buildLlmCapacitySnapshot(resolvedModel: string, envOverride: boolean): LlmCapacitySnapshot {
  const hardware = detectHardwareLlmProfile();
  const recommendation = recommendGemma4Model(hardware);
  return {
    ollamaModelEffective: resolvedModel,
    hardware,
    recommendation,
    gemma4Table: GEMMA4_OLLAMA_MODEL_TABLE,
    envOverride
  };
}
