// =============================================================================
// app/dashboard/layout.tsx — Dashboard Shell Layout
// =============================================================================
// This Server Component wraps every page under /dashboard.
// It renders the sidebar and top bar that persist across all dashboard routes.
// It also validates authentication — unauthenticated users are redirected to
// /login by the middleware.ts, but we add a secondary guard here.
// =============================================================================

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  Brain,
  BarChart3,
  ShieldBan,
  Settings,
  LogOut,
  Zap,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface DashboardLayoutProps {
  children: React.ReactNode;
}

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: "/dashboard",            label: "Focus",     icon: Zap        },
  { href: "/dashboard/blocklist",  label: "Blocklist", icon: ShieldBan  },
  { href: "/dashboard/analytics",  label: "Analytics", icon: BarChart3  },
  { href: "/dashboard/settings",   label: "Settings",  icon: Settings   },
] as const;

// =============================================================================
export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  // Server-side session check.
  // If the session is missing, redirect to login.
  // NOTE: middleware.ts also handles this, but defense-in-depth is good.
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;

  return (
    // Full-viewport flex container — sidebar | main content
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">

      {/* ─── SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside className="
        flex flex-col w-60 min-h-screen
        bg-zinc-900 border-r border-zinc-800
        px-4 py-6 shrink-0
      ">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-10 px-2">
          <Brain className="w-7 h-7 text-violet-400" strokeWidth={1.5} />
          <span className="font-bold text-lg tracking-tight text-white">
            FocusForge
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                text-zinc-400 hover:text-white hover:bg-zinc-800
                transition-colors duration-150
                aria-[current=page]:text-white aria-[current=page]:bg-zinc-800
              "
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="mt-auto pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-2 mb-3">
            {/* Avatar */}
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name ?? "User"}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-zinc-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold">
                {user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>

          {/* Sign out — uses a form POST to /api/auth/signout (NextAuth default) */}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                text-zinc-500 hover:text-red-400 hover:bg-zinc-800
                transition-colors duration-150
              "
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ─── MAIN CONTENT AREA ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        {/* Top bar */}
        <header className="
          sticky top-0 z-10 flex items-center justify-between
          px-8 py-4 bg-zinc-950/80 backdrop-blur-sm
          border-b border-zinc-800
        ">
          {/* Page title is injected by each child page via its <title> or a slot.
              For MVP, we show a static title here. */}
          <h1 className="text-sm font-medium text-zinc-400">Dashboard</h1>

          {/* Extension status indicator */}
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Extension Active
          </div>
        </header>

        {/* Page content — rendered by the active child page */}
        <div className="flex-1 px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
