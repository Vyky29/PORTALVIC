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
    sessionPickerSelection: null,
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
    return String((root.querySelector("#trsInstructors") || {}).value || "").trim();
  }

  function formAction(root) {
    var el = root.querySelector('input[name="trsAction"]:checked');
    return el ? String(el.value || "update").trim() : "update";
  }

  function rowPayloadFromForm(root) {
    var anchor = normIso((root.querySelector("#trsAnchorDate") || {}).value);
    var day = weekdayLongFromIso(anchor);
    var scope = String((root.querySelector('input[name="trsScope"]:checked') || {}).value || "single_day");
    return {
      anchorDate: anchor,
      day: day,
      client_name: String((root.querySelector("#trsClient") || {}).value || "").trim(),
      time_slot: String((root.querySelector("#trsTimeSlot") || {}).value || "").trim(),
      instructors: mergedInstructorsFromForm(root),
      service: String((root.querySelector("#trsService") || {}).value || "").trim(),
      area: String((root.querySelector("#trsArea") || {}).value || "").trim(),
      venue: String((root.querySelector("#trsVenue") || {}).value || "").trim(),
      scope: scope,
      selectedSessionDates: scope === "pick_sessions" ? readSelectedSessionDates(root) : null,
      action: formAction(root),
      reason: String((root.querySelector("#trsReason") || {}).value || "").trim(),
    };
  }

  function formatSessionDateLabel(iso) {
    var dt = parseIsoLocal(iso);
    if (!dt) return String(iso || "");
    return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function buildTermSessionDatesForSlot(p) {
    if (!p.anchorDate || !p.day) return [];
    var bounds = deps.getTermBounds();
    var dates = weekdaysMatchingFromThrough(p.day, p.anchorDate, bounds.lastDate, bounds);
    if (!p.client_name || !p.time_slot) return dates;
    var timeNorm = normSlotTime(p.time_slot);
    var svcNorm = normName(p.service || "");
    var matched = dates.filter(function (iso) {
      var row = findBundleSlot(iso, p.client_name, p.time_slot);
      if (row) return !svcNorm || normName(row.service) === svcNorm;
      return collectParticipantRows(p.client_name, iso).some(function (r) {
        if (svcNorm && normName(r.service) !== svcNorm) return false;
        return timeSlotNormMatchesOrWithin(r.time_slot, p.time_slot, p.day);
      });
    });
    return matched.length ? matched : dates;
  }

  function captureSessionPickerSelection(root) {
    var sel = Object.create(null);
    root.querySelectorAll('input[name="trsSessionCancel"]').forEach(function (inp) {
      var iso = normIso(inp.value);
      if (iso) sel[iso] = !!inp.checked;
    });
    state.sessionPickerSelection = sel;
  }

  function readSelectedSessionDates(root) {
    var out = [];
    root.querySelectorAll('input[name="trsSessionCancel"]:checked').forEach(function (inp) {
      var iso = normIso(inp.value);
      if (iso) out.push(iso);
    });
    return out.sort();
  }

  function sessionCancelDefaultChecked(iso, anchorIso, action, prevSel) {
    if (prevSel && Object.prototype.hasOwnProperty.call(prevSel, iso)) return !!prevSel[iso];
    if (action === "cancel_service" || action === "no_participant") return iso >= anchorIso;
    return iso === anchorIso;
  }

  function refreshTermSlotSessionPicker(root) {
    var block = root.querySelector("#trsSessionPickerBlock");
    var host = root.querySelector("#trsSessionPicker");
    var meta = root.querySelector("#trsSessionPickerMeta");
    if (!block || !host) return;
    var scopeEl = root.querySelector('input[name="trsScope"]:checked');
    var scope = scopeEl ? String(scopeEl.value || "") : "";
    var p = rowPayloadFromForm(root);
    var show = scope === "pick_sessions" && p.client_name && p.time_slot && p.day;
    block.hidden = !show;
    if (!show) return;
    captureSessionPickerSelection(root);
    var dates = buildTermSessionDatesForSlot(p);
    var prevSel = state.sessionPickerSelection || null;
    var action = p.action || "update";
    if (!dates.length) {
      host.innerHTML = '<p class="trs-session-empty">No matching sessions left in the term for this slot.</p>';
      if (meta) meta.textContent = "";
      return;
    }
    var checkedCount = 0;
    var html = '<div class="trs-session-list" role="group" aria-label="Sessions in term">';
    dates.forEach(function (iso) {
      var checked = sessionCancelDefaultChecked(iso, p.anchorDate, action, prevSel);
      if (checked) checkedCount += 1;
      html +=
        '<label class="trs-session-item">' +
        '<input type="checkbox" name="trsSessionCancel" value="' +
        esc(iso) +
        '"' +
        (checked ? " checked" : "") +
        "/>" +
        '<span class="trs-session-item__main">' +
        '<span class="trs-session-item__date">' +
        esc(formatSessionDateLabel(iso)) +
        "</span>" +
        '<span class="trs-session-item__slot">' +
        esc(p.time_slot) +
        "</span>" +
        "</span>" +
        '<span class="trs-session-item__status" data-cancel-label="Cancel" data-attend-label="Attending"></span>' +
        "</label>";
    });
    html += "</div>";
    html +=
      '<div class="trs-session-toolbar">' +
      '<button type="button" class="btn btn--ghost btn--xs" id="trsSessionSelectFromAnchor">All from anchor</button>' +
      '<button type="button" class="btn btn--ghost btn--xs" id="trsSessionSelectNone">All attending</button>' +
      '<button type="button" class="btn btn--ghost btn--xs" id="trsSessionSelectAll">Cancel all listed</button>' +
      "</div>";
    host.innerHTML = html;
    if (meta) meta.textContent = "(" + checkedCount + " cancel · " + (dates.length - checkedCount) + " attending)";
    host.querySelectorAll(".trs-session-item").forEach(function (lbl) {
      syncSessionItemStatusLabel(lbl);
      var inp = lbl.querySelector('input[name="trsSessionCancel"]');
      if (inp) {
        inp.addEventListener("change", function () {
          syncSessionItemStatusLabel(lbl);
          captureSessionPickerSelection(root);
          refreshTermSlotSessionPickerMeta(root, dates.length);
        });
      }
    });
    var fromAnchorBtn = host.querySelector("#trsSessionSelectFromAnchor");
    if (fromAnchorBtn) {
      fromAnchorBtn.addEventListener("click", function () {
        host.querySelectorAll('input[name="trsSessionCancel"]').forEach(function (inp) {
          inp.checked = normIso(inp.value) >= p.anchorDate;
          syncSessionItemStatusLabel(inp.closest(".trs-session-item"));
        });
        captureSessionPickerSelection(root);
        refreshTermSlotSessionPickerMeta(root, dates.length);
      });
    }
    var noneBtn = host.querySelector("#trsSessionSelectNone");
    if (noneBtn) {
      noneBtn.addEventListener("click", function () {
        host.querySelectorAll('input[name="trsSessionCancel"]').forEach(function (inp) {
          inp.checked = false;
          syncSessionItemStatusLabel(inp.closest(".trs-session-item"));
        });
        captureSessionPickerSelection(root);
        refreshTermSlotSessionPickerMeta(root, dates.length);
      });
    }
    var allBtn = host.querySelector("#trsSessionSelectAll");
    if (allBtn) {
      allBtn.addEventListener("click", function () {
        host.querySelectorAll('input[name="trsSessionCancel"]').forEach(function (inp) {
          inp.checked = true;
          syncSessionItemStatusLabel(inp.closest(".trs-session-item"));
        });
        captureSessionPickerSelection(root);
        refreshTermSlotSessionPickerMeta(root, dates.length);
      });
    }
  }

  function syncSessionItemStatusLabel(labelEl) {
    if (!labelEl) return;
    var inp = labelEl.querySelector('input[name="trsSessionCancel"]');
    var status = labelEl.querySelector(".trs-session-item__status");
    if (!inp || !status) return;
    var cancel = inp.checked;
    status.textContent = cancel ? "Cancel" : "Attending";
    status.classList.toggle("trs-session-item__status--cancel", cancel);
    status.classList.toggle("trs-session-item__status--attend", !cancel);
  }

  function refreshTermSlotSessionPickerMeta(root, total) {
    var meta = root.querySelector("#trsSessionPickerMeta");
    if (!meta) return;
    var checked = readSelectedSessionDates(root).length;
    meta.textContent = "(" + checked + " cancel · " + Math.max(0, total - checked) + " attending)";
  }

  function validatePickSessionsScope(p) {
    if (p.scope !== "pick_sessions") return "";
    if (!p.selectedSessionDates || !p.selectedSessionDates.length) {
      return "Select at least one session to cancel (or pick another Apply to option).";
    }
    return "";
  }

  function normName(v) {
    return String(v || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function resolveClientName(raw) {
    if (typeof global.portalResolveParticipantCanonicalName === "function") {
      var c = global.portalResolveParticipantCanonicalName(raw);
      if (c) return c;
    }
    return String(raw || "").trim();
  }

  function rosterRows() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  function rowMatchesAnchorWeekday(row, anchorIso, weekday) {
    var rowIso = normIso(row.session_date);
    if (rowIso) {
      if (anchorIso && rowIso === anchorIso) return true;
      return !!(weekday && weekdayLongFromIso(rowIso) === weekday);
    }
    var rowDay = String(row.day || "").trim();
    return !!(weekday && rowDay === weekday);
  }

  function collectParticipantRows(clientName, anchorIso) {
    var want = normName(resolveClientName(clientName) || clientName);
    if (!want) return [];
    var weekday = weekdayLongFromIso(anchorIso);
    var out = [];
    rosterRows().forEach(function (r) {
      var nm = String(r.client_name || "").trim();
      if (!nm || /^no[\s_-]*client$/i.test(nm)) return;
      if (normName(nm) !== want) return;
      if (anchorIso && weekday && !rowMatchesAnchorWeekday(r, anchorIso, weekday)) return;
      out.push(r);
    });
    return out;
  }

  function collectServicesForParticipantOnAnchor(clientName, anchorIso) {
    var set = Object.create(null);
    collectParticipantRows(clientName, anchorIso).forEach(function (r) {
      var s = String(r.service || "").trim();
      if (s) set[s] = true;
    });
    if (!Object.keys(set).length && typeof global.portalCollectServicesForParticipantName === "function") {
      (global.portalCollectServicesForParticipantName(clientName) || []).forEach(function (s) {
        if (s) set[s] = true;
      });
    }
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  }

  function findBundleSlotByParticipantService(anchorIso, clientName, service) {
    var wantSvc = normName(service);
    if (!wantSvc) return null;
    var matches = collectParticipantRows(clientName, anchorIso).filter(function (r) {
      return normName(r.service) === wantSvc;
    });
    if (!matches.length) {
      var wantClient = normName(resolveClientName(clientName) || clientName);
      matches = rosterRows().filter(function (r) {
        return normName(r.client_name) === wantClient && normName(r.service) === wantSvc;
      });
    }
    if (!matches.length) return null;
    var exact = matches.filter(function (r) {
      return normIso(r.session_date) === anchorIso;
    });
    if (exact.length) return exact[0];
    return matches[0];
  }

  function findBundleSlot(anchorIso, client, timeSlot) {
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    var cLow = normName(resolveClientName(client) || client);
    var tLow = normSlotTime(timeSlot);
    var wd = weekdayLongFromIso(anchorIso);
    var exact = null;
    var within = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (normName(r.client_name) !== cLow) continue;
      if (anchorIso && normIso(r.session_date) && normIso(r.session_date) !== anchorIso) continue;
      if (normSlotTime(r.time_slot) === tLow) {
        exact = r;
        break;
      }
      if (timeSlot && timeSlotNormMatchesOrWithin(r.time_slot, timeSlot, wd || r.day)) {
        within = r;
      }
    }
    return exact || within || null;
  }

  function effectiveTimeSlotForEdit(p, slot) {
    var picked = String(p.time_slot || "").trim();
    if (!picked) return slot ? String(slot.time_slot || "").trim() : "";
    if (
      slot &&
      timeSlotNormMatchesOrWithin(slot.time_slot, picked, p.day) &&
      normSlotTime(slot.time_slot) !== normSlotTime(picked)
    ) {
      return picked;
    }
    return slot ? String(slot.time_slot || picked).trim() : picked;
  }

  function validateAquaticHalfHourBand(p) {
    if (!isAquaticServiceName(p.service)) return "";
    var base = findBundleSlotByParticipantService(p.anchorDate, p.client_name, p.service);
    if (!base) return "";
    var bands = aquaticHalfHourBands(base.time_slot, p.day);
    if (bands.length <= 1) return "";
    if (bands.indexOf(p.time_slot) < 0) {
      return "Pick the 30-minute band (e.g. 5.30 to 6), not the full hour.";
    }
    if (p.scope === "weekday_term" || p.scope === "rest_of_term") {
      return "30-minute bands work with This day only or Selected sessions — not the full term template.";
    }
    return "";
  }

  function bundleCancelRow(p, iso) {
    var slot = findBundleSlot(iso || p.anchorDate, p.client_name, p.time_slot);
    return {
      client_name: p.client_name,
      day: p.day,
      time_slot: effectiveTimeSlotForEdit(p, slot),
      instructors: slot ? String(slot.instructors || p.instructors || "").trim() : p.instructors,
      service: slot ? String(slot.service || p.service || "").trim() : p.service,
      area: slot ? String(slot.area || p.area || "").trim() : p.area,
      venue: slot ? String(slot.venue || p.venue || "").trim() : p.venue,
    };
  }

  function setFormField(root, sel, val) {
    var el = root.querySelector(sel);
    if (el) el.value = String(val == null ? "" : val);
  }

  function clearAutofilledSlotFields(root) {
    ["#trsTimeSlot", "#trsInstructors", "#trsVenue", "#trsArea"].forEach(function (sel) {
      setFormField(root, sel, "");
    });
    refreshTermSlotTimeBandPicker(root, null, [], "");
  }

  function applyBundleSlotToForm(root, slot, opts) {
    opts = opts || {};
    if (!slot) return false;
    var day = String(slot.day || "").trim();
    var bands =
      opts.timeSlot && String(opts.timeSlot).trim()
        ? [String(opts.timeSlot).trim()]
        : isAquaticServiceName(slot.service)
          ? aquaticHalfHourBands(slot.time_slot, day)
          : [String(slot.time_slot || "").trim()];
    var chosen = bands.length === 1 ? bands[0] : String((root.querySelector("#trsTimeSlot") || {}).value || "").trim();
    if (bands.length > 1 && (!chosen || bands.indexOf(chosen) < 0)) chosen = bands[0];
    setFormField(root, "#trsTimeSlot", chosen || slot.time_slot);
    setFormField(root, "#trsInstructors", slot.instructors);
    setFormField(root, "#trsVenue", slot.venue);
    setFormField(root, "#trsArea", slot.area);
    refreshTermSlotTimeBandPicker(root, slot, bands, chosen);
    return true;
  }

  function refreshTermSlotTimeBandPicker(root, slot, bands, selected) {
    var wrap = root.querySelector("#trsTimeSlotPickWrap");
    var host = root.querySelector("#trsTimeSlotOptions");
    var inp = root.querySelector("#trsTimeSlot");
    if (!wrap || !host) return;
    bands = bands || [];
    var show = bands.length > 1;
    wrap.hidden = !show;
    if (inp) {
      inp.readOnly = show;
      inp.classList.toggle("trs-time-slot--readonly", show);
    }
    if (!show) {
      host.replaceChildren();
      return;
    }
    host.replaceChildren();
    bands.forEach(function (band) {
      var lbl = document.createElement("label");
      lbl.className = "trs-pill trs-time-band-pill";
      var checked = band === selected;
      lbl.innerHTML =
        '<input type="radio" name="trsTimeBandPick" value="' +
        esc(band) +
        '"' +
        (checked ? " checked" : "") +
        "/><span>" +
        esc(band) +
        "</span>";
      lbl.addEventListener("change", function () {
        if (inp) inp.value = band;
        refreshTermSlotSessionPicker(root);
      });
      host.appendChild(lbl);
    });
    if (inp && selected) inp.value = selected;
  }

  function rebuildTermSlotServiceSelect(root, participantName, preferred, anchorIso) {
    var svcEl = root.querySelector("#trsService");
    if (!svcEl || svcEl.tagName !== "SELECT") return "";
    var part = resolveClientName(participantName) || String(participantName || "").trim();
    var pref = String(preferred == null ? svcEl.value : preferred || "").trim();
    svcEl.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = part ? "Select service" : "Pick participante first";
    svcEl.appendChild(ph);
    var list = part ? collectServicesForParticipantOnAnchor(part, anchorIso) : [];
    list.forEach(function (svc) {
      var o = document.createElement("option");
      o.value = svc;
      o.textContent = svc;
      svcEl.appendChild(o);
    });
    var chosen = "";
    if (list.length === 1) chosen = list[0];
    else if (pref && list.indexOf(pref) !== -1) chosen = pref;
    if (chosen) {
      svcEl.value = chosen;
      return chosen;
    }
    if (pref && !list.length) {
      var ox = document.createElement("option");
      ox.value = pref;
      ox.textContent = pref;
      svcEl.appendChild(ox);
      svcEl.value = pref;
      return pref;
    }
    svcEl.value = "";
    return "";
  }

  function refreshTermSlotAutofill(root, opts) {
    opts = opts || {};
    var clientEl = root.querySelector("#trsClient");
    var svcEl = root.querySelector("#trsService");
    var anchorEl = root.querySelector("#trsAnchorDate");
    if (!clientEl || !svcEl) return false;
    var anchor = normIso(anchorEl && anchorEl.value);
    var resolved = resolveClientName(clientEl.value);
    if (resolved && resolved !== String(clientEl.value || "").trim()) clientEl.value = resolved;
    var part = resolved || String(clientEl.value || "").trim();
    if (!part) {
      rebuildTermSlotServiceSelect(root, "", "", anchor);
      clearAutofilledSlotFields(root);
      refreshTermSlotSessionPicker(root);
      return false;
    }
    var chosenSvc = rebuildTermSlotServiceSelect(root, part, svcEl.value, anchor);
    if (!chosenSvc) {
      clearAutofilledSlotFields(root);
      if (opts.toastIfMissing && part) {
        var wd = weekdayLongFromIso(anchor);
        deps.toast("Pick a service for " + part + (wd ? " on " + wd : "") + ".");
      }
      refreshTermSlotSessionPicker(root);
      return false;
    }
    var slot = findBundleSlotByParticipantService(anchor, part, chosenSvc);
    if (!slot) {
      clearAutofilledSlotFields(root);
      if (opts.toastIfMissing) deps.toast("No roster row for that participante and service on this date.");
      refreshTermSlotSessionPicker(root);
      return false;
    }
    applyBundleSlotToForm(root, slot);
    if (opts.toastOnSuccess) deps.toast("Loaded from roster — check fields then Save.");
    refreshTermSlotSessionPicker(root);
    return true;
  }

  function fillFormFromBundle(root) {
    var p = rowPayloadFromForm(root);
    if (!p.anchorDate || !p.client_name) {
      deps.toast("Pick anchor date and participante first.");
      return;
    }
    refreshTermSlotAutofill(root, { toastIfMissing: true, toastOnSuccess: true });
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

  function rosterSlug(value) {
    var s = String(value || "").trim();
    if (typeof global.adminRosterSlugify === "function") return global.adminRosterSlugify(s);
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function parseHmToken(raw) {
    var s = String(raw || "").trim().replace(/\./g, ":");
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return { h: 16, m: 30 };
    return { h: parseInt(m[1], 10), m: parseInt(m[2] || "0", 10) };
  }

  function hourTo24(h, day) {
    if (day !== "Sunday" && h < 8) return h + 12;
    if (day === "Sunday" && h >= 1 && h <= 3) return h + 12;
    return h;
  }

  function parseTimeSlotBounds(timeSlot, day) {
    var parts = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .split(/\s+to\s+/i);
    if (parts.length < 2) return { start: "16:30", end: "17:00" };
    var a = parseHmToken(parts[0]);
    var b = parseHmToken(parts[1]);
    var ah = hourTo24(a.h, day);
    var bh = hourTo24(b.h, day);
    return {
      start: String(ah).padStart(2, "0") + ":" + String(a.m).padStart(2, "0"),
      end: String(bh).padStart(2, "0") + ":" + String(b.m).padStart(2, "0"),
    };
  }

  function affectedDatesForPayload(p) {
    var bounds = deps.getTermBounds();
    if (p.scope === "pick_sessions") {
      return Array.isArray(p.selectedSessionDates) ? p.selectedSessionDates.slice().sort() : [];
    }
    if (p.scope === "single_day") return [p.anchorDate];
    if (p.scope === "weekday_term") return allWeekdaysInTerm(p.day, bounds);
    return weekdaysMatchingFromThrough(p.day, p.anchorDate, bounds.lastDate, bounds);
  }

  var NO_CLIENT_PARTICIPANT = "No client";

  function normSlotTime(v) {
    var s = String(v || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!s) return "";
    return s.replace(/\s*-\s*/g, " to ").replace(/(\d)\.(\d)/g, "$1:$2");
  }

  function isAquaticServiceName(service) {
    var s = normName(service).replace(/[^a-z0-9]+/g, "");
    return s.indexOf("aquatic") >= 0 || s.indexOf("swim") >= 0;
  }

  function minutesFromHm(hm) {
    var p = String(hm || "").match(/^(\d{1,2}):(\d{2})/);
    if (!p) return NaN;
    return parseInt(p[1], 10) * 60 + parseInt(p[2], 10);
  }

  function formatBandLabelFromMinutes(startMin, endMin) {
    function tok(m) {
      var h = Math.floor(m / 60);
      var mi = m % 60;
      if (mi === 0) return String(h);
      if (mi === 30) return h + ".30";
      if (mi === 15) return h + ".15";
      if (mi === 45) return h + ".45";
      return h + ":" + String(mi).padStart(2, "0");
    }
    return tok(startMin) + " to " + tok(endMin);
  }

  function aquaticHalfHourBands(timeSlot, day) {
    var raw = String(timeSlot || "").trim();
    if (!raw) return [];
    var b = parseTimeSlotBounds(raw, day);
    var lo = minutesFromHm(b.start);
    var hi = minutesFromHm(b.end);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo <= 30) return [raw];
    var out = [];
    for (var t = lo; t < hi; t += 30) {
      out.push(formatBandLabelFromMinutes(t, Math.min(t + 30, hi)));
    }
    return out;
  }

  function timeSlotNormMatchesOrWithin(rowSlot, wantSlot, day) {
    if (normSlotTime(rowSlot) === normSlotTime(wantSlot)) return true;
    if (!rowSlot || !wantSlot) return false;
    var rw = parseTimeSlotBounds(rowSlot, day);
    var ww = parseTimeSlotBounds(wantSlot, day);
    var rlo = minutesFromHm(rw.start);
    var rhi = minutesFromHm(rw.end);
    var wlo = minutesFromHm(ww.start);
    var whi = minutesFromHm(ww.end);
    if (!Number.isFinite(wlo) || !Number.isFinite(whi) || !Number.isFinite(rlo) || !Number.isFinite(rhi)) {
      return false;
    }
    return wlo >= rlo && whi <= rhi;
  }

  function slotInstructorsMatch(rowInstr, formInstr) {
    var want = String(formInstr || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!want) return true;
    return String(rowInstr || "").toLowerCase().replace(/\s+/g, " ").trim() === want;
  }

  function noClientRowInScope(row, p) {
    if (normSlotTime(row.time_slot) !== normSlotTime(p.time_slot)) return false;
    if (!slotInstructorsMatch(row.instructors, p.instructors)) return false;
    var sd = normIso(row.session_date);
    if (!sd) return p.scope === "weekday_term";
    if (p.scope === "single_day") return sd === p.anchorDate;
    if (p.scope === "pick_sessions") {
      var picked = Object.create(null);
      (p.selectedSessionDates || []).forEach(function (d) {
        picked[d] = true;
      });
      return !!picked[sd];
    }
    if (p.scope === "weekday_term") return true;
    return sd >= p.anchorDate;
  }

  function cancelNoClientRowsForScope(client, p) {
    return client
      .from("portal_roster_rows")
      .select("id, client_name, day, time_slot, instructors, session_date, status")
      .eq("status", "active")
      .eq("client_name", NO_CLIENT_PARTICIPANT)
      .eq("day", p.day)
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = (res.data || []).filter(function (row) {
          return noClientRowInScope(row, p);
        });
        if (!rows.length) return;
        return client
          .from("portal_roster_rows")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .in(
            "id",
            rows.map(function (r) {
              return r.id;
            }),
          );
      });
  }

  function supersedeTermRosterScheduleOverrides(client, p) {
    var dates = affectedDatesForPayload(p);
    if (!dates.length) return Promise.resolve();
    var timeNorm = normSlotTime(p.time_slot);
    var now = new Date().toISOString();
    return dates.reduce(function (acc, iso) {
      return acc.then(function () {
        return client
          .from("schedule_overrides")
          .select("id, payload, anchor_time_slot_label, session_date, status")
          .eq("session_date", iso)
          .eq("status", "active")
          .then(function (res) {
            if (res.error) throw res.error;
            var ids = (res.data || [])
              .filter(function (ov) {
                var pl = ov.payload || {};
                if (!pl.term_roster_edit) return false;
                return normSlotTime(ov.anchor_time_slot_label || pl.time_slot || "") === timeNorm;
              })
              .map(function (ov) {
                return ov.id;
              });
            if (!ids.length) return;
            return client
              .from("schedule_overrides")
              .update({ status: "superseded", superseded_at: now, updated_at: now })
              .in("id", ids);
          });
      });
    }, Promise.resolve());
  }

  function writeScheduleOverridesForTermEdit(client, p, before, afterSnap, eventAction) {
    var isCancel = eventAction === "cancel" || String(afterSnap.action || "") === "cancel_service";
    var isNoPax = String(afterSnap.action || "") === "no_participant";
    var isUpdate =
      !isCancel &&
      !isNoPax &&
      (eventAction === "update" || String(p.action || "").trim() === "update");
    if (isCancel || isNoPax) {
      return supersedeTermRosterScheduleOverrides(client, p).then(function () {
        return writeScheduleOverridesForTermEditInsert(client, p, before, afterSnap, eventAction);
      });
    }
    if (isUpdate) {
      return supersedeTermRosterScheduleOverrides(client, p).then(function () {
        return writeScheduleOverridesForTermUpdate(client, p, before, afterSnap);
      });
    }
    return Promise.resolve();
  }

  function writeScheduleOverridesForTermUpdate(client, p, before, afterSnap) {
    var dates = affectedDatesForPayload(p);
    if (!dates.length) return Promise.resolve();
    var paxName = String(p.client_name || "").trim();
    if (!paxName) return Promise.resolve();
    var times = parseTimeSlotBounds(p.time_slot, p.day);
    var staffTok = String(p.instructors || "")
      .split(/[,/&]|\band\b/i)[0]
      .trim();
    var prevTimes = before ? parseTimeSlotBounds(before.time_slot, p.day || before.day) : null;
    var rows = dates.map(function (iso) {
      return {
        session_date: iso,
        anchor_staff_id: rosterSlug(staffTok),
        anchor_start: times.start,
        anchor_end: times.end,
        anchor_venue: String(p.venue || "").trim(),
        anchor_client_id: rosterSlug(paxName),
        anchor_time_slot_label: String(p.time_slot || "").trim(),
        override_type: "slot_update",
        payload: {
          term_roster_edit: true,
          scope: p.scope,
          anchor_date: p.anchorDate,
          previous_time_slot: before ? String(before.time_slot || "").trim() : null,
          previous_start: prevTimes ? prevTimes.start : null,
          previous_end: prevTimes ? prevTimes.end : null,
          service: String(p.service || "").trim(),
          instructors: String(p.instructors || "").trim(),
          area: String(p.area || "").trim(),
        },
        reason: String(p.reason || "").trim() || "Term roster · slot updated",
        status: "active",
        superseded_by: null,
        spreadsheet_revision: "admin-dashboard:term_roster_edit",
      };
    });
    return client.from("schedule_overrides").insert(rows).then(function (res) {
      if (res.error) console.warn("[term-slot] schedule_overrides slot_update", res.error);
    });
  }

  function cancelFormerDefaultSlotWhenTimeChanged(client, p, before) {
    if (!before || !before.time_slot) return Promise.resolve();
    if (normSlotTime(before.time_slot) === normSlotTime(p.time_slot)) return Promise.resolve();
    var dates = affectedDatesForPayload(p);
    return dates.reduce(function (acc, iso) {
      return acc.then(function () {
        return ensureCancelledDated(client, before, iso, p.day || before.day);
      });
    }, Promise.resolve());
  }

  function writeScheduleOverridesForTermEditInsert(client, p, before, afterSnap, eventAction) {
    var isCancel = eventAction === "cancel" || String(afterSnap.action || "") === "cancel_service";
    var isNoPax = String(afterSnap.action || "") === "no_participant";
    var dates = affectedDatesForPayload(p);
    if (!dates.length) return Promise.resolve();
    var ovType = isNoPax ? "slot_clear_client" : "client_cancelled";
    var paxName = isNoPax
      ? String((before && before.client_name) || p.client_name || "").trim()
      : String(p.client_name || "").trim();
    if (!paxName) return Promise.resolve();
    var times = parseTimeSlotBounds(p.time_slot, p.day);
    var staffTok = String(p.instructors || "")
      .split(/[,/&]|\band\b/i)[0]
      .trim();
    var rows = dates.map(function (iso) {
      return {
        session_date: iso,
        anchor_staff_id: rosterSlug(staffTok),
        anchor_start: times.start,
        anchor_end: times.end,
        anchor_venue: String(p.venue || "").trim(),
        anchor_client_id: rosterSlug(paxName),
        anchor_time_slot_label: String(p.time_slot || "").trim(),
        override_type: ovType,
        payload: {
          cancelled_by_admin: true,
          term_roster_edit: true,
          scope: p.scope,
          anchor_date: p.anchorDate,
        },
        reason:
          String(p.reason || "").trim() ||
          (isNoPax ? "Term roster · no participant" : "Term roster · cancel service"),
        status: "active",
        superseded_by: null,
        spreadsheet_revision: "admin-dashboard:term_roster_edit",
      };
    });
    return client.from("schedule_overrides").insert(rows).then(function (res) {
      if (res.error) console.warn("[term-slot] schedule_overrides", res.error);
    });
  }

  function insertEvent(client, ev) {
    return client.from("portal_roster_row_events").insert([ev]);
  }

  function cancelTemplateRow(client, weekday, clientName, timeSlot) {
    return client
      .from("portal_roster_rows")
      .update({ status: "cancelled" })
      .eq("status", "active")
      .eq("day", weekday)
      .eq("client_name", clientName)
      .eq("time_slot", timeSlot)
      .is("session_date", null)
      .select("id");
  }

  function insertCancelledTemplateMarker(client, row) {
    var payload = {
      client_name: row.client_name,
      day: row.day,
      time_slot: row.time_slot,
      instructors: row.instructors || "",
      service: row.service || "",
      area: row.area || "",
      venue: row.venue || "",
      session_date: null,
      status: "cancelled",
    };
    return client.from("portal_roster_rows").insert([payload]).select("id").single();
  }

  function insertCancelledDatedMarker(client, row, sessionDate, weekday) {
    var payload = {
      client_name: row.client_name,
      day: weekday || row.day,
      time_slot: row.time_slot,
      instructors: row.instructors || "",
      service: row.service || "",
      area: row.area || "",
      venue: row.venue || "",
      session_date: sessionDate,
      status: "cancelled",
    };
    return client.from("portal_roster_rows").insert([payload]).select("id").single();
  }

  function ensureCancelledTemplate(client, row) {
    return cancelTemplateRow(client, row.day, row.client_name, row.time_slot).then(function (res) {
      if (res.error) throw res.error;
      if (res.data && res.data.length) return res.data[0];
      return insertCancelledTemplateMarker(client, row).then(function (ins) {
        if (ins.error) throw ins.error;
        return ins.data;
      });
    });
  }

  function ensureCancelledDated(client, row, sessionDate, weekday) {
    return client
      .from("portal_roster_rows")
      .update({ status: "cancelled" })
      .eq("status", "active")
      .eq("client_name", row.client_name)
      .eq("time_slot", row.time_slot)
      .eq("session_date", sessionDate)
      .select("id")
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.length) return res.data[0];
        return insertCancelledDatedMarker(client, row, sessionDate, weekday).then(function (ins) {
          if (ins.error) throw ins.error;
          return ins.data;
        });
      });
  }

  function upsertNoClientRow(client, row, sessionDate, weekday) {
    var payload = {
      client_name: "No client",
      day: weekday || row.day,
      time_slot: row.time_slot,
      instructors: row.instructors,
      service: row.service,
      area: row.area,
      venue: row.venue,
      session_date: sessionDate,
      status: "active",
    };
    var q = client
      .from("portal_roster_rows")
      .select("id")
      .eq("status", "active")
      .eq("client_name", "No client")
      .eq("time_slot", payload.time_slot)
      .eq("day", payload.day);
    if (sessionDate) q = q.eq("session_date", sessionDate);
    else q = q.is("session_date", null);
    return q.maybeSingle().then(function (res) {
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
    }).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  function cancelParticipantTermSlot(root) {
    if (state.saving) return;
    var client = deps.getClient();
    if (!client) {
      deps.toast("Sign in to Supabase first.");
      return;
    }
    var p = rowPayloadFromForm(root);
    var pickErr = validatePickSessionsScope(p);
    if (pickErr) {
      deps.toast(pickErr);
      return;
    }
    if (!p.anchorDate || !p.client_name || !p.time_slot || !p.day) {
      deps.toast("Anchor date, participante, and time slot are required.");
      return;
    }
    var bandErrC = validateAquaticHalfHourBand(p);
    if (bandErrC) {
      deps.toast(bandErrC);
      return;
    }
    if (/^no[\s_-]*client$/i.test(p.client_name) || /^no[\s_-]*participant$/i.test(p.client_name)) {
      deps.toast("Pick the participante to remove, not No client.");
      return;
    }
    if (typeof global.portalResolveParticipantCanonicalName === "function") {
      var canonC = global.portalResolveParticipantCanonicalName(p.client_name);
      if (canonC) p.client_name = canonC;
    }
    var bounds = deps.getTermBounds();
    var before = findBundleSlot(p.anchorDate, p.client_name, p.time_slot);
    var cancelRow = bundleCancelRow(p, p.anchorDate);
    var snap = snapshotRow(Object.assign({}, p, { time_slot: cancelRow.time_slot }));
    snap.action = "cancel_service";
    state.saving = true;
    render(root);
    var chain = Promise.resolve();
    if (p.scope === "pick_sessions") {
      var pickDates = affectedDatesForPayload(p);
      chain = pickDates.reduce(function (acc, iso) {
        return acc.then(function () {
          return ensureCancelledDated(client, bundleCancelRow(p, iso), iso, weekdayLongFromIso(iso) || p.day);
        });
      }, Promise.resolve());
    } else if (p.scope === "single_day") {
      chain = ensureCancelledDated(client, cancelRow, p.anchorDate, p.day);
    } else if (p.scope === "weekday_term") {
      chain = ensureCancelledTemplate(client, cancelRow).then(function () {
        return cancelDatedRowsForWeekday(client, cancelRow.day, cancelRow.client_name, cancelRow.time_slot, bounds.firstDate, bounds.lastDate);
      });
    } else {
      var dates = weekdaysMatchingFromThrough(p.day, p.anchorDate, bounds.lastDate, bounds);
      chain = cancelDatedRowsForWeekday(client, cancelRow.day, cancelRow.client_name, cancelRow.time_slot, p.anchorDate, bounds.lastDate)
        .then(function () {
          return dates.reduce(function (acc, iso) {
            return acc.then(function () {
              return ensureCancelledDated(client, bundleCancelRow(p, iso), iso, p.day);
            });
          }, Promise.resolve());
        });
    }
    finishTermSlotSave(chain, root, p, before, snap, "cancel", client, "Service cancelled — participante removed from roster.");
  }

  function applyNoParticipantTermSlot(root) {
    if (state.saving) return;
    var client = deps.getClient();
    if (!client) {
      deps.toast("Sign in to Supabase first.");
      return;
    }
    var p = rowPayloadFromForm(root);
    var pickErrN = validatePickSessionsScope(p);
    if (pickErrN) {
      deps.toast(pickErrN);
      return;
    }
    if (!p.anchorDate || !p.client_name || !p.time_slot || !p.day) {
      deps.toast("Anchor date, participante, and time slot are required.");
      return;
    }
    var bandErrN = validateAquaticHalfHourBand(p);
    if (bandErrN) {
      deps.toast(bandErrN);
      return;
    }
    if (typeof global.portalResolveParticipantCanonicalName === "function") {
      var canonN = global.portalResolveParticipantCanonicalName(p.client_name);
      if (canonN) p.client_name = canonN;
    }
    var bounds = deps.getTermBounds();
    var before = findBundleSlot(p.anchorDate, p.client_name, p.time_slot);
    var snap = snapshotRow(p);
    snap.action = "no_participant";
    snap.client_name = "No client";
    state.saving = true;
    render(root);
    var openRow = {
      client_name: p.client_name,
      day: p.day,
      time_slot: p.time_slot,
      instructors: p.instructors,
      service: p.service,
      area: p.area,
      venue: p.venue,
    };
    var chain = Promise.resolve();
    if (p.scope === "pick_sessions") {
      var pickDatesN = affectedDatesForPayload(p);
      chain = pickDatesN.reduce(function (acc, iso) {
        return acc.then(function () {
          var wd = weekdayLongFromIso(iso) || p.day;
          return ensureCancelledDated(client, openRow, iso, wd).then(function () {
            return upsertNoClientRow(client, openRow, iso, wd);
          });
        });
      }, Promise.resolve());
    } else if (p.scope === "single_day") {
      chain = ensureCancelledDated(client, openRow, p.anchorDate, p.day).then(function () {
        return upsertNoClientRow(client, openRow, p.anchorDate, p.day);
      });
    } else if (p.scope === "weekday_term") {
      chain = ensureCancelledTemplate(client, openRow).then(function () {
        return cancelDatedRowsForWeekday(client, p.day, p.client_name, p.time_slot, bounds.firstDate, bounds.lastDate);
      }).then(function () {
        return upsertNoClientRow(client, openRow, null, p.day);
      });
    } else {
      var dates = weekdaysMatchingFromThrough(p.day, p.anchorDate, bounds.lastDate, bounds);
      chain = dates.reduce(function (acc, iso) {
        return acc.then(function () {
          return ensureCancelledDated(client, openRow, iso, p.day).then(function () {
            return upsertNoClientRow(client, openRow, iso, p.day);
          });
        });
      }, Promise.resolve());
    }
    finishTermSlotSave(chain, root, p, before, snap, "update", client, "Slot set to No participant.");
  }

  function finishTermSlotSave(chain, root, p, before, afterSnap, eventAction, client, toastMsg) {
    chain
      .then(function (rowRef) {
        return writeScheduleOverridesForTermEdit(client, p, before, afterSnap, eventAction).then(function () {
          return rowRef;
        });
      })
      .then(function (rowRef) {
        return insertEvent(client, {
          roster_row_id: rowRef && rowRef.id ? rowRef.id : null,
          action: eventAction || (before ? "update" : "create"),
          scope: p.scope,
          anchor_session_date: p.anchorDate,
          before_snapshot: before || null,
          after_snapshot: afterSnap,
          client_context: {
            page: "admin_dashboard",
            module: "term_roster_edit",
            term_action: p.action,
            reason: p.reason || null,
          },
        }).then(function (res) {
          if (res.error) console.warn("[term-slot] portal_roster_row_events", res.error);
        }).then(function () {
          return rowRef;
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
        if (typeof global.portalNotifyAdminRosterDataChanged === "function") {
          global.portalNotifyAdminRosterDataChanged({ refreshScheduling: true });
        }
        deps.toast(toastMsg || "Term slot saved.");
        if (global.PortalChangeLog && typeof global.PortalChangeLog.record === "function") {
          var logAction = eventAction === "cancel" ? "cancel" : before ? "update" : "create";
          global.PortalChangeLog.record({
            area: "Timetable",
            entity: afterSnap.client_name || p.client_name,
            action: logAction,
            summary:
              (afterSnap.client_name || p.client_name) +
              " · " +
              p.time_slot +
              " · " +
              (p.action || "update").replace(/_/g, " ") +
              " · " +
              p.scope.replace(/_/g, " "),
            details: {
              session_date: p.anchorDate,
              scope: p.scope,
              selected_session_dates: p.selectedSessionDates || null,
              day: p.day,
              term_action: p.action,
              instructors: p.instructors,
              area: p.area,
              venue: p.venue,
              service: p.service,
              reason: p.reason || "",
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

  function saveTermSlot(root) {
    if (state.saving) return;
    var client = deps.getClient();
    if (!client) {
      deps.toast("Sign in to Supabase first.");
      return;
    }
    var p = rowPayloadFromForm(root);
    var action = p.action || "update";
    if (action === "cancel_service") {
      cancelParticipantTermSlot(root);
      return;
    }
    if (action === "no_participant") {
      applyNoParticipantTermSlot(root);
      return;
    }
    var pickErrU = validatePickSessionsScope(p);
    if (pickErrU) {
      deps.toast(pickErrU);
      return;
    }
    if (!p.anchorDate) {
      deps.toast("Anchor date is required.");
      return;
    }
    if (!p.client_name || !p.time_slot || !p.day) {
      if (p.client_name && !p.service) deps.toast("Select a service for this participante.");
      else if (p.client_name && p.service && !p.time_slot) deps.toast("No roster slot for that service on this date.");
      else deps.toast("Participante and time slot are required.");
      return;
    }
    if (/^no[\s_-]*client$/i.test(p.client_name)) {
      deps.toast('Use action "No participant" to open the slot without a client.');
      return;
    }
    var bandErrU = validateAquaticHalfHourBand(p);
    if (bandErrU) {
      deps.toast(bandErrU);
      return;
    }
    if (typeof global.portalResolveParticipantCanonicalName === "function") {
      var canon = global.portalResolveParticipantCanonicalName(p.client_name);
      if (canon) p.client_name = canon;
    }
    var bounds = deps.getTermBounds();
    state.saving = true;
    render(root);

    var before =
      findBundleSlotByParticipantService(p.anchorDate, p.client_name, p.service) ||
      findBundleSlot(p.anchorDate, p.client_name, p.time_slot);
    var afterSnap = snapshotRow(p);
    var chain = supersedeTermRosterScheduleOverrides(client, p).then(function () {
      return cancelNoClientRowsForScope(client, p);
    }).then(function () {
      return cancelFormerDefaultSlotWhenTimeChanged(client, p, before);
    });

    if (p.scope === "single_day") {
      chain = chain.then(function () {
        return upsertDatedRow(client, p, p.anchorDate, p.day);
      });
    } else if (p.scope === "pick_sessions") {
      var pickDatesU = affectedDatesForPayload(p);
      chain = chain.then(function () {
        return pickDatesU.reduce(function (acc, iso) {
          return acc.then(function () {
            return upsertDatedRow(client, p, iso, weekdayLongFromIso(iso) || p.day);
          });
        }, Promise.resolve());
      });
    } else if (p.scope === "weekday_term") {
      chain = chain
        .then(function () {
          return cancelDatedRowsForWeekday(client, p.day, p.client_name, p.time_slot, bounds.firstDate, bounds.lastDate);
        })
        .then(function () {
          return upsertTemplateRow(client, p);
        });
    } else {
      var dates = weekdaysMatchingFromThrough(p.day, p.anchorDate, bounds.lastDate, bounds);
      chain = chain.then(function () {
        return dates.reduce(function (acc, iso) {
          return acc.then(function () {
            return upsertDatedRow(client, p, iso, p.day);
          });
        }, Promise.resolve());
      });
    }

    finishTermSlotSave(chain, root, p, before, afterSnap, before ? "update" : "create", client, "Term slot saved.");
  }

  function injectStyleOnce() {
    if (document.getElementById("adminTermSlotStyle")) return;
    var css = [
      "body.admin-view-term-slot .admin-workspace{padding:14px 18px 32px;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}",
      "body.admin-view-term-slot .admin-term-slot-root{width:100%;max-width:none;min-width:0}",
      "body.admin-view-term-slot .trs-page{width:100%;max-width:none;min-width:0;margin:0}",
      ".trs-panel{width:100%;max-width:none;min-width:0;border:1px solid var(--line,#e2e8f0);border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.04);display:flex;flex-direction:column}",
      ".trs-panel--cancel{border-color:#fecaca}",
      ".trs-panel__head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 20px;padding:18px 22px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#f8fafc 0%,#fff 100%)}",
      ".trs-panel__title{min-width:0;flex:1 1 280px}",
      ".trs-panel__title h1{margin:0;font-size:22px;line-height:1.2;color:#0f172a;font-weight:800}",
      ".trs-panel__title p{margin:6px 0 0;font-size:13px;line-height:1.45;color:#64748b;max-width:56rem;overflow-wrap:break-word}",
      ".trs-panel__head-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:0 0 auto}",
      ".trs-panel__body{padding:18px 22px 20px;min-width:0}",
      ".trs-row{display:grid;gap:12px 16px;min-width:0}",
      ".trs-row + .trs-row{margin-top:14px;padding-top:14px;border-top:1px solid #eef2f7}",
      ".trs-row--identity,.trs-row--details{grid-template-columns:repeat(4,minmax(0,1fr))}",
      ".trs-row--control{grid-template-columns:minmax(0,1.05fr) minmax(0,1.35fr) minmax(0,1fr);align-items:start}",
      "@media(max-width:1100px){.trs-row--identity,.trs-row--details{grid-template-columns:repeat(2,minmax(0,1fr))}.trs-row--control{grid-template-columns:1fr}}",
      "@media(max-width:640px){.trs-row--identity,.trs-row--details,.trs-row--control{grid-template-columns:1fr}.trs-panel__head,.trs-panel__body,.trs-panel__foot{padding-left:14px;padding-right:14px}}",
      ".trs-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".trs-field label{font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#64748b}",
      ".trs-field input,.trs-field select{font:inherit;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a;min-width:0;width:100%;box-sizing:border-box}",
      ".trs-field input[readonly],.trs-field select:disabled,.trs-field input.trs-time-slot--readonly{background:#f8fafc;color:#475569}",
      ".trs-time-band-wrap{margin-top:8px;display:flex;flex-direction:column;gap:6px;min-width:0}",
      ".trs-time-band-wrap[hidden]{display:none!important}",
      ".trs-time-band-wrap .trs-control-label{margin:0}",
      ".trs-time-band-wrap .trs-pills{gap:6px}",
      ".trs-time-band-pill{font-size:12px;padding:8px 12px}",
      ".trs-field .participant-field-wrap{position:relative;min-width:0}",
      ".trs-field .portal-name-suggest{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;margin:0;padding:4px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);max-height:220px;overflow-y:auto}",
      ".trs-field .portal-name-suggest[hidden]{display:none!important}",
      ".trs-field .portal-name-suggest__item{display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:transparent;font:inherit;color:#0f172a;border-radius:8px;cursor:pointer;min-width:0;overflow-wrap:break-word}",
      ".trs-field .portal-name-suggest__item:hover,.trs-field .portal-name-suggest__item:focus{background:rgba(59,130,246,.1);outline:none}",
      ".trs-control-block{display:flex;flex-direction:column;gap:8px;min-width:0}",
      ".trs-control-label{font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#64748b}",
      ".trs-pills{display:flex;flex-wrap:wrap;gap:8px;min-width:0}",
      ".trs-pill{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;color:#0f172a;font-size:13px;font-weight:600;line-height:1.25;cursor:pointer;min-width:0;max-width:100%;overflow-wrap:break-word;transition:border-color .15s,background .15s,box-shadow .15s}",
      ".trs-pill:hover{border-color:#cbd5e1;background:#f8fafc}",
      ".trs-pill:has(input:checked){border-color:#3b82f6;background:#eff6ff;box-shadow:0 0 0 1px rgba(59,130,246,.15)}",
      ".trs-pill--warn:has(input:checked){border-color:#f87171;background:#fff1f2;box-shadow:0 0 0 1px rgba(248,113,113,.2)}",
      ".trs-pill input{margin:0;flex:0 0 auto}",
      ".trs-control-block--reason[hidden]{display:none!important}",
      ".trs-row--details[hidden]{display:none!important}",
      ".trs-row--sessions[hidden]{display:none!important}",
      ".trs-row--sessions{margin-top:14px;padding-top:14px;border-top:1px solid #eef2f7}",
      ".trs-control-block--sessions{grid-column:1/-1;min-width:0}",
      ".trs-session-hint{margin:0 0 10px;font-size:12px;line-height:1.45;color:#64748b;overflow-wrap:break-word}",
      ".trs-session-empty{margin:0;font-size:13px;color:#64748b}",
      ".trs-session-list{display:flex;flex-direction:column;gap:6px;max-height:min(280px,42vh);overflow-y:auto;padding:2px;min-width:0}",
      ".trs-session-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;min-width:0}",
      ".trs-session-item:hover{border-color:#cbd5e1;background:#f8fafc}",
      ".trs-session-item input{flex:0 0 auto;margin:0}",
      ".trs-session-item__main{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}",
      ".trs-session-item__date{font-size:13px;font-weight:700;color:#0f172a;min-width:0;overflow-wrap:break-word}",
      ".trs-session-item__slot{font-size:12px;color:#64748b;min-width:0;overflow-wrap:break-word}",
      ".trs-session-item__status{flex:0 0 auto;font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;padding:4px 8px;border-radius:999px;white-space:nowrap}",
      ".trs-session-item__status--cancel{background:#fff1f2;color:#be123c}",
      ".trs-session-item__status--attend{background:#ecfdf5;color:#047857}",
      ".trs-session-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
      ".btn--xs{padding:6px 10px;font-size:12px;line-height:1.2}",
      ".trs-panel__foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:14px 22px;border-top:1px solid #e2e8f0;background:#f8fafc}",
      ".trs-foot-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".trs-msg{min-width:0;flex:1 1 220px;font-size:13px;color:#64748b;margin:0;overflow-wrap:break-word;text-align:right}",
      "@media(max-width:640px){.trs-msg{text-align:left}}",
    ].join("\n");
    var st = document.createElement("style");
    st.id = "adminTermSlotStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function wireTermSlotAutofill(root) {
    if (!root || typeof global.portalWireFieldSuggest !== "function") return;
    var wire = global.portalWireFieldSuggest;

    function onParticipantChange() {
      refreshTermSlotAutofill(root);
    }

    wire(root.querySelector("#trsClient"), root.querySelector("#trsClientSuggest"), {
      kind: "participant",
      strict: true,
      match: "contains",
      onPick: onParticipantChange,
    });
    var clientEl = root.querySelector("#trsClient");
    if (clientEl) {
      var trsClientTimer = null;
      clientEl.addEventListener("input", function () {
        clearTimeout(trsClientTimer);
        trsClientTimer = setTimeout(onParticipantChange, 300);
      });
      clientEl.addEventListener("change", onParticipantChange);
    }
    var svcEl = root.querySelector("#trsService");
    if (svcEl) {
      svcEl.addEventListener("change", function () {
        refreshTermSlotAutofill(root);
      });
    }
    wire(root.querySelector("#trsInstructors"), root.querySelector("#trsInstructorsSuggest"), {
      kind: "instructor",
      strict: false,
      match: "contains",
    });
    wire(root.querySelector("#trsVenue"), root.querySelector("#trsVenueSuggest"), {
      kind: "venue",
      strict: false,
      match: "contains",
    });
  }

  function syncTermSlotActionUi(root) {
    if (!root) return;
    var action = formAction(root);
    var panel = root.querySelector("#trsPanel");
    var reasonBlock = root.querySelector("#trsReasonBlock");
    var detailsRow = root.querySelector("#trsDetailsRow");
    var isCancel = action === "cancel_service";
    var isNoPart = action === "no_participant";
    if (panel) panel.classList.toggle("trs-panel--cancel", isCancel);
    if (reasonBlock) reasonBlock.hidden = action === "update";
    if (detailsRow) detailsRow.hidden = isCancel;
    var saveBtn = root.querySelector("#trsSave");
    if (saveBtn && !state.saving) {
      if (isCancel) saveBtn.textContent = "Cancel service";
      else if (isNoPart) saveBtn.textContent = "Set No participant";
      else saveBtn.textContent = "Save term slot";
    }
    refreshTermSlotSessionPicker(root);
  }

  function render(root) {
    if (!root) return;
    var bounds = deps.getTermBounds();
    var pre = state.prefill || {};
    var anchor = normIso(pre.anchorDate) || normIso(new Date().toISOString().slice(0, 10));
    var weekday = weekdayLongFromIso(anchor);
    var preAction = String(pre.action || "update");
    var preScope = String(pre.scope || "single_day");

    root.innerHTML =
      '<div class="trs-page">' +
      '<div class="trs-panel card card--premium" id="trsPanel">' +
      '<div class="trs-panel__head">' +
      '<div class="trs-panel__title">' +
      "<h1>Edit term slot</h1>" +
      "<p>Pick <strong>participante</strong> then <strong>service</strong>. Use <strong>Selected sessions</strong> to cancel some future dates and keep others attending.</p>" +
      "</div>" +
      '<div class="trs-panel__head-actions">' +
      '<button type="button" class="btn btn--sec" id="trsLoadBundle">Reload from roster</button>' +
      "</div>" +
      "</div>" +
      '<div class="trs-panel__body">' +
      '<div class="trs-row trs-row--identity">' +
      '<div class="trs-field"><label for="trsAnchorDate">Anchor date</label><input type="date" id="trsAnchorDate" value="' + esc(anchor) + '"/></div>' +
      '<div class="trs-field"><label>Weekday</label><input type="text" id="trsWeekday" readonly value="' + esc(weekday) + '"/></div>' +
      '<div class="trs-field"><label for="trsClient">Participante</label><div class="participant-field-wrap"><input type="text" id="trsClient" value="' + esc(pre.client_name || "") + '" placeholder="Start typing name…" autocomplete="off"/><div id="trsClientSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Participantes"></div></div></div>' +
      '<div class="trs-field"><label for="trsService">Service</label><select id="trsService"><option value="">Pick participante first</option></select></div>' +
      "</div>" +
      '<div class="trs-row trs-row--details" id="trsDetailsRow">' +
      '<div class="trs-field trs-field--time"><label for="trsTimeSlot">Time slot</label><input type="text" id="trsTimeSlot" value="' + esc(pre.time_slot || "") + '" placeholder="Auto from roster"/><div class="trs-time-band-wrap" id="trsTimeSlotPickWrap" hidden><span class="trs-control-label">30-minute band (Aquatic)</span><div class="trs-pills" id="trsTimeSlotOptions"></div></div></div>' +
      '<div class="trs-field"><label for="trsInstructors">Instructor(s)</label><div class="participant-field-wrap"><input type="text" id="trsInstructors" value="' + esc(pre.instructors || "") + '" placeholder="Auto from roster" autocomplete="off"/><div id="trsInstructorsSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Instructors"></div></div></div>' +
      '<div class="trs-field"><label for="trsVenue">Venue</label><div class="participant-field-wrap"><input type="text" id="trsVenue" value="' + esc(pre.venue || "") + '" placeholder="Auto from roster" autocomplete="off"/><div id="trsVenueSuggest" class="portal-name-suggest" role="listbox" hidden aria-label="Venues"></div></div></div>' +
      '<div class="trs-field"><label for="trsArea">Pool / area</label><input type="text" id="trsArea" value="' + esc(pre.area || "") + '" placeholder="Auto from roster"/></div>' +
      "</div>" +
      '<div class="trs-row trs-row--sessions" id="trsSessionPickerBlock" hidden>' +
      '<div class="trs-control-block trs-control-block--sessions">' +
      '<span class="trs-control-label">Sessions in term <span id="trsSessionPickerMeta"></span></span>' +
      '<p class="trs-session-hint">Checked = cancel / no participant that day. Unchecked = participante still attending that session.</p>' +
      '<div id="trsSessionPicker"></div>' +
      "</div></div>" +
      '<div class="trs-row trs-row--control" id="trsControlRow">' +
      '<div class="trs-control-block" id="trsActionBox" role="group" aria-labelledby="trsActionLegend">' +
      '<span class="trs-control-label" id="trsActionLegend">Action</span>' +
      '<div class="trs-pills">' +
      '<label class="trs-pill" title="Change time, instructor, service, venue…"><input type="radio" name="trsAction" value="update"' + (preAction === "update" ? " checked" : "") + '/> Update slot</label>' +
      '<label class="trs-pill trs-pill--warn" title="Remove this participante from the roster (left the term)"><input type="radio" name="trsAction" value="cancel_service"' + (preAction === "cancel_service" ? " checked" : "") + '/> Cancel service</label>' +
      '<label class="trs-pill" title="Keep the staff slot open with no client booked"><input type="radio" name="trsAction" value="no_participant"' + (preAction === "no_participant" ? " checked" : "") + '/> No participant</label>' +
      "</div></div>" +
      '<div class="trs-control-block" role="group" aria-labelledby="trsScopeLegend">' +
      '<span class="trs-control-label" id="trsScopeLegend">Apply to</span>' +
      '<div class="trs-pills trs-pills--scope">' +
      '<label class="trs-pill" title="One dated exception on the anchor date"><input type="radio" name="trsScope" value="single_day"' + (preScope === "single_day" ? " checked" : "") + '/> This day only</label>' +
      '<label class="trs-pill" title="Updates the weekly template for all matching weekdays in the term"><input type="radio" name="trsScope" value="weekday_term"' + (preScope === "weekday_term" ? " checked" : "") + '/> Every <span id="trsScopeWeekdayLabel">' + esc(weekday || "weekday") + '</span> until end of term</label>' +
      '<label class="trs-pill" title="Same weekday from the anchor date through term end"><input type="radio" name="trsScope" value="rest_of_term"' + (preScope === "rest_of_term" ? " checked" : "") + '/> Rest of term (from anchor)</label>' +
      '<label class="trs-pill" title="Pick individual session dates in the term"><input type="radio" name="trsScope" value="pick_sessions"' + (preScope === "pick_sessions" ? " checked" : "") + '/> Selected sessions</label>' +
      "</div></div>" +
      '<div class="trs-control-block trs-control-block--reason" id="trsReasonBlock">' +
      '<label class="trs-control-label" for="trsReason">Reason</label>' +
      '<input type="text" id="trsReason" value="' + esc(pre.reason || "") + '" placeholder="e.g. Cancelled summer term"/>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="trs-panel__foot">' +
      '<div class="trs-foot-actions">' +
      '<button type="button" class="btn btn--pri" id="trsSave"' + (state.saving ? " disabled" : "") + ">" + (state.saving ? "Saving…" : "Save term slot") + "</button>" +
      '<button type="button" class="btn btn--ghost" data-view-target="scheduling">Schedule &amp; Covers</button>' +
      "</div>" +
      '<p class="trs-msg" id="trsMsg">' + (state.saving ? "Saving…" : "") + "</p>" +
      "</div>" +
      "</div></div>";

    var anchorEl = root.querySelector("#trsAnchorDate");
    var wdEl = root.querySelector("#trsWeekday");
    if (anchorEl && wdEl) {
      anchorEl.addEventListener("change", function () {
        wdEl.value = weekdayLongFromIso(normIso(anchorEl.value));
        var scopeWd = root.querySelector("#trsScopeWeekdayLabel");
        if (scopeWd) scopeWd.textContent = wdEl.value;
        refreshTermSlotAutofill(root);
      });
    }
    root.querySelectorAll('input[name="trsAction"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        syncTermSlotActionUi(root);
      });
    });
    root.querySelectorAll('input[name="trsScope"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        refreshTermSlotSessionPicker(root);
      });
    });
    syncTermSlotActionUi(root);
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
    if (pre.client_name || pre.service) {
      var svcEl0 = root.querySelector("#trsService");
      if (svcEl0 && pre.service) {
        rebuildTermSlotServiceSelect(root, pre.client_name || "", pre.service, anchor);
      }
      refreshTermSlotAutofill(root);
      if (pre.time_slot) {
        var slotPre = findBundleSlotByParticipantService(anchor, pre.client_name || "", pre.service || (svcEl0 && svcEl0.value) || "");
        if (slotPre) applyBundleSlotToForm(root, slotPre, { timeSlot: pre.time_slot });
        else setFormField(root, "#trsTimeSlot", pre.time_slot);
      }
    }
    refreshTermSlotSessionPicker(root);
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
