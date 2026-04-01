import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["tests/ui/**", "jsdom"]],
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    pool: "forks",
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.d.ts",
        "**/main.tsx",
        "src/components/**",
        "src/App.tsx",
        "src/server/http.ts",
        "src/server/monitor.ts",
        "src/kalshi/types.ts"
      ]
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    },
    dedupe: ["react", "react-dom"]
  }
});
