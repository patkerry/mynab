import { defineConfig } from "@playwright/test";

// Demo-video recorder config (`npm run demo:video`). Same sqlite server as the e2e suite, but:
// video always on, actions slowed to a watchable pace, roomier viewport. Output lands in
// demo-results/; the npm script copies the .webm out to demo/.
export default defineConfig({
  testDir: "./demo",
  outputDir: "./demo-results",
  workers: 1,
  timeout: 240_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1280, height: 800 },
    video: { mode: "on", size: { width: 1280, height: 800 } },
    launchOptions: { slowMo: 220 },
  },
  webServer: {
    command: "npx tsx e2e/prepare-db.ts && npx next dev -p 3100",
    env: {
      DB_PROVIDER: "sqlite",
      DATABASE_URL: "file:./prisma/e2e.db",
      NEXT_DIST_DIR: ".next-e2e",
    },
    url: "http://localhost:3100/budget",
    reuseExistingServer: true,
    stdout: "ignore",
    timeout: 120_000,
  },
});
