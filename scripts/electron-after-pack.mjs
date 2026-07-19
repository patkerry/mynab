// electron-builder's extraResources/files copier special-cases "node_modules" directories (its
// own dependency-walking/dedup logic, meant for the app's own top-level deps) and silently drops
// the standalone Next.js server's bundled node_modules when copied that way — confirmed by
// inspecting the packaged output, not guessed. Bypassing that entirely here with a plain
// recursive filesystem copy, run after packaging, is the standard workaround for embedding a
// `next build`-produced `output: "standalone"` bundle in an Electron app.
import { cpSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default async function afterPack(context) {
  const root = join(import.meta.dirname, "..");

  // Resources live in different places per platform: on macOS they're inside the .app bundle
  // (Contents/Resources), on Windows/Linux they're a plain `resources/` dir next to the binary.
  // context.appOutDir points at the platform output dir either way, so branch on the platform.
  const isMac = context.electronPlatformName === "darwin";
  const resourcesDir = isMac
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : join(context.appOutDir, "resources");

  const standaloneSrc = join(root, ".next", "standalone");
  const appStandaloneDir = join(resourcesDir, "app", ".next", "standalone");
  // dereference: Turbopack emits content-hashed symlinks under .next/standalone/.next/node_modules
  // (e.g. better-sqlite3-<hash> -> ../../node_modules/better-sqlite3). Copying them verbatim ships
  // fragile symlinks and, for `--universal` builds, makes @electron/universal resolve the symlinked
  // native (.node) file inconsistently between the arm64/x64 slices — it then reports a mach-o file
  // count mismatch and aborts. Dereferencing turns them into real dirs: identical in both slices.
  cpSync(standaloneSrc, appStandaloneDir, { recursive: true, force: true, dereference: true });
  console.log(`[afterPack] copied ${standaloneSrc} -> ${appStandaloneDir}`);

  // Next's standalone tracer strips binding.gyp from its bundled better-sqlite3 copy, so
  // @electron/rebuild never recognizes it as a native module to rebuild — it silently ships
  // whatever .node binary happened to be in node_modules at `next build` time (wrong ABI/OS/arch).
  // electron-builder rebuilds the app's own top-level node_modules/better-sqlite3 for the real
  // target (Electron ABI + arch) during its "install native dependencies" step, before packaging —
  // so the copy in the project's node_modules is already correct at afterPack time. Copy that over
  // the standalone copy (same package/version either way). Sourcing from node_modules rather than
  // the packaged app.asar.unpacked avoids a timing race — asar (un)packing runs after afterPack.
  const rebuiltBinary = join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  const standaloneBinary = join(appStandaloneDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  if (existsSync(rebuiltBinary) && existsSync(standaloneBinary)) {
    copyFileSync(rebuiltBinary, standaloneBinary);
    console.log(`[afterPack] synced rebuilt better-sqlite3 binary -> ${standaloneBinary}`);
  } else {
    console.warn(`[afterPack] WARNING: could not sync better-sqlite3 binary (rebuilt=${existsSync(rebuiltBinary)} standalone=${existsSync(standaloneBinary)})`);
  }

  // Ad-hoc code-sign the finished bundle. We ship without a Developer ID, and electron-builder's
  // own signing is disabled (mac.identity = null). But the app can't just be left unsigned: this
  // afterPack step copies files into Resources AFTER Electron's original ad-hoc signature was made,
  // which invalidates the seal — macOS on Apple Silicon then refuses to launch it entirely ("code
  // has no resources but signature indicates they must be present"). Re-sealing the whole bundle
  // with a fresh ad-hoc signature + entitlements (see electron/entitlements.mac.plist) produces a
  // valid, launchable app. This hook runs last for both single-arch and the merged --universal app,
  // so signing here (after the lipo merge) is correct in both cases.
  //
  // Recipients still see Gatekeeper's "unidentified developer" prompt on a downloaded copy (right-
  // click > Open, or clear the quarantine attr) — that's inherent to not having a Developer ID and
  // is separate from the invalid-seal problem this fixes. Proper signing+notarization would need an
  // Apple Developer account.
  // Skip the two per-arch temp slices of a --universal build (mac-universal-{x64,arm64}-temp):
  // signing each slice makes their _CodeSignature/CodeResources differ, and @electron/universal
  // then aborts the merge ("Expected all non-binary files to have identical SHAs"). Sign only the
  // merged universal app (appOutDir mac-universal) and single-arch builds (mac-arm64 / mac-x64).
  const isUniversalSlice = isMac && context.appOutDir.endsWith("-temp");
  if (isMac && !isUniversalSlice) {
    const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    const entitlements = join(root, "electron", "entitlements.mac.plist");
    console.log(`[afterPack] ad-hoc signing ${appPath}`);
    execFileSync(
      "codesign",
      ["--force", "--deep", "--sign", "-", "--entitlements", entitlements, appPath],
      { stdio: "inherit" },
    );
    execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
    console.log(`[afterPack] ad-hoc signature verified`);
  }
}
