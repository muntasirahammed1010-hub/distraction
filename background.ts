// =============================================================================
// src/background/background.ts — Service Worker (The Brain)
// =============================================================================
// This is the heart of the Chrome Extension. It is responsible for:
//
//  1. BLOCKING: Using declarativeNetRequest to block/redirect URLs in
//     the user's blocklist — this is instantaneous at the browser engine level.
//
//  2. POLLING: Using chrome.alarms to periodically ask the web-app API
//     "is the user in a Focus Session right now?" and cache the result.
//
//  3. PERSISTENCE: MV3 service workers are terminated by Chrome after ~30 seconds
//     of inactivity. We use chrome.alarms (which fire even when the SW is dead,
//     then re-wake it) as a heartbeat to ensure blocking rules stay current.
//
// ARCHITECTURE — Why declarativeNetRequest instead of webRequest?
//   MV3 deprecated the blocking webRequest API. declarativeNetRequest is:
//     - Faster: Rules are evaluated natively by the browser engine, not JS.
//     - More secure: Rules are declarative JSON, not arbitrary code.
//     - Privacy-preserving: No access to request headers by default.
//   The tradeoff: Rules must be defined ahead of time and updated via
//   chrome.declarativeNetRequest.updateDynamicRules().
// =============================================================================

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const WEB_APP_BASE_URL = "https://focus-forge.vercel.app"; // CHANGE IN PRODUCTION
const DEV_BASE_URL     = "http://localhost:3000";           // Used in development
const API_BASE         = process.env.NODE_ENV === "production" ? WEB_APP_BASE_URL : DEV_BASE_URL;

const POLL_ALARM_NAME      = "focusSessionPoll";   // Alarm for API polling
const RULE_ID_BASE         = 1000;                 // Starting rule ID for dynamic DNR rules
const POLL_INTERVAL_MIN    = 0.5;                  // Poll every 30 seconds (0.5 minutes)
const CACHE_TTL_MS         = 35_000;               // Session cache TTL (slightly > poll interval)

// ─── STORAGE KEYS ─────────────────────────────────────────────────────────────
// All keys stored in chrome.storage.local.
const STORAGE_KEYS = {
  EXTENSION_TOKEN:   "extensionToken",    // User's API auth token (set in popup)
  SESSION_ACTIVE:    "sessionActive",     // boolean — is a focus session active?
  BLOCKLIST:         "blocklist",         // string[] — user's blocked patterns
  LAST_POLL_AT:      "lastPollAt",        // timestamp of last successful poll
} as const;

// ─── TYPE DEFINITIONS ─────────────────────────────────────────────────────────
interface SessionStatusResponse {
  isActive: boolean;
  session: {
    id: string;
    startedAt: string;
    plannedDurationMin: number | null;
  } | null;
  blocklist: string[];
}

// =============================================================================
// ── SERVICE WORKER LIFECYCLE ──────────────────────────────────────────────────
// =============================================================================

// ── onInstalled ───────────────────────────────────────────────────────────────
// Fires once when the extension is first installed or updated.
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[FocusForge] Extension installed/updated:", details.reason);

  // Set up the polling alarm immediately on install.
  // The alarm will persist even if the service worker is killed.
  await setupPollingAlarm();

  // Do an initial poll right away so blocking rules are active from second one.
  await pollSessionStatus();
});

// ── onStartup ─────────────────────────────────────────────────────────────────
// Fires when Chrome starts (user opens their browser).
// We re-poll immediately because the cached session status may be stale.
chrome.runtime.onStartup.addListener(async () => {
  console.log("[FocusForge] Browser started — refreshing session status.");
  await setupPollingAlarm();
  await pollSessionStatus();
});

// =============================================================================
// ── ALARM MANAGEMENT (Keeps the service worker alive) ────────────────────────
// =============================================================================

async function setupPollingAlarm(): Promise<void> {
  // Clear any existing alarm before creating a new one to avoid duplicates.
  await chrome.alarms.clear(POLL_ALARM_NAME);

  // Create a repeating alarm. Chrome.alarms fire even when the service worker
  // is suspended — they will re-wake the SW when they fire.
  // periodInMinutes minimum is 0.5 (30 seconds) per Chrome docs.
  chrome.alarms.create(POLL_ALARM_NAME, {
    delayInMinutes: POLL_INTERVAL_MIN,      // First fire in 30s
    periodInMinutes: POLL_INTERVAL_MIN,     // Repeat every 30s
  });

  console.log(`[FocusForge] Polling alarm set: every ${POLL_INTERVAL_MIN * 60}s`);
}

