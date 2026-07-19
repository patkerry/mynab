// Build a universal (fat) better-sqlite3 native binary for Electron by rebuilding it for both
// arm64 and x64 against Electron's ABI, then lipo-merging the two .node files in place. This is a
// prerequisite for `electron-builder --universal` on macOS: @electron/universal needs every Mach-O
// file to already contain both slices (or match its x64ArchFiles rule), and better-sqlite3 is the
// one native module this app actually ships. Run before the universal electron-builder step.
//
// Requires macOS (lipo) and an Apple Silicon or Intel host with the Xcode command-line tools;
// electron-rebuild cross-compiles the non-host arch from source (--build-from-source).
import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dirname, "..");
const binary = join(root, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const tmp = tmpdir();
const slices = {};

for (const arch of ["arm64", "x64"]) {
  console.log(`[fat-sqlite] rebuilding better-sqlite3 for ${arch} (Electron ABI)...`);
  execFileSync(
    "npx",
    ["electron-rebuild", "-f", "-w", "better-sqlite3", "-a", arch, "--build-from-source"],
    { cwd: root, stdio: "inherit" },
  );
  const slice = join(tmp, `better_sqlite3-${arch}.node`);
  copyFileSync(binary, slice);
  slices[arch] = slice;
}

console.log("[fat-sqlite] merging slices into a universal binary...");
execFileSync("lipo", ["-create", slices.arm64, slices.x64, "-output", binary], { stdio: "inherit" });
execFileSync("lipo", ["-info", binary], { stdio: "inherit" });
