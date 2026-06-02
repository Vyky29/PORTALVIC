/**
 * Supabase Realtime Presence — who is online on admin / staff / lead / onboarding shells.
 * Admin mounts `#portalLivePresenceBar`; other dashboards only publish presence.
 */
import { getSharedSupabaseClient } from "./supabase-client.js";
import {
  STAFF_USERNAME_TO_EMAIL,
  PORTAL_CORPORATE_AUTH_EMAIL_TO_STAFF_KEY,
} from "./auth-map.js";

const CHANNEL_NAME = "portal-live-presence-v1";
const HEARTBEAT_MS = 28000;

/** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
let _channel = null;
/** @type {string | null} */
let _presenceKey = null;
/** @type {ReturnType<typeof setInterval> | null} */
let _heartbeat = null;

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

/**
 * @param {string} page
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 */
export function portalPresenceSurface(page, profile, authEmail) {
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
 * @returns {{ connected: { email: string, name: string, at: number }[] }}
 */
export function portalPresenceGrouped(state) {
  /** @type {{ email: string, name: string, at: number }[]} */
  const connected = [];
  const seen = new Set();

  for (const key of Object.keys(state || {})) {
    const payloads = state[key];
    if (!Array.isArray(payloads) || !payloads.length) continue;
    let best = /** @type {Record<string, unknown>} */ (payloads[payloads.length - 1]);
    for (let i = payloads.length - 1; i >= 0; i--) {
      const row = payloads[i];
      if (row && typeof row === "object" && row.email) {
        best = /** @type {Record<string, unknown>} */ (row);
        break;
      }
    }
    const email = String(best.email || "").trim();
    if (!email) continue;
    const dedupe = email.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    connected.push({
      email,
      name: portalPresenceFirstName(best.name, email),
      at: Number(best.at) || 0,
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
  const email = String(user?.email || "").trim();
  if (!email) return null;
  const surface = portalPresenceSurface(page, profile, email);
  const name = portalPresenceFirstName(
    String(profile?.full_name || profile?.username || "").trim(),
    email
  );
  return {
    surface,
    email,
    name,
    page: String(page || surface),
    at: Date.now(),
  };
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
  // Demo account is a sandbox: do not broadcast presence to real admins/CEOs.
  {
    const p = profile || {};
    const u = String(p.username || "").trim().toLowerCase();
    const fn = String(p.full_name || "").trim().toLowerCase();
    const local = String(session.user.email || "").trim().toLowerCase().split("@")[0] || "";
    if (opts.isDemo === true || u === "teflon" || fn === "teflon" || local === "teflon" || local === "stf020") {
      return;
    }
  }

  let supabase;
  try {
    supabase = getSharedSupabaseClient();
  } catch {
    return;
  }

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

  await new Promise((resolve) => {
    _channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await _channel.track(payload);
        } catch {
          /* ignore */
        }
        dispatchPresenceSync();
      }
      resolve(undefined);
    });
  });

  if (_heartbeat) clearInterval(_heartbeat);
  _heartbeat = setInterval(async () => {
    if (!_channel || document.visibilityState === "hidden") return;
    const p = await presenceTrackPayload(
      page,
      window.__PORTAL_SUPABASE__?.staff_profile || profile,
      window.__PORTAL_SUPABASE__?.session || session
    );
    if (!p) return;
    try {
      await _channel.track(p);
    } catch {
      /* ignore */
    }
  }, HEARTBEAT_MS);

  window.addEventListener("beforeunload", () => {
    try {
      void _channel?.untrack();
    } catch {
      /* ignore */
    }
  });
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

function presenceSelfEmail() {
  return String(window.__PORTAL_SUPABASE__?.session?.user?.email || "")
    .trim()
    .toLowerCase();
}

function presenceFilterSelf(grouped) {
  const me = presenceSelfEmail();
  if (!me) return grouped;
  const connected = (grouped.connected || []).filter(
    (e) => String(e.email || "").trim().toLowerCase() !== me
  );
  return { connected };
}

/**
 * @param {string} [hostId]
 */
export function mountPortalLivePresenceBar(hostId = "portalLivePresenceBar") {
  if (typeof document === "undefined") return;
  const host = document.getElementById(hostId);
  if (!host) return;

  function render(grouped) {
    const g = presenceFilterSelf(
      grouped ||
        window.__PORTAL_PRESENCE_GROUPED__ || {
          connected: [],
        }
    );
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

  render(window.__PORTAL_PRESENCE_GROUPED__);
  window.addEventListener("portal:presence-sync", (ev) => {
    render(/** @type {CustomEvent} */ (ev).detail);
  });
}
