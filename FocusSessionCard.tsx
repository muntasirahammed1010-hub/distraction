"use client";
// =============================================================================
// components/dashboard/FocusSessionCard.tsx — Focus Session Control Widget
// =============================================================================
// CLIENT COMPONENT — handles all interactive state:
//   - Start / stop button with loading states
//   - Live elapsed timer (updates every second via setInterval)
//   - Duration selector (25 / 45 / 60 / open-ended minutes)
//   - Optimistic UI: updates instantly, confirms with API in background
//
// Props:
//   initialSession — the active session pre-fetched by the Server Component.
//                    null means no active session exists.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { Play, Square, Loader2, Clock } from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface ActiveSession {
  id: string;
  startedAt: string; // ISO 8601 string (serialised from Date by the Server Component)
  plannedDurationMin: number | null;
}

interface FocusSessionCardProps {
  initialSession: ActiveSession | null;
}

// Pre-set duration options in minutes. null = open-ended.
const DURATION_OPTIONS: { label: string; value: number | null }[] = [
  { label: "25 min", value: 25 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
  { label: "∞ Open", value: null },
];

// =============================================================================
export default function FocusSessionCard({ initialSession }: FocusSessionCardProps) {
  // ── State ───────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<ActiveSession | null>(initialSession);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(45);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  // Runs while a session is active. Recalculates elapsed time from the
  // `startedAt` timestamp to handle page refreshes correctly.
  useEffect(() => {
    if (!session) {
      setElapsedSeconds(0);
      return;
    }

    // Calculate initial elapsed seconds in case the user refreshes mid-session
    const startTime = new Date(session.startedAt).getTime();
    setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Cleanup on session end or component unmount
    return () => clearInterval(interval);
  }, [session]);

  // ── Format elapsed time ───────────────────────────────────────────────────
  const formattedTime = useCallback((totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  // ── Start session ─────────────────────────────────────────────────────────
  const handleStart = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedDurationMin: selectedDuration }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start session.");
      }

      const data = await res.json();
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── End session ───────────────────────────────────────────────────────────
  const handleEnd = async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/session/end", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to end session.");
      }

      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Progress percentage (for the ring) ───────────────────────────────────
  const progressPercent =
    session?.plannedDurationMin
      ? Math.min((elapsedSeconds / (session.plannedDurationMin * 60)) * 100, 100)
      : 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col gap-6">

      {/* Card Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Focus Session</h2>
        {session && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active
          </span>
        )}
      </div>

      {/* Timer display */}
      <div className="flex flex-col items-center gap-2 py-4">
        {/* SVG Progress Ring */}
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* Track */}
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="#27272a" /* zinc-800 */
              strokeWidth="8"
            />
            {/* Progress arc */}
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke={session ? "#8b5cf6" : "#3f3f46"} /* violet-500 or zinc-700 */
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={`${2 * Math.PI * 54 * (1 - progressPercent / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          {/* Time text inside ring */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-mono font-bold text-white tabular-nums">
              {session ? formattedTime(elapsedSeconds) : "00:00"}
            </span>
            {session?.plannedDurationMin && (
              <span className="text-xs text-zinc-500 mt-0.5">
                / {session.plannedDurationMin}m
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Duration selector — only visible when no session is active */}
      {!session && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 font-medium">Duration</label>
          <div className="grid grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setSelectedDuration(opt.value)}
                className={`
                  py-2 rounded-lg text-xs font-medium border transition-colors duration-150
                  ${selectedDuration === opt.value
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Action button */}
      <button
        onClick={session ? handleEnd : handleStart}
        disabled={isLoading}
        className={`
          w-full flex items-center justify-center gap-2
          py-3 px-4 rounded-xl text-sm font-semibold
          transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed
          ${session
            ? "bg-red-600 hover:bg-red-500 text-white"
            : "bg-violet-600 hover:bg-violet-500 text-white"
          }
        `}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : session ? (
          <><Square className="w-4 h-4" /> End Session</>
        ) : (
          <><Play className="w-4 h-4 fill-white" /> Start Focus Session</>
        )}
      </button>

      {/* Extension hint */}
      {session && (
        <p className="text-center text-xs text-zinc-600">
          <Clock className="inline w-3 h-3 mr-1" />
          Extension is blocking distractions. Stay strong.
        </p>
      )}
    </div>
  );
}
