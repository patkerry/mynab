import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Unit tests only — e2e/*.spec.ts belongs to Playwright (`npm run test:e2e`), and vitest's
    // default include glob would otherwise try to execute those specs and crash on @playwright/test.
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
