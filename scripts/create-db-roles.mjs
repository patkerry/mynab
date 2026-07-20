// Create the two least-privilege Postgres roles the web app uses, so nothing runs as the `postgres`
// superuser (see ARCHITECTURE.md). Idempotent — safe to re-run; also the way to bootstrap roles on
// a fresh prod database.
//
//   mynab_migrator — owns the schema + tables, runs `prisma migrate deploy` (has DDL).
//   mynab_app      — app runtime: SELECT/INSERT/UPDATE/DELETE only, NOSUPERUSER/NOCREATEDB/NOCREATEROLE.
//
// Connects as an admin role (ADMIN_DATABASE_URL, defaults to the local embedded superuser). Passwords
// come from MIGRATOR_PASSWORD / APP_PASSWORD if set, otherwise a strong one is generated and printed.
//
//   node scripts/create-db-roles.mjs
//   -> prints the mynab_app + mynab_migrator connection strings
import { Client } from "pg";
import { randomBytes } from "node:crypto";

const adminUrl =
  process.env.ADMIN_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/mynab";
const admin = new Client(adminUrl);
await admin.connect();

const dbName = (await admin.query("SELECT current_database() AS db")).rows[0].db;
const host = new URL(adminUrl);

const gen = () => randomBytes(24).toString("base64url"); // URL-safe, no escaping needed in a DSN
const migratorPw = process.env.MIGRATOR_PASSWORD || gen();
const appPw = process.env.APP_PASSWORD || gen();

// CREATE/ALTER ROLE are utility statements — they can't take $1 bind params, so the password must be
// an inlined SQL literal. Escape by doubling single quotes (generated passwords are base64url and have
// none, but this stays safe for a user-supplied MIGRATOR_PASSWORD/APP_PASSWORD).
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// CREATE ROLE errors if the role exists, so guard each. LOGIN + explicitly no elevated attributes.
async function ensureRole(name, password) {
  const attrs = `WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${lit(password)}`;
  const { rowCount } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  if (rowCount) {
    await admin.query(`ALTER ROLE ${name} ${attrs}`);
    console.log(`role ${name}: already existed, password + attributes reset`);
  } else {
    await admin.query(`CREATE ROLE ${name} ${attrs}`);
    console.log(`role ${name}: created`);
  }
}

await ensureRole("mynab_migrator", migratorPw);
await ensureRole("mynab_app", appPw);

// Migrator owns the schema and every existing app object, so `migrate deploy` can ALTER/DROP them.
// Reassign only the public-schema tables/sequences (never system catalogs, so no REASSIGN OWNED).
await admin.query("ALTER SCHEMA public OWNER TO mynab_migrator");
const objs = await admin.query(
  `SELECT 'TABLE' AS kind, tablename AS name FROM pg_tables WHERE schemaname='public'
   UNION ALL
   SELECT 'SEQUENCE', sequencename FROM pg_sequences WHERE schemaname='public'`,
);
for (const { kind, name } of objs.rows) {
  await admin.query(`ALTER ${kind} public."${name}" OWNER TO mynab_migrator`);
}
console.log(`migrator now owns public schema + ${objs.rowCount} objects`);

// App: connect + read/write existing objects only. No DDL, no ownership.
await admin.query("GRANT CONNECT ON DATABASE " + dbName + " TO mynab_app");
await admin.query("GRANT USAGE ON SCHEMA public TO mynab_app");
await admin.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mynab_app");
await admin.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mynab_app");
// Future tables the migrator creates in later migrations get the same grants automatically.
await admin.query(
  "ALTER DEFAULT PRIVILEGES FOR ROLE mynab_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mynab_app",
);
await admin.query(
  "ALTER DEFAULT PRIVILEGES FOR ROLE mynab_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mynab_app",
);
console.log("app granted CRUD on current + future tables");

await admin.end();

const dsn = (user, pw) => `postgresql://${user}:${pw}@${host.host}/${dbName}`;
console.log("\n--- connection strings (store securely) ---");
console.log("DATABASE_URL         =", dsn("mynab_app", appPw));
console.log("MIGRATE_DATABASE_URL =", dsn("mynab_migrator", migratorPw));
