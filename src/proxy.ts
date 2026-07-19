import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renamed `middleware` -> `proxy` (see node_modules/next/dist/docs .../proxy.md). Runs
// before every matched request. Its only job here is the optimistic auth redirect for the WEB build.
//
// The desktop build serves this same Next app from an embedded server with DB_PROVIDER=sqlite and no
// auth — so we short-circuit for it BEFORE loading any Auth.js code. That also means desktop never
// needs AUTH_SECRET/AUTH_GOOGLE_* env vars. The dynamic import keeps next-auth out of the desktop path.
export default async function proxy(req: NextRequest, ev: unknown) {
  if (process.env.DB_PROVIDER === "sqlite") return NextResponse.next();
  const { authProxy } = await import("./auth-proxy");
  return (authProxy as unknown as (req: NextRequest, ev: unknown) => Promise<Response> | Response)(req, ev);
}

export const config = {
  // Run on everything except Auth.js endpoints and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\.png$|favicon.ico).*)"],
};
