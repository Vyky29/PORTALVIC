/**
 * Wire Quick menu Induction button on staff / lead dashboards.
 */
(function (global) {
  function authEmail() {
    var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
    return sess && sess.user && sess.user.email ? String(sess.user.email) : "";
  }

  function profile() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || null;
  }

  function onInductionClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-portal-induction]") : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof global.portalInductionOpen === "function") {
      global.portalInductionOpen(profile(), authEmail());
    }
  }

  function bindMenuSheet() {
    var sheet = global.document.getElementById("menuSheet");
    if (!sheet || sheet.dataset.portalInductionBound) return;
    sheet.dataset.portalInductionBound = "1";
    sheet.addEventListener("click", onInductionClick, true);
  }

  function sync() {
    bindMenuSheet();
    if (typeof global.portalInductionBindDashboard === "function") {
      global.portalInductionBindDashboard({ profile: profile(), authEmail: authEmail() });
    }
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }

  global.portalInductionSyncQuickMenu = sync;
})(typeof window !== "undefined" ? window : globalThis);
