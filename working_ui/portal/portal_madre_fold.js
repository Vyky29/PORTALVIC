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

  /**
   * Authoritative week only: each calendar day belongs to exactly one week block
   * (start ≤ sessionDate ≤ end). Stale copies of the same date in other week blocks
   * (e.g. Monday template copied forward) must not be flattened into adapter rows —
   * otherwise staff see duplicate/conflicting Today cards (Emanuel split + Ikram 11–4).
   */
  function sessionDateBelongsToWeek(iso, week) {
    var day = String(iso || "").trim().slice(0, 10);
    var start = String((week && week.start) || "").trim().slice(0, 10);
    var end = String((week && week.end) || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      /* Weeks without a date range are treated as templates — keep them. */
      return true;
    }
    return day >= start && day <= end;
  }

  function madreStaffList(week) {
    var staff = week && week.staff;
    if (!staff) return [];
    if (Array.isArray(staff)) return staff;
    if (typeof staff === "object") return Object.keys(staff).map(function (k) {
      return staff[k];
    });
    return [];
  }

  function madreToAdapterRows(madre) {
    var rows = [];
    var weeks = (madre && madre.weeks) || [];
    weeks.forEach(function (w) {
      madreStaffList(w).forEach(function (st) {
        if (!st) return;
        // Always emit LULIYA for this person — never LULIA from roster key `lulia`.
        var staffKeyNorm = String(st.staffKey || st.name || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "");
        var staffName = String(st.staffName || st.staffKey || st.name || "")
          .trim()
          .toUpperCase();
        if (
          staffKeyNorm === "lulia" ||
          staffKeyNorm === "luliya" ||
          staffKeyNorm === "lulya" ||
          staffKeyNorm === "aida" ||
          staffKeyNorm === "stf021" ||
          staffName === "LULIA" ||
          staffName === "LULYA" ||
          staffName === "AIDA"
        ) {
          staffName = "LULIYA";
        }
        (st.days || []).forEach(function (d) {
          var iso = String(d.sessionDate || d.session_date || "").trim().slice(0, 10);
          if (iso && !sessionDateBelongsToWeek(iso, w)) return;
          (d.slots || []).forEach(function (s) {
            var area = String(s.pool_note || s.area || "").trim();
            var cn = normalizeMadreDashboardClient(s.client_name, area);
            var up = cn.toUpperCase();
            // "NO PARTICIPANT" is a STANDING OPEN SLOT: the instructor works that block
            // but nobody is booked. Emit it as an empty-client roster row so the roster
            // merge + dashboard render the yellow "No Participant" card (and an override
            // can later fill it, e.g. a make-up). CLOSED / NO CLIENT are genuine
            // non-slots and stay dropped.
            var isNoParticipant = up === "NO PARTICIPANT";
            if (
              !cn ||
              up === "CLOSED" ||
              up === "NO CLIENT" ||
              up === "NO_CLIENT"
            ) {
              return;
            }
            rows.push({
              client_name: isNoParticipant ? "" : cn,
              day: d.weekday,
              instructors: staffName,
              service: String(s.service || "").trim(),
              area: !isNoParticipant && cn === "HOME" ? "HOME" : area,
              time_slot: String(s.time_slot || "").trim(),
              venue: String(s.venue || "SwimFarm").trim(),
              session_date: d.sessionDate,
              // Optional per-slot breakdown (e.g. Day Centre morning + Big Pool hour).
              // Display-only: the slot stays ONE session for feedback / pay.
              segments:
                Array.isArray(s.segments) && s.segments.length ? s.segments : undefined,
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
    // Raw REST GET with cache:"no-store" + no-cache request headers. The Supabase
    // JS client's .select() is subject to browser HTTP caching, which could serve a
    // stale portal_madre_document revision — the roster would briefly show correct
    // (bundle) then flip to an old cached MADRE. no-store guarantees the freshest row.
    function fetchDocRow() {
      var base = String(supabaseUrl() || "").replace(/\/+$/, "");
      if (!base) return Promise.resolve(null);
      return authHeaders(client).then(function (h) {
        // Bust the browser HTTP cache with request headers only. Do NOT append a
        // query param (e.g. _ts): PostgREST treats unknown params as column filters
        // and returns HTTP 400 ("column _ts does not exist"), which would make the
        // live MADRE fetch fail and silently fall back to the stale bundle.
        var headers = Object.assign({}, h, {
          Accept: "application/vnd.pgrst.object+json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        });
        var url =
          base +
          "/rest/v1/portal_madre_document?select=document,revision,updated_at&term_key=eq." +
          encodeURIComponent(TERM_KEY);
        return fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: headers,
        }).then(function (resp) {
          if (resp.status === 406) return null; // no row for single-object accept
          if (!resp.ok) {
            var e = new Error("HTTP " + resp.status);
            e.httpStatus = resp.status;
            throw e;
          }
          return resp.json();
        });
      });
    }
    function fetchOnce(retried) {
      return fetchDocRow()
        .then(function (row) {
          if (!row || !row.document) return null;
          CACHE = {
            document: row.document,
            revision: row.revision,
            updated_at: row.updated_at,
            rows: madreToAdapterRows(row.document),
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
        replace_open: opts.replace_open !== false && !cancelled,
      },
    });
  }

  function weekdayKeyFromIso(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(dt.getTime())) return "";
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
      dt.getDay()
    ];
  }

  function collectMadreIsosForDow(dayName, preferredIso) {
    var out = [];
    var want = String(dayName || "")
      .trim()
      .toLowerCase();
    var pref = normIso(preferredIso);
    try {
      var doc = (global.PORTAL_MADRE_LIVE && global.PORTAL_MADRE_LIVE.document) || null;
      var weeks = (doc && doc.weeks) || [];
      for (var wi = 0; wi < weeks.length; wi++) {
        var staff = (weeks[wi] && weeks[wi].staff) || [];
        for (var si = 0; si < staff.length; si++) {
          var days = (staff[si] && staff[si].days) || [];
          for (var di = 0; di < days.length; di++) {
            var iso = String(days[di].sessionDate || "").slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
            var wd = String(days[di].weekday || "")
              .trim()
              .toLowerCase();
            if (wd && want) {
              if (wd !== want && wd.indexOf(want.slice(0, 3)) < 0) {
                if (weekdayKeyFromIso(iso) !== want) continue;
              }
            } else if (want && weekdayKeyFromIso(iso) !== want) {
              continue;
            }
            if (out.indexOf(iso) < 0) out.push(iso);
          }
        }
      }
    } catch (_e) {}
    out.sort();
    if (pref && out.indexOf(pref) < 0) out.push(pref);
    if (!out.length && pref) out.push(pref);
    return out;
  }

  /**
   * Assign / rest-of-term: rename open NO PARTICIPANT seats to the named client
   * across standing MADRE weeks for that weekday (offer reads latest standing).
   */
  function queueParticipantAssignConsumeOpen(client, opts) {
    opts = opts || {};
    var after = opts.after || {};
    var day = after.day || opts.day || "";
    var anchor = normIso(opts.session_date || after.session_date);
    var scope = String(opts.scope || "").trim();
    var isos = collectMadreIsosForDow(day, anchor);
    if (!isos.length && anchor) isos = [anchor];
    if (scope === "single_day" && anchor) {
      isos = [anchor];
    } else if (scope === "pick_sessions" && Array.isArray(opts.selected_session_dates)) {
      isos = opts.selected_session_dates.map(normIso).filter(Boolean);
    } else if (scope === "rest_of_term" && anchor) {
      // Keep standing weeks before the Autumn anchor — offer template is summer MADRE.
      // Still prefer dates on/after anchor when present, but never drop earlier standing.
      var standing = isos.slice();
      var future = standing.filter(function (iso) {
        return iso >= anchor;
      });
      isos = standing.length ? standing : future.length ? future : [anchor];
    }
    // Deduplicate, prefer latest first so offer ref date is updated early.
    isos = isos.slice().sort().reverse();
    var seen = Object.create(null);
    var chain = Promise.resolve({ ok: true, notes: [] });
    isos.forEach(function (iso) {
      if (seen[iso]) return;
      seen[iso] = true;
      chain = chain.then(function (acc) {
        return queueParticipantSlotChange(client, {
          after: after,
          session_date: iso,
          replace_open: true,
          term_action: opts.term_action || "update",
          source_module: opts.source_module || "term_roster_edit",
        }).then(function (res) {
          if (res && res.note) acc.notes.push(iso + ": " + res.note);
          if (res && (res.ok === false || res.folded === false)) acc.ok = false;
          return acc;
        });
      });
    });
    return chain;
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
    queueParticipantAssignConsumeOpen: queueParticipantAssignConsumeOpen,
    collectMadreIsosForDow: collectMadreIsosForDow,
    queueScheduleOverrideChange: queueScheduleOverrideChange,
    madreToAdapterRows: madreToAdapterRows,
    dedupeRosterAdapterRows: dedupeRosterAdapterRows,
    TERM_KEY: TERM_KEY,
  };
})(typeof window !== "undefined" ? window : globalThis);
