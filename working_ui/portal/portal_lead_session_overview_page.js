/**
 * Standalone Session overview for programme leads (John, Berta).
 */
import { bootstrapDashboardSupabase } from "./auth-handler.js";
import {
  portalCanAccessLeadSessionOverview,
  portalLeadSessionScopeFilterFns,
  portalLeadSessionScopesForProfile,
  portalLeadSessionScopeLabels,
  portalLeadReportInScope,
  portalLeadFeedbackInScope,
} from "./portal_lead_session_scope.js";

const HUB_SRC = "/portal/admin-sessions-hub.js?v=20260526-lead-overview3";
const LEAD_URL = "lead_dashboard.html";

const state = { tab: "overview", scopes: [] };

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isoToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function mondayOfWeekIso(iso) {
  const s = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoToday();
  const p = s.split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  if (isNaN(d.getTime())) return isoToday();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function portalFeedbackRows() {
  const src = window.SESSION_FEEDBACK_PORTAL_SOURCE;
  return src && Array.isArray(src.rows) ? src.rows : [];
}

function feedbackDateIso(r) {
  const raw = String(r.date || r.sessionDate || r.session_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (m) {
    return m[3] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
  }
  return "";
}

function mapPortalRowToHubFeedback(r, scopes) {
  const d = feedbackDateIso(r);
  const eng = r.engagement;
  const row = {
    client_name: String(r.clientName || r.client || "").trim() || "—",
    session_date: d,
    service: String(r.service || "").trim() || "—",
    attendance: r.attendance,
    engagement_rating: eng != null && eng !== "" && !isNaN(Number(eng)) ? Number(eng) : null,
    client_emotions: String(r.emotions || r.emotionSummary || "").trim(),
    engagement_patterns: String(r.independence || "").trim() || null,
    positive_feedback: String(r.positive || r.positiveFeedback || "").trim(),
    relevant_information: String(r.relevantParent || r.relevant || "").trim(),
    completed_by_name: String(r.instructor || r.completedBy || "").trim() || "—",
    session_time: String(r.sessionTime || r.time || "").trim(),
    portal_session_key: d ? d + "|" + String(r.clientName || "").trim() : "",
    venue: String(r.venue || "").trim(),
  };
  if (!portalLeadFeedbackInScope(row, scopes)) return null;
  return row;
}

function ensureHubScript() {
  return new Promise((resolve, reject) => {
    if (window.AdminSessionsHub) {
      resolve();
      return;
    }
    const tagged = document.querySelector('script[data-admin-sessions-hub="1"]');
    if (tagged) {
      tagged.addEventListener(
        "load",
        () => (window.AdminSessionsHub ? resolve() : reject(new Error("hub missing"))),
        { once: true }
      );
      tagged.addEventListener("error", () => reject(new Error("hub load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = HUB_SRC;
    s.dataset.adminSessionsHub = "1";
    s.onload = () => (window.AdminSessionsHub ? resolve() : reject(new Error("hub missing")));
    s.onerror = () => reject(new Error("hub load failed"));
    document.head.appendChild(s);
  });
}

function headHtml(tab) {
  if (tab === "feedback") {
    return (
      '<div class="c4k-sessions-hub__head">' +
      '<div class="c4k-sessions-hub__title-row">' +
      '<span class="c4k-sessions-hub__ico" aria-hidden="true">📋</span>' +
      '<div style="min-width:0">' +
      "<h1 class=\"c4k-sessions-hub__title\">SESSION FEEDBACKS</h1>" +
      '<p class="c4k-sessions-hub__sub">Staff feedback on sessions in your programmes (same view as admin).</p>' +
      "</div></div></div>"
    );
  }
  if (tab === "lead") {
    return (
      '<div class="c4k-sessions-hub__head">' +
      '<div class="c4k-sessions-hub__title-row">' +
      '<span class="c4k-sessions-hub__ico" aria-hidden="true">📊</span>' +
      '<div style="min-width:0">' +
      "<h1 class=\"c4k-sessions-hub__title\">LEAD REPORTS</h1>" +
      '<p class="c4k-sessions-hub__sub">Lead session reports — including your co-lead when they worked the slot.</p>' +
      "</div></div></div>"
    );
  }
  return (
    '<div class="c4k-sessions-hub__head">' +
    "<h1 class=\"c4k-sessions-hub__title\">SESSIONS OVERVIEW</h1>" +
    '<p class="c4k-sessions-hub__sub">Weekly roster, session status, and feedback for your programmes.</p>' +
    "</div>"
  );
}

function usesTrackingHub(tab) {
  return tab === "overview";
}

function usesFeedbackHub(tab) {
  return tab === "feedback";
}

function refreshPanels() {
  const showTrack = usesTrackingHub(state.tab);
  const showFb = usesFeedbackHub(state.tab);
  const showLead = state.tab === "lead";
  const ov = $("c4kHubPanelOverview");
  const fb = $("c4kHubPanelFeedback");
  const lead = $("c4kHubPanelLead");
  if (ov) ov.hidden = !showTrack;
  if (fb) fb.hidden = !showFb;
  if (lead) lead.hidden = !showLead;
  document.querySelectorAll("[data-plso-tab]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-plso-tab") === state.tab);
  });
  const head = document.querySelector(".c4k-sessions-hub__head");
  if (head) head.outerHTML = headHtml(state.tab);
}

async function fetchLeadReports(client) {
  if (!client) return [];
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const sinceIso = since.toISOString().slice(0, 10);
  try {
    const { data, error } = await client
      .from("lead_session_reports")
      .select("*")
      .gte("session_date", sinceIso)
      .order("session_date", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn("lead_session_reports fetch", e);
    return [];
  }
}

function applyScopedPayload(scopes) {
  const p = window.PortalDayOps && window.PortalDayOps.getPayload();
  if (!p) return p;
  const portalFb = portalFeedbackRows()
    .map((r) => mapPortalRowToHubFeedback(r, scopes))
    .filter(Boolean);
  if (portalFb.length) {
    p.session_feedback = portalFb;
    p.session_feedback_total = portalFb.length;
    p.session_feedback_loaded = portalFb.length;
  }
  p.lead_session_reports = (p.lead_session_reports || []).filter((r) =>
    portalLeadReportInScope(r, scopes)
  );
  return p;
}

function configureDayOps(scopes) {
  if (!window.PortalDayOps || window.__plsoDayOpsConfigured) return;
  window.__plsoDayOpsConfigured = true;
  window.PortalDayOps.configure({
    esc,
    getClient: () =>
      window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client
        ? window.__PORTAL_SUPABASE__.client
        : null,
    getSupabaseUrl: () =>
      String(window.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co").trim(),
    getAnonKey: () => String(window.SUPABASE_ANON_KEY || "").trim(),
    buildFeedbackFromPortal: () => {
      const out = [];
      portalFeedbackRows().forEach((r) => {
        const row = mapPortalRowToHubFeedback(r, scopes);
        if (row) out.push(row);
      });
      return out;
    },
    formatDate: (iso) => {
      if (!iso) return "—";
      try {
        const d = new Date(String(iso));
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (e) {
        return String(iso);
      }
    },
  });
}

async function initHubs(scopes) {
  await ensureHubScript();
  const filters = portalLeadSessionScopeFilterFns(scopes);
  const hubOpts = {
    escapeHtml: esc,
    externalTabs: true,
    payload: window.PortalDayOps.getPayload(),
    slotScopeFilter: filters.slotScopeFilter,
    feedbackRowScopeFilter: filters.feedbackRowScopeFilter,
    hideEmptyWeekDays: true,
    readOnlyOverview: true,
  };

  const trackRoot = $("adminSessionsHubRoot");
  if (trackRoot) {
    window.__plsoTrackingHub = await window.AdminSessionsHub.mount(trackRoot, {
      ...hubOpts,
      mode: "tracking",
    });
    if (window.__plsoTrackingHub) {
      window.__plsoTrackingHub.tab = "tracking";
      window.__plsoTrackingHub.weekStart = mondayOfWeekIso(isoToday());
      const showDays =
        typeof window.__plsoTrackingHub.weekDaysForDisplay === "function"
          ? window.__plsoTrackingHub.weekDaysForDisplay()
          : window.__plsoTrackingHub.weekDays();
      window.__plsoTrackingHub.selectedDay =
        showDays.length > 0 ? showDays[0] : isoToday();
    }
  }

  const fbRoot = $("adminSessionFeedbacksRoot");
  if (fbRoot) {
    window.__plsoFeedbackHub = await window.AdminSessionsHub.mount(fbRoot, {
      ...hubOpts,
      mode: "feedback",
    });
    if (window.__plsoFeedbackHub) {
      window.__plsoFeedbackHub.weekStart = mondayOfWeekIso(isoToday());
      const fbDays =
        typeof window.__plsoFeedbackHub.weekDaysForDisplay === "function"
          ? window.__plsoFeedbackHub.weekDaysForDisplay()
          : window.__plsoFeedbackHub.weekDays();
      if (fbDays.length > 0) window.__plsoFeedbackHub.selectedDay = fbDays[0];
    }
  }
}

async function mergeLeadReportsFromDb(scopes) {
  const ctx = window.__PORTAL_SUPABASE__ || {};
  const extra = await fetchLeadReports(ctx.client);
  const p = window.PortalDayOps.getPayload();
  const seen = new Set();
  const merged = [];
  (p.lead_session_reports || []).concat(extra || []).forEach((r) => {
    const id = String(r.id || r.created_at || "") + "|" + String(r.session_date || "");
    if (seen.has(id)) return;
    seen.add(id);
    if (portalLeadReportInScope(r, scopes)) merged.push(r);
  });
  p.lead_session_reports = merged;
}

async function refreshTab(tab) {
  state.tab = tab || "overview";
  const scopes = state.scopes;
  refreshPanels();
  if (window.PortalDayOps && typeof window.PortalDayOps.ensurePayload === "function") {
    await window.PortalDayOps.ensurePayload();
    await mergeLeadReportsFromDb(scopes);
    applyScopedPayload(scopes);
  }
  const payload = window.PortalDayOps.getPayload();
  if (usesTrackingHub(state.tab) && window.__plsoTrackingHub) {
    window.__plsoTrackingHub.setPayload(payload);
    if (typeof window.__plsoTrackingHub.renderPanels === "function") {
      window.__plsoTrackingHub.renderPanels();
    }
  }
  if (usesFeedbackHub(state.tab) && window.__plsoFeedbackHub) {
    window.__plsoFeedbackHub.setPayload(payload);
    if (typeof window.__plsoFeedbackHub.renderPanels === "function") {
      window.__plsoFeedbackHub.renderPanels();
    } else if (typeof window.__plsoFeedbackHub.render === "function") {
      window.__plsoFeedbackHub.render();
    }
  }
  if (state.tab === "lead" && window.PortalDayOps && typeof window.PortalDayOps.refreshTab === "function") {
    await window.PortalDayOps.refreshTab("lead");
  }
}

function bindTabs() {
  document.querySelectorAll("[data-plso-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void refreshTab(btn.getAttribute("data-plso-tab") || "overview");
    });
  });
}

export async function portalInitLeadSessionOverviewPage() {
  const statusEl = $("portalDayOpsStatus");
  try {
    await bootstrapDashboardSupabase({ page: "lead" });
  } catch (e) {
    console.warn("lead session overview auth", e);
  }
  const ctx = window.__PORTAL_SUPABASE__ || {};
  const profile = ctx.staff_profile;
  const email = String((ctx.session && ctx.session.user && ctx.session.user.email) || "").trim();
  if (!portalCanAccessLeadSessionOverview(profile, email)) {
    window.location.replace(LEAD_URL);
    return;
  }
  const scopes = portalLeadSessionScopesForProfile(profile, email);
  state.scopes = scopes;
  const hint = $("plsoScopeHint");
  if (hint) {
    const labels = portalLeadSessionScopeLabels(profile, email);
    if (labels.length > 0) {
      hint.textContent = "Showing: " + labels.join(" · ");
      hint.hidden = false;
    } else {
      hint.textContent = "Programme scope could not be resolved.";
      hint.hidden = false;
    }
  }

  configureDayOps(scopes);
  if (statusEl) statusEl.textContent = "Loading session data…";

  if (window.PortalDayOps && typeof window.PortalDayOps.ensurePayload === "function") {
    await window.PortalDayOps.ensurePayload();
  }
  const client = ctx.client;
  const leadRows = await fetchLeadReports(client);
  const payload = window.PortalDayOps.getPayload();
  const seenLead = new Set();
  const mergedLead = [];
  (payload.lead_session_reports || []).concat(leadRows).forEach((r) => {
    const id = String(r.id || r.created_at || "") + "|" + String(r.session_date || "");
    if (seenLead.has(id)) return;
    seenLead.add(id);
    if (portalLeadReportInScope(r, scopes)) mergedLead.push(r);
  });
  payload.lead_session_reports = mergedLead;
  applyScopedPayload(scopes);

  await initHubs(scopes);
  bindTabs();
  if (statusEl) statusEl.textContent = "";
  await refreshTab("overview");
}

export function portalSyncLeadSessionOverviewButton() {
  const btn = document.getElementById("quickMenuLeadSessionOverview");
  if (!btn) return;
  const ctx = window.__PORTAL_SUPABASE__ || {};
  const profile = ctx.staff_profile;
  const email = String((ctx.session && ctx.session.user && ctx.session.user.email) || "").trim();
  const show = portalCanAccessLeadSessionOverview(profile, email);
  btn.hidden = !show;
  btn.setAttribute("aria-hidden", show ? "false" : "true");
}
