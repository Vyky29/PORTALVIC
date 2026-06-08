/**
 * Admin — Edit term slot (Phase 1).
 * Saves to public.portal_roster_rows with scope: single day, every weekday in term, or rest of term.
 */
(function (global) {
  "use strict";

  var deps = {
    getClient: function () { return null; },
    toast: function (m) { try { console.log("[term-slot]", m); } catch (_) {} },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    setView: function () { return null; },
    getTermBounds: function () {
      var t = global.PORTAL_TERM_FROM_TIMETABLE || {};
      return {
        firstDate: String(t.firstDate || "2026-04-13").slice(0, 10),
        lastDate: String(t.lastDate || "2026-07-17").slice(0, 10),
        termBreakFrom: String(t.termBreakFrom || "").slice(0, 10),
        termBreakTo: String(t.termBreakTo || "").slice(0, 10),
      };
    },
  };

  var state = {
    rootEl: null,
    saving: false,
    prefill: null,
  };

  function esc(s) { return deps.esc(s); }

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

  function isoFromDate(dt) {
    if (!dt || isNaN(dt.getTime())) return "";
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }

  function isoAddDays(iso, days) {
    var dt = parseIsoLocal(iso);
    if (!dt) return "";
    dt.setDate(dt.getDate() + days);
    return isoFromDate(dt);
  }

  function weekdayLongFromIso(iso) {
    var dt = parseIsoLocal(iso);
    if (!dt) return "";
    return dt.toLocaleDateString("en-GB", { weekday: "long" });
  }

  function isoInTermBreak(iso, bounds) {
    return !!(iso && bounds.termBreakFrom && bounds.termBreakTo && iso >= bounds.termBreakFrom && iso <= bounds.termBreakTo);
  }

  function weekdaysMatchingFromThrough(weekday, fromIso, throughIso, bounds) {
    var out = [];
    var cur = fromIso;
    while (cur && cur <= throughIso) {
      if (!isoInTermBreak(cur, bounds) && weekdayLongFromIso(cur) === weekday) out.push(cur);
      cur = isoAddDays(cur, 1);
    }
    return out;
  }

  function allWeekdaysInTerm(weekday, bounds) {
    return weekdaysMatchingFromThrough(weekday, bounds.firstDate, bounds.lastDate, bounds);
  }

  function mergedInstructorsFromForm(root) {
    var staff = String((root.querySelector("#trsStaff") || {}).value || "").trim();
    var inst = String((root.querySelector("#trsInstructors") || {}).value || "").trim();
    if (inst) return inst;
    return staff;
  }

  function rowPayloadFromForm(root) {
    var anchor = normIso((root.querySelector("#trsAnchorDate") || {}).value);
    var day = weekdayLongFromIso(anchor);
    return {
      anchorDate: anchor,
      day: day,
      client_name: String((root.querySelector("#trsClient") || {}).value || "").trim(),
      time_slot: String((root.querySelector("#trsTimeSlot") || {}).value || "").trim(),
      instructors: mergedInstructorsFromForm(root),
      service: String((root.querySelector("#trsService") || {}).value || "").trim(),
      area: String((root.querySelector("#trsArea") || {}).value || "").trim(),
      venue: String((root.querySelector("#trsVenue") || {}).value || "").trim(),
      scope: String((root.querySelector('input[name="trsScope"]:checked') || {}).value || "single_day"),
    };
  }

  function findBundleSlot(anchorIso, client, timeSlot) {
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    var cLow = String(client || "").toLowerCase();
    var tLow = String(timeSlot || "").toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r.client_name || "").toLowerCase() !== cLow) continue;
      if (String(r.time_slot || "").toLowerCase() !== tLow) continue;
      if (anchorIso && normIso(r.session_date) && normIso(r.session_date) !== anchorIso) continue;
      return r;
    }
    return null;
  }

  function fillFormFromBundle(root) {
    var p = rowPayloadFromForm(root);
    if (!p.anchorDate || !p.client_name || !p.time_slot) {
      deps.toast("Pick anchor date, participante, and time slot first.");
      return;
    }
    var slot = findBundleSlot(p.anchorDate, p.client_name, p.time_slot);
    if (!slot) {
      deps.toast("No matching roster row in the loaded bundle for that date.");
      return;
    }
    var map = [
      ["#trsInstructors", slot.instructors],
      ["#trsStaff", slot.instructors],
      ["#trsService", slot.service],
      ["#trsArea", slot.area],
      ["#trsVenue", slot.venue],
    ];
    map.forEach(function (pair) {
      var el = root.querySelector(pair[0]);
      if (el) el.value = String(pair[1] || "");
    });
    var instEl = root.querySelector("#trsInstructors");
    var staffEl = root.querySelector("#trsStaff");
    if (instEl && staffEl) {
      var instRaw = String(instEl.value || "").trim();
      if (instRaw.indexOf(",") < 0 && instRaw.indexOf(";") < 0) {
        staffEl.value = instRaw;
      }
    }
    deps.toast("Loaded current bundle values — edit fields then Save.");
  }

  function snapshotRow(p) {
    return {
      client_name: p.client_name,
      day: p.day,
      time_slot: p.time_slot,
      instructors: p.instructors,
      service: p.service,
      area: p.area,
      venue: p.venue,
      session_date: p.scope === "weekday_term" ? null : p.anchorDate,
    };
  }

  function upsertDatedRow(client, row, sessionDate, weekday) {
    var payload = {
      client_name: row.client_name,
      day: weekday || row.day,
      time_slot: row.time_slot,
      instructors: row.instructors,
      service: row.service,
      area: row.area,
      venue: row.venue,
      session_date: sessionDate,
      status: "active",
    };
    return client
      .from("portal_roster_rows")
      .select("id")
      .eq("status", "active")
      .eq("client_name", payload.client_name)
      .eq("time_slot", payload.time_slot)
      .eq("session_date", payload.session_date)
      .maybeSingle()
      .then(function (res) {
        if (res.error && res.error.code !== "PGRST116") throw res.error;
        if (res.data && res.data.id) {
          return client
            .from("portal_roster_rows")
            .update(payload)
            .eq("id", res.data.id)
            .select("id")
            .single();
        }
        return client.from("portal_roster_rows").insert([payload]).select("id").single();
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || null;
      });
  }

  function upsertTemplateRow(client, row) {
    var payload = {
      client_name: row.client_name,
      day: row.day,
      time_slot: row.time_slot,
      instructors: row.instructors,
      service: row.service,
      area: row.area,
      venue: row.venue,
      session_date: null,
      status: "active",
    };
    return client
      .from("portal_roster_rows")
      .select("id")
      .eq("status", "active")
      .eq("client_name", payload.client_name)
      .eq("time_slot", payload.time_slot)
      .eq("day", payload.day)
      .is("session_date", null)
      .maybeSingle()
      .then(function (res) {
        if (res.error && res.error.code !== "PGRST116") throw res.error;
        if (res.data && res.data.id) {
          return client
            .from("portal_roster_rows")
            .update(payload)
            .eq("id", res.data.id)
            .select("id")
            .single();
        }
        return client.from("portal_roster_rows").insert([payload]).select("id").single();
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || null;
      });
  }

  function cancelDatedRowsForWeekday(client, weekday, clientName, timeSlot, fromIso, throughIso) {
    var q = client
      .from("portal_roster_rows")
      .update({ status: "cancelled" })
      .eq("status", "active")
      .eq("day", weekday)
      .eq("client_name", clientName)
      .eq("time_slot", timeSlot)
      .not("session_date", "is", null);
    if (fromIso) q = q.gte("session_date", fromIso);
    if (throughIso) q = q.lte("session_date", throughIso);
    return q;
  }

  function insertEvent(client, ev) {
    return client.from("portal_roster_row_events").insert([ev]);
  }

  function saveTermSlot(root) {
    if (state.saving) return;
    var client = deps.getClient();
    if (!client) {
      deps.toast("Sign in to Supabase first.");
      return;
    }
    var p = rowPayloadFromForm(root);
    if (!p.anchorDate) {
      deps.toast("Anchor date is required.");
      return;
    }
    if (!p.client_name || !p.time_slot || !p.day) {
      deps.toast("Participante and time slot are required.");
      return;
    }
    if (typeof global.portalResolveParticipantCanonicalName === "function") {
      var canon = global.portalResolveParticipantCanonicalName(p.client_name);
      if (canon) p.client_name = canon;
    }
    var bounds = deps.getTermBounds();
    state.saving = true;
    render(root);

    var before = findBundleSlot(p.anchorDate, p.client_name, p.time_slot);
    var afterSnap = snapshotRow(p);
    var chain = Promise.resolve();

    if (p.scope === "single_day") {
      chain = upsertDatedRow(client, p, p.anchorDate, p.day);
    } else if (p.scope === "weekday_term") {
      chain = cancelDatedRowsForWeekday(client, p.day, p.client_name, p.time_slot, bounds.firstDate, bounds.lastDate)
        .then(function () { return upsertTemplateRow(client, p); });
    } else {
      var dates = weekdaysMatchingFromThrough(p.day, p.anchorDate, bounds.lastDate, bounds);
      chain = dates.reduce(function (acc, iso) {
        return acc.then(function () { return upsertDatedRow(client, p, iso, p.day); });
      }, Promise.resolve());
    }

    chain
      .then(function (rowRef) {
        return insertEvent(client, {
          roster_row_id: rowRef && rowRef.id ? rowRef.id : null,
          action: before ? "update" : "create",
          scope: p.scope,
          anchor_session_date: p.anchorDate,
          before_snapshot: before || null,
          after_snapshot: afterSnap,
          client_context: { page: "admin_dashboard", module: "term_roster_edit" },
        });
      })
      .then(function () {
        if (global.PortalRosterRowsMerge && typeof global.PortalRosterRowsMerge.loadAndCache === "function") {
          return global.PortalRosterRowsMerge.loadAndCache(client);
        }
      })
      .then(function () {
        if (typeof global.portalRefreshStaffDashboardSourceFromPortal === "function") {
          global.portalRefreshStaffDashboardSourceFromPortal();
        }
        deps.toast("Term slot saved.");
        if (global.PortalChangeLog && typeof global.PortalChangeLog.record === "function") {
          global.PortalChangeLog.record({
            area: "Timetable",
            entity: p.client_name,
            action: before ? "update" : "create",
            summary:
              p.client_name +
              " · " +
              p.time_slot +
              " · " +
              p.scope.replace(/_/g, " "),
            details: {
              session_date: p.anchorDate,
              scope: p.scope,
              day: p.day,
              instructors: p.instructors,
              area: p.area,
              venue: p.venue,
              service: p.service,
            },
            source: "term_roster_edit",
          });
        }
      })
      .catch(function (err) {
        deps.toast("Save failed: " + String((err && err.message) || err));
      })
      .finally(function () {
        state.saving = false;
        render(root);
      });
  }

  function injectStyleOnce() {
    if (document.getElementById("adminTermSlotStyle")) return;
    var css = [
      ".trs-wrap{min-width:0;max-width:52rem}",
      ".trs-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin:0 0 16px}",
      "@media(max-width:640px){.trs-grid{grid-template-columns:1fr}}",
      ".trs-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".trs-field label{font-size:12px;font-weight:700;color:#475569}",
      ".trs-field input,.trs-field select{font:inherit;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a;min-width:0;width:100%;box-sizing:border-box}",
      ".trs-field .participant-field-wrap{position:relative;min-width:0}",
      ".trs-field .portal-name-suggest{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;margin:0;padding:4px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);max-height:220px;overflow-y:auto}",
      ".trs-field .portal-name-suggest[hidden]{display:none!important}",
      ".trs-field .portal-name-suggest__item{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:transparent;font:inherit;color:#0f172a;border-radius:8px;cursor:pointer;min-width:0;overflow-wrap:break-word}",
      ".trs-field .portal-name-suggest__item:hover,.trs-field .portal-name-suggest__item:focus{background:rgba(59,130,246,.1);outline:none}",
      ".trs-scope{border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin:0 0 16px;background:#f8fafc}",
      ".trs-scope label{display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:pointer;min-width:0}",
      ".trs-scope label span{min-width:0;overflow-wrap:break-word}",
      ".trs-scope strong{display:block;color:#0f172a;font-size:13px}",
      ".trs-scope em{display:block;font-style:normal;font-size:12px;color:#64748b;margin-top:2px}",
      ".trs-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".trs-msg{min-height:1.2em;font-size:13px;color:#64748b;margin:10px 0 0;overflow-wrap:break-word}",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "adminTermSlotStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function wireTermSlotAutofill(root) {
    if (!root || typeof global.portalWireFieldSuggest !== "function") return;
    var wire = global.portalWireFieldSuggest;

    function onParticipantPick(name) {
      var svcEl = root.querySelector("#trsService");
      if (!svcEl || String(svcEl.value || "").trim()) return;
      if (typeof global.portalCollectServicesForParticipantName !== "function") return;
      var list = global.portalCollectServicesForParticipantName(name) || [];
      if (list.length === 1) svcEl.value = list[0];
    }

    wire(root.querySelector("#trsClient"), root.querySelector("#trsClientSuggest"), {
      kind: "participant",
      strict: true,
      match: "contains",
      onPick: onParticipantPick,
    });
    wire(root.querySelector("#trsStaff"), root.querySelector("#trsStaffSuggest"), {
      kind: "staff",
      strict: false,
      match: "contains",
    });
    wire(root.querySelector("#trsInstructors"), root.querySelector("#trsInstructorsSuggest"), {
      kind: "instructor",
      strict: false,
      match: "contains",
    });
    wire(root.querySelector("#trsService"), root.querySelector("#trsServiceSuggest"), {
      kind: "service",
      strict: false,
      match: "contains",
    });
    wire(root.querySelector("#trsVenue"), root.querySelector("#trsVenueSuggest"), {
      kind: "venue",
      strict: false,
      match: "contains",
    });
  }

  function render(root) {
    if (!root) return;
    var bounds = deps.getTermBounds();
    var pre = state.prefill || {};
    var anchor = normIso(pre.anchorDate) || normIso(new Date().toISOString().slice(0, 10));
    var weekday = weekdayLongFromIso(anchor);

    var preStaff = String(pre.staff || pre.instructors || "").trim();
    if (preStaff.indexOf(",") >= 0 || preStaff.indexOf(";") >= 0) preStaff = "";

    root.innerHTML =
      '<div class="trs-wrap">' +
      '<div class="trs-grid">' +
      '<div class="trs-field"><label for="trsAnchorDate">Anchor date</label><input type="date" id="trsAnchorDate" value="' + esc(anchor) + '"/></div>' +
      '<div class="trs-field"><label>Weekday</label><input type="text" id="trsWeekday" readonly value="' + esc(weekday) + '"/></div>' +
      '<div class="trs-field"><label for="trsClient">Participante</label><div class="participant-field-wrap"><input type="text" id="trsClient" value="' + esc(pre.client_name || "") + '" placeholder="e.g. Shire" autocomplete="off"/><div id="trsClientSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Participantes"></div></div></div>' +
      '<div class="trs-field"><label for="trsTimeSlot">Time slot</label><input type="text" id="trsTimeSlot" value="' + esc(pre.time_slot || "") + '" placeholder="e.g. 9 to 9.30"/></div>' +
      '<div class="trs-field"><label for="trsStaff">Staff</label><div class="participant-field-wrap"><input type="text" id="trsStaff" value="' + esc(preStaff) + '" placeholder="e.g. Javier" autocomplete="off"/><div id="trsStaffSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Staff"></div></div></div>' +
      '<div class="trs-field"><label for="trsInstructors">Instructor(s)</label><div class="participant-field-wrap"><input type="text" id="trsInstructors" value="' + esc(pre.instructors || "") + '" placeholder="e.g. JAVIER, RAUL" autocomplete="off"/><div id="trsInstructorsSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Instructors"></div></div></div>' +
      '<div class="trs-field"><label for="trsService">Service</label><div class="participant-field-wrap"><input type="text" id="trsService" value="' + esc(pre.service || "") + '" placeholder="e.g. Aquatic Activity" autocomplete="off"/><div id="trsServiceSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Services"></div></div></div>' +
      '<div class="trs-field"><label for="trsVenue">Venue</label><div class="participant-field-wrap"><input type="text" id="trsVenue" value="' + esc(pre.venue || "") + '" placeholder="e.g. SwimFarm" autocomplete="off"/><div id="trsVenueSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Venues"></div></div></div>' +
      '<div class="trs-field"><label for="trsArea">Pool / area</label><input type="text" id="trsArea" value="' + esc(pre.area || "") + '" placeholder="e.g. Small Pool"/></div>' +
      "</div>" +
      '<div class="trs-scope" role="group" aria-labelledby="trsScopeLegend">' +
      '<div id="trsScopeLegend" style="font-weight:800;font-size:13px;margin:0 0 6px;color:#0f172a">Apply change to</div>' +
      '<label><input type="radio" name="trsScope" value="single_day" checked/><span><strong>This day only</strong><em>One dated exception on the anchor date.</em></span></label>' +
      '<label><input type="radio" name="trsScope" value="weekday_term"/><span><strong>Every ' + esc(weekday || "weekday") + ' until end of term</strong><em>Updates the weekly template for all ' + esc(weekday || "weekday") + 's in the term.</em></span></label>' +
      '<label><input type="radio" name="trsScope" value="rest_of_term"/><span><strong>Rest of term (from anchor date)</strong><em>Same weekday from the anchor date through ' + esc(bounds.lastDate) + '.</em></span></label>' +
      "</div>" +
      '<div class="trs-actions">' +
      '<button type="button" class="btn btn--pri" id="trsSave"' + (state.saving ? " disabled" : "") + ">" + (state.saving ? "Saving…" : "Save term slot") + "</button>" +
      '<button type="button" class="btn btn--sec" id="trsLoadBundle">Load from roster</button>' +
      '<button type="button" class="btn btn--ghost" data-view-target="scheduling">Schedule &amp; Covers</button>' +
      "</div>" +
      '<p class="trs-msg" id="trsMsg">' + (state.saving ? "Saving…" : "") + "</p>" +
      "</div>";

    var anchorEl = root.querySelector("#trsAnchorDate");
    var wdEl = root.querySelector("#trsWeekday");
    if (anchorEl && wdEl) {
      anchorEl.addEventListener("change", function () {
        wdEl.value = weekdayLongFromIso(normIso(anchorEl.value));
        var labels = root.querySelectorAll(".trs-scope label span strong");
        if (labels[1]) labels[1].textContent = "Every " + wdEl.value + " until end of term";
      });
    }
    var saveBtn = root.querySelector("#trsSave");
    if (saveBtn) saveBtn.addEventListener("click", function () { saveTermSlot(root); });
    var loadBtn = root.querySelector("#trsLoadBundle");
    if (loadBtn) loadBtn.addEventListener("click", function () { fillFormFromBundle(root); });
    root.querySelectorAll("[data-view-target]").forEach(function (b) {
      b.addEventListener("click", function () {
        var fn = deps.setView;
        if (typeof fn === "function") fn(b.getAttribute("data-view-target"));
      });
    });
    wireTermSlotAutofill(root);
  }

  function openWithPrefill(prefill) {
    state.prefill = prefill || null;
    global.__PORTAL_TERM_SLOT_PREFILL__ = prefill || null;
    if (typeof deps.setView === "function") deps.setView("term_roster_edit");
  }

  function mount(rootEl, opts) {
    if (!rootEl) return;
    injectStyleOnce();
    state.rootEl = rootEl;
    state.prefill = (opts && opts.prefill) || global.__PORTAL_TERM_SLOT_PREFILL__ || null;
    global.__PORTAL_TERM_SLOT_PREFILL__ = null;
    render(rootEl);
  }

  function configure(opts) {
    opts = opts || {};
    ["getClient", "toast", "esc", "getTermBounds", "setView"].forEach(function (k) {
      if (typeof opts[k] === "function") deps[k] = opts[k];
    });
  }

  global.AdminTermSlot = { configure: configure, mount: mount, openWithPrefill: openWithPrefill };
})(typeof window !== "undefined" ? window : globalThis);
