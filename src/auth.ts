import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { ensureUserAndBudget } from "@/lib/user-provisioning";

// Full Auth.js instance (Node runtime — has DB access via the jwt callback). Used by the route
// handler (src/app/api/auth/[...nextauth]/route.ts) and by getActiveBudget's web path. The proxy
// uses the lighter DB-free instance in src/auth-proxy.ts instead.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    // Runs on every token read; `user` is only set on initial sign-in. On first sign-in we provision
    // the app-level User + their first Budget + OWNER Membership (idempotent by email), then stash our
    // DB user id on the token so getActiveBudget can resolve the user's budgets without a DB lookup here.
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await ensureUserAndBudget({
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        });
        token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});
