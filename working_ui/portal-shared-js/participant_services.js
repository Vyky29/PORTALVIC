/**
 * Participant service list from merged roster (STAFF_DASHBOARD_SOURCE).
 * Minimal PORTAL shim until full portal-shared-js is synced from the other project.
 */
(function () {
  function clean(v) {
    return String(v || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normName(v) {
    return clean(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  window.portalCollectServicesForParticipantName = function (participantRaw) {
    var target = clean(participantRaw);
    if (!target) return [];
    var want = normName(target);
    var set = Object.create(null);
    try {
      var src = window.STAFF_DASHBOARD_SOURCE;
      var rows = src && Array.isArray(src.rows) ? src.rows : [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var nm = clean(r.client_name);
        if (!nm || normName(nm) !== want) continue;
        var s = clean(r.service);
        if (s) set[s] = true;
      }
    } catch (_) {}
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  window.portalCollectUniqueParticipantNames = function () {
    var set = Object.create(null);
    var out = [];
    function add(nm) {
      var n = clean(nm);
      if (!n) return;
      var k = normName(n);
      if (set[k]) return;
      set[k] = true;
      out.push(n);
    }
    try {
      var rows = window.PORTAL_CLIENTS_INFO_ROWS;
      if (Array.isArray(rows)) {
        for (var i = 0; i < rows.length; i++) {
          add(rows[i] && rows[i].client_name);
        }
      }
    } catch (_) {}
    try {
      var src = window.STAFF_DASHBOARD_SOURCE;
      var roster = src && Array.isArray(src.rows) ? src.rows : [];
      for (var j = 0; j < roster.length; j++) {
        var nm2 = clean(roster[j] && roster[j].client_name);
        if (!nm2 || nm2.toLowerCase() === "closed") continue;
        add(nm2);
      }
    } catch (_) {}
    return out.sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  window.portalParticipantNameStartsWith = function (name, prefixRaw) {
    var pref = clean(prefixRaw);
    if (!pref) return false;
    return normName(name).indexOf(normName(pref)) === 0;
  };

  window.portalResolveParticipantCanonicalName = function (rawName) {
    return clean(rawName);
  };
})();
