/**
 * Supabase Realtime Presence — who is online on admin / staff / lead / onboarding shells.
 * Admin mounts `#portalLivePresenceBar`; other dashboards only publish presence.
 * Admin bar merges Realtime with DB heartbeats (visit sessions + live GPS).
 */
import { getSharedSupabaseClient } from "./supabase-client.js";
import {
  STAFF_USERNAME_TO_EMAIL,
  PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY,
} from "./auth-map.js";

const CHANNEL_NAME = "portal-live-presence-v1";
const HEARTBEAT_MS = 28000;
const ADMIN_POLL_MS = 45000;
const VISIT_STALE_SECONDS = 90;
const SUBSCRIBE_TIMEOUT_MS = 15000;

/** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
let _channel = null;
/** @type {string | null} */
let _presenceKey = null;
/** @type {ReturnType<typeof setInterval> | null} */
let _heartbeat = null;
/** @type {ReturnType<typeof setInterval> | null} */
let _adminPoll = null;
/** @type {string} */
let _presencePage = "";
/** @type {Record<string, unknown> | null} */
let _presenceProfile = null;
/** @type {import("@supabase/supabase-js").Session | null} */
let _presenceSession = null;
let _visibilityBound = false;
let _authListenerBound = false;

export function portalPresenceDisplayLabel(nameRaw, email) {
  const em = String(email || "").trim();
  const emLow = em.toLowerCase();
  const n = String(nameRaw || "").trim();
  if (n && n.toLowerCase() !== emLow && !/@/.test(n)) return n;
  const corpKey = PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY[emLow];
  if (corpKey) return corpKey.charAt(0).toUpperCase() + corpKey.slice(1);
  for (const [label, addr] of Object.entries(STAFF_USERNAME_TO_EMAIL)) {
    if (String(addr).trim().toLowerCase() === emLow && !String(label).includes("@")) {
      return label;
    }
  }
  const local = em.split("@")[0] || em;
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : em;
}

/** First name only — used in the live presence bar when many users may be online. */
export function portalPresenceFirstName(nameRaw, email) {
  const label = portalPresenceDisplayLabel(nameRaw, email);
  const part = String(label).trim().split(/\s+/).filter(Boolean)[0];
  return part || label;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function londonTodayIso() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* ignore */
  }
  return new Date().toISOString().slice(0, 10);
}

