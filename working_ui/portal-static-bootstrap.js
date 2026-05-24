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
})();
