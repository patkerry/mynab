import "server-only";

// The active-budget resolver: the single place the app answers "which budget does this request
// operate on, and what may the caller do to it?" Every query and server action funnels through
// getActiveBudget() so budget scoping can't be forgotten in one spot and leak another user's data.
//
// Two runtimes:
//   • Desktop (DB_PROVIDER=sqlite): single embedded budget, no auth. Always the local budget with
//     full (OWNER) rights. See electron/main.js — the DB is seeded with exactly this budget id.
//   • Web (Postgres): resolved from the Auth.js session + a selected-budget cookie, validated
//     against the user's Membership rows. Implemented in the auth step; until then the web branch
//     throws so a misconfigured web deployment fails closed rather than leaking.

import type { MembershipRole } from "@/generated/prisma-postgres/client";

// Fixed id of the desktop's one-and-only budget. The multi-user migration seeds a budget with this
// id (see prisma/migrations-sqlite/.../migration.sql) and electron/main.js seeds its defaults under
// it, so the desktop app always has exactly this budget to operate on.
export const LOCAL_BUDGET_ID = "default-budget";

const isDesktop = process.env.DB_PROVIDER === "sqlite";

export type ActiveBudget = {
  budgetId: string;
  role: MembershipRole;
};

export type Permission = "read" | "write" | "manage";

// Which roles may perform which class of operation.
const ROLE_ALLOWS: Record<MembershipRole, Permission[]> = {
  OWNER: ["read", "write", "manage"],
  EDITOR: ["read", "write"],
  VIEWER: ["read"],
};

/**
 * Resolve the budget the current request operates on, plus the caller's role in it.
 * Desktop: always the local budget as OWNER. Web: from session + selected-budget cookie.
 */
export async function getActiveBudget(): Promise<ActiveBudget> {
  if (isDesktop) {
    return { budgetId: LOCAL_BUDGET_ID, role: "OWNER" };
  }
  // Web path — implemented alongside Auth.js wiring. Fail closed until then.
  const { resolveWebActiveBudget } = await import("./budget-context.web");
  return resolveWebActiveBudget();
}

/** Convenience: just the budget id (most read paths only need this). */
export async function getActiveBudgetId(): Promise<string> {
  return (await getActiveBudget()).budgetId;
}

/**
 * Resolve the active budget and assert the caller has at least the given permission for it.
 * Throws on insufficient role — call at the top of every mutating server action.
 */
export async function requireBudget(permission: Permission = "read"): Promise<ActiveBudget> {
  const active = await getActiveBudget();
  if (!ROLE_ALLOWS[active.role].includes(permission)) {
    throw new Error(`Forbidden: role ${active.role} cannot ${permission} this budget`);
  }
  return active;
}
