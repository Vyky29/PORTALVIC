/**
 * Supabase Realtime Presence — who is online on admin / staff / lead / onboarding shells.
 * Admin mounts `#portalLivePresenceBar`; other dashboards only publish presence.
 */
import { getSupabaseClient } from "./supabase-client.js?v=20260506-portal-interactions";

const CHANNEL_NAME = "portal-live-presence-v1";
const HEARTBEAT_MS = 28000;

/** @type {import("@supabase/supabase-js").RealtimeChannel | null} */
let _channel = null;
/** @type {string | null} */
let _presenceKey = null;
/** @type {ReturnType<typeof setInterval> | null} */
let _heartbeat = null;

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
 */
export function portalPresenceGrouped(state) {
  /** @type {{ email: string, name: string, at: number }[]} */
  const admins = [];
  /** @type {{ email: string, name: string, at: number }[]} */
  const staffLeads = [];
  /** @type {{ email: string, name: string, at: number }[]} */
  const onboarding = [];
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
    const entry = {
      email,
      name: String(best.name || email).trim(),
      at: Number(best.at) || 0,
    };
    const surface = String(best.surface || "staff").toLowerCase();
    if (surface === "admin") admins.push(entry);
    else if (surface === "onboarding") onboarding.push(entry);
    else staffLeads.push(entry);
  }

  admins.sort((a, b) => a.email.localeCompare(b.email));
  staffLeads.sort((a, b) => a.email.localeCompare(b.email));
  onboarding.sort((a, b) => a.email.localeCompare(b.email));
  return { admins, staffLeads, onboarding };
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
  const name =
    String(profile?.full_name || profile?.username || "").trim() ||
    email.split("@")[0];
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

  let supabase;
  try {
    supabase = getSupabaseClient();
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
    return '<span class="portal-live-presence__empty">' + escHtml(emptyLabel) + "</span>";
  }
  return entries
    .map(
      (e) =>
        '<span class="portal-live-presence__pill" title="' +
        escHtml(e.name) +
        '">' +
        escHtml(e.email) +
        "</span>"
    )
    .join("");
}

/**
 * @param {string} [hostId]
 */
export function mountPortalLivePresenceBar(hostId = "portalLivePresenceBar") {
  if (typeof document === "undefined") return;
  const host = document.getElementById(hostId);
  if (!host) return;

  function render(grouped) {
    const g = grouped || window.__PORTAL_PRESENCE_GROUPED__ || {
      admins: [],
      staffLeads: [],
      onboarding: [],
    };
    host.hidden = false;
    host.innerHTML =
      '<div class="portal-live-presence__wrap">' +
      '<div class="portal-live-presence__inner">' +
      '<section class="portal-live-presence__col"><h2 class="portal-live-presence__lbl">ADMINS ONLINE</h2><div class="portal-live-presence__pills">' +
      presencePillsHtml(g.admins, "No admins online") +
      "</div></section>" +
      '<section class="portal-live-presence__col"><h2 class="portal-live-presence__lbl">STAFF &amp; LEADS ONLINE</h2><div class="portal-live-presence__pills">' +
      presencePillsHtml(g.staffLeads, "No staff or leads online") +
      "</div></section>" +
      '<section class="portal-live-presence__col"><h2 class="portal-live-presence__lbl">ONBOARDING ONLINE</h2><div class="portal-live-presence__pills">' +
      presencePillsHtml(g.onboarding, "No one on onboarding") +
      "</div></section>" +
      "</div>" +
      '<div class="portal-live-presence__actions">' +
      '<a class="btn btn--sec btn--sm portal-live-presence__guide" href="/OTROS/admin_architecture_guide.html" target="_blank" rel="noopener noreferrer">Admin guide</a>' +
      '<button type="button" class="btn btn--sec btn--sm portal-live-presence__logout" data-portal-logout>Log out</button>' +
      "</div></div>";
  }

  render(window.__PORTAL_PRESENCE_GROUPED__);
  window.addEventListener("portal:presence-sync", (ev) => {
    render(/** @type {CustomEvent} */ (ev).detail);
  });
}
