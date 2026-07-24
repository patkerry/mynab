import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resetDb, E2E_DB_URL } from "./db";

// Runs as the first half of playwright.config's webServer command (NOT globalSetup — Playwright
// boots the web server before globalSetup, so the server would race an unmigrated DB). Fresh
// file, real migrations-sqlite history (the same SQL the desktop build replays), demo seed.
async function main() {
  const file = E2E_DB_URL.replace("file:", "");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    if (existsSync(file + suffix)) rmSync(file + suffix);
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "pipe" });
  await resetDb();
  console.log("[e2e] database migrated + seeded");
}
main(); // no top-level await — tsx transforms this file as CJS
