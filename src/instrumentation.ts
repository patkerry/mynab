// Runs once on server startup (Next.js instrumentation hook). See node_modules/next/dist/docs/
// 01-app/02-guides/instrumentation.md.
export async function register() {
  // The DB_PROVIDER guard is Node.js-only (it calls process.exit). Gate it on the Node runtime and
  // load it via dynamic import so it never lands in an Edge bundle — the pattern from the
  // "Importing runtime-specific code" section of the instrumentation guide.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDbProvider } = await import("./lib/assert-db-provider");
    assertDbProvider();
  }
}
