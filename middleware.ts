// =============================================================================
// middleware.ts — Route Protection Middleware
// =============================================================================
// Runs on the Edge Runtime before EVERY matching request.
// Protects all /dashboard/* routes: unauthenticated users are redirected to /login.
// Public routes (/, /login, /api/auth/*, /api/session/status, /api/roast) are
// explicitly excluded from protection.
//
// WHY MIDDLEWARE AND NOT LAYOUT GUARDS?
// Layout guards (in layout.tsx) only run on the server during rendering, which
// means the unauthenticated user briefly sees the layout HTML before the redirect.
// Middleware fires BEFORE rendering — the redirect is invisible and instantaneous.
// =============================================================================

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The auth() helper from our lib/auth.ts is NextAuth v5's middleware-compatible
// function. Wrapping our middleware in it automatically validates the session.
export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;

  // ── Public API routes — always accessible ─────────────────────────────────
  // These routes use their own token-based auth (X-Extension-Token header),
  // so they must NOT require a browser session cookie.
  const PUBLIC_API_PREFIXES = [
    "/api/auth",       // NextAuth handlers (/api/auth/signin, /callback/*, etc.)
    "/api/roast",      // Extension roast engine
    "/api/session/status", // Extension polling endpoint
  ];

  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isPublicApi) {
    return NextResponse.next();
  }

  // ── Protected routes ──────────────────────────────────────────────────────
  const isProtectedRoute = pathname.startsWith("/dashboard");

  // `req.auth` is populated by the wrapping `auth()` call.
  // If it's null/undefined, the user has no valid session.
  if (isProtectedRoute && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    // Preserve the intended destination so we can redirect back after login.
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

// ─── MATCHER ─────────────────────────────────────────────────────────────────
// The `matcher` config tells Next.js which paths to run the middleware on.
// Explicitly exclude static files and Next.js internals to avoid overhead.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
