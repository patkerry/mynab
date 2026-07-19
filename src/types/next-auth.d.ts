import type { DefaultSession } from "next-auth";

// Expose our app-level DB user id on the session (set in the jwt/session callbacks in src/auth.ts)
// and on the JWT itself.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    isAdmin?: boolean;
  }
}
