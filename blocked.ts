// =============================================================================
// src/blocked/blocked.ts — Blocked Page Logic
// =============================================================================
// This script runs on the extension's blocked.html page.
// It is responsible for:
//   1. Parsing the ?site= query param to know which site was blocked.
//   2. Reading the extension token from chrome.storage.local.
//   3. Calling the web-app's /api/roast endpoint to get a personalised roast.
//   4. Rendering the roast on the page.
//   5. Wiring up the "Go Back" button.
// =============================================================================

const WEB_APP_BASE = "https://focus-forge.vercel.app"; // CHANGE IN PRODUCTION

// ─── DOM REFERENCES ───────────────────────────────────────────────────────────
const siteNameEl   = document.getElementById("site-name") as HTMLParagraphElement;
const roastLoading = document.getElementById("roast-loading") as HTMLDivElement;
const roastText    = document.getElementById("roast-text") as HTMLDivElement;
const roastLine1   = document.getElementById("roast-line1") as HTMLParagraphElement;
const roastLine2   = document.getElementById("roast-line2") as HTMLParagraphElement;
const goBackBtn    = document.getElementById("go-back-btn") as HTMLButtonElement;
const dashboardLink = document.getElementById("dashboard-link") as HTMLAnchorElement;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // ── 1. Parse site from query string ──────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const blockedSite = urlParams.get("site") ?? "that site";

  // Display the blocked site name
  siteNameEl.textContent = blockedSite;

  // Update dashboard link with the actual URL
  dashboardLink.href = WEB_APP_BASE + "/dashboard";

  // ── 2. Get extension token from storage ──────────────────────────────────
  const storage = await chrome.storage.local.get(["extensionToken"]);
  const token: string | undefined = storage["extensionToken"];

  if (!token) {
    showFallbackRoast();
    return;
  }

  // ── 3. Fetch roast from API ───────────────────────────────────────────────
  try {
    const res = await fetch(`${WEB_APP_BASE}/api/roast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Extension-Token": token,
      },
      body: JSON.stringify({
        context: `User tried to open ${blockedSite} during a Focus Session`,
        siteUrl: blockedSite,
      }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json() as { line1: string; line2: string };

    // ── 4. Display the roast ───────────────────────────────────────────────
    displayRoast(data.line1, data.line2);
  } catch (err) {
    console.error("[FocusForge] Failed to fetch roast:", err);
    showFallbackRoast();
  }

  // ── 5. Wire up Go Back button ─────────────────────────────────────────────
  goBackBtn.addEventListener("click", () => {
    // Navigate to the previous page in history.
    // If there's no history (e.g., opened in new tab), close the tab.
    if (history.length > 1) {
      history.back();
    } else {
      window.close();
    }
  });
}

// ─── displayRoast ─────────────────────────────────────────────────────────────
function displayRoast(line1: string, line2: string) {
  // Hide loading spinner
  roastLoading.classList.add("hidden");

  // Populate lines
  roastLine1.textContent = line1;
  roastLine2.textContent = line2;

  // Show roast text with a fade-in animation (handled by CSS class)
  roastText.classList.remove("hidden");
  roastText.classList.add("visible");
}

// ─── showFallbackRoast ────────────────────────────────────────────────────────
// Used when the API is unreachable or the token is missing.
// The page should NEVER show a blank roast card — that would reduce the shame.
function showFallbackRoast() {
  displayRoast(
    "No token? No roast. But also no access. Nice try.",
    "পড়াশোনা না করলে Professor Pepper ছাড়াও তুই ব্যর্থ হবি।"
  );
}

// ─── Run ──────────────────────────────────────────────────────────────────────
// Use DOMContentLoaded to ensure all elements are available.
// Since this script is type="module", it's deferred by default anyway.
document.addEventListener("DOMContentLoaded", init);
