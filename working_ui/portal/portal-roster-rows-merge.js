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
      normTimeSlot(row.time_slot),
    ].join("|");
  }

  function datedSlotKey(row) {
    return [
      normIso(row.session_date),
      String(row.client_name || "").toLowerCase(),
      normTimeSlot(row.time_slot),
    ].join("|");
  }

  function normTimeSlot(v) {
    var s = String(v || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!s) return "";
    return s.replace(/\s*-\s*/g, " to ").replace(/(\d)\.(\d)/g, "$1:$2");
  }

  function normInstructors(v) {
    return String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isNoClientName(name) {
    var n = String(name || "").trim().toLowerCase();
    return !n || n === "no client" || n === "noclient" || n === "no_client";
  }

  function openedSlotKey(iso, row) {
    return [
      normIso(iso),
      normTimeSlot(row.time_slot),
      normInstructors(row.instructors),
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

  function clientFirstSessionIso(clientName) {
    var slug = String(clientName || "")
      .trim()
      .toLowerCase();
    if (slug === "timmy") slug = "timi";
    try {
      var map =
        global.STAFF_DASHBOARD_SOURCE &&
        global.STAFF_DASHBOARD_SOURCE.clientRosterStartDates;
      if (map && map[clientName]) return normIso(map[clientName]);
      if (map) {
        for (var k in map) {
          if (
            Object.prototype.hasOwnProperty.call(map, k) &&
            String(k).trim().toLowerCase() === slug
          ) {
            return normIso(map[k]);
          }
        }
      }
    } catch (_) {}
    return "";
  }

  function rowEligibleForSessionDate(row, iso) {
    if (!iso || !row || isNoClientName(row.client_name)) return true;
    var first = clientFirstSessionIso(row.client_name);
    return !first || iso >= first;
  }

  function mergePortalRosterRows(baseRows, dbRows) {
    var base = Array.isArray(baseRows) ? baseRows : [];
    var db = Array.isArray(dbRows) ? dbRows : [];
    if (!db.length) {
      return base.filter(function (r) {
        var iso = normIso(r.session_date);
        return !iso || rowEligibleForSessionDate(r, iso);
      });
    }

    var templates = Object.create(null);
    var dated = Object.create(null);
    var cancelledTemplates = Object.create(null);
    var cancelledDated = Object.create(null);
    var cancelledClientDay = Object.create(null);

    db.forEach(function (raw) {
      if (String(raw.status || "active") !== "active" && String(raw.status || "") !== "cancelled") return;
      var row = dbToAdapter(raw);
      if (!row.client_name || !row.time_slot) return;
      if (String(raw.status || "") === "cancelled") {
        if (row.session_date) {
          cancelledDated[datedSlotKey(row)] = true;
          var iso = normIso(row.session_date);
          if (iso) {
            cancelledClientDay[
              iso + "|" + String(row.client_name || "").toLowerCase() + "|" + String(row.day || weekdayLongFromIso(iso) || "").toLowerCase()
            ] = true;
          }
        } else if (row.day) cancelledTemplates[templateKey(row)] = true;
        return;
      }
      if (row.session_date) {
        var rowIso = normIso(row.session_date);
        if (rowIso && !rowEligibleForSessionDate(row, rowIso)) return;
        dated[datedSlotKey(row)] = row;
      } else if (row.day) templates[templateKey(row)] = row;
    });

    var out = [];
    var seenDated = Object.create(null);
    var openedSlots = Object.create(null);
    var clientDayActive = Object.create(null);

    Object.keys(dated).forEach(function (sk) {
      var row = dated[sk];
      var iso = normIso(row.session_date);
      if (!iso || isNoClientName(row.client_name)) return;
      var ck = iso + "|" + String(row.client_name || "").toLowerCase();
      clientDayActive[ck] = row;
    });

    function rememberOpenedSlot(iso, row, dayLabel) {
      if (!iso || !row || !row.time_slot) return;
      openedSlots[openedSlotKey(iso, row)] = {
        session_date: iso,
        day: String(row.day || dayLabel || weekdayLongFromIso(iso) || "").trim(),
        time_slot: row.time_slot,
        instructors: row.instructors,
        service: row.service,
        area: row.area,
        venue: row.venue,
      };
    }

    base.forEach(function (r) {
      var iso = normIso(r.session_date);
      var sk = datedSlotKey(r);
      var dayLabel = String(r.day || weekdayLongFromIso(iso) || "").toLowerCase();
      if (iso && !rowEligibleForSessionDate(r, iso)) {
        rememberOpenedSlot(iso, r, dayLabel);
        return;
      }
      if (iso) {
        var clientDayKey = iso + "|" + String(r.client_name || "").toLowerCase();
        var moved = clientDayActive[clientDayKey];
        if (
          moved &&
          normTimeSlot(moved.time_slot) !== normTimeSlot(r.time_slot) &&
          String(moved.service || "").trim().toLowerCase() === String(r.service || "").trim().toLowerCase()
        ) {
          rememberOpenedSlot(iso, r, dayLabel);
          return;
        }
      }
      if (cancelledDated[sk]) {
        rememberOpenedSlot(iso, r, dayLabel);
        return;
      }
      if (iso && cancelledClientDay[iso + "|" + String(r.client_name || "").toLowerCase() + "|" + dayLabel]) {
        rememberOpenedSlot(iso, r, dayLabel);
        return;
      }
      var tk = templateKey({ day: r.day || weekdayLongFromIso(iso), client_name: r.client_name, time_slot: r.time_slot });
      if (!dated[sk] && cancelledTemplates[tk]) {
        rememberOpenedSlot(iso, r, dayLabel);
        return;
      }
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

    var occupiedSlots = Object.create(null);

    function markOccupied(row) {
      if (!row || isNoClientName(row.client_name)) return;
      var iso = normIso(row.session_date);
      if (!iso || !row.time_slot) return;
      occupiedSlots[openedSlotKey(iso, row)] = true;
    }

    out.forEach(markOccupied);
    Object.keys(dated).forEach(function (sk) {
      markOccupied(dated[sk]);
    });

    Object.keys(dated).forEach(function (sk) {
      if (seenDated[sk]) return;
      var row = dated[sk];
      var iso = normIso(row.session_date);
      if (iso && !rowEligibleForSessionDate(row, iso)) return;
      if (isNoClientName(row.client_name)) {
        var iso = normIso(row.session_date);
        if (iso && occupiedSlots[openedSlotKey(iso, row)]) return;
      }
      out.push(row);
      seenDated[sk] = true;
    });

    Object.keys(templates).forEach(function (tk) {
      var tpl = templates[tk];
      if (!tpl || !isNoClientName(tpl.client_name)) return;
      var tplParts = tk.split("|");
      var tplDay = tplParts[0] || "";
      var tplSlot = tplParts[2] || "";
      Object.keys(openedSlots).forEach(function (ok) {
        var slot = openedSlots[ok];
        if (!slot || !slot.session_date) return;
        if (String(slot.day || "").toLowerCase() !== tplDay) return;
        if (normTimeSlot(slot.time_slot) !== tplSlot) return;
        if (occupiedSlots[openedSlotKey(slot.session_date, slot)]) return;
        var skNoClient = datedSlotKey({
          session_date: slot.session_date,
          client_name: tpl.client_name,
          time_slot: slot.time_slot,
        });
        if (seenDated[skNoClient]) return;
        out.push(
          Object.assign({}, slot, tpl, {
            session_date: slot.session_date,
            day: slot.day,
          }),
        );
        seenDated[skNoClient] = true;
      });
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
