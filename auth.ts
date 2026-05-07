// =============================================================================
// lib/auth.ts — NextAuth.js v5 Configuration
// =============================================================================
// This file is the single source of truth for authentication configuration.
// It is imported by:
//   - app/api/auth/[...nextauth]/route.ts  (the HTTP handler)
//   - middleware.ts                        (route protection)
//   - Server Components that need the session (via `auth()`)
// =============================================================================

import NextAuth, { type NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "@/lib/prisma";

// ─── AUTH OPTIONS ─────────────────────────────────────────────────────────────
export const authConfig: NextAuthConfig = {
  // Use Prisma to persist users, accounts, and sessions in PostgreSQL.
  adapter: PrismaAdapter(prisma),

  providers: [
    // Google OAuth — the simplest auth flow for students (they all have Google accounts).
    // Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Force account selection even if user is already signed in to Google.
          // This prevents confusion when students share devices.
          prompt: "select_account",
        },
      },
    }),
  ],

  // Custom pages override NextAuth's default (ugly) UI.
  pages: {
    signIn: "/login",
    error: "/login", // Redirect auth errors back to the login page with `?error=` param
  },

  callbacks: {
    // ── session callback ──────────────────────────────────────────────────────
    // Extend the default session object to include the user's database ID.
    // Without this, client components only get name/email/image from the session.
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },

  // Use JWT for stateless sessions in the Edge runtime (middleware).
  // The database session is still stored via the Prisma adapter for the API routes.
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

// ─── EXPORTED HELPERS ─────────────────────────────────────────────────────────
// `auth`       — call in Server Components: const session = await auth()
// `handlers`   — { GET, POST } exported from the catch-all API route
// `signIn`     — programmatic sign-in from Server Actions
// `signOut`    — programmatic sign-out
export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
