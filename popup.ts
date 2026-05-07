// =============================================================================
// src/popup/popup.ts — Extension Toolbar Popup Logic
// =============================================================================
// The popup shows:
//   - Whether a Focus Session is currently active (pulled from cached storage)
//   - The last time the session status was synced with the API
//   - A form to enter/update the Extension Token (first-time setup)
//   - A "Force Sync" button to manually trigger a poll
// =============================================================================

// ─── DOM REFERENCES ───────────────────────────────────────────────────────────
const statusDot      = document.getElementById("status-dot") as HTMLSpanElement;
const statusText     = document.getElementById("status-text") as HTMLParagraphElement;
const lastSyncEl     = document.getElementById("last-sync") as HTMLParagraphElement;
const tokenInput     = document.getElementById("token-input") as HTMLInputElement;
const saveTokenBtn   = document.getElementById("save-token-btn") as HTMLButtonElement;
const syncBtn        = document.getElementById("sync-btn") as HTMLButtonElement;
const tokenStatus    = document.getElementById("token-status") as HTMLParagraphElement;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Request current status from the background service worker.
  // Using chrome.runtime.sendMessage ensures we get the SW's cached data.
  const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" }) as {
    isActive: boolean;
    blocklist: string[];
    lastPollAt: number | null;
    hasToken: boolean;
  };

  // ── Update status indicator ───────────────────────────────────────────────
  if (response.isActive) {
    statusDot.className = "dot dot--active";
    statusText.textContent = "Focus Session Active";
    statusText.style.color = "#4ade80"; // green-400
  } else {
    statusDot.className = "dot dot--inactive";
    statusText.textContent = "No Active Session";
    statusText.style.color = "#71717a"; // zinc-500
  }

  // ── Update last sync time ─────────────────────────────────────────────────
  if (response.lastPollAt) {
    const secondsAgo = Math.floor((Date.now() - response.lastPollAt) / 1000);
    lastSyncEl.textContent = `Last synced ${secondsAgo}s ago`;
  } else {
    lastSyncEl.textContent = "Never synced";
  }

  // ── Show token status ─────────────────────────────────────────────────────
  if (response.hasToken) {
    tokenStatus.textContent = "✓ Token saved";
    tokenStatus.style.color = "#4ade80";
    tokenInput.placeholder = "Token saved — paste new to update";
  } else {
    tokenStatus.textContent = "⚠ No token — extension is inactive";
    tokenStatus.style.color = "#f59e0b";
  }
}

// ─── SAVE TOKEN ───────────────────────────────────────────────────────────────
saveTokenBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();

  if (!token) {
    tokenStatus.textContent = "Please enter a token first.";
    tokenStatus.style.color = "#ef4444";
    return;
  }

  await chrome.storage.local.set({ extensionToken: token });
  tokenInput.value = "";

  tokenStatus.textContent = "Token saved! Syncing...";
  tokenStatus.style.color = "#4ade80";

  // Force an immediate poll with the new token
  await chrome.runtime.sendMessage({ type: "FORCE_POLL" });

  // Re-render the popup with updated status
  await init();
});

// ─── FORCE SYNC ───────────────────────────────────────────────────────────────
syncBtn.addEventListener("click", async () => {
  syncBtn.textContent = "Syncing...";
  syncBtn.disabled = true;

  await chrome.runtime.sendMessage({ type: "FORCE_POLL" });

  // Brief delay so the user sees "Syncing..." before re-render
  await new Promise((r) => setTimeout(r, 800));

  syncBtn.textContent = "Sync Now";
  syncBtn.disabled = false;

  await init();
});

// ─── Run ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
