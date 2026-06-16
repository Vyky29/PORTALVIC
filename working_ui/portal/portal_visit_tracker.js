/**
 * Records staff/lead/admin portal visit sessions into public.portal_staff_visit_sessions.
 */
import { getSharedSupabaseClient } from "./supabase-client.js";
import {
  portalPresenceSurface,
  portalPresenceDisplayLabel,
  portalPresenceSkipDemoBroadcast,
} from "./portal_live_presence.js";

const STORAGE_KEY = "portalVisitSessionId_v1";
const HEARTBEAT_MS = 12000;
const FLUSH_MS = 45000;
const MAX_PAGES = 64;
const MAX_FORM_SUBMITS = 32;

/** @type {string | null} */
let _sessionId = null;
/** @type {ReturnType<typeof setInterval> | null} */
let _heartbeatTimer = null;
/** @type {number} */
let _visibleSince = 0;
/** @type {number} */
let _activeTabAccumMs = 0;
/** @type {string} */
let _lastPageLabel = "";
/** @type {{ label: string, at: string }[]} */
let _pagesLocal = [];
/** @type {{ label: string, action: string, page: string, at: string }[]} */
let _formSubmitsLocal = [];
/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let _client = null;
/** @type {string} */
let _userId = "";
/** @type {boolean} */
let _listenersBound = false;
/** @type {boolean} */
let _pagesDirty = false;
/** @type {boolean} */
let _heartbeatLightMode = false;

const SHEET_VISIT_LABELS = {
  menuSheet: "menu",
  clientsSheet: "clients",
  clientSheet: "client",
  termSheet: "timetable",
  announcementsSheet: "announcements",
  achievementsSheet: "achievements",
  alertsNotificationsSheet: "alerts",
  internalChatSheet: "chat",
  safeguardingFeedbackPolicySheet: "safeguarding policy",
  setupReminderSheet: "setup reminder",
};

function newSessionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function londonDateIso(d) {
  const dt = d || new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(dt);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch (_) {}
  return dt.toISOString().slice(0, 10);
}

export function portalVisitPageLabelFromLocation(loc) {
  const path = String((loc && loc.pathname) || "").toLowerCase();
  const file = path.split("/").pop() || "";
  const map = {
    "staff_dashboard.html": "staff hub",
    "lead_dashboard.html": "lead hub",
    "admin_dashboard.html": "admin hub",
    "ceo_dashboard.html": "ceo hub",
    "portal-timesheet.html": "timesheet",
    "portal-expenses.html": "expenses",
    "portal-session-feedback.html": "session feedback",
    "session_feedback.html": "session feedback",
    "portal-pickup.html": "pick up / drop off",
    "cancellation.html": "cancellation",
    "portal-incident.html": "incident",
    "portal-venue-review.html": "venue review",
    "portal-lead-feedback.html": "lead report",
    "lead_feedback_report.html": "lead report",
    "staff_profile_update.html": "profile update",
    "portal_choose.html": "portal chooser",
    "login.html": "login",
  };
  if (map[file]) return map[file];
  if (file.endsWith(".html")) return file.replace(/\.html$/i, "").replace(/_/g, " ");
  return file || "portal";
}

export function portalVisitLabelFromSheetId(sheetId) {
  const id = String(sheetId || "").trim();
  if (!id) return "";
  if (SHEET_VISIT_LABELS[id]) return SHEET_VISIT_LABELS[id];
  return id.replace(/Sheet$/i, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
}

function loadStoredSessionId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch (_) {
    return "";
  }
}

function saveStoredSessionId(id) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

function notePage(label) {
  const L = String(label || "").trim();
  if (!L || L === _lastPageLabel) return;
  _lastPageLabel = L;
}

function capVisitTrail(arr, max) {
  const list = Array.isArray(arr) ? arr : [];
  const limit = Number(max || 0);
  if (!limit || list.length <= limit) return list;
  return list.slice(-limit);
}

