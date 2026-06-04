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
  portalLeadAbsentMarkInScope,
  portalLeadFeedbackInScope,
  portalLeadInferFeedbackVenue,
  portalLeadDayFeedbackStats,
  portalLeadProgrammeKey,
  portalLeadDayIsClubClosed,
  portalLeadDayIsProgrammeWorkDay,
  portalLeadOnOrAfterSummerTerm,
  portalLeadSummerTermWeekStart,
  PORTAL_LEAD_SUMMER_TERM_START,
} from "./portal_lead_session_scope.js";

const HUB_SRC = "/portal/admin-sessions-hub.js?v=20260608-lead-overview";
const LEAD_URL = "lead_dashboard.html";

const state = { tab: "feedback", scopes: [] };

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

function feedbackRowMergeKey(row) {
  const pk = String(row.portal_session_key || "").trim();
  const by = String(row.completed_by_name || "")
    .trim()
    .toLowerCase();
  if (pk) return pk + "|" + by;
  return [
    String(row.session_date || "").slice(0, 10),
    String(row.client_name || "").trim().toLowerCase(),
    String(row.session_time || "").trim(),
    by,
  ].join("|");
}

function mergeScopedFeedbackLists(scopes, lists) {
  const byKey = new Map();
  lists.forEach((list) => {
    (list || []).forEach((row) => {
      if (!row) return;
      const k = feedbackRowMergeKey(row);
      if (!k || byKey.has(k)) return;
      byKey.set(k, row);
    });
  });
  return Array.from(byKey.values());
}

function mapPortalRowToHubFeedback(r, scopes) {
  const d = feedbackDateIso(r);
  const eng = r.engagement;
  const row = {
    client_name: String(r.clientName || r.client || r.client_name || "").trim() || "—",
    session_date: d,
    service: String(r.service || "").trim() || "—",
    attendance: r.attendance,
    engagement_rating: eng != null && eng !== "" && !isNaN(Number(eng)) ? Number(eng) : null,
    client_emotions: String(r.emotions || r.emotionSummary || r.client_emotions || "").trim(),
    engagement_patterns:
      String(r.independence || r.engagement_patterns || "").trim() || null,
    positive_feedback: String(r.positive || r.positiveFeedback || r.positive_feedback || "").trim(),
    relevant_information: String(
      r.relevantParent || r.relevant || r.relevant_information || ""
    ).trim(),
    completed_by_name:
      String(r.instructor || r.completedBy || r.completed_by_name || "").trim() || "—",
    session_time: String(r.sessionTime || r.time || r.session_time || "").trim(),
    created_at: String(r.submittedAt || r.created_at || "").trim() || null,
    portal_session_key: String(r.portal_session_key || r.portalSessionKey || "").trim(),
    venue: String(r.venue || "").trim(),
  };
  if (!row.portal_session_key && d) {
    row.portal_session_key = d + "|" + String(r.clientName || r.client || "").trim();
  }
  row.venue = portalLeadInferFeedbackVenue(row);
  if (!portalLeadOnOrAfterSummerTerm(d)) return null;
  if (!portalLeadFeedbackInScope(row, scopes)) return null;
  return row;
}

