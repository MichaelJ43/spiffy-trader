import "@testing-library/jest-dom/vitest";

/** Recharts ResponsiveContainer reads dimensions from ResizeObserver in jsdom. */
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

try {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
} catch {
  /* ignore */
}
