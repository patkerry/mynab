// Create the two least-privilege Postgres roles the web app uses, so nothing runs as the `postgres`
// superuser (see ARCHITECTURE.md). Safe to re-run — an existing role keeps its password unless you
// pass a new one (see below). Also the way to bootstrap roles on a fresh prod database.
//
//   mynab_migrator — owns the schema + tables, runs `prisma migrate deploy` (has DDL).
//   mynab_app      — app runtime: SELECT/INSERT/UPDATE/DELETE only, NOSUPERUSER/NOCREATEDB/NOCREATEROLE.
//
// Connects as an admin role (ADMIN_DATABASE_URL, defaults to the local embedded superuser). A role's
// password is generated + printed when the role is first created; on re-run it is left untouched
// unless you explicitly set MIGRATOR_PASSWORD / APP_PASSWORD to rotate it (so a bare re-run can't
// silently break a running app whose .env holds the current password).
//
//   node scripts/create-db-roles.mjs
//   -> prints the mynab_app + mynab_migrator connection strings
import { Client } from "pg";
import { randomBytes } from "node:crypto";

const adminUrl =
  process.env.ADMIN_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/mynab";
const admin = new Client(adminUrl);

const gen = () => randomBytes(24).toString("base64url"); // URL-safe, no escaping needed in a DSN

// CREATE/ALTER ROLE and GRANT ... ON DATABASE are utility statements — they take no bind params, so
// values must be inlined safely: lit() for string literals (single-quoted), qid() for identifiers
// (double-quoted). Both escape by doubling the closing quote.
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qid = (s) => `"${String(s).replace(/"/g, '""')}"`;

// Ensure a LOGIN role with exactly the intended (non-elevated) attributes. Password policy:
//   • role missing         -> create with envPassword || a generated one; return it
//   • role exists + env pw  -> rotate to envPassword; return it
//   • role exists, no env   -> leave the password ALONE (return null); attributes still re-enforced
async function ensureRole(client, name, envPassword) {
  const attrs = "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE";
  const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  if (!rowCount) {
    const pw = envPassword || gen();
    await client.query(`CREATE ROLE ${qid(name)} WITH ${attrs} PASSWORD ${lit(pw)}`);
    console.log(`role ${name}: created`);
    return pw;
  }
  if (envPassword) {
    await client.query(`ALTER ROLE ${qid(name)} WITH ${attrs} PASSWORD ${lit(envPassword)}`);
    console.log(`role ${name}: existed, password rotated + attributes enforced`);
    return envPassword;
  }
  await client.query(`ALTER ROLE ${qid(name)} WITH ${attrs}`);
  console.log(`role ${name}: existed, attributes enforced, password left unchanged`);
  return null;
}

await admin.connect();
try {
  const dbName = (await admin.query("SELECT current_database() AS db")).rows[0].db;

  // One transaction so a mid-sequence failure never leaves the DB half-configured.
  await admin.query("BEGIN");

  const migratorPw = await ensureRole(admin, "mynab_migrator", process.env.MIGRATOR_PASSWORD);
  const appPw = await ensureRole(admin, "mynab_app", process.env.APP_PASSWORD);

  // Migrator owns the schema and every existing app object, so `migrate deploy` can ALTER/DROP them.
  // Reassign only public-schema tables/sequences (never system catalogs, so no REASSIGN OWNED).
  await admin.query(`ALTER SCHEMA public OWNER TO ${qid("mynab_migrator")}`);
  const objs = await admin.query(
    `SELECT 'TABLE' AS kind, tablename AS name FROM pg_tables WHERE schemaname='public'
     UNION ALL
     SELECT 'SEQUENCE', sequencename FROM pg_sequences WHERE schemaname='public'`,
  );
  for (const { kind, name } of objs.rows) {
    await admin.query(`ALTER ${kind} public.${qid(name)} OWNER TO ${qid("mynab_migrator")}`);
  }
  console.log(`migrator now owns public schema + ${objs.rowCount} objects`);

  // App: connect + read/write existing objects only. No DDL, no ownership.
  await admin.query(`GRANT CONNECT ON DATABASE ${qid(dbName)} TO mynab_app`);
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

  await admin.query("COMMIT");

  // Build DSNs off the admin URL so host, port, and query params (e.g. ?sslmode=require) survive, and
  // the URL API percent-encodes the password. A left-unchanged password can't be reprinted.
  const dsn = (user, pw) => {
    if (pw === null) {
      const p = new URL(adminUrl);
      return `${p.protocol}//${user}:<existing-password-unchanged>@${p.host}/${dbName}${p.search}`;
    }
    const u = new URL(adminUrl);
    u.username = user;
    u.password = pw;
    u.pathname = `/${dbName}`;
    return u.toString();
  };
  console.log("\n--- connection strings (store securely) ---");
  console.log("DATABASE_URL         =", dsn("mynab_app", appPw));
  console.log("MIGRATE_DATABASE_URL =", dsn("mynab_migrator", migratorPw));
} catch (err) {
  await admin.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  await admin.end();
}
