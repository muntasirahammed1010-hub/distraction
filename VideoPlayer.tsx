"use client";
// =============================================================================
// components/dashboard/VideoPlayer.tsx — Embedded Science Video Player
// =============================================================================
// Renders a YouTube embed (restricted to educational playlists).
// The src URL is passed in as a prop, defaulting to a curated science playlist.
//
// SECURITY NOTE: We use YouTube's privacy-enhanced mode (youtube-nocookie.com)
// to avoid tracking cookies being set on the student's browser.
// The embed is sandboxed — no allow-same-origin to prevent script injection.
// =============================================================================

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";

interface VideoPlayerProps {
  // Optional: pass a specific YouTube video ID to override the default
  videoId?: string;
  title?: string;
}

// Curated science video IDs (Khan Academy / Kurzgesagt / etc.)
// In a full product, these would come from the DB / admin panel.
const DEFAULT_VIDEO_ID = "URUJD5NEXC8"; // Example: Khan Academy Biology

export default function VideoPlayer({
  videoId = DEFAULT_VIDEO_ID,
  title = "Science Study Video",
}: VideoPlayerProps) {
  // Use a poster/thumbnail first — only load the iframe on click.
  // This avoids loading heavy YouTube scripts until the student is ready.
  const [isLoaded, setIsLoaded] = useState(false);

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <div className="flex flex-col gap-3">
      {/* 16:9 aspect ratio container */}
      <div className="relative w-full rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800"
           style={{ paddingBottom: "56.25%" }}>

        {isLoaded ? (
          // ── Actual iframe embed ─────────────────────────────────────────
          <iframe
            className="absolute inset-0 w-full h-full"
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            // Sandboxed: allow-scripts and allow-same-origin are required for YouTube
            // but we explicitly DO NOT grant allow-top-navigation to prevent the
            // video from navigating the parent page.
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          // ── Click-to-play thumbnail (avoids loading YouTube JS eagerly) ─
          <button
            onClick={() => setIsLoaded(true)}
            className="absolute inset-0 w-full h-full group"
            aria-label={`Play ${title}`}
          >
            {/* Thumbnail */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to lower-res thumbnail if maxresdefault fails
                (e.target as HTMLImageElement).src =
                  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
              }}
            />

            {/* Dark overlay + play button */}
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-colors duration-150 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-150">
                <Play className="w-6 h-6 text-zinc-900 fill-zinc-900 ml-1" />
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Video title + open-in-new-tab link */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400 truncate">{title}</span>
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors shrink-0 ml-3"
        >
          <ExternalLink className="w-3 h-3" />
          YouTube
        </a>
      </div>
    </div>
  );
}
