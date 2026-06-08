/**
 * Merge Supabase portal_roster_rows over spreadsheet/bundle roster rows.
 * Templates (session_date null) override matching weekday slots; dated rows win per day.
 */
(function (global) {
  "use strict";

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function parseIsoLocal(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(dt.getTime()) ? null : dt;
  }

  function weekdayLongFromIso(iso) {
    var dt = parseIsoLocal(iso);
    if (!dt) return "";
    return dt.toLocaleDateString("en-GB", { weekday: "long" });
  }

  function templateKey(row) {
    return [
      String(row.day || "").toLowerCase(),
      String(row.client_name || "").toLowerCase(),
      String(row.time_slot || "").toLowerCase(),
    ].join("|");
  }

  function datedSlotKey(row) {
    return [
      normIso(row.session_date),
      String(row.client_name || "").toLowerCase(),
      String(row.time_slot || "").toLowerCase(),
    ].join("|");
  }

  /** From this ISO, machine/bundle dated rows keep their instructors; DB templates may not replace them. */
  function summerRosterFloorIso() {
    try {
      var t = global.PORTAL_TERM_FROM_TIMETABLE;
      if (t) {
        var v = String(t.termResumeDate || t.termDashboardCalendarFrom || "")
          .trim()
          .slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      }
    } catch (_) {}
    return "2026-06-01";
  }

  function dbToAdapter(r) {
    return {
      client_name: String(r.client_name || "").trim(),
      day: String(r.day || "").trim(),
      instructors: String(r.instructors || "").trim(),
      service: String(r.service || "").trim(),
      area: String(r.area || "").trim(),
      time_slot: String(r.time_slot || "").trim(),
      venue: String(r.venue || "").trim(),
      session_date: normIso(r.session_date) || undefined,
      __portal_roster_row_id: r.id || null,
    };
  }

  function mergePortalRosterRows(baseRows, dbRows) {
    var base = Array.isArray(baseRows) ? baseRows : [];
    var db = Array.isArray(dbRows) ? dbRows : [];
    if (!db.length) return base.slice();

    var templates = Object.create(null);
    var dated = Object.create(null);
    var cancelledTemplates = Object.create(null);
    var cancelledDated = Object.create(null);

    db.forEach(function (raw) {
      if (String(raw.status || "active") !== "active" && String(raw.status || "") !== "cancelled") return;
      var row = dbToAdapter(raw);
      if (!row.client_name || !row.time_slot) return;
      if (String(raw.status || "") === "cancelled") {
        if (row.session_date) cancelledDated[datedSlotKey(row)] = true;
        else if (row.day) cancelledTemplates[templateKey(row)] = true;
        return;
      }
      if (row.session_date) dated[datedSlotKey(row)] = row;
      else if (row.day) templates[templateKey(row)] = row;
    });

    var out = [];
    var seenDated = Object.create(null);

    base.forEach(function (r) {
      var iso = normIso(r.session_date);
      var sk = datedSlotKey(r);
      if (cancelledDated[sk]) return;
      var tk = templateKey({ day: r.day || weekdayLongFromIso(iso), client_name: r.client_name, time_slot: r.time_slot });
      if (!dated[sk] && cancelledTemplates[tk]) return;
      if (dated[sk]) {
        out.push(Object.assign({}, r, dated[sk], { session_date: iso, day: r.day || dated[sk].day }));
        seenDated[sk] = true;
        return;
      }
      if (iso) {
        if (templates[tk]) {
          var tpl = templates[tk];
          var merged = Object.assign({}, r, tpl, {
            session_date: iso,
            day: r.day || tpl.day,
          });
          var rowIso = normIso(r.session_date);
          var floor = summerRosterFloorIso();
          if (rowIso && iso >= floor) {
            merged.instructors = r.instructors;
          }
          out.push(merged);
          return;
        }
      }
      out.push(r);
    });

    Object.keys(dated).forEach(function (sk) {
      if (seenDated[sk]) return;
      out.push(dated[sk]);
    });

    return out.sort(function (a, b) {
      var c = String(a.session_date || "").localeCompare(String(b.session_date || ""));
      if (c) return c;
      c = String(a.day || "").localeCompare(String(b.day || ""));
      if (c) return c;
      return String(a.time_slot || "").localeCompare(String(b.time_slot || ""));
    });
  }

  function fetchActiveRows(client) {
    return fetchRowsForMerge(client);
  }

  function fetchRowsForMerge(client) {
    if (!client || typeof client.from !== "function") {
      return Promise.resolve([]);
    }
    return client
      .from("portal_roster_rows")
      .select("id,client_name,day,time_slot,instructors,service,area,venue,session_date,status,updated_at")
      .in("status", ["active", "cancelled"])
      .then(function (res) {
        if (res.error) {
          console.warn("[portal_roster_rows] fetch", res.error);
          return [];
        }
        return res.data || [];
      })
      .catch(function (err) {
        console.warn("[portal_roster_rows] fetch", err);
        return [];
      });
  }

  function loadAndCache(client) {
    return fetchActiveRows(client).then(function (rows) {
      global.PORTAL_ROSTER_ROWS_CACHE = rows;
      return rows;
    });
  }

  global.PortalRosterRowsMerge = {
    mergePortalRosterRows: mergePortalRosterRows,
    fetchActiveRows: fetchActiveRows,
    fetchRowsForMerge: fetchRowsForMerge,
    loadAndCache: loadAndCache,
    datedSlotKey: datedSlotKey,
    templateKey: templateKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