/** Demo / guide preview only — real Teflon login should appear in the Online bar for QA. */
export function portalPresenceSkipDemoBroadcast(profile, session, opts) {
  if (opts?.isDemo === true) return true;
  const p = profile || {};
  const u = String(p.username || "").trim().toLowerCase();
  const fn = String(p.full_name || "").trim().toLowerCase();
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const local = email.split("@")[0] || "";
  const isTeflonAccount =
    u === "teflon" || fn === "teflon" || local === "teflon" || local === "stf020";
  if (!isTeflonAccount) return false;
  if (session?.user?.id) return false;
  try {
    const qs = new URLSearchParams(String(window.location.search || ""));
    if (String(qs.get("portalPreview") || "").trim().toLowerCase() === "teflon") {
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * @param {string} page
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 * @returns {"onboarding"|"admin"|"lead"|"staff"}
 */
export function portalPresenceSurface(page, profile, email) {
  const p = String(page || "").toLowerCase();
  if (p === "onboarding") return "onboarding";
  const app = String(profile?.app_role || "").toLowerCase();
  const staff = String(profile?.staff_role || "").toLowerCase();
  if (p === "admin" || p === "ceo" || app === "admin" || app === "ceo" || staff === "manager") {
    return "admin";
  }
  if (p === "lead" || app === "lead" || staff === "lead") return "lead";
  if (app === "onboarding" || staff === "onboarding") return "onboarding";
  return "staff";
}

/**
 * @param {Record<string, import("@supabase/supabase-js").RealtimePresenceState[string]>} state
 * @returns {{ connected: { email: string, name: string, at: number, user_id?: string }[] }}
 */
export function portalPresenceGrouped(state) {
  /** @type {{ email: string, name: string, at: number, user_id?: string }[]} */
  const connected = [];
  const seenIds = new Set();
  const seenEmails = new Set();

  for (const key of Object.keys(state || {})) {
    const payloads = state[key];
    if (!Array.isArray(payloads) || !payloads.length) continue;
    let best = /** @type {Record<string, unknown>} */ (payloads[payloads.length - 1]);
    for (let i = payloads.length - 1; i >= 0; i--) {
      const row = payloads[i];
      if (row && typeof row === "object" && (row.email || row.user_id)) {
        best = /** @type {Record<string, unknown>} */ (row);
        break;
      }
    }
    const userId = String(best.user_id || key || "").trim();
    const email = String(best.email || "").trim();
    if (userId && seenIds.has(userId)) continue;
    const dedupeEmail = email.toLowerCase();
    if (!userId && dedupeEmail && seenEmails.has(dedupeEmail)) continue;
    if (userId) seenIds.add(userId);
    if (dedupeEmail) seenEmails.add(dedupeEmail);
    connected.push({
      email,
      name: portalPresenceFirstName(best.name, email),
      at: Number(best.at) || 0,
      user_id: userId || undefined,
    });
  }

  connected.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { connected };
}

/**
 * @param {{ connected?: { email?: string, name?: string, at?: number, user_id?: string }[] }} realtime
 * @param {{ connected?: { email?: string, name?: string, at?: number, user_id?: string }[] }} supplement
 */
export function portalPresenceMergeSupplement(realtime, supplement) {
  /** @type {{ email: string, name: string, at: number, user_id?: string }[]} */
  const connected = (realtime?.connected || []).slice();
  const seenIds = new Set(connected.map((e) => String(e.user_id || "").trim()).filter(Boolean));
  const seenNames = new Set(
    connected.map((e) => String(e.name || "").trim().toLowerCase()).filter(Boolean)
  );

  for (const row of supplement?.connected || []) {
    const userId = String(row.user_id || "").trim();
    const name = portalPresenceFirstName(String(row.name || "").trim(), String(row.email || ""));
    const nameKey = name.toLowerCase();
    if (userId && seenIds.has(userId)) continue;
    if (!userId && nameKey && seenNames.has(nameKey)) continue;
    if (userId) seenIds.add(userId);
    if (nameKey) seenNames.add(nameKey);
    connected.push({
      email: String(row.email || "").trim(),
      name,
      at: Number(row.at) || 0,
      user_id: userId || undefined,
    });
  }

  connected.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { connected };
}

function dispatchPresenceSync() {
  if (typeof window === "undefined") return;
  const state = _channel ? _channel.presenceState() : {};
  const grouped = portalPresenceGrouped(state);
  window.__PORTAL_PRESENCE_GROUPED__ = grouped;
  window.dispatchEvent(
    new CustomEvent("portal:presence-sync", { detail: grouped })
  );
}

async function presenceTrackPayload(page, profile, session) {
  const user = session?.user;
  if (!user?.id) return null;
  let email = String(user.email || "").trim();
  if (!email) {
    email = String(profile?.username || profile?.full_name || "").trim();
  }
  if (!email) {
    email = `user-${user.id}@portal.local`;
  }
  const surface = portalPresenceSurface(page, profile, email);
  const name = portalPresenceFirstName(
    String(profile?.full_name || profile?.username || "").trim(),
    String(user.email || email)
  );
  return {
    surface,
    email,
    user_id: user.id,
    name,
    page: String(page || surface),
    at: Date.now(),
  };
}

async function presenceRetrack() {
  if (!_channel || document.visibilityState === "hidden") return;
  const p = await presenceTrackPayload(
    _presencePage,
    window.__PORTAL_SUPABASE__?.staff_profile || _presenceProfile,
    window.__PORTAL_SUPABASE__?.session || _presenceSession
  );
  if (!p) return;
  try {
    await _channel.track(p);
    dispatchPresenceSync();
  } catch (err) {
    console.warn("[portal] presence retrack failed:", err);
  }
}

function bindPresenceResumeListeners(page, profile, session) {
  _presencePage = String(page || "").trim().toLowerCase();
  _presenceProfile = profile || null;
  _presenceSession = session || null;

  if (typeof document !== "undefined" && !_visibilityBound) {
    _visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void presenceRetrack();
    });
  }

  if (!_authListenerBound) {
    _authListenerBound = true;
    try {
      const sb = getSharedSupabaseClient();
      sb.auth.onAuthStateChange((event) => {
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") void presenceRetrack();
      });
    } catch {
      /* ignore */
    }
  }
}

async function subscribeAndTrack(supabase, payload) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("[portal] presence subscribe timeout");
      resolve(false);
    }, SUBSCRIBE_TIMEOUT_MS);

    _channel.subscribe(async (status, err) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        try {
          await _channel.track(payload);
          dispatchPresenceSync();
          resolve(true);
        } catch (trackErr) {
          console.warn("[portal] presence track failed:", trackErr);
          resolve(false);
        }
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timeout);
        if (status === "CLOSED") {
          resolve(false);
          return;
        }
        if (typeof globalThis.portalRealtimeLogChannelIssue === "function") {
          globalThis.portalRealtimeLogChannelIssue("[portal] presence channel", status, err);
        } else if (typeof globalThis.portalWarnUnlessOffline === "function") {
          globalThis.portalWarnUnlessOffline("[portal] presence channel", status, err);
        }
        resolve(false);
      }
    });
  });
}

