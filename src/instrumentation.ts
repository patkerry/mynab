// Runs once on server startup (Next.js instrumentation hook). See node_modules/next/dist/docs/
// 01-app/02-guides/instrumentation.md.
export async function register() {
  // The DB_PROVIDER guard is Node.js-only (it calls process.exit). Gate it on the Node runtime and
  // load it via dynamic import so it never lands in an Edge bundle — the pattern from the
  // "Importing runtime-specific code" section of the instrumentation guide.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertDbProvider } = await import("./lib/assert-db-provider");
    assertDbProvider();

    // The sign-in allowlist fails OPEN by design (unset = any Google account may register and
    // gets a seeded budget). That's fine for a deliberately-open instance, but on a production
    // web deploy it's more likely a forgotten env var — say so loudly at boot.
    if (process.env.NODE_ENV === "production" && process.env.DB_PROVIDER !== "sqlite" && !process.env.AUTH_ALLOWED_EMAILS?.trim()) {
      console.warn(
        "[mynab] AUTH_ALLOWED_EMAILS is not set — ANY Google account can sign in and self-provision a budget on this instance. Set it to a comma-separated allowlist to lock the instance down."
      );
    }
  }
}
