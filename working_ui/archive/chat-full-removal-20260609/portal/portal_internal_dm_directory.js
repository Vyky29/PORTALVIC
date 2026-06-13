/**
 * Internal chat recipient directory — staff + session leads (not admin/CEO exec).
 * Used by admin Internal chat compose search.
 */
(function () {
  var LEAD_KEYS = { berta: true, john: true };
  var EXEC_APP = { admin: true, ceo: true };
  var EXEC_STAFF_ROLE = { manager: true, admin: true };
  var WORKER_STAFF_ROLE = {
    swimming: true,
    climbing: true,
    fitness: true,
    support: true,
    support_lead: true,
  };

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  /**
   * @param {Record<string, unknown> | null | undefined} row staff_profiles row
   * @returns {boolean}
   */
  function portalInternalDmIsWorkerRecipient(row) {
    if (!row || row.is_active === false) return false;
    var app = String(row.app_role || "").toLowerCase();
    var sr = String(row.staff_role || "").toLowerCase();
    if (EXEC_APP[app]) return false;
    if (EXEC_STAFF_ROLE[sr]) return false;
    if (app === "staff" || app === "lead") return true;
    var u = normKey(row.username);
    var first = normKey(String(row.full_name || "").split(/\s+/).filter(Boolean)[0] || "");
    if (LEAD_KEYS[u] || LEAD_KEYS[first]) return true;
    if (WORKER_STAFF_ROLE[sr]) return true;
    var dr = String(row.dashboard_route || "").toLowerCase();
    if (dr === "staff_dashboard.html" || dr === "lead_dashboard.html") return true;
    if (!app && (row.full_name || row.username)) {
      if (!dr || (dr.indexOf("admin") === -1 && dr.indexOf("ceo") === -1)) return true;
    }
    if (row.full_name || row.username) {
      if (!EXEC_APP[app] && !EXEC_STAFF_ROLE[sr]) return true;
    }
    return false;
  }

  window.portalInternalDmIsWorkerRecipient = portalInternalDmIsWorkerRecipient;
  window.portalInternalDmNormKey = normKey;
})();
