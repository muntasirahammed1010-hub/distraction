// =============================================================================
// app/api/session/start/route.ts — Start Focus Session
// =============================================================================
// Called by the dashboard "Start Focus Session" button via a Server Action
// or client-side fetch. Only authenticated users (browser cookie session) can
// call this — it is NOT exposed to the extension (use /api/session/status for that).
//
// POST /api/session/start
// Body: { "plannedDurationMin": 45 }
// Returns: { "session": { id, startedAt, plannedDurationMin } }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // ── 1. Authenticate via NextAuth session cookie ───────────────────────────
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const userId = session.user.id;

  // ── 2. Prevent duplicate active sessions ─────────────────────────────────
  // A user should never have two active sessions simultaneously.
  const existing = await prisma.focusSession.findFirst({
    where: { userId, endedAt: null },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A focus session is already active.", session: existing },
      { status: 409 } // Conflict
    );
  }

  // ── 3. Parse optional duration ────────────────────────────────────────────
  let plannedDurationMin: number | null = null;
  try {
    const body = await req.json();
    if (typeof body.plannedDurationMin === "number" && body.plannedDurationMin > 0) {
      plannedDurationMin = Math.min(body.plannedDurationMin, 480); // max 8 hours
    }
  } catch {
    // Body is optional — an open-ended session is valid
  }

  // ── 4. Create the session ─────────────────────────────────────────────────
  const newSession = await prisma.focusSession.create({
    data: {
      userId,
      plannedDurationMin,
    },
    select: {
      id: true,
      startedAt: true,
      plannedDurationMin: true,
    },
  });

  return NextResponse.json({ session: newSession }, { status: 201 });
}
