import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const sharedTest = {
  globals: true,
  pool: "forks" as const,
  testTimeout: 20_000,
  setupFiles: ["./tests/setup/vitest.setup.ts"]
};

export default defineConfig({
  plugins: [react()],
  test: {
    ...sharedTest,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.d.ts",
        "**/main.tsx",
        "src/server/http.ts",
        "src/server/monitor.ts",
        "src/kalshi/types.ts"
      ],
      /**
       * Global gates on included `src/**` (see exclude list). Branch % is capped lower than lines
       * because optional paths and defensive branches are unevenly exercised.
       */
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 65
      }
    },
    projects: [
      {
        extends: true,
        test: {
          ...sharedTest,
          name: "unit",
          include: ["tests/**/*.test.ts"],
          environment: "node"
        }
      },
      {
        extends: true,
        test: {
          ...sharedTest,
          name: "ui",
          include: ["tests/ui/**/*.test.tsx"],
          environment: "jsdom"
        }
      }
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    },
    dedupe: ["react", "react-dom"]
  }
});
