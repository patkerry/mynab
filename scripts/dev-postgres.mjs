// Local development Postgres via the embedded-postgres package — a real Postgres 18 server run from
// a downloaded binary, so web/multi-user testing needs no system Postgres, Docker, or Homebrew.
// Data lives in ./.pgdata (gitignored). Keeps running until killed; stops the server cleanly on exit.
//
//   node scripts/dev-postgres.mjs
//   -> postgresql://postgres:postgres@localhost:5432/mynab
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
});

if (!existsSync(join(dir, "PG_VERSION"))) {
  console.log("initialising Postgres data dir at .pgdata ...");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("mynab");
  console.log("created database 'mynab'");
} catch {
  console.log("database 'mynab' already exists");
}
console.log("EMBEDDED_POSTGRES_READY postgresql://postgres:postgres@localhost:5432/mynab");

async function shutdown() {
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// Keep the process (and thus the Postgres server) alive.
setInterval(() => {}, 1 << 30);
