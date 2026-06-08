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
    var typed = clean(rawName);
    if (!typed) return "";
    return window.portalResolveCatalogName(typed, window.portalCollectUniqueParticipantNames(), {
      match: "startsWith",
    });
  };

  window.portalCollectUniqueStaffNames = function () {
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
      var src = window.STAFF_DASHBOARD_SOURCE || {};
      var profs = src.staffProfiles || {};
      Object.keys(profs).forEach(function (key) {
        var p = profs[key] || {};
        add(p.staffName || p.full_name || key);
      });
    } catch (_) {}
    try {
      var rows = window.STAFF_DASHBOARD_SOURCE && Array.isArray(window.STAFF_DASHBOARD_SOURCE.rows)
        ? window.STAFF_DASHBOARD_SOURCE.rows
        : [];
      for (var i = 0; i < rows.length; i++) {
        var inst = clean(rows[i] && rows[i].instructors);
        if (!inst) continue;
        inst.split(/[,;/]+/).forEach(function (part) {
          var p = clean(part);
          if (!p) return;
          add(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
        });
      }
    } catch (_2) {}
    try {
      var slots = window.STAFF_DASHBOARD_SOURCE && Array.isArray(window.STAFF_DASHBOARD_SOURCE.slots)
        ? window.STAFF_DASHBOARD_SOURCE.slots
        : [];
      for (var j = 0; j < slots.length; j++) {
        add(slots[j] && (slots[j].staffName || slots[j].staffRosterId));
      }
    } catch (_3) {}
    return out.sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  window.portalCollectUniqueVenueNames = function () {
    var set = Object.create(null);
    var out = [];
    var known = ["SwimFarm", "Acton", "Westway", "Northolt", "Other"];
    function add(nm) {
      var n = clean(nm);
      if (!n) return;
      var k = normName(n);
      if (set[k]) return;
      set[k] = true;
      out.push(n);
    }
    known.forEach(add);
    try {
      var rows = window.STAFF_DASHBOARD_SOURCE && Array.isArray(window.STAFF_DASHBOARD_SOURCE.rows)
        ? window.STAFF_DASHBOARD_SOURCE.rows
        : [];
      for (var i = 0; i < rows.length; i++) {
        add(rows[i] && rows[i].venue);
        add(rows[i] && rows[i].location);
      }
    } catch (_) {}
    return out.sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  /** Resolve typed text to a catalog entry (exact, then prefix, then contains). */
  window.portalResolveCatalogName = function (raw, catalog, opts) {
    opts = opts || {};
    var typed = clean(raw);
    if (!typed) return "";
    var list = Array.isArray(catalog) ? catalog : [];
    if (!list.length) return typed;
    var want = normName(typed);
    var matchMode = opts.match === "contains" ? "contains" : "startsWith";
    for (var i = 0; i < list.length; i++) {
      if (normName(list[i]) === want) return list[i];
    }
    if (matchMode === "startsWith") {
      for (var j = 0; j < list.length; j++) {
        if (normName(list[j]).indexOf(want) === 0) return list[j];
      }
    }
    if (opts.allowContains !== false) {
      var contains = [];
      for (var k = 0; k < list.length; k++) {
        if (normName(list[k]).indexOf(want) !== -1) contains.push(list[k]);
      }
      if (contains.length === 1) return contains[0];
    }
    return opts.strict ? "" : typed;
  };

  window.portalCollectUniqueServiceNames = function () {
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
    [
      "Aquatic Activity",
      "Swimming Activity",
      "Multi-Activity",
      "Day Centre",
      "Climbing Activity",
      "Bespoke Programme",
      "Therapeutic Activity",
      "Fitness Activity",
    ].forEach(add);
    try {
      var rows =
        window.STAFF_DASHBOARD_SOURCE && Array.isArray(window.STAFF_DASHBOARD_SOURCE.rows)
          ? window.STAFF_DASHBOARD_SOURCE.rows
          : [];
      for (var i = 0; i < rows.length; i++) {
        add(rows[i] && rows[i].service);
      }
    } catch (_) {}
    return out.sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  window.portalCollectUniqueInstructorNames = function () {
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
      var rows =
        window.STAFF_DASHBOARD_SOURCE && Array.isArray(window.STAFF_DASHBOARD_SOURCE.rows)
          ? window.STAFF_DASHBOARD_SOURCE.rows
          : [];
      for (var i = 0; i < rows.length; i++) {
        var inst = clean(rows[i] && rows[i].instructors);
        if (!inst) continue;
        inst.split(/[,;/]+/).forEach(function (part) {
          var p = clean(part);
          if (!p) return;
          add(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
        });
      }
    } catch (_) {}
    try {
      var staffList = window.portalCollectUniqueStaffNames();
      for (var j = 0; j < staffList.length; j++) add(staffList[j]);
    } catch (_s) {}
    return out.sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  window.portalCatalogForKind = function (kind) {
    kind = String(kind || "").toLowerCase();
    if (kind === "staff") return window.portalCollectUniqueStaffNames();
    if (kind === "instructor" || kind === "instructors") {
      return window.portalCollectUniqueInstructorNames();
    }
    if (kind === "service" || kind === "services") return window.portalCollectUniqueServiceNames();
    if (kind === "venue" || kind === "location") return window.portalCollectUniqueVenueNames();
    if (kind === "participant" || kind === "participants" || kind === "client") {
      return window.portalCollectUniqueParticipantNames();
    }
    return window.portalCollectUniqueParticipantNames();
  };
})();
