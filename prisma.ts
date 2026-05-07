// =============================================================================
// lib/prisma.ts — Prisma Client Singleton
// =============================================================================
// PROBLEM: Next.js hot-reload in development creates new module instances on
// every file change. Each instance would normally open a new Prisma Client
// connection, quickly exhausting the PostgreSQL connection pool (default: 10).
//
// SOLUTION: Store the client on the Node.js `global` object, which persists
// across hot-reloads in development. In production, each serverless invocation
// gets exactly one client (no global sharing needed).
// =============================================================================

import { PrismaClient } from "@prisma/client";

// Extend the NodeJS global type so TypeScript knows about our custom property.
declare global {
  // `var` is intentional here — `let`/`const` don't attach to the global object.
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Create the Prisma client with query logging in development.
// In production, only log errors to avoid log bloat.
const prisma =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// Attach to global only in development so hot-reload reuses the same instance.
if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

export default prisma;
