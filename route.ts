// =============================================================================
// app/api/roast/route.ts — Gemini-Powered Roast Engine
// =============================================================================
// CALLER: The Chrome Extension's blocked.html page calls this endpoint
// immediately after redirecting the user, passing the site they tried to visit.
// The returned roast is displayed full-screen with zero mercy.
//
// POST /api/roast
// Body: { "context": "User tried to open facebook.com", "siteUrl": "facebook.com" }
// Returns: { "line1": "...", "line2": "...", "id": "<roastLogId>" }
//
// AUTH: Validated via the user's extensionToken header (X-Extension-Token).
// This avoids requiring a browser cookie from the extension's background worker.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getGeminiRoastModel, type RoastResponse } from "@/lib/gemini";
import prisma from "@/lib/prisma";

// ─── Rate-limit state ─────────────────────────────────────────────────────────
// Simple in-memory rate limiter (sufficient for MVP solo project).
// UPGRADE PATH: Replace with Upstash Redis + @upstash/ratelimit for production.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;       // max requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // New window: reset counter
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true; // allowed
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

// ─── POST Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── 1. Authenticate via Extension Token ──────────────────────────────────
  const extensionToken = req.headers.get("X-Extension-Token");

  if (!extensionToken) {
    return NextResponse.json(
      { error: "Missing X-Extension-Token header." },
      { status: 401 }
    );
  }

  // Look up the user who owns this token.
  // The token is stored as a plain string in DB (not hashed) for MVP simplicity.
  // UPGRADE PATH: Hash it with bcrypt before storing; compare hash here.
  const user = await prisma.user.findUnique({
    where: { extensionToken },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid extension token. Re-pair the extension from Settings." },
      { status: 403 }
    );
  }

  // ── 2. Rate limit per user ────────────────────────────────────────────────
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Slow down — you're getting roasted too often." },
      { status: 429 }
    );
  }

  // ── 3. Parse + validate request body ─────────────────────────────────────
  let body: { context?: string; siteUrl?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const context = body.context?.trim();
  const siteUrl = body.siteUrl?.trim();

  if (!context || !siteUrl) {
    return NextResponse.json(
      { error: "Both `context` and `siteUrl` fields are required." },
      { status: 400 }
    );
  }

  // ── 4. Call Gemini API ────────────────────────────────────────────────────
  let roast: RoastResponse;

  try {
    const model = getGeminiRoastModel();

    // Build the user-turn prompt. The system instruction (persona) is already
    // baked into the model via getGeminiRoastModel().
    const prompt = `Context: ${context}\nSite attempted: ${siteUrl}`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    // Gemini is instructed to return raw JSON, but occasionally wraps it in
    // markdown code fences. Strip those defensively before parsing.
    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    roast = JSON.parse(cleaned) as RoastResponse;

    // Validate the parsed shape — Gemini can hallucinate unexpected keys.
    if (typeof roast.line1 !== "string" || typeof roast.line2 !== "string") {
      throw new Error("Gemini returned unexpected JSON shape.");
    }
  } catch (err) {
    console.error("[/api/roast] Gemini generation error:", err);

    // Fallback roast — the show must go on even if Gemini is down.
    roast = {
      line1: "Gemini is having a day off, but you still can't visit that site.",
      line2: "তোর মতো distracted ছাত্রের জন্য AI-ও tired হয়ে যায়।",
    };
  }

  // ── 5. Persist roast to DB for analytics ─────────────────────────────────
  let roastLogId: string | null = null;
  try {
    const log = await prisma.roastLog.create({
      data: {
        userId: user.id,
        context,
        roastText: `${roast.line1}\n${roast.line2}`,
      },
    });
    roastLogId = log.id;
  } catch (dbErr) {
    // Non-fatal: if DB write fails, still return the roast to the extension.
    console.error("[/api/roast] DB write error:", dbErr);
  }

  // ── 6. Return the roast ───────────────────────────────────────────────────
  return NextResponse.json({ ...roast, id: roastLogId }, { status: 200 });
}
