// Turbopack's `output: "standalone"` build emits content-hashed symlinks under
// .next/standalone/.next/node_modules (e.g. better-sqlite3-<hash> -> ../../node_modules/better-sqlite3)
// as its module-resolution aliases. Shipping symlinks in a packaged app is already fragile, and for
// electron-builder `--universal` it's fatal: @electron/universal resolves these identical relative
// symlinks to different absolute paths in the arm64 vs x64 slices, then aborts with
// "the number of mach-o files is not the same between the arm64 and x64 builds" (the symlinked
// better_sqlite3.node gets keyed under two different paths). fs.cpSync({dereference:true}) does NOT
// fix it — Node preserves symlinks whose target lies inside the tree being copied.
//
// This script walks .next/standalone and replaces every symlink in place with a real recursive copy
// of its target, so the packaged bundle contains only regular files. Run it after `next build` and
// the static/public copy, before packaging.
import { readdirSync, lstatSync, realpathSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const standaloneDir = join(root, ".next", "standalone");

let replaced = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // Resolve to the real target, drop the link, copy the target's real contents into its place.
      const target = realpathSync(full);
      rmSync(full, { recursive: true, force: true });
      cpSync(target, full, { recursive: true, dereference: true });
      replaced++;
      // The freshly-copied real dir may itself contain further symlinks — walk it too.
      if (lstatSync(full).isDirectory()) walk(full);
    } else if (entry.isDirectory()) {
      walk(full);
    }
  }
}

walk(standaloneDir);
console.log(`de-symlinked ${replaced} symlink(s) under ${standaloneDir}`);
