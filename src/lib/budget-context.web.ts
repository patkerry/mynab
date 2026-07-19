import "server-only";

// Web (Postgres) active-budget resolver. Split into its own module so the desktop build never
// imports Auth.js. Implemented fully in the Auth.js wiring step; until then it fails closed so a
// web deployment can't accidentally run unauthenticated.
import type { ActiveBudget } from "./budget-context";

export async function resolveWebActiveBudget(): Promise<ActiveBudget> {
  throw new Error(
    "Web auth is not configured yet. getActiveBudget() on the web requires the Auth.js session " +
      "resolver (added in the multi-user auth step).",
  );
}
