/**
 * Portal static bootstrap (Vercel / working_ui root).
 * Sets Supabase globals and shared JS base for portal-* forms from the other project.
 */
(function () {
  if (typeof window === "undefined") return;

  window.SUPABASE_URL =
    window.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co";
  window.SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE";

  if (!window.PORTAL_SHARED_JS_BASE) {
    window.PORTAL_SHARED_JS_BASE = "/portal-shared-js";
  }

  var BRIDGE_KEY = "portalStaffProfileBridgeSecret_v1";

  window.portalPersistBridgeSecret = function portalPersistBridgeSecret(secret) {
    var s = String(secret || "").trim();
    if (!s || s.indexOf("%%") === 0 || s.length < 16) return;
    try {
      sessionStorage.setItem(BRIDGE_KEY, s);
    } catch (_) {}
  };

  window.portalEnsureBridgeCached = function portalEnsureBridgeCached() {
    try {
      return sessionStorage.getItem(BRIDGE_KEY) || "";
    } catch (_) {
      return "";
    }
  };

  try {
    document.documentElement.classList.add("portal-app-shell");
  } catch (_) {}

  /** Dashboard HTML for staff vs lead (forms + quick links). */
  window.portalResolveHubUrl = function portalResolveHubUrl(fromPortal) {
    var fp = String(fromPortal || "").trim().toLowerCase();
    if (fp === "lead") return "lead_dashboard.html";
    if (fp === "staff") return "staff_dashboard.html";
    try {
      var p = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (p.indexOf("lead_dashboard") >= 0) return "lead_dashboard.html";
    } catch (_) {}
    return "staff_dashboard.html";
  };

  window.portalFormRoleFromPath = function portalFormRoleFromPath() {
    try {
      var p = String(
        (typeof location !== "undefined" && location.pathname) || ""
      ).toLowerCase();
      if (p.indexOf("lead_dashboard") >= 0) return "lead";
    } catch (_) {}
    return "staff";
  };

  window.PORTAL_CONTEXT_ROW_ICONS = {
    participant:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    service:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    date:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    time:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  };

  window.portalRenderSessionContextCard = function portalRenderSessionContextCard(
    cardEl,
    rows
  ) {
    if (!cardEl) return;
    cardEl.replaceChildren();
    var grid = document.createElement("div");
    grid.className = "portal-session-context__grid";
    var icons = window.PORTAL_CONTEXT_ROW_ICONS || {};
    (rows || []).forEach(function (item) {
      if (!item || !item.value) return;
      var r = document.createElement("div");
      r.className = "portal-session-context__row";
      var line = document.createElement("p");
      line.className = "portal-session-context__line";
      var iconKey = item.icon || "";
      if (iconKey && icons[iconKey]) {
        var ic = document.createElement("span");
        ic.className = "portal-session-context__icon";
        ic.setAttribute("aria-hidden", "true");
        ic.innerHTML = icons[iconKey];
        line.appendChild(ic);
      }
      var lt = document.createElement("span");
      lt.className = "portal-session-context__label-text";
      lt.textContent = String(item.label || "").replace(/\s*$/,"") + ": ";
      line.appendChild(lt);
      var v = document.createElement("span");
      v.className = "portal-session-context__value";
      v.textContent = String(item.value || "");
      line.appendChild(v);
      r.appendChild(line);
      grid.appendChild(r);
    });
    cardEl.appendChild(grid);
  };
})();
