// =============================================================================
// app/api/session/status/route.ts — Focus Session Status (Extension Polling)
// =============================================================================
// This is the single most-called endpoint in the entire system.
// The Chrome Extension background service worker polls this every 30 seconds
// to determine whether to enforce blocking rules.
//
// GET /api/session/status
// Headers: X-Extension-Token: <token>
// Returns: {
//   "isActive": true,
//   "session": { "id": "...", "startedAt": "...", "plannedDurationMin": 45 },
//   "blocklist": ["facebook.com", "*.twitter.com", "youtube.com/shorts"]
// }
//
// PERFORMANCE NOTES:
// - Uses Prisma's `select` to avoid fetching unnecessary columns.
// - The blocklist is returned alongside status to save an extra round-trip.
// - The extension caches this response and only re-polls on a timer.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // ── 1. Authenticate ───────────────────────────────────────────────────────
  const extensionToken = req.headers.get("X-Extension-Token");

  if (!extensionToken) {
    return NextResponse.json({ error: "Missing X-Extension-Token." }, { status: 401 });
  }

  // Fetch the user AND their blocklist in a single query using Prisma's
  // nested `include`. This avoids a second round-trip to the DB.
  const user = await prisma.user.findUnique({
    where: { extensionToken },
    select: {
      id: true,
      blockedSites: {
        select: { pattern: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  // ── 2. Find active session ────────────────────────────────────────────────
  // "Active" = endedAt IS NULL. We only need the most recent one.
  const activeSession = await prisma.focusSession.findFirst({
    where: {
      userId: user.id,
      endedAt: null, // null means still in progress
    },
    select: {
      id: true,
      startedAt: true,
      plannedDurationMin: true,
    },
    orderBy: { startedAt: "desc" },
  });

  // ── 3. Build blocklist as plain string array ──────────────────────────────
  const blocklist = user.blockedSites.map((s) => s.pattern);

  // ── 4. Return response ────────────────────────────────────────────────────
  // Include Cache-Control: no-store so the extension always gets fresh data.
  return NextResponse.json(
    {
      isActive: activeSession !== null,
      session: activeSession ?? null,
      blocklist,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
