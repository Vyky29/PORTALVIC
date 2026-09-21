/**
 * Merge portal_staff_timetable_cells over spreadsheet reference staff hours.
 */
(function (global) {
  "use strict";

  var cache = null;
  var cacheAt = 0;

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function fetchOverrides(client) {
    if (!client || typeof client.from !== "function") return Promise.resolve([]);
    return client
      .from("portal_staff_timetable_cells")
      .select("session_date,day,column_key,raw_assignment,paid_hours,status,updated_at")
      .eq("status", "active")
      .then(function (res) {
        if (res.error) {
          console.warn("[portal_staff_timetable_cells]", res.error);
          return [];
        }
        return res.data || [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadAndCache(client, maxAgeMs) {
    var age = maxAgeMs == null ? 60000 : maxAgeMs;
    if (cache && Date.now() - cacheAt < age) return Promise.resolve(cache);
    return fetchOverrides(client).then(function (rows) {
      var map = Object.create(null);
      rows.forEach(function (r) {
        var iso = normIso(r.session_date);
        var key = String(r.column_key || "").trim();
        if (!iso || !key) return;
        map[iso + "|" + key] = {
          text: String(r.raw_assignment || "").trim(),
          paid_hours: String(r.paid_hours || "").trim(),
        };
      });
      cache = map;
      cacheAt = Date.now();
      return map;
    });
  }

  function overrideText(ov) {
    if (ov == null) return "";
    if (typeof ov === "string") return String(ov).trim();
    return String((ov && ov.text) || "").trim();
  }

  function overridePaid(ov) {
    if (ov == null || typeof ov === "string") return "";
    return String((ov && ov.paid_hours) || "").trim();
  }

  function applyToStaffHours(staffHours, overrideMap) {
    if (!staffHours || !overrideMap) return staffHours;
    function patchCells(cells) {
      if (!Array.isArray(cells)) return;
      cells.forEach(function (cell) {
        if (!cell || !cell.editKey) return;
        var parts = String(cell.editKey).split("|");
        if (parts.length < 3) return;
        var iso = normIso(parts[0]);
        var colKey = parts.slice(2).join("|");
        var k = iso + "|" + colKey;
        if (Object.prototype.hasOwnProperty.call(overrideMap, k)) {
          var ov = overrideMap[k];
          cell.text = overrideText(ov);
          cell.paidHours = overridePaid(ov);
          cell.overridden = true;
          cell.tone = "updated";
        }
      });
    }
    Object.keys(staffHours).forEach(function (day) {
      var sheet = staffHours[day];
      if (!sheet) return;
      (sheet.dates || []).forEach(function (dr) {
        patchCells(dr.cells);
      });
      (sheet.blocks || []).forEach(function (block) {
        (block.dates || []).forEach(function (dr) {
          patchCells(dr.cells);
        });
      });
    });
    return staffHours;
  }

  function invalidate() {
    cache = null;
    cacheAt = 0;
  }

  global.PortalStaffTimetableMerge = {
    loadAndCache: loadAndCache,
    applyToStaffHours: applyToStaffHours,
    invalidate: invalidate,
  };
})(typeof window !== "undefined" ? window : globalThis);