function appendPageEvent(pages, label) {
  const arr = capVisitTrail(Array.isArray(pages) ? pages.slice() : [], MAX_PAGES);
  const L = String(label || "").trim();
  if (!L) return arr;
  const last = arr.length ? arr[arr.length - 1] : null;
  if (last && String(last.label) === L) return arr;
  arr.push({ label: L, at: new Date().toISOString() });
  return capVisitTrail(arr, MAX_PAGES);
}

function visitSessionErrorIsTimeout(error) {
  const msg = String((error && error.message) || error || "").toLowerCase();
  return msg.indexOf("statement timeout") >= 0 || msg.indexOf("canceling statement") >= 0;
}

function isPortalPageContextLabel(label) {
  const L = String(label || "")
    .trim()
    .toLowerCase();
  if (!L) return false;
  if (L === "feedback" || L === "session feedback") return true;
  if (/hub\b/.test(L) || L.indexOf("dashboard") >= 0) return true;
  return false;
}

function appendFormSubmitEvent(submits, actionLabel, pageLabel) {
  const arr = Array.isArray(submits) ? submits.slice() : [];
  const action = String(actionLabel || "").trim();
  if (!action) return arr;
  const hint = String(pageLabel || "").trim();
  const participant =
    hint && !isPortalPageContextLabel(hint) ? hint : "";
  arr.push({
    label: action,
    action,
    page: participant
      ? _lastPageLabel || "session feedback"
      : hint || _lastPageLabel || "",
    participant,
    at: new Date().toISOString(),
  });
  return arr;
}

async function flushPatch(extra) {
  if (!_client || !_sessionId || !_userId) return;
  const now = Date.now();
  if (document.visibilityState === "visible" && _visibleSince > 0) {
    _activeTabAccumMs += Math.max(0, now - _visibleSince);
    _visibleSince = now;
  }
  const payload = Object.assign(
    {
      last_seen_at: new Date().toISOString(),
      last_page_label: _lastPageLabel || portalVisitPageLabelFromLocation(location),
      active_tab_ms: Math.round(_activeTabAccumMs),
      still_open: true,
    },
    extra || {}
  );
  if (payload.total_ms == null) {
    payload.total_ms = payload.active_tab_ms;
  }
  const { error } = await _client
    .from("portal_staff_visit_sessions")
    .update(payload)
    .eq("id", _sessionId)
    .eq("staff_user_id", _userId);
  if (error) {
    if (visitSessionErrorIsTimeout(error)) _heartbeatLightMode = true;
    var logFn =
      _heartbeatLightMode && (extra == null || !extra.pages)
        ? console.debug.bind(console)
        : typeof globalThis.portalWarnUnlessOffline === "function"
          ? globalThis.portalWarnUnlessOffline
          : console.warn.bind(console);
    logFn("[portal] visit session update", "", error.message || error);
  } else if (extra && (extra.pages != null || extra.form_submits != null)) {
    _pagesDirty = false;
    _heartbeatLightMode = false;
  }
}

async function insertVisitSessionRow(row) {
  let result = await _client.from("portal_staff_visit_sessions").insert([row]);
  if (result.error) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await _client.from("portal_staff_visit_sessions").insert([row]);
  }
  return result;
}

