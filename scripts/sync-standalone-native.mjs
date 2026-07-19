// Next's `output: "standalone"` dependency tracer copies only the files better-sqlite3 needs at
// runtime — it drops binding.gyp and the C++ sources, which means @electron/rebuild's
// native-module detector (it looks for binding.gyp) never recognizes
// .next/standalone/node_modules/better-sqlite3 as rebuildable and silently leaves its compiled
// .node binary untouched (still built for plain Node, not Electron's ABI, and for whatever OS/arch
// it happened to be installed on). Run this AFTER the root node_modules copy has been rebuilt for
// the real target (Electron ABI + OS/arch, or a lipo'd universal binary) — it copies that already-
// correct binary over every better_sqlite3.node under the standalone bundle.
//
// "every" matters: Turbopack emits a content-hashed alias of better-sqlite3 under
// .next/standalone/.next/node_modules (better-sqlite3-<hash>), and desymlink-standalone.mjs turns
// that alias from a symlink into a real directory copy — which freezes whatever .node was in place
// at prepare time. Syncing only the primary copy would leave that alias stale (wrong ABI, and for
// --universal, single-arch → @electron/universal aborts). So sync all of them.
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const src = join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const standaloneDir = join(root, ".next", "standalone");

if (!existsSync(src)) {
  throw new Error(`rebuilt better-sqlite3 binary not found at ${src} — run electron-rebuild first`);
}
if (!existsSync(standaloneDir)) {
  throw new Error(`${standaloneDir} doesn't exist — run \`next build\` first`);
}

// Find every better_sqlite3.node under the standalone bundle and overwrite it with the freshly
// built root binary (same package/version, only the compiled binary differs).
const targets = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name === "better_sqlite3.node") targets.push(full);
  }
}
walk(standaloneDir);

if (targets.length === 0) {
  throw new Error(`no better_sqlite3.node found under ${standaloneDir} — run \`next build\` first`);
}
for (const dest of targets) {
  copyFileSync(src, dest);
  console.log(`copied rebuilt better-sqlite3 binary -> ${dest}`);
}
