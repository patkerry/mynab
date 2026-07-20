// Runs once on server startup (Next.js instrumentation hook). See node_modules/next/dist/docs/
// 01-app/02-guides/instrumentation.md.
//
// Fail-fast guard against the one deployment footgun that silently disables authentication: running
// the *web* server on SQLite. The SQLite path (DB_PROVIDER=sqlite) is single-user, no-auth by design —
// proxy.ts, budget-context.ts, and admin.ts all short-circuit auth for it — because it exists only for
// the embedded Electron desktop build. If a production web deployment is misconfigured onto SQLite,
// every request would bypass login and see the local budget. Refuse to boot instead.
//
// SQLite is legitimate in exactly two situations, both allowed below:
//   • the Electron desktop build, which spawns the standalone server with ELECTRON_RUN_AS_NODE=1
//     (see electron/main.js), and
//   • local development (`npm run dev:sqlite`), i.e. NODE_ENV !== "production".
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DB_PROVIDER !== "sqlite") return; // postgres (the web default) — fine
  if (process.env.ELECTRON_RUN_AS_NODE === "1") return; // Electron desktop build — fine
  if (process.env.NODE_ENV !== "production") return; // local dev:sqlite testing — fine

  throw new Error(
    "Refusing to start: DB_PROVIDER=sqlite in a production server disables authentication " +
      "(the SQLite path is single-user, no-auth, and exists only for the Electron desktop build). " +
      "Set DB_PROVIDER=postgres and point DATABASE_URL at the mynab_app role. See DEPLOY.md.",
  );
}
