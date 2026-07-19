import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge/proxy-safe Auth.js config: providers + pages only, NO database access. Imported by both the
// full auth instance (src/auth.ts, which adds the DB-backed callbacks) and the proxy (src/auth-proxy.ts,
// which only needs to read the session cookie). Google reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from
// the environment automatically; token signing uses AUTH_SECRET. trustHost is required for non-Vercel
// hosts (Railway/Render/localhost) so Auth.js accepts the deployment's own origin.
export const authConfig = {
  trustHost: true,
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
} satisfies NextAuthConfig;
