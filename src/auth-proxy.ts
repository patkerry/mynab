import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

// A DB-free Auth.js instance built from the edge-safe config, used ONLY by the proxy to read the
// session cookie and redirect. Kept separate from src/auth.ts so the proxy bundle never pulls in
// Prisma. Real authorization still happens in the data layer (getActiveBudget) — this is just the
// optimistic redirect gate the Next docs recommend.
const { auth } = NextAuth(authConfig);

export const authProxy = auth((req) => {
  const path = req.nextUrl.pathname;
  // Auth.js's own endpoints must always be reachable (sign-in/callback/sign-out).
  if (path.startsWith("/api/auth")) return NextResponse.next();

  const isLoggedIn = !!req.auth?.user;
  const isLogin = path === "/login" || path.startsWith("/login/");

  if (!isLoggedIn && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/budget", req.nextUrl));
  }
  return NextResponse.next();
});
