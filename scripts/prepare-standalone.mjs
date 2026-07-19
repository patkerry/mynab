// Next's `output: "standalone"` build (see next.config.ts) doesn't copy static assets into the
// standalone bundle itself — the docs call this out explicitly and expect a manual copy step.
// Run this after `next build`, before packaging the Electron app.
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const standaloneDir = join(root, ".next", "standalone");

cpSync(join(root, ".next", "static"), join(standaloneDir, ".next", "static"), { recursive: true });
console.log("copied .next/static -> .next/standalone/.next/static");

if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standaloneDir, "public"), { recursive: true });
  console.log("copied public/ -> .next/standalone/public");
}

// Prune sharp: Next bundles it as its optional image optimizer, but this app uses no next/image,
// so it's dead weight. It also ships as a platform+arch-specific prebuilt (@img/sharp-darwin-arm64
// only), which breaks electron-builder `--universal`: @electron/universal aborts on the single-arch
// .node that can't be lipo-merged. Removing the unused optimizer is the clean fix for all packaging.
for (const pkg of ["@img", "sharp"]) {
  const dir = join(standaloneDir, "node_modules", pkg);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`pruned unused ${pkg} from standalone node_modules`);
  }
}
