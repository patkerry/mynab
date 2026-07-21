import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { ensureUserAndBudget } from "@/lib/user-provisioning";
import { parseAllowedEmails, isEmailAllowed } from "@/lib/auth-allowlist";

// Optional sign-in allowlist. Set AUTH_ALLOWED_EMAILS to a comma-separated list to restrict sign-in
// to just those addresses (case-insensitive) — everyone else is rejected at the OAuth step. Leave it
// unset to allow any Google account (each new user gets their own isolated budget). Parsed once here.
const ALLOWED_EMAILS = parseAllowedEmails(process.env.AUTH_ALLOWED_EMAILS);

// Full Auth.js instance (Node runtime — has DB access via the jwt callback). Used by the route
// handler (src/app/api/auth/[...nextauth]/route.ts) and by getActiveBudget's web path. The proxy
// uses the lighter DB-free instance in src/auth-proxy.ts instead.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    // Block sign-in for a non-allowlisted or suspended account (existing users only — a brand-new
    // user can't be suspended yet). Provisioning happens in the jwt callback below.
    async signIn({ user }) {
      if (!user?.email) return false;
      if (!isEmailAllowed(ALLOWED_EMAILS, user.email)) return false;
      const existing = await (await import("@/lib/db")).prisma.user.findUnique({
        where: { email: user.email },
        select: { suspendedAt: true },
      });
      if (existing?.suspendedAt) return false;
      return true;
    },
    // Runs on every token read; `user` is only set on initial sign-in. On first sign-in we provision
    // the app-level User + their first Budget + OWNER Membership (idempotent by email), then stash our
    // DB user id + admin flag on the token. isAdmin here is only an optimistic hint for the UI — the
    // real /admin gate re-checks the DB (see src/lib/admin.ts requireAdmin).
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await ensureUserAndBudget({
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        });
        token.userId = dbUser.id;
        token.isAdmin = dbUser.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
        session.user.isAdmin = token.isAdmin === true;
      }
      return session;
    },
  },
});
