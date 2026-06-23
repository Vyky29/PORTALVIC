/**
 * Participants sheet: My roster only; optional "New participants" from schedule overrides
 * (make-up / replace) and live portal_roster_rows (term intake / trial).
 */
(function (global) {
  const REPLACE_TYPES = new Set(["client_replace_in_slot", "replace_participant"]);

  function normKey(v) {
    if (typeof global.portalNormKeyStr === "function") {
      return global.portalNormKeyStr(v);
    }
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normIso(v) {
    if (typeof global.normaliseIsoDate === "function") {
      return global.normaliseIsoDate(v);
    }
    return String(v || "").trim().slice(0, 10);
  }

  function pseudoIds(ctx) {
    const p = ctx && ctx.pseudoIds;
    return Array.isArray(p) ? p : ["closed", "available"];
  }

  function isPseudo(cid, ctx) {
    return !cid || pseudoIds(ctx).includes(cid);
  }

  function rowsAll(ctx) {
    if (ctx && typeof ctx.scheduleOverrideRowsAll === "function") {
      return ctx.scheduleOverrideRowsAll();
    }
    return Array.isArray(global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__)
      ? global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__
      : [];
  }

  function rowApplies(row, ctx) {
    if (ctx && typeof ctx.rowAppliesToStaff === "function") {
      return ctx.rowAppliesToStaff(row);
    }
    if (typeof global.portalScheduleOverrideRowAppliesToLoggedInStaff === "function") {
      return global.portalScheduleOverrideRowAppliesToLoggedInStaff(row);
    }
    return false;
  }

  function replacementClientId(payload, ctx) {
    if (ctx && typeof ctx.replacementClientId === "function") {
      return ctx.replacementClientId(payload);
    }
    if (typeof global.portalOverrideReplacementClientId === "function") {
      return global.portalOverrideReplacementClientId(payload);
    }
    return "";
  }

  function parsePayload(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_) {
      return null;
    }
  }

  function isNoClientName(name) {
    const n = String(name || "").trim().toLowerCase();
    return !n || n === "no client" || n === "noclient" || n === "no_client";
  }

  function clientSlugFromName(name) {
    return normKey(name);
  }

  function rosterRowsCache() {
    return Array.isArray(global.PORTAL_ROSTER_ROWS_CACHE) ? global.PORTAL_ROSTER_ROWS_CACHE : [];
  }

  function rosterRowAppliesToStaff(row, staffId) {
    const sid = normKey(staffId);
    if (!sid || !row) return false;
    const raw = String(row.instructors || "");
    const parts = raw.split(/[,/&]|\band\b/gi);
    for (let i = 0; i < parts.length; i++) {
      if (normKey(parts[i]) === sid) return true;
    }
    return normKey(raw) === sid;
  }

  function machineRosterClientSlugsForStaff(staffId) {
    const sid = normKey(staffId);
    const machine = Array.isArray(global.__STAFF_DASHBOARD_MACHINE_ROWS__)
      ? global.__STAFF_DASHBOARD_MACHINE_ROWS__
      : [];
    const out = new Set();
    machine.forEach(function (r) {
      if (!r || isNoClientName(r.client_name)) return;
      const inst = String(r.instructors || "").split(/[,/&]|\band\b/gi)[0];
      if (normKey(inst) !== sid) return;
      out.add(clientSlugFromName(r.client_name));
    });
    return out;
  }

  function termResumeIso() {
    const t = global.PORTAL_TERM_FROM_TIMETABLE;
    return normIso(t && (t.termResumeDate || t.termDashboardCalendarFrom)) || "2026-06-01";
  }

  function weekdayLongFromIso(iso) {
    const key = normIso(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
    try {
      return new Date(key + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
    } catch (_) {
      return "";
    }
  }

  function firstWeekdayOnOrAfterIso(weekdayLong, fromIso) {
    const want = String(weekdayLong || "").trim();
    const start = normIso(fromIso);
    if (!want || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";
    try {
      const cur = new Date(start + "T12:00:00");
      for (let i = 0; i < 14; i++) {
        const iso = normIso(
          cur.getFullYear() +
            "-" +
            String(cur.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(cur.getDate()).padStart(2, "0")
        );
        if (weekdayLongFromIso(iso) === want) return iso;
        cur.setDate(cur.getDate() + 1);
      }
    } catch (_) {}
    return "";
  }

  function buildPortalRosterFirstSessionMap(ctx) {
    ctx = ctx || buildContext();
    const staffId = ctx.staffId;
    const map = Object.create(null);
    const templates = Object.create(null);

    rosterRowsCache().forEach(function (row) {
      if (String(row.status || "active") !== "active") return;
      if (!rosterRowAppliesToStaff(row, staffId)) return;
      if (isNoClientName(row.client_name)) return;
      const slug = clientSlugFromName(row.client_name);
      const iso = normIso(row.session_date);
      if (iso) {
        if (!map[slug] || iso < map[slug]) map[slug] = iso;
      } else if (row.day) {
        templates[slug] = String(row.day || "").trim();
      }
    });

    Object.keys(templates).forEach(function (slug) {
      if (map[slug]) return;
      const first = firstWeekdayOnOrAfterIso(templates[slug], termResumeIso());
      if (first) map[slug] = first;
    });

    return map;
  }

  function clientFirstSessionDateIso(clientKey, ctx) {
    const k = normKey(clientKey);
    if (!k) return "";
    const t = global.PORTAL_TERM_FROM_TIMETABLE;
    const staticMap = t && t.termClientFirstSessionDate;
    if (staticMap && typeof staticMap === "object") {
      if (staticMap[k]) return normIso(staticMap[k]);
      for (const key of Object.keys(staticMap)) {
        if (normKey(key) === k) return normIso(staticMap[key]);
      }
    }
    const startMap =
      global.STAFF_DASHBOARD_SOURCE &&
      global.STAFF_DASHBOARD_SOURCE.clientRosterStartDates;
    if (startMap && typeof startMap === "object") {
      for (const key of Object.keys(startMap)) {
        if (normKey(key) === k) return normIso(startMap[key]);
      }
    }
    return normIso(buildPortalRosterFirstSessionMap(ctx)[k]) || "";
  }

  function overridePayload(row) {
    return parsePayload(row && row.payload);
  }

  function overrideScopeIsTerm(pl) {
    const s = String((pl && pl.scope) || "").trim();
    return s === "rest_of_term" || s === "weekday_term";
  }

  function overridePayloadScope(pl) {
    return String((pl && pl.scope) || "").trim();
  }

  /** Synthetic row emitted by collapseScheduleOverrideRowsForAttention (one card per staff/day). */
  function overrideIsRosterDayGroupRow(row) {
    const pl = overridePayload(row);
    return !!(pl && (pl._portal_roster_day_group || pl._portal_new_shift_day_group));
  }

  /** slot_update rows that collapse to a single day card (excludes term-intake halo). */
  function overrideIsRosterDayGroupableSlotUpdate(row) {
    const t = String(row && row.override_type || "").trim();
    if (t !== "slot_update") return false;
    if (overrideIsTermNewParticipant(row)) return false;
    return true;
  }

  /** One-off / picked dates: “New shift” title on the grouped day card. */
  function overrideIsNewShiftDayUpdate(row) {
    const pl = overridePayload(row);
    if (pl && pl._portal_roster_day_group) return !!pl._portal_roster_day_has_new_shift;
    const t = String(row && row.override_type || "").trim();
    if (t !== "slot_update") return false;
    if (!pl) return false;
    if (pl._portal_new_shift_day_group) return true;
    const scope = overridePayloadScope(pl);
    if (scope === "rest_of_term" || scope === "weekday_term") return false;
    if (scope === "single_day" || scope === "pick_sessions") return true;
    if (pl.term_roster_edit && normIso(row && row.session_date)) return true;
    return false;
  }

  function overrideRosterDayGroupIsNewShift(row) {
    return overrideIsNewShiftDayUpdate(row);
  }

  function overrideSlotAttentionKey(row) {
    const iso = normIso(row && row.session_date);
    const staff = normKey(row && row.anchor_staff_id);
    const start = String(row && row.anchor_start != null ? row.anchor_start : "");
    const end = String(row && row.anchor_end != null ? row.anchor_end : "");
    const venue = normKey(row && row.anchor_venue);
    return [iso, staff, start, end, venue].join("|");
  }

  function overrideSlotAttentionScore(row) {
    let score = 0;
    if (String(row && row.anchor_client_id || "").trim()) score += 2;
    const pl = overridePayload(row);
    if (pl && String(pl.to_client_name || "").trim()) score += 2;
    if (pl && pl.term_roster_edit) score += 1;
    return score;
  }

  function overrideRosterDayGroupKey(row) {
    if (!overrideIsRosterDayGroupableSlotUpdate(row) && !overrideIsRosterDayGroupRow(row)) return "";
    const staff = normKey(row && row.anchor_staff_id);
    const iso = normIso(row && row.session_date);
    const venue = normKey(row && row.anchor_venue);
    if (!staff || !iso) return "";
    return "roster-day|" + staff + "|" + iso + "|" + venue;
  }

  function overrideNewShiftDayGroupKey(row) {
    return overrideRosterDayGroupKey(row);
  }

  /** Term intake: one halo / quick-menu line for the whole term — not every calendar day. */
  function overrideIsTermNewParticipant(row) {
    const t = String(row && row.override_type || "").trim();
    const pl = overridePayload(row);
    if (!pl) return false;
    if (pl.term_new_participant === true) {
      const scope = overridePayloadScope(pl);
      if (scope === "single_day" || scope === "pick_sessions") return false;
      return true;
    }
    if (t === "slot_update" && pl.term_roster_edit && overrideScopeIsTerm(pl)) return true;
    return false;
  }

  function overrideIsTrialSession(row) {
    const pl = overridePayload(row);
    if (!pl) return false;
    const scope = String(pl.scope || "").trim();
    return scope === "single_day" || scope === "pick_sessions";
  }

  function overrideTermIntakeClientSlug(row) {
    const pl = overridePayload(row);
    if (pl && pl.to_client_id) return normKey(pl.to_client_id);
    if (pl && pl.replacement_client_id) return normKey(pl.replacement_client_id);
    if (pl && pl.moved_client_id) return normKey(pl.moved_client_id);
    return normKey(row && row.anchor_client_id);
  }

  function overrideTermIntakeGroupKey(row) {
    if (!overrideIsTermNewParticipant(row)) return "";
    const staff = normKey(row && row.anchor_staff_id);
    const client = overrideTermIntakeClientSlug(row);
    const slot = normKey(row && row.anchor_time_slot_label);
    return "term-intake|" + staff + "|" + client + "|" + slot;
  }

  function overrideShouldShowOnCalendarDate(row, iso) {
    if (!overrideIsTermNewParticipant(row)) return true;
    const first = clientFirstSessionDateIso(
      overrideTermIntakeClientSlug(row),
      buildContext()
    );
    const key = normIso(iso);
    if (first && key) return key === first;
    return normIso(row && row.session_date) === key;
  }

  function scheduleOverrideAttentionDismissKey(row) {
    const rosterGk = overrideRosterDayGroupKey(row);
    if (rosterGk && (overrideIsRosterDayGroupRow(row) || overrideIsRosterDayGroupableSlotUpdate(row))) {
      return "roster-day:" + rosterGk.replace(/\|/g, ":");
    }
    const gk = overrideTermIntakeGroupKey(row);
    if (gk) return "term-intake:" + gk.replace(/\|/g, ":");
    return "";
  }

  function collapseScheduleOverrideRowsForAttention(rows, ctx) {
    ctx = ctx || buildContext();
    const keep = [];
    const termGroups = Object.create(null);
    const rosterDayGroups = Object.create(null);

    (rows || []).forEach(function (row) {
      if (!rowApplies(row, ctx)) return;
      if (overrideIsRosterDayGroupableSlotUpdate(row)) {
        const gk = overrideRosterDayGroupKey(row);
        if (!gk) {
          keep.push(row);
          return;
        }
        const iso = normIso(row.session_date);
        const prev = rosterDayGroups[gk];
        if (!prev) {
          rosterDayGroups[gk] = {
            row: row,
            iso: iso,
            count: 1,
            hasNewShift: overrideIsNewShiftDayUpdate(row),
            rows: [row],
          };
        } else {
          prev.count += 1;
          prev.rows.push(row);
          if (overrideIsNewShiftDayUpdate(row)) prev.hasNewShift = true;
          if (iso && (!prev.iso || iso < prev.iso)) prev.iso = iso;
        }
        return;
      }
      if (!overrideIsTermNewParticipant(row)) {
        keep.push(row);
        return;
      }
      const gk = overrideTermIntakeGroupKey(row);
      if (!gk) {
        keep.push(row);
        return;
      }
      const iso = normIso(row.session_date);
      if (!termGroups[gk] || (iso && (!termGroups[gk].iso || iso < termGroups[gk].iso))) {
        termGroups[gk] = { row: row, iso: iso };
      }
    });

    Object.keys(rosterDayGroups).forEach(function (gk) {
      const pack = rosterDayGroups[gk];
      const src = pack.row;
      const pl = overridePayload(src) || {};
      var shiftSlotLabel = "";
      if (typeof global.portalStaffPayrollShiftBandLabel === "function") {
        shiftSlotLabel = global.portalStaffPayrollShiftBandLabel(
          src && src.anchor_staff_id,
          pack.iso || normIso(src.session_date),
          src && src.anchor_venue
        );
      }
      if (!shiftSlotLabel && typeof global.portalStaffShiftSlotLabelFromRows === "function") {
        shiftSlotLabel = global.portalStaffShiftSlotLabelFromRows(pack.rows || [src], pack.iso || normIso(src.session_date));
      }
      keep.push(
        Object.assign({}, src, {
          payload: Object.assign({}, pl, {
            _portal_roster_day_group: true,
            _portal_roster_day_has_new_shift: !!pack.hasNewShift,
            _portal_roster_day_participant_count: pack.count,
            _portal_new_shift_day_group: !!pack.hasNewShift,
            _portal_new_shift_participant_count: pack.count,
            _portal_shift_slot_label: shiftSlotLabel || undefined,
          }),
        })
      );
    });

    Object.keys(termGroups).forEach(function (gk) {
      keep.push(termGroups[gk].row);
    });

    return keep;
  }

  function collectNewParticipantsFromPortalRoster(ctx) {
    ctx = ctx || buildContext();
    const staffId = ctx.staffId;
    const machineSlugs = machineRosterClientSlugsForStaff(staffId);
    const bySlug = Object.create(null);

    rosterRowsCache().forEach(function (row) {
      if (String(row.status || "active") !== "active") return;
      if (!rosterRowAppliesToStaff(row, staffId)) return;
      if (isNoClientName(row.client_name)) return;
      const slug = clientSlugFromName(row.client_name);
      if (!slug || machineSlugs.has(slug)) return;
      if (!bySlug[slug]) {
        bySlug[slug] = {
          slug: slug,
          name: String(row.client_name || "").trim(),
          dates: [],
          hasTemplate: false,
        };
      }
      const iso = normIso(row.session_date);
      if (iso) bySlug[slug].dates.push(iso);
      else bySlug[slug].hasTemplate = true;
    });

    const scheduleByClientId = Object.create(null);
    const ids = [];

    Object.keys(bySlug).forEach(function (slug) {
      const pack = bySlug[slug];
      let iso = "";
      if (pack.dates.length === 1) {
        iso = pack.dates[0];
      } else if (pack.dates.length > 1 || pack.hasTemplate) {
        pack.dates.sort();
        iso = pack.dates[0] || clientFirstSessionDateIso(slug, ctx);
      }
      if (!iso && pack.hasTemplate) {
        iso = clientFirstSessionDateIso(slug, ctx);
      }
      if (!iso) return;
      ids.push(slug);
      scheduleByClientId[slug] = iso;
    });

    return { ids: ids, scheduleByClientId: scheduleByClientId, namesBySlug: bySlug };
  }

  function isMakeUpDashboardRow(item) {
    if (!item || String(item.kind || "") !== "client") return false;
    if (item.portalOverrideMakeUpTag) return true;
    const ov = item.__portalScheduleOverride;
    if (!ov) return false;
    return REPLACE_TYPES.has(String(ov.override_type || "").trim());
  }

  function buildContext() {
    return {
      staffId: String(global.STAFF_DASHBOARD_ID || "").trim().toLowerCase(),
      sessionsModel: Array.isArray(global.sessionsModel) ? global.sessionsModel : [],
      clientNotesById:
        global.clientNotesById && typeof global.clientNotesById === "object"
          ? global.clientNotesById
          : {},
      dashboardData: global.dashboardData || {},
      pseudoIds: global.CLIENT_LIST_PSEUDO_IDS,
      scheduleOverrideRowsAll:
        typeof global.portalScheduleOverrideRowsAll === "function"
          ? global.portalScheduleOverrideRowsAll
          : null,
      rowAppliesToStaff:
        typeof global.portalScheduleOverrideRowAppliesToLoggedInStaff === "function"
          ? global.portalScheduleOverrideRowAppliesToLoggedInStaff
          : null,
      replacementClientId:
        typeof global.portalOverrideReplacementClientId === "function"
          ? global.portalOverrideReplacementClientId
          : null,
    };
  }

  /**
   * @returns {{ ids: string[], scheduleByClientId: Record<string, string> }}
   */
  function collectNewParticipantIds(ctx) {
    ctx = ctx || buildContext();
    const scheduleByClientId = Object.create(null);
    const seen = new Set();
    const ids = [];

    function add(cid, iso) {
      const id = String(cid || "").trim().toLowerCase();
      if (isPseudo(id, ctx) || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
      const day = normIso(iso);
      if (day && (!scheduleByClientId[id] || day < scheduleByClientId[id])) {
        scheduleByClientId[id] = day;
      }
    }

    rowsAll(ctx).forEach(function (row) {
      if (!rowApplies(row, ctx)) return;
      const t = String(row.override_type || "").trim();
      if (REPLACE_TYPES.has(t)) {
        const pl = parsePayload(row.payload);
        const cid = replacementClientId(pl, ctx);
        if (cid) add(cid, row.session_date);
        return;
      }
      if (overrideIsRosterDayGroupRow(row) || overrideIsNewShiftDayUpdate(row)) return;
      if (overrideIsTermNewParticipant(row)) {
        const cid = overrideTermIntakeClientSlug(row);
        if (cid) add(cid, clientFirstSessionDateIso(cid, ctx) || row.session_date);
        return;
      }
    });

    const rosterPack = collectNewParticipantsFromPortalRoster(ctx);
    rosterPack.ids.forEach(function (slug) {
      add(slug, rosterPack.scheduleByClientId[slug]);
    });

    function scanDayList(list) {
      (list || []).forEach(function (item) {
        if (!isMakeUpDashboardRow(item)) return;
        const cid = String(item.clientId || "").trim().toLowerCase();
        if (!cid) return;
        const sk = String(item.sessionKey || "");
        const isoFromKey = /^\d{4}-\d{2}-\d{2}/.test(sk) ? sk.slice(0, 10) : "";
        add(cid, isoFromKey);
      });
    }

    scanDayList(ctx.dashboardData && ctx.dashboardData.today);
    scanDayList(ctx.dashboardData && ctx.dashboardData.tomorrow);

    ids.sort(function (a, b) {
      const na =
        (ctx.clientNotesById[a] && ctx.clientNotesById[a].name) || a;
      const nb =
        (ctx.clientNotesById[b] && ctx.clientNotesById[b].name) || b;
      return na.localeCompare(nb, "en");
    });

    return { ids: ids, scheduleByClientId: scheduleByClientId };
  }

  function formatScheduleLabel(iso, opts) {
    opts = opts || {};
    const key = normIso(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
    if (opts.termOnly) return "For the term";
    try {
      const d = new Date(key + "T12:00:00");
      if (isNaN(d.getTime())) return key;
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch (_) {
      return key;
    }
  }

  /** Staff dashboards only: My + optional New. Lead/admin/CEO: All participants (no New tab). */
  function participantsSheetStaffOnly() {
    if (typeof global.portalParticipantsSheetStaffOnly === "boolean") {
      return global.portalParticipantsSheetStaffOnly;
    }
    return true;
  }

  function applyTabVisibility() {
    const allBtn = global.document && global.document.getElementById("clientsTabAll");
    const newBtn = global.document && global.document.getElementById("clientsTabNew");
    const pack = collectNewParticipantIds(buildContext());
    const hasNew = pack.ids.length > 0;
    const staffOnly = participantsSheetStaffOnly();

    if (allBtn) {
      if (staffOnly) {
        allBtn.hidden = true;
        allBtn.setAttribute("aria-hidden", "true");
        allBtn.classList.remove("is-active");
        allBtn.setAttribute("aria-selected", "false");
      } else {
        allBtn.hidden = false;
        allBtn.setAttribute("aria-hidden", "false");
      }
    }

    if (newBtn) {
      const wasActive = newBtn.classList.contains("is-active");
      if (staffOnly) {
        newBtn.hidden = !hasNew;
        newBtn.setAttribute("aria-hidden", hasNew ? "false" : "true");
        if (!hasNew) {
          newBtn.classList.remove("is-active");
          newBtn.setAttribute("aria-selected", "false");
          if (wasActive && typeof global.setClientsSheetTab === "function") {
            global.setClientsSheetTab("my");
          }
        }
      } else {
        newBtn.hidden = true;
        newBtn.setAttribute("aria-hidden", "true");
        newBtn.classList.remove("is-active");
        newBtn.setAttribute("aria-selected", "false");
        if (wasActive && typeof global.setClientsSheetTab === "function") {
          global.setClientsSheetTab("all");
        }
      }
    }

    return pack;
  }

  function clientNoteForSheet(clientId, ctx) {
    ctx = ctx || buildContext();
    const id = String(clientId || "").trim().toLowerCase();
    if (!id) return null;
    const notes = ctx.clientNotesById;
    const existing = notes[id];
    if (existing && String(existing.name || "").trim()) return existing;

    let name = "";
    rowsAll(ctx).forEach(function (row) {
      if (!rowApplies(row, ctx)) return;
      const t = String(row.override_type || "").trim();
      if (REPLACE_TYPES.has(t)) {
        const pl = parsePayload(row.payload);
        const cid = replacementClientId(pl, ctx);
        if (cid !== id) return;
        if (typeof global.portalOverrideReplacementClientName === "function") {
          name = global.portalOverrideReplacementClientName(pl) || name;
        } else if (pl) {
          name =
            String(pl.to_client_name || pl.replacement_client_name || "").trim() ||
            name;
        }
        return;
      }
      if (overrideIsTermNewParticipant(row)) {
        const cid = overrideTermIntakeClientSlug(row);
        if (cid !== id) return;
        const pl = parsePayload(row.payload);
        name =
          String(pl && (pl.to_client_name || pl.moved_client_name || pl.replacement_client_name) || "").trim() ||
          name;
      }
    });

    if (!name) {
      rosterRowsCache().forEach(function (row) {
        if (!rosterRowAppliesToStaff(row, ctx.staffId)) return;
        if (clientSlugFromName(row.client_name) !== id) return;
        name = String(row.client_name || "").trim() || name;
      });
    }

    if (!name) {
      name = id.replace(/[-_]+/g, " ").replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      });
    }

    const stub = {
      name: name,
      hasMedicalAlert: false,
      generalInfoSheet: existing && existing.generalInfoSheet ? existing.generalInfoSheet : "",
      specialty: existing && existing.specialty ? existing.specialty : "",
    };
    notes[id] = Object.assign({}, existing || {}, stub);
    return notes[id];
  }

  function newParticipantScheduleLabelOpts(clientId, ctx) {
    ctx = ctx || buildContext();
    const slug = normKey(clientId);
    if (!slug) return null;
    let dated = 0;
    let templ = false;
    rosterRowsCache().forEach(function (row) {
      if (String(row.status || "active") !== "active") return;
      if (!rosterRowAppliesToStaff(row, ctx.staffId)) return;
      if (clientSlugFromName(row.client_name) !== slug) return;
      if (normIso(row.session_date)) dated++;
      else templ = true;
    });
    if (templ || dated > 1) return { termOnly: true };
    let fromOverride = false;
    rowsAll(ctx).forEach(function (row) {
      if (fromOverride || !rowApplies(row, ctx)) return;
      if (!overrideIsTermNewParticipant(row)) return;
      if (overrideTermIntakeClientSlug(row) === slug) fromOverride = true;
    });
    if (fromOverride) return { termOnly: true };
    return null;
  }

  global.PortalParticipantsSheet = {
    REPLACE_TYPES: REPLACE_TYPES,
    participantsSheetStaffOnly: participantsSheetStaffOnly,
    buildContext: buildContext,
    collectNewParticipantIds: collectNewParticipantIds,
    applyTabVisibility: applyTabVisibility,
    isMakeUpDashboardRow: isMakeUpDashboardRow,
    formatScheduleLabel: formatScheduleLabel,
    clientNoteForSheet: clientNoteForSheet,
    buildPortalRosterFirstSessionMap: buildPortalRosterFirstSessionMap,
    clientFirstSessionDateIso: clientFirstSessionDateIso,
    overrideIsTermNewParticipant: overrideIsTermNewParticipant,
    overrideIsRosterDayGroupRow: overrideIsRosterDayGroupRow,
    overrideRosterDayGroupIsNewShift: overrideRosterDayGroupIsNewShift,
    overrideIsNewShiftDayUpdate: overrideIsNewShiftDayUpdate,
    overrideIsTrialSession: overrideIsTrialSession,
    overrideShouldShowOnCalendarDate: overrideShouldShowOnCalendarDate,
    overrideTermIntakeClientSlug: overrideTermIntakeClientSlug,
    scheduleOverrideAttentionDismissKey: scheduleOverrideAttentionDismissKey,
    collapseScheduleOverrideRowsForAttention: collapseScheduleOverrideRowsForAttention,
    newParticipantScheduleLabelOpts: newParticipantScheduleLabelOpts,
  };
})(typeof window !== "undefined" ? window : globalThis);