async function ensureSession(opts) {
  if (!_client || !_userId) return;
  const profile = opts.profile || {};
  const session = opts.session || {};
  const email = String(session.user?.email || "").trim();
  const surface = portalPresenceSurface(opts.page, profile, email);
  const displayName = portalPresenceDisplayLabel(
    String(profile.full_name || profile.username || "").trim(),
    email
  );
  const pageLabel = portalVisitPageLabelFromLocation(location);
  _lastPageLabel = pageLabel;
  const today = londonDateIso(new Date());

  const existingId = loadStoredSessionId();
  if (existingId) {
    const { data, error } = await _client
      .from("portal_staff_visit_sessions")
      .select("id, session_date, still_open, pages, form_submits")
      .eq("id", existingId)
      .eq("staff_user_id", _userId)
      .maybeSingle();
    if (!error && data && data.still_open && String(data.session_date) === today) {
      _sessionId = data.id;
      _pagesLocal = capVisitTrail(Array.isArray(data.pages) ? data.pages.slice() : [], MAX_PAGES);
      _formSubmitsLocal = capVisitTrail(
        Array.isArray(data.form_submits) ? data.form_submits.slice() : [],
        MAX_FORM_SUBMITS
      );
      const pagesPatch = appendPageEvent(_pagesLocal, pageLabel);
      _pagesLocal = pagesPatch;
      _pagesDirty = true;
      await flushPatch({ last_page_label: pageLabel, pages: pagesPatch });
      return;
    }
    saveStoredSessionId("");
  }

  const sessionId = newSessionId();
  _pagesLocal = [{ label: pageLabel, at: new Date().toISOString() }];
  _formSubmitsLocal = [];
  const row = {
    id: sessionId,
    staff_user_id: _userId,
    staff_display_name: displayName,
    staff_surface: surface,
    session_date: today,
    login_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    last_page_label: pageLabel,
    pages: _pagesLocal,
    still_open: true,
    active_tab_ms: 0,
    total_ms: 0,
  };
  const insResult = await insertVisitSessionRow(row);
  if (insResult.error) {
    if (typeof globalThis.portalWarnUnlessOffline === "function") {
      globalThis.portalWarnUnlessOffline("[portal] visit session insert", "", insResult.error.message || insResult.error);
    } else if (typeof navigator === "undefined" || navigator.onLine !== false) {
      console.warn("[portal] visit session insert", insResult.error.message || insResult.error);
    }
    return;
  }
  _sessionId = sessionId;
  saveStoredSessionId(_sessionId);
}

async function heartbeat() {
  if (!_client || !_sessionId) return;
  const label = portalVisitPageLabelFromLocation(location);
  notePage(label);
  const prevLen = _pagesLocal.length;
  _pagesLocal = appendPageEvent(_pagesLocal, label);
  if (_pagesLocal.length !== prevLen) _pagesDirty = true;
  const now = Date.now();
  if (document.visibilityState === "visible") {
    if (_visibleSince <= 0) _visibleSince = now;
    _activeTabAccumMs += Math.max(0, now - _visibleSince);
    _visibleSince = now;
  } else {
    _visibleSince = 0;
  }
  const active = Math.round(_activeTabAccumMs);
  const payload = {
    last_seen_at: new Date().toISOString(),
    last_page_label: label,
    active_tab_ms: active,
    total_ms: active,
    still_open: true,
  };
  if (!_heartbeatLightMode && _pagesDirty) payload.pages = _pagesLocal;
  const { error } = await _client
    .from("portal_staff_visit_sessions")
    .update(payload)
    .eq("id", _sessionId)
    .eq("staff_user_id", _userId);
  if (error) {
    if (visitSessionErrorIsTimeout(error)) _heartbeatLightMode = true;
    if (_heartbeatLightMode) {
      console.debug("[portal] visit session heartbeat", error.message || error);
    } else if (typeof globalThis.portalWarnUnlessOffline === "function") {
      globalThis.portalWarnUnlessOffline("[portal] visit session heartbeat", "", error.message || error);
    } else if (typeof navigator === "undefined" || navigator.onLine !== false) {
      console.warn("[portal] visit session heartbeat", error.message || error);
    }
  } else if (payload.pages != null) {
    _pagesDirty = false;
    _heartbeatLightMode = false;
  }
}

async function closeSession() {
  if (!_client || !_sessionId) return;
  const nowIso = new Date().toISOString();
  const active = Math.round(_activeTabAccumMs);
  await _client
    .from("portal_staff_visit_sessions")
    .update({
      logout_at: nowIso,
      last_seen_at: nowIso,
      active_tab_ms: active,
      total_ms: active,
      still_open: false,
    })
    .eq("id", _sessionId)
    .eq("staff_user_id", _userId);
  saveStoredSessionId("");
  _sessionId = null;
  _pagesLocal = [];
  _formSubmitsLocal = [];
}

