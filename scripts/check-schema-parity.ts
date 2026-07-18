// Fails if prisma/schema.postgres.prisma and prisma/schema.sqlite.prisma have drifted apart
// anywhere except their datasource/generator headers. The two files must define identical
// models — see the note at the top of schema.sqlite.prisma.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function modelBody(path: string): string {
  const text = readFileSync(path, "utf8");
  const markerIndex = text.indexOf("\nenum AccountType");
  if (markerIndex === -1) {
    throw new Error(`${path}: could not find start of model body ("enum AccountType")`);
  }
  return text.slice(markerIndex);
}

const postgresPath = join(import.meta.dirname, "..", "prisma", "schema.postgres.prisma");
const sqlitePath = join(import.meta.dirname, "..", "prisma", "schema.sqlite.prisma");

const postgresBody = modelBody(postgresPath);
const sqliteBody = modelBody(sqlitePath);

if (postgresBody !== sqliteBody) {
  console.error(
    "schema.postgres.prisma and schema.sqlite.prisma have diverged outside their datasource/generator headers.\n" +
      "Keep the model bodies identical between the two files.",
  );
  process.exit(1);
}

console.log("schema parity OK: schema.postgres.prisma and schema.sqlite.prisma models match");
