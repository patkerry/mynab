// electron-builder's extraResources/files copier special-cases "node_modules" directories (its
// own dependency-walking/dedup logic, meant for the app's own top-level deps) and silently drops
// the standalone Next.js server's bundled node_modules when copied that way — confirmed by
// inspecting the packaged output, not guessed. Bypassing that entirely here with a plain
// recursive filesystem copy, run after packaging, is the standard workaround for embedding a
// `next build`-produced `output: "standalone"` bundle in an Electron app.
import { cpSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export default async function afterPack(context) {
  const root = join(import.meta.dirname, "..");
  const standaloneSrc = join(root, ".next", "standalone");
  const appResourcesDir = join(context.appOutDir, "resources", "app", ".next", "standalone");
  cpSync(standaloneSrc, appResourcesDir, { recursive: true, force: true });
  console.log(`[afterPack] copied ${standaloneSrc} -> ${appResourcesDir}`);

  // Next's standalone tracer strips binding.gyp from its bundled better-sqlite3 copy, so
  // @electron/rebuild never recognizes it as a native module to rebuild — it silently ships
  // whatever .node binary happened to be in node_modules at `next build` time (wrong ABI/OS/arch).
  // electron-builder DOES correctly rebuild the app's own top-level node_modules/better-sqlite3
  // for the real target (asarUnpack'd here); copy that already-correct binary over the
  // standalone copy too, since it's the exact same package/version either way.
  const rebuiltBinary = join(context.appOutDir, "resources", "app.asar.unpacked", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  const standaloneBinary = join(appResourcesDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  if (existsSync(rebuiltBinary) && existsSync(standaloneBinary)) {
    copyFileSync(rebuiltBinary, standaloneBinary);
    console.log(`[afterPack] synced rebuilt better-sqlite3 binary -> ${standaloneBinary}`);
  } else {
    console.warn(`[afterPack] WARNING: could not sync better-sqlite3 binary (rebuilt=${existsSync(rebuiltBinary)} standalone=${existsSync(standaloneBinary)})`);
  }
}