export function mountPortalVisitActivityBridge() {
  if (typeof window === "undefined") return;
  window.portalRecordVisitPage = (label) => {
    void recordPortalVisitPage(label);
  };
  window.portalRecordFormSubmit = (action, page) => {
    void recordPortalFormSubmit(action, page);
  };
  window.portalEndVisitSession = () => {
    void endPortalVisitSession();
  };
}

export function installDashboardSheetHooks() {
  if (typeof window === "undefined" || window.__PORTAL_VISIT_SHEET_HOOK__) return false;
  const orig = window.openSheet;
  if (typeof orig !== "function") return false;
  window.__PORTAL_VISIT_SHEET_HOOK__ = true;
  window.openSheet = function portalOpenSheetWithVisit(id) {
    const result = orig.apply(this, arguments);
    const sheetLabel = portalVisitLabelFromSheetId(id);
    if (sheetLabel) {
      const hub =
        portalVisitPageLabelFromLocation(location).indexOf("hub") >= 0
          ? portalVisitPageLabelFromLocation(location)
          : "hub";
      void recordPortalVisitPage(`${hub}: ${sheetLabel}`);
    }
    return result;
  };
  return true;
}

function installDashboardSheetHooksWithRetry() {
  if (installDashboardSheetHooks()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (installDashboardSheetHooks() || tries >= 40) clearInterval(timer);
  }, 500);
}

/**
 * @param {string} label
 */
export async function recordPortalVisitPage(label) {
  if (!_client || !_sessionId) return;
  const L = String(label || "").trim();
  if (!L) return;
  notePage(L);
  _pagesLocal = appendPageEvent(_pagesLocal, L);
  _pagesDirty = true;
  await flushPatch({ last_page_label: L, pages: _pagesLocal });
}

/**
 * @param {string} actionLabel
 * @param {string} [pageLabel]
 */
export async function recordPortalFormSubmit(actionLabel, pageLabel) {
  if (!_client || !_sessionId) return;
  const action = String(actionLabel || "").trim();
  if (!action) return;
  const page = String(pageLabel || _lastPageLabel || portalVisitPageLabelFromLocation(location)).trim();
  _formSubmitsLocal = capVisitTrail(
    appendFormSubmitEvent(_formSubmitsLocal, action, page),
    MAX_FORM_SUBMITS
  );
  await flushPatch({ form_submits: _formSubmitsLocal, last_page_label: page || _lastPageLabel });
}

export async function endPortalVisitSession() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  await closeSession();
}

/**
 * @param {{ page?: string, profile?: Record<string, unknown> | null, session?: import("@supabase/supabase-js").Session | null }} opts
 */
function portalVisitIsDemoAccount(profile, session, opts) {
  return portalPresenceSkipDemoBroadcast(profile, session, opts);
}

export async function startPortalVisitTracker(opts = {}) {
  if (typeof window === "undefined") return;
  try {
    _client = getSharedSupabaseClient();
  } catch (_) {
    return;
  }
  const session = opts.session;
  _userId = String(session?.user?.id || "").trim();
  if (!_userId) return;
  if (opts.isDemo === true || portalVisitIsDemoAccount(opts.profile, session, opts)) {
    return;
  }

  _visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  await ensureSession(opts);
  if (!_sessionId) return;
  mountPortalVisitActivityBridge();
  installDashboardSheetHooksWithRetry();

  if (_listenersBound) return;
  _listenersBound = true;

  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(() => {
    void heartbeat();
  }, HEARTBEAT_MS);

  const onVis = () => {
    if (document.visibilityState === "visible") {
      _visibleSince = Date.now();
      notePage(portalVisitPageLabelFromLocation(location));
    } else if (_visibleSince > 0) {
      _activeTabAccumMs += Math.max(0, Date.now() - _visibleSince);
      _visibleSince = 0;
      void flushPatch();
    }
  };
  document.addEventListener("visibilitychange", onVis);

  window.addEventListener("pagehide", () => {
    void flushPatch();
  });

  setInterval(() => {
    void flushPatch();
  }, FLUSH_MS);
}