// Listen for alarm fires — this wakes the service worker and runs the poll.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    await pollSessionStatus();
  }
});

// =============================================================================
// ── SESSION POLLING ───────────────────────────────────────────────────────────
// =============================================================================

async function pollSessionStatus(): Promise<void> {
  // Retrieve the extension token from storage.
  const storage = await chrome.storage.local.get([STORAGE_KEYS.EXTENSION_TOKEN]);
  const token: string | undefined = storage[STORAGE_KEYS.EXTENSION_TOKEN];

  if (!token) {
    // User hasn't paired the extension yet. Silently skip.
    // The popup will prompt them to enter their token.
    console.warn("[FocusForge] No extension token found. Skipping poll.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/session/status`, {
      method: "GET",
      headers: {
        "X-Extension-Token": token,
        "Cache-Control": "no-cache",
      },
    });

    if (!res.ok) {
      if (res.status === 403) {
        // Token is invalid — clear it so the user is prompted to re-pair.
        await chrome.storage.local.remove(STORAGE_KEYS.EXTENSION_TOKEN);
        console.error("[FocusForge] Extension token rejected (403). Cleared.");
      }
      throw new Error(`API returned ${res.status}`);
    }

    const data: SessionStatusResponse = await res.json();

    // Update cached state
    await chrome.storage.local.set({
      [STORAGE_KEYS.SESSION_ACTIVE]: data.isActive,
      [STORAGE_KEYS.BLOCKLIST]: data.blocklist,
      [STORAGE_KEYS.LAST_POLL_AT]: Date.now(),
    });

    // Sync declarativeNetRequest rules to match the current state
    await syncBlockingRules(data.isActive, data.blocklist);

    console.log(`[FocusForge] Poll OK — session active: ${data.isActive}, blocked sites: ${data.blocklist.length}`);
  } catch (err) {
    console.error("[FocusForge] Poll failed:", err);
    // On failure, we do NOT clear the cached state — we keep the last known
    // state active. This means if the API is down, blocking continues until
    // the next successful poll confirms the session has ended.
    // This is the "fail closed" strategy: default to blocking when uncertain.
  }
}

// =============================================================================
// ── DECLARATIVE NET REQUEST RULES ────────────────────────────────────────────
// =============================================================================
// This is where blocking becomes instantaneous.
// We translate the user's blocklist patterns into Chrome's DNR rule format
// and update them dynamically whenever the session state changes.
// =============================================================================

async function syncBlockingRules(
  isSessionActive: boolean,
  blocklist: string[]
): Promise<void> {
  // First, remove ALL existing dynamic rules to start fresh.
  // This guarantees no stale rules from a previous session linger.
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map((r) => r.id);

  if (!isSessionActive) {
    // Session not active → remove all rules (no blocking)
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
        addRules: [],
      });
      console.log("[FocusForge] Session inactive — all blocking rules removed.");
    }
    return;
  }

  // Session IS active → build and apply rules for each blocked pattern.
  const extensionBlockedPageUrl =
    chrome.runtime.getURL("blocked/blocked.html");

  const newRules: chrome.declarativeNetRequest.Rule[] = blocklist.map(
    (pattern, index) => {
      // Parse the pattern into a URL filter Chrome can understand.
      // Our patterns can be:
      //   "facebook.com"          → blocks facebook.com and www.facebook.com
      //   "*.twitter.com"         → blocks all subdomains
      //   "youtube.com/shorts"    → blocks only the /shorts path
      const urlFilter = patternToUrlFilter(pattern);

      return {
        id: RULE_ID_BASE + index,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: {
            // Redirect to our local blocked page.
            // We pass the attempted site as a query param so blocked.html
            // can display it and request a roast from the API.
            url: `${extensionBlockedPageUrl}?site=${encodeURIComponent(pattern)}`,
          },
        },
        condition: {
          urlFilter,
          // Block all resource types except the extension's own pages to
          // prevent infinite redirect loops.
          excludedInitiatorDomains: [chrome.runtime.id],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
          ],
        },
      };
    }
  );

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: newRules,
  });

  console.log(`[FocusForge] Applied ${newRules.length} blocking rules.`);
}