/**
 * @param {{ page?: string, profile?: Record<string, unknown> | null, session?: import("@supabase/supabase-js").Session | null }} opts
 */
export async function startPortalLivePresence(opts = {}) {
  if (typeof window === "undefined") return;
  const page = String(opts.page || "").trim().toLowerCase();
  const profile = opts.profile || window.__PORTAL_SUPABASE__?.staff_profile || null;
  const session =
    opts.session || window.__PORTAL_SUPABASE__?.session || null;
  if (!session?.user?.id) return;
  if (portalPresenceSkipDemoBroadcast(profile, session, opts)) {
    return;
  }

  let supabase;
  try {
    supabase = getSharedSupabaseClient();
  } catch {
    return;
  }

  bindPresenceResumeListeners(page, profile, session);

  _presenceKey = session.user.id;
  if (_channel) {
    try {
      await _channel.untrack();
    } catch {
      /* ignore */
    }
    try {
      await supabase.removeChannel(_channel);
    } catch {
      /* ignore */
    }
    _channel = null;
  }

  const payload = await presenceTrackPayload(page, profile, session);
  if (!payload) return;

  _channel = supabase.channel(CHANNEL_NAME, {
    config: { presence: { key: _presenceKey } },
  });

  _channel.on("presence", { event: "sync" }, () => dispatchPresenceSync());
  _channel.on("presence", { event: "join" }, () => dispatchPresenceSync());
  _channel.on("presence", { event: "leave" }, () => dispatchPresenceSync());

  await subscribeAndTrack(supabase, payload);

  if (_heartbeat) clearInterval(_heartbeat);
  _heartbeat = setInterval(async () => {
    if (!_channel || document.visibilityState === "hidden") return;
    await presenceRetrack();
  }, HEARTBEAT_MS);

  window.addEventListener("beforeunload", () => {
    try {
      void _channel?.untrack();
    } catch {
      /* ignore */
    }
  });
}

