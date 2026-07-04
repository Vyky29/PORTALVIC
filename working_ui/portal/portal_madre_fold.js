/**
 * Live MADRE from Supabase portal_madre_document + apply admin folds to Edge Function.
 */
(function (global) {
  "use strict";

  var TERM_KEY = "summer-2026";
  var CACHE = null;
  var CACHE_AT = 0;
  var CACHE_MS = 120000;
  var LOAD_INFLIGHT = null;

  function isRetryableSupabaseError(err) {
    var msg = String((err && err.message) || err || "");
    return /504|502|503|timeout|57014|gateway|fetch failed/i.test(msg);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function supabaseUrl() {
    var p = global.__PORTAL_SUPABASE__;
    return (p && p.url) || global.SUPABASE_URL || "";
  }

  function anonKey() {
    var p = global.__PORTAL_SUPABASE__;
    return (p && p.anonKey) || global.SUPABASE_ANON_KEY || "";
  }

  function authHeaders(client) {
    var h = { apikey: anonKey(), "Content-Type": "application/json" };
    if (client && client.auth && typeof client.auth.getSession === "function") {
      return client.auth.getSession().then(function (res) {
        var tok = res && res.data && res.data.session && res.data.session.access_token;
        if (tok) h.Authorization = "Bearer " + tok;
        return h;
      });
    }
    return Promise.resolve(h);
  }

  function normalizeMadreDashboardClient(cn, area) {
    var up = String(cn || "").trim().toUpperCase();
    var areaUp = String(area || "").trim().toUpperCase();
    if (up === "CASA" || up === "HOME" || areaUp === "HOME") return "HOME";
    if (up === "MANAGER") return "MANAGER";
    return String(cn || "").trim();
  }

  function rosterSlug(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  /** MADRE has 7 week blocks — same dated slot must appear once in adapter rows. */
  function dedupeRosterAdapterRows(rows) {
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r) return;
      var key = [
        String(r.session_date || "").trim().slice(0, 10),
        String(r.day || "").trim(),
        rosterSlug(r.client_name),
        String(r.instructors || "").trim().toUpperCase(),
        String(r.time_slot || "").trim(),
        rosterSlug(r.service),
        String(r.area || "").trim(),
        String(r.venue || "").trim(),
      ].join("\0");
      if (seen[key]) return;
      seen[key] = true;
      out.push(r);
    });
    return out;
  }

  function madreToAdapterRows(madre) {
    var rows = [];
    var weeks = (madre && madre.weeks) || [];
    weeks.forEach(function (w) {
      (w.staff || []).forEach(function (st) {
        var staffName = String(st.staffName || st.staffKey || "")
          .trim()
          .toUpperCase();
        (st.days || []).forEach(function (d) {
          (d.slots || []).forEach(function (s) {
            var area = String(s.pool_note || s.area || "").trim();
            var cn = normalizeMadreDashboardClient(s.client_name, area);
            var up = cn.toUpperCase();
            if (
              !cn ||
              up === "CLOSED" ||
              up === "NO CLIENT" ||
              up === "NO PARTICIPANT" ||
              up === "NO_CLIENT"
            ) {
              return;
            }
            rows.push({
              client_name: cn,
              day: d.weekday,
              instructors: staffName,
              service: String(s.service || "").trim(),
              area: cn === "HOME" ? "HOME" : area,
              time_slot: String(s.time_slot || "").trim(),
              venue: String(s.venue || "SwimFarm").trim(),
              session_date: d.sessionDate,
            });
          });
        });
      });
    });
    return dedupeRosterAdapterRows(rows);
  }

  function loadLiveMadre(client, force) {
    if (!force && CACHE && Date.now() - CACHE_AT < CACHE_MS) {
      return Promise.resolve(CACHE);
    }
    if (!client || typeof client.from !== "function") {
      return Promise.resolve(null);
    }
    if (LOAD_INFLIGHT && !force) {
      return LOAD_INFLIGHT;
    }
    function fetchOnce(retried) {
      return client
        .from("portal_madre_document")
        .select("document, revision, updated_at")
        .eq("term_key", TERM_KEY)
        .maybeSingle()
        .then(function (res) {
          if (res.error) {
            var msg = String(res.error.message || res.error);
            if (!retried && isRetryableSupabaseError(msg)) {
              return delay(1200).then(function () {
                return fetchOnce(true);
              });
            }
            console.warn("[portal_madre_document]", res.error);
            return null;
          }
          if (!res.data || !res.data.document) return null;
          CACHE = {
            document: res.data.document,
            revision: res.data.revision,
            updated_at: res.data.updated_at,
            rows: madreToAdapterRows(res.data.document),
          };
          CACHE_AT = Date.now();
          global.PORTAL_MADRE_LIVE = CACHE;
          return CACHE;
        })
        .catch(function (err) {
          if (!retried && isRetryableSupabaseError(err)) {
            return delay(1200).then(function () {
              return fetchOnce(true);
            });
          }
          console.warn("[portal_madre_document]", err);
          return null;
        });
    }
    LOAD_INFLIGHT = fetchOnce(false).finally(function () {
      LOAD_INFLIGHT = null;
    });
    return LOAD_INFLIGHT;
  }

  function invalidateLiveMadreCache() {
    CACHE = null;
    CACHE_AT = 0;
    LOAD_INFLIGHT = null;
    global.PORTAL_MADRE_LIVE = null;
  }

  function applyFoldToLiveMadre(client, foldRow) {
    var base = supabaseUrl().replace(/\/$/, "");
    if (!base || !foldRow || !foldRow.fold_type) {
      return Promise.resolve({ skipped: true });
    }
    return authHeaders(client).then(function (headers) {
      return fetch(base + "/functions/v1/portal-madre-apply-fold", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          fold_type: foldRow.fold_type,
          session_date: foldRow.session_date || null,
          payload: foldRow.payload || {},
        }),
      }).then(function (res) {
        return res.json().catch(function () {
          return { ok: false };
        }).then(function (data) {
          if (!res.ok) console.warn("[portal-madre-apply-fold]", data);
          invalidateLiveMadreCache();
          return loadLiveMadre(client, true).then(function () {
            return data;
          });
        });
      });
    });
  }

  function queueParticipantSlotChange(client, opts) {
    opts = opts || {};
    var after = opts.after || {};
    var iso = normIso(opts.session_date || after.session_date);
    var cancelled =
      String(after.status || "").toLowerCase() === "cancelled" ||
      opts.action === "cancel" ||
      opts.term_action === "cancel_service" ||
      opts.term_action === "no_participant";
    return applyFoldToLiveMadre(client, {
      fold_type: cancelled ? "participant_slot_cancel" : "participant_slot_upsert",
      session_date: iso || null,
      payload: {
        client_name: after.client_name || opts.client_name,
        day: after.day || opts.day,
        time_slot: after.time_slot || opts.time_slot,
        instructors: after.instructors || opts.instructors,
        service: after.service || opts.service,
        area: after.area || opts.area,
        venue: after.venue || opts.venue,
      },
    });
  }

  function queueScheduleOverrideChange(client, opts) {
    opts = opts || {};
    var row = opts.row || {};
    var payload = row.payload || {};
    var ovType = String(row.override_type || "").toLowerCase();
    var iso = normIso(row.session_date || opts.session_date);
    var isStaffCover =
      ovType.indexOf("staff") >= 0 ||
      ovType === "instructor_cover" ||
      !!payload.covering_staff_id;
    if (isStaffCover) {
      return applyFoldToLiveMadre(client, {
        fold_type: "staff_shift_upsert",
        session_date: iso || null,
        payload: {
          staff_name: payload.covering_staff_name || payload.covering_staff_id || "",
          venue: row.anchor_venue || payload.venue || "",
          time_range: row.anchor_time_slot_label || "",
          day: payload.day || "",
          raw_assignment: payload.raw_assignment || "",
        },
      });
    }
    return applyFoldToLiveMadre(client, {
      fold_type:
        ovType === "slot_clear_client" || ovType === "client_cancelled"
          ? "participant_slot_cancel"
          : "participant_slot_upsert",
      session_date: iso || null,
      payload: {
        client_name:
          payload.replacement_client_name ||
          payload.to_client_name ||
          row.anchor_client_id ||
          "",
        instructors: payload.covering_staff_id || row.anchor_staff_id || "",
        time_slot: row.anchor_time_slot_label || "",
        venue: row.anchor_venue || "",
        service: payload.service || "",
        area: payload.area || "",
      },
    });
  }

  global.PortalMadreFold = {
    loadLiveMadre: loadLiveMadre,
    invalidateLiveMadreCache: invalidateLiveMadreCache,
    applyFoldToLiveMadre: applyFoldToLiveMadre,
    queueParticipantSlotChange: queueParticipantSlotChange,
    queueScheduleOverrideChange: queueScheduleOverrideChange,
    madreToAdapterRows: madreToAdapterRows,
    dedupeRosterAdapterRows: dedupeRosterAdapterRows,
    TERM_KEY: TERM_KEY,
  };
})(typeof window !== "undefined" ? window : globalThis);