// ─── patternToUrlFilter ───────────────────────────────────────────────────────
// Converts our human-readable pattern format to Chrome's DNR URL filter syntax.
// DNR URL filters use `||` as a domain anchor, similar to AdBlock Plus syntax.
function patternToUrlFilter(pattern: string): string {
  // Handle wildcard subdomains: "*.facebook.com" → "||facebook.com"
  if (pattern.startsWith("*.")) {
    return `||${pattern.slice(2)}`;
  }
  // Handle exact path: "youtube.com/shorts" → "||youtube.com/shorts"
  // Handle bare domain: "facebook.com" → "||facebook.com"
  return `||${pattern}`;
}

// =============================================================================
// ── MESSAGES FROM POPUP / CONTENT SCRIPTS ────────────────────────────────────
// =============================================================================
// The popup can send messages to the background worker to:
//   - Trigger an immediate poll ("token just saved, refresh now")
//   - Get the current cached session state (for display in popup)
// =============================================================================

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender,
    sendResponse: (response: unknown) => void
  ) => {
    // Handle each message type asynchronously
    (async () => {
      switch (message.type) {
        // ── FORCE_POLL: Immediate re-poll (e.g., after saving a new token) ──
        case "FORCE_POLL": {
          await pollSessionStatus();
          sendResponse({ success: true });
          break;
        }

        // ── GET_STATUS: Return cached state for the popup ─────────────────
        case "GET_STATUS": {
          const storage = await chrome.storage.local.get([
            STORAGE_KEYS.SESSION_ACTIVE,
            STORAGE_KEYS.BLOCKLIST,
            STORAGE_KEYS.LAST_POLL_AT,
            STORAGE_KEYS.EXTENSION_TOKEN,
          ]);
          sendResponse({
            isActive: storage[STORAGE_KEYS.SESSION_ACTIVE] ?? false,
            blocklist: storage[STORAGE_KEYS.BLOCKLIST] ?? [],
            lastPollAt: storage[STORAGE_KEYS.LAST_POLL_AT] ?? null,
            hasToken: !!storage[STORAGE_KEYS.EXTENSION_TOKEN],
          });
          break;
        }

        default:
          sendResponse({ error: `Unknown message type: ${message.type}` });
      }
    })();

    // Return true to indicate we'll call sendResponse asynchronously.
    // Without this, the message port is closed before our async work finishes.
    return true;
  }
);

// =============================================================================
// ── NOTIFICATION HELPER ───────────────────────────────────────────────────────
// =============================================================================
// Called when a tab navigates to a blocked site (detected via tabs.onUpdated).
// We also redirect via DNR rules, but the notification provides a second
// layer of feedback.
// =============================================================================

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only fire when the navigation is committed (not on every DNS lookup)
  if (changeInfo.status !== "loading" || !tab.url) return;

  const storage = await chrome.storage.local.get([
    STORAGE_KEYS.SESSION_ACTIVE,
    STORAGE_KEYS.BLOCKLIST,
  ]);

  const isActive: boolean = storage[STORAGE_KEYS.SESSION_ACTIVE] ?? false;
  const blocklist: string[] = storage[STORAGE_KEYS.BLOCKLIST] ?? [];

  if (!isActive) return;

  // Check if the navigated URL matches any blocked pattern
  const matchedPattern = blocklist.find((pattern) =>
    urlMatchesPattern(tab.url!, pattern)
  );

  if (matchedPattern) {
    // The DNR rule will handle the actual redirect.
    // We just need to show the notification for extra shame.
    try {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Blocked by FocusForge 🛡️",
        message: `Nice try. ${matchedPattern} is blocked during your Focus Session.`,
        priority: 2,
      });
    } catch {
      // Notifications are non-critical — swallow errors silently
    }
  }
});

// ─── urlMatchesPattern ────────────────────────────────────────────────────────
// Simple URL matching for the notification check.
// The DNR rule handles the actual blocking — this is just for notifications.
function urlMatchesPattern(url: string, pattern: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const cleanPattern = pattern.startsWith("*.") ? pattern.slice(2) : pattern;

    // Check if the pattern includes a path
    if (cleanPattern.includes("/")) {
      const [patternDomain, ...pathParts] = cleanPattern.split("/");
      const patternPath = "/" + pathParts.join("/");
      return (
        (hostname === patternDomain || hostname.endsWith(`.${patternDomain}`)) &&
        pathname.startsWith(patternPath)
      );
    }

    return hostname === cleanPattern || hostname.endsWith(`.${cleanPattern}`);
  } catch {
    return false;
  }
}

// =============================================================================
// Log that the service worker has started successfully.
// This message will appear in chrome://extensions > background page console.
// =============================================================================
console.log("[FocusForge] Background service worker initialised ✅");
