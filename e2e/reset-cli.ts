import { resetDb } from "./db";

// Invoked from specs via `npx tsx e2e/reset-cli.ts` (see resetLedger in budget.spec.ts):
// Playwright's own TS loader can't parse the generated Prisma client (ESM/import.meta), so specs
// never import db.ts directly — tsx handles it fine in a child process.
resetDb().then(() => process.exit(0));