function mapDbSessionFeedbackToHub(row, scopes) {
  const d = String(row.session_date || "").trim().slice(0, 10);
  const patterns = row.engagement_patterns;
  const hub = {
    client_name: String(row.client_name || "").trim() || "—",
    session_date: d,
    service: String(row.service || "").trim() || "—",
    attendance: row.attendance,
    engagement_rating:
      row.engagement_rating != null && !isNaN(Number(row.engagement_rating))
        ? Number(row.engagement_rating)
        : null,
    client_emotions: String(row.client_emotions || "").trim(),
    engagement_patterns: Array.isArray(patterns)
      ? patterns.join(", ")
      : String(patterns || "").trim() || null,
    positive_feedback: String(row.positive_feedback || "").trim(),
    relevant_information: String(row.relevant_information || "").trim(),
    completed_by_name: String(row.completed_by_name || "").trim() || "—",
    session_time: String(row.session_time || "").trim(),
    created_at: row.created_at || null,
    portal_session_key: String(row.portal_session_key || "").trim(),
    venue: "",
  };
  hub.venue = portalLeadInferFeedbackVenue(hub);
  if (!portalLeadOnOrAfterSummerTerm(d)) return null;
  if (!portalLeadFeedbackInScope(hub, scopes)) return null;
  return hub;
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
      '<p class="c4k-sessions-hub__sub">Submitted feedback plus sessions still awaiting feedback on your programme days.</p>' +
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
  if (tab === "absents") {
    return (
      '<div class="c4k-sessions-hub__head">' +
      '<div class="c4k-sessions-hub__title-row">' +
      '<span class="c4k-sessions-hub__ico" aria-hidden="true">🚫</span>' +
      '<div style="min-width:0">' +
      "<h1 class=\"c4k-sessions-hub__title\">SESSION ABSENTS</h1>" +
      '<p class="c4k-sessions-hub__sub">Absent marks on your programme days (same view as admin).</p>' +
      "</div></div></div>"
    );
  }
  if (tab === "incidents") {
    return (
      '<div class="c4k-sessions-hub__head">' +
      '<div class="c4k-sessions-hub__title-row">' +
      '<span class="c4k-sessions-hub__ico" aria-hidden="true">⚠️</span>' +
      '<div style="min-width:0">' +
      "<h1 class=\"c4k-sessions-hub__title\">INCIDENTS</h1>" +
      '<p class="c4k-sessions-hub__sub">Incident reports on your programme days (same view as admin).</p>' +
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

function usesFeedbackHub(tab) {
  return tab === "feedback";
}

function usesAbsentsHub(tab) {
  return tab === "absents";
}

function usesIncidentsHub(tab) {
  return tab === "incidents";
}

function refreshPanels() {
  const showFb = usesFeedbackHub(state.tab);
  const showAbs = usesAbsentsHub(state.tab);
  const showInc = usesIncidentsHub(state.tab);
  const showLead = state.tab === "lead";
  const fb = $("c4kHubPanelFeedback");
  const abs = $("c4kHubPanelAbsents");
  const inc = $("c4kHubPanelIncidents");
  const lead = $("c4kHubPanelLead");
  if (fb) fb.hidden = !showFb;
  if (abs) abs.hidden = !showAbs;
  if (inc) inc.hidden = !showInc;
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
  const fromPortal = portalFeedbackRows()
    .map((r) => mapPortalRowToHubFeedback(r, scopes))
    .filter(Boolean);
  const fromPayload = (p.session_feedback || [])
    .map((r) => {
      if (!r) return null;
      const row = Object.assign({}, r, {
        venue: portalLeadInferFeedbackVenue(r) || String(r.venue || "").trim(),
      });
      return portalLeadFeedbackInScope(row, scopes) ? row : null;
    })
    .filter(Boolean);
  const merged = mergeScopedFeedbackLists(scopes, [fromPayload, fromPortal]).filter((r) =>
    portalLeadOnOrAfterSummerTerm(r.session_date)
  );
  p.session_feedback = merged;
  p.session_feedback_total = merged.length;
  p.session_feedback_loaded = merged.length;
  p.lead_session_reports = (p.lead_session_reports || []).filter(
    (r) =>
      portalLeadOnOrAfterSummerTerm(r.session_date) && portalLeadReportInScope(r, scopes)
  );
  p.session_quick_marks = (p.session_quick_marks || []).filter(
    (m) =>
      portalLeadOnOrAfterSummerTerm(m.session_date) &&
      portalLeadAbsentMarkInScope(m, scopes)
  );
  p.incident_reports = (p.incident_reports || []).filter(
    (r) =>
      portalLeadOnOrAfterSummerTerm(r.session_date) && portalLeadReportInScope(r, scopes)
  );
  return p;
}

function makeLeadFeedbackDayStats(scopes, leadKey) {
  return function (iso) {
    const hub = window.__plsoFeedbackHub;
    if (!hub) return { required: 0, completed: 0 };
    const st = portalLeadDayFeedbackStats(iso, scopes, leadKey, hub);
    if (!st) return { required: 0, completed: 0 };
    return { required: st.total, completed: st.done };
  };
}

function configureDayOps(scopes, leadKey) {
  const statsFn = makeLeadFeedbackDayStats(scopes, leadKey);
  if (window.PortalDayOps && window.__plsoDayOpsConfigured) {
    window.PortalDayOps.configure({
      getFeedbackDayStats: statsFn,
      skipAdminFormsEdge: true,
      isClubClosedDay: portalLeadDayIsClubClosed,
    });
    return;
  }
  if (!window.PortalDayOps) return;
  window.__plsoDayOpsConfigured = true;
  window.PortalDayOps.configure({
    skipAdminFormsEdge: true,
    getFeedbackDayStats: statsFn,
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
    fetchSessionFeedback: async () => {
      const client =
        window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client
          ? window.__PORTAL_SUPABASE__.client
          : null;
      if (!client) return [];
      const since = new Date();
      since.setDate(since.getDate() - 150);
      const sinceIso = since.toISOString().slice(0, 10);
      try {
        const { data, error } = await client
          .from("session_feedback")
          .select(
            "client_name,session_date,service,attendance,engagement_rating,engagement_patterns,client_emotions,positive_feedback,relevant_information,completed_by_name,portal_session_key,created_at"
          )
          .gte("session_date", sinceIso)
          .order("session_date", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return (data || [])
          .map((row) => mapDbSessionFeedbackToHub(row, scopes))
          .filter(Boolean);
      } catch (e) {
        console.warn("lead session_feedback fetch", e);
        return [];
      }
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

async function initHubs(scopes, leadKey) {
  await ensureHubScript();
  const filters = portalLeadSessionScopeFilterFns(scopes, leadKey);
  const statsFn = makeLeadFeedbackDayStats(scopes, leadKey);
  const hubOpts = {
    escapeHtml: esc,
    externalTabs: true,
    payload: window.PortalDayOps.getPayload(),
    slotScopeFilter: filters.slotScopeFilter,
    feedbackRowScopeFilter: filters.feedbackRowScopeFilter,
    absentMarkScopeFilter: filters.absentMarkScopeFilter,
    incidentScopeFilter: filters.incidentScopeFilter,
    feedbackMixAwaitingSlots: true,
    feedbackMixLeadUnique: true,
    showFullWeekDayStrip: true,
    minSessionDate: PORTAL_LEAD_SUMMER_TERM_START,
    readOnlyOverview: true,
    isClubClosedDay: portalLeadDayIsClubClosed,
    isProgrammeWorkDay: function (iso) {
      return portalLeadDayIsProgrammeWorkDay(iso, scopes);
    },
    getFeedbackDayStats: statsFn,
  };

  function snapHubWeek(hub) {
    if (!hub) return;
    const minWeek = portalLeadSummerTermWeekStart();
    hub.weekStart = mondayOfWeekIso(isoToday());
    if (hub.weekStart < minWeek) hub.weekStart = minWeek;
    if (typeof hub.snapSelectedDayToDisplayWeek === "function") {
      hub.snapSelectedDayToDisplayWeek();
      return;
    }
    const showDays =
      typeof hub.weekDaysForDisplay === "function" ? hub.weekDaysForDisplay() : hub.weekDays();
    hub.selectedDay = showDays.length > 0 ? showDays[0] : isoToday();
  }

  const fbRoot = $("adminSessionFeedbacksRoot");
  if (fbRoot) {
    window.__plsoFeedbackHub = await window.AdminSessionsHub.mount(fbRoot, {
      ...hubOpts,
      mode: "feedback",
    });
    snapHubWeek(window.__plsoFeedbackHub);
  }

  const absRoot = $("adminSessionsAbsentsRoot");
  if (absRoot) {
    window.__plsoAbsentsHub = await window.AdminSessionsHub.mount(absRoot, {
      ...hubOpts,
      mode: "full",
      tab: "absents",
    });
    snapHubWeek(window.__plsoAbsentsHub);
  }

  const incRoot = $("adminSessionsIncidentsRoot");
  if (incRoot) {
    window.__plsoIncidentsHub = await window.AdminSessionsHub.mount(incRoot, {
      ...hubOpts,
      mode: "full",
      tab: "incidents",
    });
    snapHubWeek(window.__plsoIncidentsHub);
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

function renderLeadHub(hub, payload) {
  if (!hub) return;
  hub.setPayload(payload);
  if (typeof hub.renderPanels === "function") hub.renderPanels();
  else if (typeof hub.render === "function") hub.render();
}

async function refreshTab(tab) {
  state.tab = tab || "feedback";
  const scopes = state.scopes;
  refreshPanels();
  if (window.PortalDayOps && typeof window.PortalDayOps.ensurePayload === "function") {
    await window.PortalDayOps.ensurePayload();
    await mergeLeadReportsFromDb(scopes);
    applyScopedPayload(scopes);
  }
  const payload = window.PortalDayOps.getPayload();
  if (usesFeedbackHub(state.tab)) renderLeadHub(window.__plsoFeedbackHub, payload);
  if (usesAbsentsHub(state.tab)) renderLeadHub(window.__plsoAbsentsHub, payload);
  if (usesIncidentsHub(state.tab)) renderLeadHub(window.__plsoIncidentsHub, payload);
  if (state.tab === "lead" && window.PortalDayOps && typeof window.PortalDayOps.refreshTab === "function") {
    await window.PortalDayOps.refreshTab("lead");
  }
}

function bindTabs() {
  document.querySelectorAll("[data-plso-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void refreshTab(btn.getAttribute("data-plso-tab") || "feedback");
    });
  });
}

function awaitPortalSupabaseReady(timeoutMs) {
  if (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client) {
    return Promise.resolve(window.__PORTAL_SUPABASE__);
  }
  return new Promise(function (resolve) {
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      resolve(window.__PORTAL_SUPABASE__ || {});
    };
    window.addEventListener("portal:supabase-ready", finish, { once: true });
    setTimeout(finish, timeoutMs || 5000);
  });
}

async function portalResolveLeadAuthEmail(ctx) {
  ctx = ctx || window.__PORTAL_SUPABASE__ || {};
  let email = String((ctx.session && ctx.session.user && ctx.session.user.email) || "").trim();
  if (!email && ctx.client) {
    try {
      const { data: ud } = await ctx.client.auth.getUser();
      email = String(ud?.user?.email || "").trim();
    } catch {
      /* ignore */
    }
  }
  if (!email && ctx.client) {
    try {
      const { data: sess } = await ctx.client.auth.getSession();
      email = String(sess?.session?.user?.email || "").trim();
    } catch {
      /* ignore */
    }
  }
  return email;
}

async function portalResolveLeadAccessContext() {
  let ctx = window.__PORTAL_SUPABASE__ || {};
  let profile = ctx.staff_profile || null;
  let email = await portalResolveLeadAuthEmail(ctx);
  if (portalCanAccessLeadSessionOverview(profile, email) && ctx.client) {
    return { ctx, profile, email };
  }
  try {
    await bootstrapDashboardSupabase({ page: "lead_overview" });
  } catch (e) {
    console.warn("lead session overview auth", e);
  }
  await awaitPortalSupabaseReady(8000);
  ctx = window.__PORTAL_SUPABASE__ || {};
  profile = ctx.staff_profile || null;
  email = await portalResolveLeadAuthEmail(ctx);
  if (!portalCanAccessLeadSessionOverview(profile, email)) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise(function (r) {
        setTimeout(r, 400);
      });
      ctx = window.__PORTAL_SUPABASE__ || {};
      profile = ctx.staff_profile || profile;
      email = await portalResolveLeadAuthEmail(ctx);
      if (portalCanAccessLeadSessionOverview(profile, email)) break;
      if (!ctx.client) {
        try {
          await bootstrapDashboardSupabase({ page: "lead_overview" });
        } catch {
          /* ignore */
        }
        await awaitPortalSupabaseReady(2000);
        ctx = window.__PORTAL_SUPABASE__ || {};
        profile = ctx.staff_profile || profile;
        email = await portalResolveLeadAuthEmail(ctx);
        if (portalCanAccessLeadSessionOverview(profile, email)) break;
      }
    }
  }
  return { ctx, profile, email };
}

export async function portalInitLeadSessionOverviewPage() {
  const statusEl = $("portalDayOpsStatus");
  const access = await portalResolveLeadAccessContext();
  const ctx = access.ctx || {};
  const profile = access.profile;
  const email = access.email;
  if (!portalCanAccessLeadSessionOverview(profile, email)) {
    console.warn(
      "[lead session overview] access denied",
      { email: email || "(empty)", username: profile && profile.username, full_name: profile && profile.full_name }
    );
    window.location.replace(LEAD_URL);
    return;
  }
  const scopes = portalLeadSessionScopesForProfile(profile, email);
  const leadKey = portalLeadProgrammeKey(profile, email);
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

  configureDayOps(scopes, leadKey);
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

  await initHubs(scopes, leadKey);
  bindTabs();
  const fbCount =
    window.PortalDayOps &&
    window.PortalDayOps.getPayload() &&
    Array.isArray(window.PortalDayOps.getPayload().session_feedback)
      ? window.PortalDayOps.getPayload().session_feedback.length
      : 0;
  if (statusEl) {
    statusEl.textContent =
      fbCount > 0
        ? ""
        : "No programme feedback loaded for your days yet — check you are on the latest deploy or contact admin.";
    statusEl.className = "portal-forms-status" + (fbCount > 0 ? "" : " is-error");
  }
  await refreshTab("feedback");
}

export async function portalSyncLeadSessionOverviewButton() {
  const btn = document.getElementById("quickMenuLeadSessionOverview");
  if (!btn) return;
  await awaitPortalSupabaseReady(5000);
  const ctx = window.__PORTAL_SUPABASE__ || {};
  const profile = ctx.staff_profile;
  const email = await portalResolveLeadAuthEmail(ctx);
  const show = portalCanAccessLeadSessionOverview(profile, email);
  btn.hidden = !show;
  btn.setAttribute("aria-hidden", show ? "false" : "true");
}
