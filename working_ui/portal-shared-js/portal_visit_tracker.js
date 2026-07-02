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
/** Admin online bar treats visits stale after ~90s — pulse every 45s is enough. */
const HEARTBEAT_MS = 45000;
const MAX_PAGES = 64;
const MAX_FORM_SUBMITS = 32;
const PULSE_BACKOFF_MS = 120000;
const MAX_CONSECUTIVE_FAILS = 3;

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
/** @type {boolean} */
let _writeInFlight = false;
/** @type {number} */
let _consecutiveFails = 0;
/** @type {number} */
let _pulseBackoffUntil = 0;
const VISIT_PULSE_RPC_OK_KEY = "portalVisitPulseRpcOk";
/** @type {boolean} — default direct table updates; enable RPC only after a prior success. */
let _rpcPulseAvailable = false;

function visitSessionRpcEnabled() {
  if (_rpcPulseAvailable === false) {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(VISIT_PULSE_RPC_OK_KEY) === "1") {
        _rpcPulseAvailable = true;
        return true;
      }
    } catch (_) {}
    return false;
  }
  return _rpcPulseAvailable === true;
}

function visitSessionMarkRpcOk() {
  _rpcPulseAvailable = true;
  try {
    localStorage.setItem(VISIT_PULSE_RPC_OK_KEY, "1");
  } catch (_) {}
}

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
    "staff_dashboard.html": "lead hub",
    "admin_dashboard.html": "admin hub",
    "ceo_dashboard.html": "ceo hub",
    "portal-timesheet.html": "timesheet",
    "portal-expenses.html": "expenses",
    "portal-session-feedback.html": "session feedback",
    "session_feedback.html": "session feedback",
    "portal-pickup.html": "pick up / drop off",
    "cancellation.html": "cancellation",
    "session_disruption_report.html": "session_disruption",
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

function visitSessionErrorIsMissingRpc(error) {
  const msg = String((error && error.message) || error || "").toLowerCase();
  return (
    msg.indexOf("portal_visit_session_pulse") >= 0 ||
    msg.indexOf("portal_visit_session_patch") >= 0 ||
    (msg.indexOf("function") >= 0 && msg.indexOf("does not exist") >= 0)
  );
}

function visitSessionAccumulateActiveMs() {
  const now = Date.now();
  if (document.visibilityState === "visible" && _visibleSince > 0) {
    _activeTabAccumMs += Math.max(0, now - _visibleSince);
    _visibleSince = now;
  }
  return Math.round(_activeTabAccumMs);
}

function visitSessionLogIssue(kind, error, quiet) {
  const msg = error && error.message ? error.message : String(error || "");
  if (quiet) {
    console.debug("[portal] visit session " + kind, msg);
    return;
  }
  if (typeof globalThis.portalWarnUnlessOffline === "function") {
    globalThis.portalWarnUnlessOffline("[portal] visit session " + kind, "", msg);
  } else if (typeof navigator === "undefined" || navigator.onLine !== false) {
    console.warn("[portal] visit session " + kind, msg);
  }
}

function visitSessionMarkSuccess(hadJsonPatch) {
  _consecutiveFails = 0;
  _pulseBackoffUntil = 0;
  if (hadJsonPatch) {
    _pagesDirty = false;
    _heartbeatLightMode = false;
  }
}

function visitSessionMarkFailure(error, kind, hadJsonPatch) {
  if (visitSessionErrorIsTimeout(error)) _heartbeatLightMode = true;
  _consecutiveFails += 1;
  if (_consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
    _pulseBackoffUntil = Date.now() + PULSE_BACKOFF_MS;
  }
  const quiet = _heartbeatLightMode && !hadJsonPatch;
  visitSessionLogIssue(kind, error, quiet);
}

async function visitSessionDirectUpdate(payload) {
  return _client
    .from("portal_staff_visit_sessions")
    .update(payload)
    .eq("id", _sessionId)
    .eq("staff_user_id", _userId);
}

async function visitSessionPulseRpc(scalars) {
  if (!visitSessionRpcEnabled()) return { ok: false, skipped: true };
  const { data, error } = await _client.rpc("portal_visit_session_pulse", {
    p_session_id: _sessionId,
    p_last_page_label: scalars.last_page_label || null,
    p_active_tab_ms: scalars.active_tab_ms,
    p_total_ms: scalars.total_ms,
  });
  if (error) {
    if (visitSessionErrorIsMissingRpc(error)) {
      _rpcPulseAvailable = false;
      try {
        localStorage.removeItem(VISIT_PULSE_RPC_OK_KEY);
      } catch (_) {}
    }
    return { ok: false, error };
  }
  visitSessionMarkRpcOk();
  if (data === false) return { ok: false, error: { message: "session_not_found" } };
  return { ok: true, error: null };
}

