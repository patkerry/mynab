import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only for the Electron packaging build (see package.json's electron:prepare, which sets
  // ELECTRON_BUILD=1) — produces a minimal, self-contained server bundle (.next/standalone) that
  // gets embedded in the desktop app instead of shipping the full node_modules tree. Left unset
  // for a plain `next build`/`next start` web deployment: "standalone" output makes `next start`
  // itself unsupported (Next prints "next start does not work with output: standalone" and tells
  // you to run .next/standalone/server.js directly instead), which would break the conventional
  // server-deployment path this app also needs to keep working.
  output: process.env.ELECTRON_BUILD === "1" ? "standalone" : undefined,

  // The CSV/QFX import sends the whole file's text through a Server Action (see importTransactions
  // in src/app/accounts/actions.ts). Server Actions cap the request body at 1MB by default, which a
  // real bank export can exceed — raise it so larger statements import instead of failing.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
