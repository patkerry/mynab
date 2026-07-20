// Node.js-only startup guard, invoked from src/instrumentation.ts via a dynamic import so its
// process.exit call never enters an Edge bundle.
//
// Fail-fast against the one deployment footgun that silently disables authentication: running the
// *web* server on SQLite. The SQLite path (DB_PROVIDER=sqlite) is single-user, no-auth by design —
// proxy.ts, budget-context.ts, and admin.ts all short-circuit auth for it — because it exists only
// for the embedded Electron desktop build. On a misconfigured web deployment every request would
// bypass login and see the local budget.
//
// SQLite is legitimate in exactly two situations, both allowed below:
//   • the Electron desktop build, which spawns the standalone server with ELECTRON_RUN_AS_NODE=1
//     (see electron/main.js), and
//   • explicit local development (`npm run dev:sqlite`), i.e. NODE_ENV === "development".
// The check is deny-by-default: an unset/other NODE_ENV does NOT slip through — only "development".
export function assertDbProvider() {
  if (process.env.DB_PROVIDER !== "sqlite") return; // postgres (the web default) — fine
  if (process.env.ELECTRON_RUN_AS_NODE === "1") return; // Electron desktop build — fine
  if (process.env.NODE_ENV === "development") return; // local `dev:sqlite` testing — fine

  // Hard stop via process.exit: we do NOT rely on Next aborting the server when register() throws
  // (that is not a documented guarantee), so a thrown error that Next merely logged would leave an
  // auth-disabled server serving requests. Exiting the process makes that impossible.
  console.error(
    "\n[mynab] FATAL: refusing to start — DB_PROVIDER=sqlite outside the Electron desktop build or " +
      "local development disables authentication (the SQLite path is single-user and no-auth). Set " +
      "DB_PROVIDER=postgres and point DATABASE_URL at the mynab_app role. See DEPLOY.md.\n",
  );
  process.exit(1);
}
