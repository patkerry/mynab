import { defineConfig } from "@playwright/test";

// E2E runs against the SQLITE (desktop) build: DB_PROVIDER=sqlite has no Google OAuth, so the
// full app is testable with zero auth mocking — and it exercises the otherwise under-tested
// SQLite provider path. The server gets its own DB file (prisma/e2e.db, gitignored); tests reset
// it to the demo seed via e2e/db.ts before each test, so specs are order-independent.
//
// Deliberately serial (workers: 1): every spec shares one server + one SQLite file, and the
// register/budget flows mutate the same seeded budget. Parallel workers would race the resets.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    // ARCHITECTURE.md lesson: the page keeps rendering behind modal overlays — every spec must
    // scope selectors (e.g. page.locator(".modal")) rather than rely on placeholder uniqueness.
    trace: "retain-on-failure",
  },
  webServer: {
    // prepare-db runs first IN the server command (not globalSetup — Playwright boots the web
    // server before globalSetup, which would race an unmigrated DB).
    command: "npx tsx e2e/prepare-db.ts && npx next dev -p 3100",
    env: {
      DB_PROVIDER: "sqlite",
      DATABASE_URL: "file:./prisma/e2e.db",
      NEXT_DIST_DIR: ".next-e2e", // own build dir so a normal `npm run dev` can stay running
    },
    url: "http://localhost:3100/budget",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    timeout: 120_000,
  },
});
