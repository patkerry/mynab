// Next's `output: "standalone"` build (see next.config.ts) doesn't copy static assets into the
// standalone bundle itself — the docs call this out explicitly and expect a manual copy step.
// Run this after `next build`, before packaging the Electron app.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const standaloneDir = join(root, ".next", "standalone");

cpSync(join(root, ".next", "static"), join(standaloneDir, ".next", "static"), { recursive: true });
console.log("copied .next/static -> .next/standalone/.next/static");

if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standaloneDir, "public"), { recursive: true });
  console.log("copied public/ -> .next/standalone/public");
}
