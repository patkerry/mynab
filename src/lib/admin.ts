import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./db";

// The authoritative global-admin gate (re-checks the DB rather than trusting the session's optimistic
// isAdmin hint). Redirects non-admins away instead of throwing so it's usable directly at the top of
// admin Server Components; also called by every admin Server Action. Suspended admins are locked out too.
export async function requireAdmin() {
  // The desktop (SQLite) build has no users or auth — there's no admin concept, so never invoke
  // Auth.js there (it also has no AUTH_SECRET). Just send them back to the app.
  if (process.env.DB_PROVIDER === "sqlite") redirect("/budget");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.suspendedAt || !user.isAdmin) redirect("/budget");
  return user;
}
