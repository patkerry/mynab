// Register transaction-state semantics, kept in one pure (non-`server-only`) place so the invariant
// behind the sidebar/register "Uncleared" figure has a single source of truth that can be unit-tested.
//
// NOTE ON SCOPE: the header total itself — `unclearedCents + pendingCents` in
// `getAccountTransactions` (src/lib/queries.ts) — is computed with Prisma `_sum` aggregates and can
// only be exercised against a real database, which the project has no test harness for. What IS pure
// and testable is the *state rule* these values depend on, captured below and locked by register.test.ts.

// Imported rows post already-cleared (a bank/Quicken export only contains transactions that have
// already posted) yet `pending` (awaiting human review). `src/lib/import.ts` writes exactly this
// state for every imported row. This pairing is the whole reason the register header's
// `Uncleared = unclearedCents + pendingCents` is a sum over DISJOINT sets: a pending row is
// `cleared: true`, so it never falls into the `cleared: false` bucket — the two sums can't
// double-count the same row. Change this and the header math silently starts double-counting.
export const IMPORTED_TXN_STATE = { cleared: true, pending: true } as const;

// The two register buckets, mirroring the WHERE filters the aggregates use in getAccountTransactions:
//   unclearedCents  <-  where { cleared: false }
//   pendingCents    <-  where { pending: true }
// Kept here as predicates so the disjointness property can be asserted directly in a test.
export const isUncleared = (t: { cleared: boolean }) => t.cleared === false;
export const isPending = (t: { pending: boolean }) => t.pending === true;
