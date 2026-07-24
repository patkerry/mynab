// Guards the dual-schema invariant: prisma/schema.postgres.prisma (web/Postgres) and
// prisma/schema.sqlite.prisma (Electron desktop/SQLite) must define identical models. Runs in
// `npm test`. See ARCHITECTURE.md ("The dual-schema split") for the why.
//
// WHAT THIS GUARANTEES
//   The two files are compared as EXACT TEXT from the first enum (`enum AccountType`) to the end.
//   Because it's a byte-for-byte comparison of the whole model body, it catches ANY divergence in
//   that region: added/removed/renamed models, fields, enum values, scalar types, `@default`s,
//   `@unique`/`@@index`/`@@map`, relation `onDelete` rules — and even comments and whitespace. If
//   the bodies aren't identical, it fails. This is deliberately strict: identical text is the
//   simplest proof the two generated clients are shape-compatible (src/lib/db.ts casts the SQLite
//   client to the Postgres client's type, which is only sound while the models match exactly).
//
// WHAT THIS DOES *NOT* CATCH (know these before trusting it)
//   1. Anything declared in the HEADER region (before `enum AccountType`) is NOT compared — that
//      region legitimately differs (generator `output` path, datasource `provider`). The guard
//      below fails if a `model`/`enum` is declared there, so a new declaration can't silently
//      escape comparison by landing above the marker. Keep new enums/models BELOW `enum AccountType`.
//   2. It is a TEXT check, not a semantic/provider-behavior check. Identical text can still behave
//      differently at runtime because Postgres and SQLite are different engines: SQLite has no
//      native enum type (Prisma stores enums as TEXT), no native DateTime (stored as TEXT/INT),
//      and `createMany`'s `skipDuplicates` is unsupported on SQLite (see src/lib/import.ts, which
//      pre-filters instead). Portability of the FEATURES you use across both engines is on you;
//      this script only proves the schemas are textually the same.
//   3. It does not run `prisma validate` or verify the migrations in migrations-postgres/ and
//      migrations-sqlite/ actually produce these schemas — migrations are authored per-provider
//      and are not checked here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARKER = "\nenum AccountType";

function splitSchema(path: string): { header: string; body: string } {
  const text = readFileSync(path, "utf8");
  const markerIndex = text.indexOf(MARKER);
  if (markerIndex === -1) {
    throw new Error(`${path}: could not find start of model body ("${MARKER.trim()}")`);
  }
  return { header: text.slice(0, markerIndex), body: text.slice(markerIndex) };
}

const postgresPath = join(import.meta.dirname, "..", "prisma", "schema.postgres.prisma");
const sqlitePath = join(import.meta.dirname, "..", "prisma", "schema.sqlite.prisma");

const postgres = splitSchema(postgresPath);
const sqlite = splitSchema(sqlitePath);

// Guard (blind-spot #1): nothing model-like may live in the un-compared header region. Otherwise a
// model/enum declared above the marker would drift freely between the two files, undetected.
const declInHeader = /^\s*(model|enum)\s+\w+/m;
for (const [path, { header }] of [
  [postgresPath, postgres] as const,
  [sqlitePath, sqlite] as const,
]) {
  if (declInHeader.test(header)) {
    console.error(
      `${path}: a model/enum is declared BEFORE "${MARKER.trim()}", so it is outside the parity check.\n` +
        `Move every model and enum below "${MARKER.trim()}" so it is compared between the two schemas.`,
    );
    process.exit(1);
  }
}

if (postgres.body !== sqlite.body) {
  console.error(
    "schema.postgres.prisma and schema.sqlite.prisma have diverged outside their datasource/generator headers.\n" +
      "Keep the model bodies (everything from `enum AccountType` onward) byte-for-byte identical between the two files.",
  );
  process.exit(1);
}

console.log("schema parity OK: schema.postgres.prisma and schema.sqlite.prisma models match");