/** @returns {Promise<{ connected: { email: string, name: string, at: number, user_id?: string }[] }>} */
async function fetchAdminPresenceSupplement() {
  /** @type {{ email: string, name: string, at: number, user_id?: string }[]} */
  const connected = [];
  let client;
  try {
    client = getSharedSupabaseClient();
  } catch {
    return { connected };
  }

  const rpc = await client.rpc("portal_admin_fetch_online_staff", {
    p_visit_stale_seconds: VISIT_STALE_SECONDS,
  });
  if (!rpc.error && rpc.data != null) {
    const rows = Array.isArray(rpc.data) ? rpc.data : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const userId = String(row.staff_user_id || "").trim();
      const name = portalPresenceFirstName(String(row.name || "").trim(), "");
      if (!name) continue;
      connected.push({
        email: "",
        name,
        at: row.at ? new Date(String(row.at)).getTime() : Date.now(),
        user_id: userId || undefined,
      });
    }
    return { connected };
  }

  const cutoff = new Date(Date.now() - VISIT_STALE_SECONDS * 1000).toISOString();
  const today = londonTodayIso();

  const [locRes, visitRes] = await Promise.all([
    client.rpc("portal_admin_fetch_staff_live_locations", { p_stale_minutes: 20 }),
    client
      .from("portal_staff_visit_sessions")
      .select("staff_user_id, staff_display_name, last_seen_at")
      .eq("session_date", today)
      .eq("still_open", true)
      .gte("last_seen_at", cutoff),
  ]);

  const seen = new Set();
  const pushRow = (userId, nameRaw, atIso) => {
    const id = String(userId || "").trim();
    if (id && seen.has(id)) return;
    const name = portalPresenceFirstName(String(nameRaw || "").trim(), "");
    if (!name) return;
    if (id) seen.add(id);
    connected.push({
      email: "",
      name,
      at: atIso ? new Date(String(atIso)).getTime() : Date.now(),
      user_id: id || undefined,
    });
  };

  if (!locRes.error && Array.isArray(locRes.data)) {
    for (const row of locRes.data) pushRow(row.staff_user_id, row.staff_display_name, row.updated_at);
  }
  if (!visitRes.error && Array.isArray(visitRes.data)) {
    for (const row of visitRes.data) pushRow(row.staff_user_id, row.staff_display_name, row.last_seen_at);
  }

  connected.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { connected };
}

function presencePillsHtml(entries, emptyLabel) {
  if (!entries.length) {
    return '<span class="sf-status-bar__chip sf-status-bar__chip--muted">' + escHtml(emptyLabel) + "</span>";
  }
  return entries
    .map(
      (e) =>
        '<span class="sf-status-bar__chip">' +
        escHtml(e.name) +
        "</span>"
    )
    .join("");
}

function presenceSelfUserId() {
  return String(window.__PORTAL_SUPABASE__?.session?.user?.id || "").trim();
}

function presenceSelfEmail() {
  return String(window.__PORTAL_SUPABASE__?.session?.user?.email || "")
    .trim()
    .toLowerCase();
}

function presenceFilterSelf(grouped) {
  const meId = presenceSelfUserId();
  const me = presenceSelfEmail();
  const connected = (grouped.connected || []).filter((e) => {
    const id = String(e.user_id || "").trim();
    if (meId && id && id === meId) return false;
    if (me && String(e.email || "").trim().toLowerCase() === me) return false;
    return true;
  });
  return { connected };
}

/**
 * @param {string} [hostId]
 */
export function mountPortalLivePresenceBar(hostId = "portalLivePresenceBar") {
  if (typeof document === "undefined") return;
  const host = document.getElementById(hostId);
  if (!host) return;

  function renderFromSources() {
    const rt =
      window.__PORTAL_PRESENCE_GROUPED__ || {
        connected: [],
      };
    const supplement = window.__PORTAL_PRESENCE_SUPPLEMENT__ || { connected: [] };
    const merged = portalPresenceMergeSupplement(rt, supplement);
    const g = presenceFilterSelf(merged);
    const list = g.connected || [];
    const countLabel = list.length ? String(list.length) : "0";
    host.hidden = false;
    host.innerHTML =
      '<div class="sf-status-bar">' +
      '<div class="sf-status-bar__main">' +
      '<span class="sf-status-bar__tag" title="Connected now">Online · ' +
      escHtml(countLabel) +
      "</span>" +
      '<div class="sf-status-bar__values">' +
      presencePillsHtml(list, "Nobody else online") +
      "</div></div>" +
      '<a class="sf-status-bar__guide" href="/OTROS/admin_architecture_guide.html" target="_blank" rel="noopener noreferrer">Guide</a>' +
      "</div>";
  }

  async function pollAdminSupplement() {
    const supplement = await fetchAdminPresenceSupplement();
    window.__PORTAL_PRESENCE_SUPPLEMENT__ = supplement;
    renderFromSources();
  }

  renderFromSources();
  void pollAdminSupplement();

  window.addEventListener("portal:presence-sync", () => {
    renderFromSources();
  });

  if (_adminPoll) clearInterval(_adminPoll);
  _adminPoll = setInterval(() => {
    void pollAdminSupplement();
  }, ADMIN_POLL_MS);
}
