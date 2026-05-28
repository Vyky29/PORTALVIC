/**
 * Records staff/lead/admin portal visit sessions into public.portal_staff_visit_sessions.
 */
import { getSupabaseClient } from "./supabase-client.js?v=20260531-visit-track";
import { portalPresenceSurface } from "./portal_live_presence.js?v=20260531-visit-track";

const STORAGE_KEY = "portalVisitSessionId_v1";
const HEARTBEAT_MS = 12000;
const FLUSH_MS = 45000;

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
/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let _client = null;
/** @type {string} */
let _userId = "";

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
  await _client.from("portal_staff_visit_sessions").update(payload).eq("id", _sessionId);
}

async function ensureSession(opts) {
  if (!_client || !_userId) return;
  const profile = opts.profile || {};
  const session = opts.session || {};
  const email = String(session.user?.email || "").trim();
  const surface = portalPresenceSurface(opts.page, profile, email);
  const displayName =
    String(profile.full_name || profile.username || "").trim() ||
    email.split("@")[0] ||
    "Staff";
  const pageLabel = portalVisitPageLabelFromLocation(location);
  _lastPageLabel = pageLabel;
  const today = londonDateIso(new Date());

  const existingId = loadStoredSessionId();
  if (existingId) {
    const { data } = await _client
      .from("portal_staff_visit_sessions")
      .select("id, session_date, still_open")
      .eq("id", existingId)
      .eq("staff_user_id", _userId)
      .maybeSingle();
    if (data && data.still_open && String(data.session_date) === today) {
      _sessionId = data.id;
      await flushPatch({ last_page_label: pageLabel });
      return;
    }
    saveStoredSessionId("");
  }

  const pages = [{ label: pageLabel, at: new Date().toISOString() }];
  const row = {
    staff_user_id: _userId,
    staff_display_name: displayName,
    staff_surface: surface,
    session_date: today,
    login_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    last_page_label: pageLabel,
    pages,
    still_open: true,
    active_tab_ms: 0,
    total_ms: 0,
  };
  const { data: ins, error } = await _client
    .from("portal_staff_visit_sessions")
    .insert([row])
    .select("id")
    .maybeSingle();
  if (error || !ins?.id) {
    console.debug("[portal] visit session insert", error);
    return;
  }
  _sessionId = ins.id;
  saveStoredSessionId(_sessionId);
}

function appendPageEvent(pages, label) {
  const arr = Array.isArray(pages) ? pages.slice() : [];
  const L = String(label || "").trim();
  if (!L) return arr;
  const last = arr.length ? arr[arr.length - 1] : null;
  if (last && String(last.label) === L) return arr;
  arr.push({ label: L, at: new Date().toISOString() });
  return arr;
}

async function heartbeat() {
  if (!_client || !_sessionId) return;
  const label = portalVisitPageLabelFromLocation(location);
  notePage(label);
  let pagesPatch;
  try {
    const { data } = await _client
      .from("portal_staff_visit_sessions")
      .select("pages")
      .eq("id", _sessionId)
      .maybeSingle();
    pagesPatch = appendPageEvent(data?.pages, label);
  } catch (_) {
    pagesPatch = appendPageEvent([], label);
  }
  const now = Date.now();
  if (document.visibilityState === "visible") {
    if (_visibleSince <= 0) _visibleSince = now;
    _activeTabAccumMs += Math.max(0, now - _visibleSince);
    _visibleSince = now;
  } else {
    _visibleSince = 0;
  }
  const active = Math.round(_activeTabAccumMs);
  await _client
    .from("portal_staff_visit_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      last_page_label: label,
      active_tab_ms: active,
      total_ms: active,
      pages: pagesPatch,
      still_open: true,
    })
    .eq("id", _sessionId);
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
    .eq("id", _sessionId);
  saveStoredSessionId("");
  _sessionId = null;
}

/**
 * @param {{ page?: string, profile?: Record<string, unknown> | null, session?: import("@supabase/supabase-js").Session | null }} opts
 */
export async function startPortalVisitTracker(opts = {}) {
  if (typeof window === "undefined") return;
  try {
    _client = getSupabaseClient();
  } catch (_) {
    return;
  }
  const session = opts.session;
  _userId = String(session?.user?.id || "").trim();
  if (!_userId) return;

  _visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  await ensureSession(opts);

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
    void closeSession();
  });

  setInterval(() => {
    void flushPatch();
  }, FLUSH_MS);
}
