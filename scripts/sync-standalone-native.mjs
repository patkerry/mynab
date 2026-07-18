// Next's `output: "standalone"` dependency tracer copies only the files better-sqlite3 needs at
// runtime — it drops binding.gyp and the C++ sources, which means @electron/rebuild's
// native-module detector (it looks for binding.gyp) never recognizes
// .next/standalone/node_modules/better-sqlite3 as rebuildable and silently leaves its compiled
// .node binary untouched (still built for plain Node, not Electron's ABI, and for whatever OS/arch
// it happened to be installed on). Run this AFTER `electron-rebuild` has rebuilt the root
// node_modules copy for the real target (Electron ABI + OS/arch) — it just copies that already-
// correct binary over, since it's the exact same package/version either way.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const src = join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const dest = join(root, ".next", "standalone", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");

if (!existsSync(src)) {
  throw new Error(`rebuilt better-sqlite3 binary not found at ${src} — run electron-rebuild first`);
}
if (!existsSync(join(root, ".next", "standalone", "node_modules", "better-sqlite3"))) {
  throw new Error(`${dest} directory doesn't exist — run \`next build\` first`);
}
copyFileSync(src, dest);
console.log(`copied rebuilt better-sqlite3 binary -> ${dest}`);
