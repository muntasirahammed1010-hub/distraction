// =============================================================================
// app/dashboard/page.tsx — Dashboard Home: Focus Session Control
// =============================================================================
// This is the primary screen students will stare at during a focus session.
// Architecture:
//  - Server Component (page.tsx): Fetches the active session from DB at
//    request time. Passes it as a prop to the client component.
//  - Client Component (FocusSessionCard.tsx): Handles "Start/Stop" button
//    state and optimistic UI without full page reloads.
// =============================================================================

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import FocusSessionCard from "@/components/dashboard/FocusSessionCard";
import VideoPlayer from "@/components/dashboard/VideoPlayer";

// ─── METADATA ─────────────────────────────────────────────────────────────────
export const metadata = {
  title: "Focus — FocusForge",
};

// =============================================================================
// Server Component — fetches data, renders layout
// =============================================================================
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // Fetch the current active focus session (if any) directly from DB.
  // This data is fresh on every navigation — no stale cache.
  const activeSession = await prisma.focusSession.findFirst({
    where: { userId, endedAt: null },
    select: {
      id: true,
      startedAt: true,
      plannedDurationMin: true,
    },
    orderBy: { startedAt: "desc" },
  });

  // Fetch recent roast history for motivation/shame display
  const recentRoasts = await prisma.roastLog.findMany({
    where: { userId },
    take: 3,
    orderBy: { createdAt: "desc" },
    select: { roastText: true, createdAt: true },
  });

  return (
    // Two-column grid: left = focus controls, right = video player
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-6 h-full">

      {/* ─── LEFT COLUMN: Session Control ─────────────────────────────────── */}
      <div className="flex flex-col gap-6">

        {/* The interactive "Start/Stop Focus Session" card.
            This is a Client Component so it can manage button state + timers. */}
        <FocusSessionCard
          initialSession={
            activeSession
              ? {
                  id: activeSession.id,
                  startedAt: activeSession.startedAt.toISOString(),
                  plannedDurationMin: activeSession.plannedDurationMin,
                }
              : null
          }
        />

        {/* Roast Hall of Shame — shows last 3 times you got caught */}
        {recentRoasts.length > 0 && (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
              🔥 Hall of Shame
            </h3>
            <ul className="flex flex-col gap-3">
              {recentRoasts.map((roast, i) => (
                <li key={i} className="text-sm text-zinc-400 leading-relaxed">
                  <span className="text-zinc-600 text-xs mr-2">
                    {new Date(roast.createdAt).toLocaleDateString("en-GB")}
                  </span>
                  {/* Show only the first line of the roast in the list */}
                  {roast.roastText.split("\n")[0]}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Sessions Today" value="3" />
          <StatCard label="Minutes Focused" value="127" />
        </div>
      </div>

      {/* ─── RIGHT COLUMN: Video Player Area ──────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Study Material</h2>
          <span className="text-xs text-zinc-500">Curated Science Content</span>
        </div>

        {/* VideoPlayer is a Client Component that renders an iframe */}
        <VideoPlayer />

        {/* Quick-switch playlist (static for MVP) */}
        <div className="grid grid-cols-2 gap-2">
          {SCIENCE_VIDEOS.map((v) => (
            <button
              key={v.id}
              className="
                text-left px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800
                text-xs text-zinc-400 hover:text-white hover:border-zinc-600
                transition-colors duration-150 truncate
              "
            >
              🔬 {v.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SMALL HELPER COMPONENTS ──────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── STATIC DATA (replace with DB query in v2) ────────────────────────────────
const SCIENCE_VIDEOS = [
  { id: "1", title: "Cell Division — Mitosis" },
  { id: "2", title: "Newton's Laws of Motion" },
  { id: "3", title: "Periodic Table Deep Dive" },
  { id: "4", title: "DNA Replication Explained" },
];