async function visitSessionPatchRpc(scalars, jsonExtra) {
  if (!visitSessionRpcEnabled()) return { ok: false, skipped: true };
  const { data, error } = await _client.rpc("portal_visit_session_patch", {
    p_session_id: _sessionId,
    p_last_page_label: scalars.last_page_label || null,
    p_active_tab_ms: scalars.active_tab_ms,
    p_total_ms: scalars.total_ms,
    p_pages: jsonExtra.pages != null ? jsonExtra.pages : null,
    p_form_submits: jsonExtra.form_submits != null ? jsonExtra.form_submits : null,
  });
  if (error) {
    if (visitSessionErrorIsMissingRpc(error)) {
      _rpcPulseAvailable = false;
      try {
        localStorage.removeItem(VISIT_PULSE_RPC_OK_KEY);
      } catch (_) {}
    }
    return { ok: false, error };
  }
  visitSessionMarkRpcOk();
  if (data === false) return { ok: false, error: { message: "session_not_found" } };
  return { ok: true, error: null };
}

function visitSessionDirectScalarPayload(scalars, jsonExtra) {
  return Object.assign(
    {
      last_seen_at: new Date().toISOString(),
      last_page_label: scalars.last_page_label || null,
      active_tab_ms: scalars.active_tab_ms,
      total_ms: scalars.total_ms,
      still_open: true,
    },
    jsonExtra || {}
  );
}

/**
 * @param {{ last_page_label?: string, pages?: unknown, form_submits?: unknown, forceJson?: boolean }} opts
 */
async function visitSessionWrite(opts) {
  if (!_client || !_sessionId || !_userId) return;
  if (_writeInFlight) return;
  if (Date.now() < _pulseBackoffUntil) return;

  _writeInFlight = true;
  try {
    const active = visitSessionAccumulateActiveMs();
    const label =
      (opts && opts.last_page_label) ||
      _lastPageLabel ||
      portalVisitPageLabelFromLocation(location);
    const scalars = {
      last_page_label: label,
      active_tab_ms: active,
      total_ms: active,
    };
    const jsonExtra = {};
    const wantPages = opts && opts.pages != null;
    const wantForms = opts && opts.form_submits != null;
    const wantJson =
      (opts && opts.forceJson) ||
      wantPages ||
      wantForms ||
      (!_heartbeatLightMode && _pagesDirty);
    if (wantPages) jsonExtra.pages = opts.pages;
    else if (wantJson && _pagesDirty) jsonExtra.pages = _pagesLocal;
    if (wantForms) jsonExtra.form_submits = opts.form_submits;

    let result = { ok: false, error: null };
    const directPayload = visitSessionDirectScalarPayload(scalars, jsonExtra);
    const directFirst = await visitSessionDirectUpdate(directPayload);
    if (!directFirst.error) {
      result = { ok: true, error: null };
    } else if (wantJson && Object.keys(jsonExtra).length) {
      result = await visitSessionPatchRpc(scalars, jsonExtra);
      if (result.skipped) {
        result = { ok: false, error: directFirst.error };
      }
    } else if (visitSessionRpcEnabled()) {
      result = await visitSessionPulseRpc(scalars);
      if (result.skipped) {
        result = { ok: false, error: directFirst.error };
      }
    } else {
      result = { ok: false, error: directFirst.error };
    }

    if (result.ok) {
      visitSessionMarkSuccess(wantJson && Object.keys(jsonExtra).length > 0);
      return;
    }
    if (result.error && String(result.error.message || "") === "session_not_found") {
      saveStoredSessionId("");
      _sessionId = null;
      return;
    }
    visitSessionMarkFailure(result.error, wantJson ? "update" : "heartbeat", wantJson);
  } finally {
    _writeInFlight = false;
  }
}

async function flushPatch(extra) {
  await visitSessionWrite(
    Object.assign({ forceJson: !!(extra && (extra.pages != null || extra.form_submits != null)) }, extra || {})
  );
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
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  const label = portalVisitPageLabelFromLocation(location);
  notePage(label);
  const prevLen = _pagesLocal.length;
  _pagesLocal = appendPageEvent(_pagesLocal, label);
  if (_pagesLocal.length !== prevLen) _pagesDirty = true;
  await visitSessionWrite({ last_page_label: label });
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
}
