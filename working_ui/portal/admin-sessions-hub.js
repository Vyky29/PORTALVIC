/**
 * Admin \u2014 Sessions hub \u2014 roster vs session feedback, submitted grid, schedule.
 * Mount with AdminSessionsHub.mount(root, { payload, escapeHtml, onRefresh }).
 */
(function (global) {
  "use strict";

  var BUNDLE_SRC = "/portal/staff_dashboard_spreadsheet_bundle.js?v=20260614-madre-anas-cli";
  var DAY_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#6366f1"];
  var DAY_BG_TINTS = [
    "rgba(59, 130, 246, 0.13)",
    "rgba(139, 92, 246, 0.13)",
    "rgba(6, 182, 212, 0.13)",
    "rgba(16, 185, 129, 0.13)",
    "rgba(245, 158, 11, 0.13)",
    "rgba(236, 72, 153, 0.13)",
    "rgba(99, 102, 241, 0.13)"
  ];

  function usesWeekDayPickerTab(tab) {
    return (
      tab === "absents" ||
      tab === "incidents" ||
      tab === "cancellations" ||
      tab === "positive" ||
      tab === "relevant"
    );
  }

  function truncateCellText(s, max) {
    var t = clean(s);
    if (!t) return "\u2014";
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "\u2014";
  }

  function hubDayIsClubClosed(hub, iso) {
    return !!(
      hub &&
      hub.opts &&
      typeof hub.opts.isClubClosedDay === "function" &&
      hub.opts.isClubClosedDay(iso)
    );
  }

  function hubDayIsProgrammeInactive(hub, iso) {
    return !!(
      hub &&
      hub.opts &&
      typeof hub.opts.isProgrammeWorkDay === "function" &&
      !hub.opts.isProgrammeWorkDay(iso) &&
      !hubDayIsClubClosed(hub, iso)
    );
  }

  function clampHubWeekStart(hub, weekStartIso) {
    var ws = mondayOfWeek(weekStartIso || isoToday());
    var min = hub && hub.opts && hub.opts.minSessionDate;
    if (!min || !/^\d{4}-\d{2}-\d{2}$/.test(min)) return ws;
    var minMon = mondayOfWeek(min);
    return ws < minMon ? minMon : ws;
  }

  function htmlClosedDayCardInlineStyle() {
    return "--ash-day-col:#dc2626;--ash-day-bg:rgba(220,38,38,0.2);--ash-col:#dc2626";
  }

  function htmlWeekDayCardInactive(iso, esc, kind) {
    var label = kind === "closed" ? "closed" : "not scheduled";
    return (
      '<div class="ash-day-card ash-day-card--week ash-day-card--inactive ash-day-card--closed" aria-disabled="true" style="' +
      htmlClosedDayCardInlineStyle() +
      '">' +
      htmlWeekdayLabel(iso, esc) +
      '<span class="ash-day-card__dt">' +
      esc(formatShortDate(iso)) +
      '</span><span class="ash-day-card__bar" style="--ash-pct:0" role="presentation"></span>' +
      '<span class="ash-day-card__sessions" aria-hidden="false"><strong>\u2014</strong><small>' +
      esc(label) +
      "</small></span></div>"
    );
  }

  function htmlWeekDayCardClosed(iso, esc, sel, clickable) {
    var inner =
      htmlWeekdayLabel(iso, esc) +
      '<span class="ash-day-card__dt">' +
      esc(formatShortDate(iso)) +
      '</span><span class="ash-day-card__bar" style="--ash-pct:0" role="presentation"></span>' +
      '<span class="ash-day-card__sessions"><strong>\u2014</strong><small>closed</small></span>';
    if (clickable) {
      return (
        '<button type="button" class="ash-day-card ash-day-card--week ash-day-card--closed' +
        sel +
        '" data-ash-day="' +
        esc(iso) +
        '" style="' +
        htmlClosedDayCardInlineStyle() +
        '">' +
        inner +
        "</button>"
      );
    }
    return (
      '<div class="ash-day-card ash-day-card--week ash-day-card--closed" aria-disabled="true" style="' +
      htmlClosedDayCardInlineStyle() +
      '">' +
      inner +
      "</div>"
    );
  }

  function htmlWeekDayCard(hub, iso, idx, esc) {
    var sel = iso === hub.selectedDay ? " ash-day-card--sel" : "";
    if (hubDayIsClubClosed(hub, iso)) {
      return htmlWeekDayCardClosed(iso, esc, sel, true);
    }
    if (hubDayIsProgrammeInactive(hub, iso)) {
      return htmlWeekDayCardInactive(iso, esc, "off");
    }
    var col = DAY_COLORS[idx % DAY_COLORS.length];
    var tint = DAY_BG_TINTS[idx % DAY_BG_TINTS.length];
    var innerPct = 0;
    var countLabel;
    var countStrong;
    var stateCls = "";
    if (hub.tab === "absents") {
      var absentN = hub.absentCountForDate(iso);
      countStrong = String(absentN);
      countLabel = absentN === 1 ? "absent" : "absents";
      if (absentN > 0) innerPct = 100;
    } else if (hub.tab === "incidents") {
      var incN = hub.incidentCountForDate(iso);
      countStrong = String(incN);
      countLabel = incN === 1 ? "incident" : "incidents";
      if (incN > 0) innerPct = 100;
    } else if (hub.tab === "cancellations") {
      var canN = hub.cancellationCountForDate(iso);
      countStrong = String(canN);
      countLabel = canN === 1 ? "cancellation" : "cancellations";
      if (canN > 0) innerPct = 100;
    } else if (hub.tab === "positive" || hub.tab === "relevant") {
      var noteN = hub.feedbackNotesCountForDate(iso, hub.tab);
      countStrong = String(noteN);
      countLabel = noteN === 1 ? "note" : "notes";
      if (noteN > 0) innerPct = 100;
    } else if (hub.tab === "feedback" || hub.mode === "feedback") {
      var dsFb = hub.dayStats(iso);
      if (dsFb.total) {
        innerPct = Math.round((100 * dsFb.done) / dsFb.total);
        if (dsFb.done > 0 && innerPct < 8) innerPct = 8;
      }
      countStrong = dsFb.total ? dsFb.done + "/" + dsFb.total : "0";
      countLabel = "feedbacks";
      if (dsFb.total && dsFb.done === 0) stateCls = " ash-day-card--none";
      else if (dsFb.total && dsFb.done < dsFb.total) stateCls = " ash-day-card--partial";
      else if (dsFb.total && dsFb.done >= dsFb.total) stateCls = " ash-day-card--complete";
    } else if (hub.tab === "tracking") {
      var dsTrack = hub.dayStats(iso);
      if (dsTrack.total) {
        innerPct = Math.round((100 * dsTrack.done) / dsTrack.total);
        if (dsTrack.done > 0 && innerPct < 12) innerPct = 12;
      }
      countStrong = dsTrack.done + "/" + dsTrack.total;
      countLabel = "feedbacks";
      var stateClsTrack = "";
      if (dsTrack.total && dsTrack.done === 0) stateClsTrack = " ash-day-card--none";
      else if (dsTrack.total && dsTrack.done < dsTrack.total) stateClsTrack = " ash-day-card--partial";
      else if (dsTrack.total && dsTrack.done >= dsTrack.total) stateClsTrack = " ash-day-card--complete";
      return (
        '<button type="button" class="ash-day-card ash-day-card--feedback' +
        sel +
        stateClsTrack +
        '" data-ash-day="' +
        esc(iso) +
        '" style="--ash-day-col:' +
        col +
        ";--ash-day-bg:" +
        tint +
        ";--ash-col:" +
        col +
        '">' +
        '<div class="ash-day-card__top">' +
        htmlWeekdayLabel(iso, esc) +
        '</div>' +
        '<div class="ash-day-card__bar" style="--ash-pct:' +
        innerPct +
        ";--ash-col:" +
        col +
        '"></div>' +
        htmlAshRatioCount(esc, countStrong) +
        "</button>"
      );
    } else {
      var ds = hub.dayStats(iso);
      if (ds.total) {
        innerPct = Math.round((100 * ds.done) / ds.total);
        if (ds.done > 0 && innerPct < 8) innerPct = 8;
      }
      countStrong = String(ds.total);
      countLabel = ds.total === 1 ? "session" : "sessions";
    }
    return (
      '<button type="button" class="ash-day-card ash-day-card--week' +
      sel +
      stateCls +
      '" data-ash-day="' +
      esc(iso) +
      '" style="--ash-day-col:' +
      col +
      ";--ash-day-bg:" +
      tint +
      '">' +
      htmlWeekdayLabel(iso, esc) +
      '<span class="ash-day-card__dt">' +
      esc(formatShortDate(iso)) +
      "</span>" +
      '<span class="ash-day-card__bar" style="--ash-pct:' +
      innerPct +
      '" role="presentation"></span>' +
      '<span class="ash-day-card__sessions" aria-label="' +
      esc(countStrong + " " + countLabel) +
      '"><strong>' +
      esc(countStrong) +
      "</strong><small>" +
      esc(countLabel) +
      "</small></span></button>"
    );
  }

  var TH_ICON_INCIDENT =
    '<th class="ash-th-icon" scope="col" title="Incident reported on this session">' +
    '<span class="ash-th-icon__svg" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span></th>';
  var TH_ICON_CANCELLATION =
    '<th class="ash-th-icon" scope="col" title="Cancellation reported on this session">' +
    '<span class="ash-th-icon__svg ash-th-icon__svg--cancel" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></span></th>';

  function yesNoCell(yes) {
    return yes
      ? '<span class="ash-yn ash-yn--yes">Yes</span>'
      : '<span class="ash-yn ash-yn--no">No</span>';
  }

  function rosterFeedbackStatusHtml(isAbsent, fbDone) {
    if (isAbsent) {
      return '<span class="ash-status ash-status--absent">Submitted (Absent)</span>';
    }
    if (fbDone) {
      return '<span class="ash-status ash-status--done">Feedback submitted</span>';
    }
    return '<span class="ash-status ash-status--wait">Awaiting feedback</span>';
  }

  /** Overview roster table: awaiting feedback first, then submitted, then absent. */
  function overviewSlotFeedbackRank(isAbsent, fbDone, isCancelled) {
    if (isCancelled && !isAbsent) return 2;
    if (!isAbsent && !fbDone && !isCancelled) return 0;
    if (fbDone && !isAbsent && !isCancelled) return 1;
    if (isAbsent) return 2;
    return 3;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clean(s) {
    return String(s == null ? "" : s).trim();
  }

  function incidentIsStaffSubject(r) {
    return clean(r && r.subject_type).toLowerCase() === "staff";
  }

  function incidentSubjectMain(r) {
    if (incidentIsStaffSubject(r)) {
      return (
        clean(r.affected_staff_name) ||
        clean(r.submitted_by_name) ||
        "Staff"
      );
    }
    return clean(r.client_name) || "\u2014";
  }

  function incidentSubjectSub(r) {
    if (!incidentIsStaffSubject(r)) return "";
    var bits = ["Staff incident"];
    var out = clean(r.incident_outcome);
    if (out === "none_reported") bits.push("no injury");
    else if (out === "injury") bits.push("injury reported");
    else if (out === "minor") bits.push("minor");
    else if (out === "near_miss") bits.push("near miss");
    if (clean(r.client_name)) bits.push("participant: " + clean(r.client_name));
    return bits.join(" \u2013 ");
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  /** Legacy roster / feedback spellings → canonical slug (same person only — do not merge distinct participants). */
  var CLIENT_SLUG_ALIASES = {
    sammer: "samer",
    amaar: "amaar_ah",
    rayyan: "rayyan_fi",
    rayyan_f: "rayyan_fi",
    adam_pilcher: "adam_pi",
    adam_a: "adam_ab",
    abodi_p: "abodi_pa",
    abodi: "abodi_pa",
    steven_ce: "steven_c",
    steven_c: "steven_c",
    junaid: "junaid_f",
  };

  function canonicalClientSlug(name) {
    var s = slugify(name);
    return CLIENT_SLUG_ALIASES[s] || s;
  }

  function isMisnamedAdamAbFeedbackClientName(name) {
    var s = slugify(name);
    return s === "adam" || s === "adam_a";
  }

  function buildAdamAbSessionDateSet(rosterRows, feedbackList) {
    var set = {};
    function mark(d) {
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) set[d] = true;
    }
    (rosterRows || []).forEach(function (row) {
      if (canonicalClientSlug(row.client_name) === "adam_ab") mark(rowDateIso(row.session_date));
    });
    (feedbackList || []).forEach(function (fb) {
      if (canonicalClientSlug(fb.client_name) === "adam_ab") mark(feedbackSessionDate(fb));
    });
    return set;
  }

  function normalizeAdamAbFeedbackPortalKey(key) {
    var k = String(key || "");
    if (!k) return k;
    return k
      .replace(/(^|\|)adam_a\.?(?=\||$)/gi, "$1adam_ab")
      .replace(/(^|\|)adam(?=\||$)/gi, "$1adam_ab");
  }

  function normalizeMisnamedAdamAbFeedbackRows(feedbackList, adamAbDates) {
    if (!Array.isArray(feedbackList) || !adamAbDates) return feedbackList;
    return feedbackList.map(function (fb) {
      if (!isMisnamedAdamAbFeedbackClientName(fb.client_name)) return fb;
      var sd = feedbackSessionDate(fb);
      if (!sd || !adamAbDates[sd]) return fb;
      var out = Object.assign({}, fb);
      out.client_name = "Adam Ab";
      if (out.portal_session_key) {
        out.portal_session_key = normalizeAdamAbFeedbackPortalKey(out.portal_session_key);
      }
      return out;
    });
  }

  /** Bad submit: roster area saved as client_name (e.g. "Big Pool" / "Wall" instead of Scott). */
  function isMislabeledRosterAreaClientName(name) {
    var s = canonicalClientSlug(name);
    return (
      s === "wall" ||
      s === "big_pool" ||
      s === "hub_room" ||
      s === "small_pool" ||
      s === "teaching_pool" ||
      s === "climbing_wall" ||
      s === "room_2" ||
      s === "room_3" ||
      s === "pools"
    );
  }

  function portalSessionKeyAreaSlugTokens() {
    return {
      wall: true,
      big_pool: true,
      hub_room: true,
      small_pool: true,
      teaching_pool: true,
      climbing_wall: true,
      room_2: true,
      room_3: true,
      pools: true,
      default: true,
    };
  }

  /** Session date for roster match \u2013 never use created_at (late submit on another day). */
  function feedbackSessionDate(fb) {
    var d = rowDateIso(fb && fb.session_date);
    if (d) return d;
    var pk = clean(fb && fb.portal_session_key);
    if (pk) {
      var p0 = pk.split("|")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(p0)) return p0;
    }
    return "";
  }

  function clientConfigMapEntry(map, clientName) {
    if (!map) return null;
    var name = clean(clientName);
    if (map[name] != null) return map[name];
    if (!name) return null;
    var slug = canonicalClientSlug(name);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k) && canonicalClientSlug(k) === slug) {
        return map[k];
      }
    }
    return null;
  }

  function clientAllowedOnWeekday(clientName, weekdayLong) {
    var allow = clientConfigMapEntry(
      global.STAFF_DASHBOARD_SOURCE && global.STAFF_DASHBOARD_SOURCE.clientWeekdaysOnly,
      clientName
    );
    if (!allow || !allow.length) return true;
    return allow.indexOf(weekdayLong) !== -1;
  }

  /** First calendar day this client appears on roster (ISO date). */
  function clientAllowedOnDate(clientName, isoDate) {
    var start = clientConfigMapEntry(
      global.STAFF_DASHBOARD_SOURCE && global.STAFF_DASHBOARD_SOURCE.clientRosterStartDates,
      clientName
    );
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(String(start))) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return true;
    return isoDate >= String(start);
  }

  function parseHm(token) {
    var t = String(token || "").trim();
    var parts = t.split(".");
    var h = parseInt(parts[0], 10) || 0;
    var m = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
    return { h: h, m: m };
  }

  function hourTo24(hour, day) {
    if (day !== "Sunday" && hour < 8) return hour + 12;
    if (day === "Sunday" && hour >= 1 && hour <= 3) return hour + 12;
    return hour;
  }

  function parseTimeSlot(timeSlot, day) {
    var normalized = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    var parts = normalized.split(/\s+to\s+/i);
    if (parts.length < 2) return { start: "16:00", end: "16:30", label: normalized };
    var a = parseHm(parts[0]);
    var b = parseHm(parts[1]);
    var ah = hourTo24(a.h, day);
    var bh = hourTo24(b.h, day);
    var start = String(ah).padStart(2, "0") + ":" + String(a.m).padStart(2, "0");
    var end = String(bh).padStart(2, "0") + ":" + String(b.m).padStart(2, "0");
    return { start: start, end: end, label: normalized };
  }

  function weekdayLongFromIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    var p = iso.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { weekday: "long" });
  }

  function weekdayShortFromIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    var p = iso.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { weekday: "short" });
  }

  function htmlWeekdayLabel(iso, esc) {
    return (
      '<span class="ash-day-card__wd">' +
      '<span class="ash-day-card__wd-full">' +
      esc(weekdayLongFromIso(iso)) +
      '</span><span class="ash-day-card__wd-short" aria-hidden="true">' +
      esc(weekdayShortFromIso(iso)) +
      "</span></span>"
    );
  }

  function htmlAshRatioCount(esc, ratioText) {
    return (
      '<span class="ash-day-card__count">' +
      '<span class="ash-day-card__count-full">' +
      esc(ratioText) +
      '</span><span class="ash-day-card__count-short" aria-hidden="true">' +
      esc(ratioText) +
      "</span></span>"
    );
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function parseIso(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function isoFromDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function isoWeekNumber(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 0;
    var d = parseIso(iso);
    d.setHours(12, 0, 0, 0);
    var day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    var yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function sundayDateOverride(isoDate) {
    var src = global.STAFF_DASHBOARD_SOURCE;
    if (!src || !src.sundayDateOverrides) return null;
    return src.sundayDateOverrides[isoDate] || null;
  }

  /** Per-date SwimFarm swim+hub rows (e.g. 2026-06-07 Samer/Zaid swap). Climbing unchanged. */
  function sundayDateSwimOverride(isoDate) {
    var src = global.STAFF_DASHBOARD_SOURCE;
    if (!src || !src.sundayDateSwimOverrides) return null;
    return src.sundayDateSwimOverrides[isoDate] || null;
  }

  function rosterRowToSlot(isoDate, wd, r) {
    var slot = parseTimeSlot(r.time_slot, wd);
    var instructors = parseInstructors(applySundayInstructorOverride(isoDate, r.instructors));
    var slotRow = {
      session_date: isoDate,
      day: wd,
      client_name: clean(r.client_name),
      service: clean(r.service),
      time_slot: clean(r.time_slot),
      time_start: slot.start,
      venue: clean(r.venue),
      area: clean(r.area),
      instructors: instructors,
      instructor_label: instructors.join(", ") || clean(r.instructors),
      session_key: buildSessionKey(isoDate, r),
      __portal_roster_row_id: r.__portal_roster_row_id || null,
      portalRosterTimeUpdated: !!r.__portal_roster_time_updated,
    };
    slotRow.feedback_unit_key = feedbackUnitKey(slotRow);
    slotRow.feedback_merge_group = feedbackMergeGroupForSlot(slotRow);
    return slotRow;
  }

  function applySundayInstructorOverride(isoDate, instructorRaw) {
    var day = sundayDateOverride(isoDate);
    if (!day || !day.replaceInstructor) return clean(instructorRaw);
    var map = day.replaceInstructor;
    var key = clean(instructorRaw).toUpperCase();
    return map[key] || clean(instructorRaw);
  }

  function sundayLeadOnDuty(isoDate) {
    var day = sundayDateOverride(isoDate);
    if (day && day.leadOnDuty) return clean(day.leadOnDuty);
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rot = src && src.sundayLeadRotation;
    if (!rot) return "";
    var w = isoWeekNumber(isoDate);
    if (!w) return "";
    return w % 2 === 0 ? clean(rot.evenIsoWeek) : clean(rot.oddIsoWeek);
  }

  function mondayOfWeek(iso) {
    var d = parseIso(iso);
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return isoFromDate(d);
  }

  function addDaysIso(iso, n) {
    var d = parseIso(iso);
    d.setDate(d.getDate() + n);
    return isoFromDate(d);
  }

  function rosterRowSessionDate(r) {
    var sd = clean(r && (r.session_date || r.date));
    return /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : "";
  }

  /** True when this client has any dated roster row in the ISO week containing isoDate. */
  function clientHasDatedRosterInWeek(rosterRows, clientName, isoDate) {
    var cid = canonicalClientSlug(clientName);
    if (!cid || !rosterRows || !rosterRows.length) return false;
    var ws = mondayOfWeek(isoDate);
    var we = addDaysIso(ws, 6);
    for (var i = 0; i < rosterRows.length; i++) {
      var o = rosterRows[i];
      var sd = rosterRowSessionDate(o);
      if (!sd || sd < ws || sd > we) continue;
      if (canonicalClientSlug(o.client_name) === cid) return true;
    }
    return false;
  }

  /**
   * Dated week rows only on their calendar day; undated templates only when this client has
   * no dated rows that week and no dated row on this weekday (matches roster week CSV import).
   */
  function rosterRowAppliesOnDate(rosterRows, r, isoDate, wd) {
    if (clean(r.day) !== wd) return false;
    var sd = rosterRowSessionDate(r);
    if (sd) return sd === isoDate;
    var cid = canonicalClientSlug(r.client_name);
    if (!cid) return true;
    if (clientHasDatedRosterInWeek(rosterRows, r.client_name, isoDate)) return false;
    for (var i = 0; i < rosterRows.length; i++) {
      var o = rosterRows[i];
      if (rosterRowSessionDate(o) !== isoDate) continue;
      if (clean(o.day) !== wd) continue;
      if (canonicalClientSlug(o.client_name) === cid) return false;
    }
    return true;
  }

  function formatShortDate(iso) {
    var d = parseIso(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatLongDate(iso) {
    var d = parseIso(iso);
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  function formatFbDate(isoOrTs) {
    var s = String(isoOrTs || "").trim();
    if (!s) return "\u2014";
    var d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 10);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatFbDateShort(isoOrTs) {
    var s = String(isoOrTs || "").trim();
    if (!s) return "";
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + "/" + m[2] + "/" + m[1].slice(2);
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yy = String(d.getFullYear()).slice(2);
    return dd + "/" + mm + "/" + yy;
  }

  function formatFbTime(isoOrTs) {
    var s = String(isoOrTs || "").trim();
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function feedbackSubmittedAt(fb) {
    if (!fb) return "";
    return (
      fb.created_at ||
      fb.submittedAt ||
      fb.submitted_at ||
      fb.updated_at ||
      ""
    );
  }

  function formatFbDateTime(isoOrTs) {
    var s = String(isoOrTs || "").trim();
    if (!s) return "\u2014";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "\u2014";
    var date = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
    var time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return date + " / " + time;
  }

  /** When an absent mark was submitted (date row + time row in UI). */
  function absentMarkedWhenParts(isoOrTs) {
    var s = String(isoOrTs || "").trim();
    if (!s) return { date: "\u2014", time: "" };
    var d = new Date(s);
    if (isNaN(d.getTime())) return { date: "\u2014", time: "" };
    return {
      date: d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }),
      time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
  }

  function absentWhenStackHtml(dateStr, timeStr, escFn) {
    var esc = escFn || function (x) {
      return String(x == null ? "" : x);
    };
    if (!dateStr || dateStr === "\u2014") return "\u2014";
    return (
      '<span class="ash-when-stack">' +
      '<span class="ash-when-stack__date">' +
      esc(dateStr) +
      "</span>" +
      '<span class="ash-when-stack__time">' +
      esc(timeStr || "") +
      "</span></span>"
    );
  }

  /** portal_session_key ? date, optional HH:MM, client slug (handles 2026-05-18||aadam_ah). */
  function parsePortalSessionKeyFields(pk) {
    var raw = clean(pk);
    if (!raw) return { date: "", time: "", clientSlug: "" };
    var parts = raw.split("|").map(clean);
    var date = /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) ? parts[0] : "";
    var dayWord = date ? weekdayLongFromIso(date) : "";
    var time = "";
    var clientSlug = "";
    var areaSlugs = portalSessionKeyAreaSlugTokens();
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var tk = normTimeKey(p, dayWord);
      if (tk && /^\d{2}:\d{2}$/.test(tk)) {
        time = tk;
        continue;
      }
      var sl = slugify(p);
      if (!sl || areaSlugs[sl]) continue;
      if (!clientSlug) clientSlug = sl;
    }
    if (!clientSlug) {
      for (var j = 1; j < parts.length; j++) {
        if (!parts[j]) continue;
        var tk2 = normTimeKey(parts[j], dayWord);
        if (tk2 && /^\d{2}:\d{2}$/.test(tk2)) continue;
        var sl2 = slugify(parts[j]);
        if (!sl2 || areaSlugs[sl2]) continue;
        clientSlug = sl2;
        break;
      }
    }
    if (clientSlug) clientSlug = canonicalClientSlug(clientSlug);
    return { date: date, time: time, clientSlug: clientSlug };
  }

  function resolveRosterClientName(slug) {
    var s = canonicalClientSlug(slug);
    if (!s || isMislabeledRosterAreaClientName(s)) return "";
    var rows =
      global.STAFF_DASHBOARD_SOURCE && Array.isArray(global.STAFF_DASHBOARD_SOURCE.rows)
        ? global.STAFF_DASHBOARD_SOURCE.rows
        : [];
    for (var i = 0; i < rows.length; i++) {
      if (canonicalClientSlug(rows[i].client_name) === s) return clean(rows[i].client_name);
    }
    if (isMislabeledRosterAreaClientName(s)) return "";
    return s.replace(/_/g, " ").replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function enrichAbsentMark(mark) {
    if (!mark) return mark;
    var m = mark;
    var pk = clean(m.portal_session_key);
    var parsed = parsePortalSessionKeyFields(pk);
    if (!clean(m.session_date) && parsed.date) m = Object.assign({}, m, { session_date: parsed.date });
    if (!clean(m.client_name) && parsed.clientSlug) {
      m = Object.assign({}, m, { client_name: resolveRosterClientName(parsed.clientSlug) });
    }
    if (!clean(m.session_time) && parsed.time) {
      m = Object.assign({}, m, { session_time: parsed.time });
    }
    return m;
  }

  function normTimeShort(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return "";
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (!m) return s.length >= 5 ? s.slice(0, 5) : s;
    return String(parseInt(m[1], 10)).padStart(2, "0") + ":" + m[2];
  }

  function overridePayloadObj(ov) {
    var p = ov && ov.payload;
    if (p && typeof p === "string") {
      try {
        p = JSON.parse(p);
      } catch (e) {
        p = {};
      }
    }
    return p && typeof p === "object" ? p : {};
  }

  function overrideIsAbsentType(ov) {
    return (
      String(ov && ov.override_type || "").trim() === "client_absence_announced" &&
      String(ov && ov.status || "active").trim() === "active"
    );
  }

  function statusExportRowsForDate(iso) {
    var src = global.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return [];
    var want = clean(iso).substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(want)) return [];
    return src.rows.filter(function (r) {
      return String(r.date || "").trim().substring(0, 10) === want;
    });
  }

  function statusExportRowMatchesSlot(stRow, slot) {
    if (!stRow || !slot) return false;
    var want = String(slot.session_date || "").trim().substring(0, 10);
    if (String(stRow.date || "").trim().substring(0, 10) !== want) return false;
    if (canonicalClientSlug(stRow.client) !== canonicalClientSlug(slot.client_name)) return false;
    var slotTs = clean(slot.time_slot).toLowerCase();
    var rowTs = clean(stRow.timeSlot || stRow.time_slot).toLowerCase();
    if (slotTs && rowTs && slotTs !== rowTs) return false;
    return true;
  }

  function statusExportRowIsAbsent(stRow) {
    return String(stRow && stRow.overviewStatus || "").trim().toLowerCase() === "absent";
  }

  function statusExportRowIsResolved(stRow) {
    if (!stRow) return false;
    var st = String(stRow.overviewStatus || "").trim().toLowerCase();
    if (st === "absent" || st === "cancelled") return true;
    return !!stRow.feedbackComplete;
  }

  function overrideIsCancelledType(ov) {
    var t = String(ov && ov.override_type || "").trim();
    if (String(ov && ov.status || "active").trim() !== "active") return false;
    if (t === "slot_close") return true;
    var p = overridePayloadObj(ov);
    return t === "slot_clear_client" && !!p.cancelled_by_admin;
  }

  function overrideIsSlotUpdateType(ov) {
    return (
      String(ov && ov.override_type || "").trim() === "slot_update" &&
      String(ov && ov.status || "active").trim() === "active"
    );
  }

  function hubOverrideLabel(ov) {
    if (!ov) return "";
    if (overrideIsSlotUpdateType(ov)) return "Updated";
    return String(ov.override_type || "").trim() || "Override";
  }

  function hubOverrideChipClass(ov) {
    if (overrideIsSlotUpdateType(ov)) return "override--updated";
    if (overrideIsAbsentType(ov)) return "override--absent";
    if (overrideIsCancelledType(ov)) return "override--cancelled";
    return "";
  }

  function hubSlotShowsUpdatedChip(slot, slotOv) {
    if (overrideIsSlotUpdateType(slotOv)) return true;
    return !!(slot && slot.portalRosterTimeUpdated);
  }

  function overrideClientName(ov) {
    var slug = clean(ov && ov.anchor_client_id);
    return resolveRosterClientName(slug) || slug.replace(/_/g, " ");
  }

  function overrideToAbsentMark(ov) {
    if (!ov || !overrideIsAbsentType(ov)) return null;
    var sd = clean(ov.session_date);
    var slug = canonicalClientSlug(ov.anchor_client_id);
    if (!sd || !slug) return null;
    var st = normTimeShort(ov.anchor_start);
    return {
      portal_session_key: st ? sd + "||" + st + "||" + slug : sd + "||" + slug,
      session_date: sd,
      session_time: st,
      client_name: overrideClientName(ov),
      service: "\u2014",
      staff_user_id: "",
      staff_name: clean(ov.reason) ? "Schedule override \u2014 " + clean(ov.reason) : "Schedule override",
      created_at: ov.created_at || null,
      mark_type: "absent",
      source: "schedule_override",
    };
  }

  function overrideToCancellationRow(ov) {
    if (!ov || !overrideIsCancelledType(ov)) return null;
    var sd = clean(ov.session_date);
    var slug = canonicalClientSlug(ov.anchor_client_id);
    if (!sd || !slug) return null;
    var reason = clean(ov.reason) || "Admin cancellation (schedule override)";
    return {
      id: "schedule_override:" + String(ov.id || ""),
      created_at: ov.created_at || null,
      session_date: sd,
      session_time: normTimeShort(ov.anchor_start),
      client_name: overrideClientName(ov),
      service: "\u2014",
      cancellation_timing: "Schedule override",
      reason_category: reason,
      submitted_by_name: "Schedule override",
      portal_session_key: normTimeShort(ov.anchor_start)
        ? sd + "||" + normTimeShort(ov.anchor_start) + "||" + slug
        : sd + "||" + slug,
      _fromScheduleOverride: true,
    };
  }

  /** Always HH:MM (zero-padded). Accepts roster dot times (1.15) and staff portal_session_key tokens. */
  function normTimeKey(t, dayWord) {
    var s = clean(t).toLowerCase().replace(/\s+/g, " ");
    if (!s) return "";
    var hm = s.match(/^(\d{1,2}):(\d{2})$/);
    if (hm) {
      return String(parseInt(hm[1], 10)).padStart(2, "0") + ":" + String(parseInt(hm[2], 10) || 0).padStart(2, "0");
    }
    var dot = s.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (dot) {
      var dh = parseInt(dot[1], 10);
      var dm = parseInt(dot[2], 10) || 0;
      if (dayWord) dh = hourTo24(dh, dayWord);
      else if (dh >= 1 && dh <= 7) dh = dh + 12;
      return String(dh).padStart(2, "0") + ":" + String(dm).padStart(2, "0");
    }
    var p = parseTimeSlot(s, dayWord || "");
    return p.start || "";
  }

  function registerFeedbackAlias(map, key, fb) {
    var k = clean(key).toLowerCase();
    if (!k || k.length < 12) return;
    map[k] = fb;
  }

  function normalizePortalSessionKey(raw) {
    var parsed = parsePortalSessionKeyFields(raw);
    if (!parsed.date || !parsed.clientSlug) return "";
    var out = [parsed.date, parsed.time || "", parsed.clientSlug];
    return out.join("|").toLowerCase();
  }

  function feedbackAliasKeysForSlot(slot) {
    var keys = [];
    var sk = clean(slot.session_key);
    if (sk) keys.push(sk);
    var cid = canonicalClientSlug(slot.client_name);
    if (!slot.session_date || !cid) return keys;
    if (isDayCentreService(slot.service)) {
      keys.push(slot.session_date + "|" + cid);
      keys.push(slot.session_date + "|" + cid + "|day_centre");
      keys.push(slot.session_date + "|" + cid + "|hub_room");
      keys.push(feedbackUnitKey(slot));
      return keys;
    }
    if (isBespokeMultiStaffSharedSlot(slot)) {
      keys.push(slot.session_date + "|" + cid);
      keys.push(slot.session_date + "|" + cid + "|bespoke_shared");
      keys.push(slot.session_date + "|" + cid + "|hub_room");
      keys.push(feedbackUnitKey(slot));
      return keys;
    }
    var t = slot.time_start || normTimeKey(slot.time_slot);
    if (!t) return keys;
    var base = slot.session_date + "|" + t + "|" + cid;
    keys.push(base);
    if (isMultiActivityService(slot.service) || isBespokeService(slot.service)) {
      keys.push(feedbackUnitKey(slot));
      var mg = feedbackMergeGroupForSlot(slot);
      if (mg) keys.push(slot.session_date + "|merge|" + mg);
      if (isMultiActivityService(slot.service)) {
        var area = sessionAreaKey(slot.area);
        var inst = primaryInstructorKey(slot);
        if (area && area !== "default") keys.push(base + "|" + area);
        keys.push(base + "|" + serviceKey(slot.service));
        keys.push(base + "|" + serviceKey(slot.service) + "|" + area);
        keys.push(base + "|" + serviceKey(slot.service) + "|" + area + "|" + inst);
      }
    }
    if (isClimbingService(slot.service)) {
      keys.push(feedbackUnitKey(slot));
      var climbArea = sessionAreaKey(slot.area);
      var climbInst = primaryInstructorKey(slot);
      if (climbArea && climbArea !== "default") keys.push(base + "|" + climbArea);
      keys.push(base + "|" + serviceKey(slot.service));
      keys.push(base + "|" + serviceKey(slot.service) + "|" + climbArea);
      keys.push(base + "|" + serviceKey(slot.service) + "|" + climbArea + "|" + climbInst);
    }
    if (isAquaticService(slot.service)) {
      keys.push(feedbackUnitKey(slot));
      var mergeAquatic = feedbackMergeGroupForSlot(slot);
      if (mergeAquatic) keys.push(slot.session_date + "|merge|" + mergeAquatic);
      keys.push(slot.session_date + "|" + cid + "|aquatic");
      if (!clientNeedsPerSlotAquaticFeedback(slot)) keys.push(base);
    }
    if (isPhysicalActivityService(slot.service)) {
      keys.push(slot.session_date + "|" + cid);
      keys.push(feedbackUnitKey(slot));
    }
    return keys;
  }

  function feedbackAliasKeysForRow(fb) {
    var keys = [];
    var pk = clean(fb.portal_session_key);
    var svc = clean(fb.service);
    if (pk) {
      keys.push(pk);
      var norm = normalizePortalSessionKey(pk);
      if (norm) keys.push(norm);
      var parts = pk.split("|").map(clean);
      if (parts.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
        var pkTimeFirst = normTimeKey(parts[1]);
        var pkClientTime = normTimeKey(parts[2]);
        if (pkTimeFirst && /^\d{2}:\d{2}$/.test(pkTimeFirst) && parts[2]) {
          keys.push(parts[0] + "|" + pkTimeFirst + "|" + canonicalClientSlug(parts[2]));
          if (isBespokeService(svc)) {
            keys.push(
              parts[0] +
                "|" +
                canonicalClientSlug(parts[2]) +
                "|" +
                pkTimeFirst +
                "|" +
                serviceKey(svc) +
                "|" +
                (portalKeyAreaFromParts(parts) || "hub_room")
            );
          }
        } else if (pkClientTime && /^\d{2}:\d{2}$/.test(pkClientTime) && parts[1]) {
          keys.push(
            parts[0] +
              "|" +
              canonicalClientSlug(parts[1]) +
              "|" +
              pkClientTime +
              "|" +
              serviceKey(svc) +
              "|" +
              (portalKeyAreaFromParts(parts) || "hub_room")
          );
        }
      }
    }
    var sd = feedbackSessionDate(fb);
    var nm = canonicalClientSlug(fb.client_name);
    var rawSlug = slugify(fb.client_name);
    if (!sd || !nm) return keys;
    var parsedPk = parsePortalSessionKeyFields(pk);
    var climbingOrMaPerSlot = isClimbingService(svc) || isMultiActivityService(svc);
    if (parsedPk.date && parsedPk.clientSlug) {
      if (parsedPk.time) keys.push(parsedPk.date + "|" + parsedPk.time + "|" + parsedPk.clientSlug);
      if (!climbingOrMaPerSlot) keys.push(parsedPk.date + "|" + parsedPk.clientSlug);
    }
    var tk = sd + "|" + normTimeKey(fb.session_time) + "|" + nm;
    keys.push(tk);
    var broadDateClient = sd + "|" + nm;
    var aquaticPerSlot =
      isAquaticService(svc) &&
      aquaticSlotCountForClientOnDate(sd, fb.client_name) > 1 &&
      !aquaticSameInstructorAllSlotsOnDate(sd, fb.client_name);
    if (!aquaticPerSlot && !climbingOrMaPerSlot) {
      keys.push(broadDateClient);
    }
    if (isDayCentreService(svc)) {
      keys.push(sd + "|" + nm + "|day_centre");
      keys.push(sd + "|" + nm + "|hub_room");
    }
    if (rawSlug && rawSlug !== nm) {
      keys.push(sd + "|" + normTimeKey(fb.session_time) + "|" + rawSlug);
      if (!aquaticPerSlot && !climbingOrMaPerSlot) keys.push(sd + "|" + rawSlug);
    }
    if (isMultiActivityService(svc)) {
      var t = normTimeKey(fb.session_time);
      if (t) {
        keys.push(tk + "|" + serviceKey(svc));
        var maKind = feedbackAreaKindFromFb(fb);
        var maArea = portalKeyAreaFromParts(pk ? pk.split("|").map(clean) : []);
        if (!maArea || maArea === "default") {
          if (maKind === "hub") maArea = "hub_room";
          else if (maKind === "pool") maArea = "big_pool";
          else if (maKind === "aquatic") maArea = "small_pool";
        }
        if (maArea && maArea !== "default") {
          keys.push(sd + "|" + t + "|" + nm + "|" + maArea);
        }
      }
    }
    if (isClimbingService(svc)) {
      var ct = normTimeKey(fb.session_time);
      if (ct) {
        keys.push(tk + "|" + serviceKey(svc));
        var climbAreaFb = portalKeyAreaFromParts(pk ? pk.split("|").map(clean) : []);
        if (!climbAreaFb || climbAreaFb === "default") climbAreaFb = sessionAreaKey("Wall");
        if (climbAreaFb && climbAreaFb !== "default") {
          keys.push(sd + "|" + ct + "|" + nm + "|" + climbAreaFb);
        }
      }
    }
    if (isDayCentreService(svc)) {
      keys.push(sd + "|" + nm + "|day_centre");
    }
    if (isPhysicalActivityService(svc)) {
      keys.push(broadDateClient);
      if (normTimeKey(fb.session_time)) keys.push(tk);
    }
    if (isBespokeService(svc)) {
      var bt = normTimeKey(fb.session_time) || parsedPk.time;
      var bespokeArea = pk ? portalKeyAreaFromParts(pk.split("|").map(clean)) || "hub_room" : "hub_room";
      if (bt) {
        keys.push(sd + "|" + nm + "|" + bt + "|" + serviceKey(svc) + "|" + bespokeArea);
      }
    }
    return keys;
  }

  function sessionAreaKey(area) {
    return slugify(clean(area) || "default");
  }

  function buildSessionKey(isoDate, row) {
    var day = row.day || weekdayLongFromIso(isoDate);
    var slot = parseTimeSlot(row.time_slot, day);
    var id = canonicalClientSlug(row.client_name);
    if (!isoDate || !id) return "";
    var svc = clean(row.service);
    if (isDayCentreService(svc)) {
      return isoDate + "|" + id + "|day_centre";
    }
    if (isBespokeService(svc)) {
      var pseudoShared = {
        service: svc,
        venue: row.venue,
        area: row.area,
        instructors: parseInstructors(row.instructors || ""),
        instructor_label: row.instructors || "",
      };
      if (isBespokeMultiStaffSharedSlot(pseudoShared)) {
        return isoDate + "|" + id + "|bespoke_shared";
      }
    }
    if (isMultiActivityService(svc) || isBespokeService(svc)) {
      return isoDate + "|" + slot.start + "|" + id + "|" + sessionAreaKey(row.area);
    }
    return isoDate + "|" + slot.start + "|" + id;
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-ash-roster-bundle="1"]');
      if (existing) {
        if (global.STAFF_DASHBOARD_SOURCE) {
          resolve();
          return;
        }
        if (existing.getAttribute("data-loaded") === "1") {
          resolve();
          return;
        }
        existing.addEventListener(
          "load",
          function () {
            existing.setAttribute("data-loaded", "1");
            resolve();
          },
          { once: true }
        );
        existing.addEventListener(
          "error",
          function () {
            reject(new Error("load failed: " + src));
          },
          { once: true }
        );
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.setAttribute("data-ash-roster-bundle", "1");
      s.onload = function () {
        s.setAttribute("data-loaded", "1");
        resolve();
      };
      s.onerror = function () {
        reject(new Error("load failed: " + src));
      };
      document.head.appendChild(s);
    });
  }

  function isRosterClient(name) {
    var t = clean(name);
    if (!t) return false;
    var low = t.toLowerCase();
    return low !== "closed" && low !== "available" && low !== "no client";
  }

  function parseInstructors(raw) {
    return clean(raw)
      .split(/[,/&+]+/)
      .map(function (x) { return clean(x); })
      .filter(Boolean);
  }

  function serviceKey(service) {
    return clean(service).toLowerCase();
  }

  function isBespokeService(service) {
    return serviceKey(service).indexOf("bespoke") !== -1;
  }

  function isDayCentreService(service) {
    var k = serviceKey(service);
    return k.indexOf("day centre") !== -1 || k.indexOf("day_centre") !== -1 || k.indexOf("daycentre") !== -1;
  }

  function slotInstructorCount(slot) {
    var insts =
      slot.instructors && slot.instructors.length
        ? slot.instructors
        : parseInstructors(slot.instructor_label || "");
    return insts.length;
  }

  /** 2:1 / 3:1 Bespoke at SwimFarm Hub — one feedback per client per day for the whole team (e.g. Tinashe). */
  function isBespokeMultiStaffSharedSlot(slot) {
    if (!slot || !isBespokeService(slot.service)) return false;
    if (clean(slot.venue).toLowerCase() !== "swimfarm") return false;
    if (slotAreaKind(slot) !== "hub") return false;
    return slotInstructorCount(slot) >= 2;
  }

  function dayCentreFeedbackServiceCompatible(fb, slot) {
    var fbSvc = serviceKey(clean(fb.service));
    var slotSvc = serviceKey(clean(slot.service));
    if (!fbSvc || !slotSvc || fbSvc === slotSvc) return true;
    if (isDayCentreService(fb.service) && isBespokeService(slot.service)) return true;
    if (isBespokeService(fb.service) && isDayCentreService(slot.service)) return true;
    return false;
  }

  function isMultiActivityService(service) {
    return serviceKey(service).indexOf("multi-activity") !== -1;
  }

  function isAquaticService(service) {
    var k = serviceKey(service);
    return k.indexOf("aquatic") !== -1 || k.indexOf("swimming") !== -1;
  }

  function isClimbingService(service) {
    return serviceKey(service).indexOf("climbing") !== -1;
  }

  function isPhysicalActivityService(service) {
    var k = serviceKey(service);
    return (
      k.indexOf("physical activity") !== -1 ||
      k.indexOf("physical activities") !== -1 ||
      k.indexOf("fitness") !== -1 ||
      k === "gym"
    );
  }

  /** Monday SwimFarm ACAT block \u2013 group feedback covers these roster names (slug keys). */
  var ACAT_MEMBER_SLUGS = { jack_w: true, jack_s: true, kamy: true, kate: true };

  function isAcatMemberClient(name) {
    return !!ACAT_MEMBER_SLUGS[canonicalClientSlug(name)];
  }

  function isAcatGroupClient(name) {
    var s = canonicalClientSlug(name);
    return s === "acat" || s === "acat_group";
  }

  function findAcatGroupFeedbackInList(list, iso) {
    for (var i = 0; i < list.length; i++) {
      var fb = list[i];
      if (!isAcatGroupClient(fb.client_name)) continue;
      if (feedbackSessionDate(fb) !== iso) continue;
      if (isAbsentFeedbackRow(fb)) continue;
      if (isAquaticService(fb.service) || clean(fb.portal_session_key).toLowerCase().indexOf("acat") >= 0) {
        return fb;
      }
    }
    return null;
  }

  function isAcatMorningAquaticSlot(slot) {
    if (!slot || !isAquaticService(slot.service)) return false;
    var st = slot.time_start || normTimeKey(slot.time_slot);
    if (st === "11:00") return true;
    var ts = clean(slot.time_slot).toLowerCase();
    return ts.indexOf("11") === 0 || ts === "11 to 12";
  }

  function acatGroupCoverageConfig() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && src.acatGroupCoverage ? src.acatGroupCoverage : null;
  }

  function slotMatchesAcatCoverage(slot, cfg) {
    if (!cfg || !slot) return false;
    if (cfg.weekday && weekdayLongFromIso(slot.session_date) !== cfg.weekday) return false;
    if (!isAquaticService(slot.service)) return false;
    if (cfg.venues && cfg.venues.length) {
      var v = clean(slot.venue).toLowerCase();
      var okVenue = false;
      for (var vi = 0; vi < cfg.venues.length; vi++) {
        if (clean(cfg.venues[vi]).toLowerCase() === v) {
          okVenue = true;
          break;
        }
      }
      if (!okVenue) return false;
    }
    if (cfg.time_slots && cfg.time_slots.length) {
      var ts = clean(slot.time_slot);
      if (cfg.time_slots.indexOf(ts) === -1) return false;
    }
    if (cfg.client_slugs && cfg.client_slugs.length) {
      var slug = canonicalClientSlug(slot.client_name);
      if (cfg.client_slugs.indexOf(slug) === -1) return false;
    }
    return true;
  }

  function slotMatchesOverviewOmitRule(slot, rule) {
    if (!rule || !slot) return false;
    if (rule.weekday && weekdayLongFromIso(slot.session_date) !== rule.weekday) return false;
    if (rule.client_slug && canonicalClientSlug(slot.client_name) !== canonicalClientSlug(rule.client_slug)) {
      return false;
    }
    if (rule.time_slot && clean(slot.time_slot) !== clean(rule.time_slot)) return false;
    if (rule.service && serviceKey(slot.service) !== serviceKey(rule.service)) return false;
    return true;
  }

  function shouldOmitOverviewSlot(hub, slot) {
    if (!slot) return false;
    var cfg = acatGroupCoverageConfig();
    if (cfg && slotMatchesAcatCoverage(slot, cfg)) {
      if (cfg.always_hide_individual_rows === true) return true;
      if (hub.findAcatGroupFeedbackForDate(slot.session_date)) return true;
    }
    if (hub.acatGroupCoversSlot(slot)) return true;
    var omitRules =
      global.STAFF_DASHBOARD_SOURCE && Array.isArray(global.STAFF_DASHBOARD_SOURCE.overviewOmitRosterSlots)
        ? global.STAFF_DASHBOARD_SOURCE.overviewOmitRosterSlots
        : [];
    for (var oi = 0; oi < omitRules.length; oi++) {
      if (slotMatchesOverviewOmitRule(slot, omitRules[oi])) return true;
    }
    return false;
  }

  function feedbackSubmittedAtMs(fb) {
    var raw = fb && (fb.created_at || fb.updated_at);
    if (!raw) return 0;
    var t = Date.parse(String(raw));
    return isNaN(t) ? 0 : t;
  }

  function feedbackSortNewestFirst(a, b) {
    var diff = feedbackSubmittedAtMs(b) - feedbackSubmittedAtMs(a);
    if (diff !== 0) return diff;
    return String(a.client_name || "").localeCompare(String(b.client_name || ""), "en", {
      sensitivity: "base",
    });
  }

  function feedbackMergeRules() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.sundayFeedbackMerges) ? src.sundayFeedbackMerges : [];
  }

  var SUNDAY_HUB_TEAM_MERGE_PREFIX = "sunday_hub_team|";

  function sundayHubSupportTeams() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return (src && src.sundayHubSupportTeams) || {};
  }

  function sundayHubTeamKeyForClient(clientName) {
    var teams = sundayHubSupportTeams();
    var slug = canonicalClientSlug(clientName);
    for (var key in teams) {
      if (!Object.prototype.hasOwnProperty.call(teams, key)) continue;
      var clients = teams[key].clients || [];
      for (var i = 0; i < clients.length; i++) {
        if (canonicalClientSlug(clients[i]) === slug) return key;
      }
    }
    return "";
  }

  function sundayHubTeamWorkerNames(teamKey) {
    var team = sundayHubSupportTeams()[teamKey];
    if (!team || !Array.isArray(team.workers)) return [];
    return team.workers
      .map(function (w) {
        return clean(w);
      })
      .filter(Boolean);
  }

  function feedbackFromSundayHubTeamWorker(fb, teamKey) {
    if (!fb || !teamKey) return false;
    var workers = sundayHubTeamWorkerNames(teamKey);
    for (var i = 0; i < workers.length; i++) {
      if (completedByMatchesInstructor(fb.completed_by_name, workers[i])) return true;
    }
    return false;
  }

  function instructorRuleMatches(ruleRaw, slotInstructors) {
    var want = clean(ruleRaw).toUpperCase();
    var list = slotInstructors || [];
    for (var i = 0; i < list.length; i++) {
      if (clean(list[i]).toUpperCase() === want) return true;
    }
    return false;
  }

  function feedbackMergeGroupForSlot(slot) {
    var rules = feedbackMergeRules();
    var wd = slot.day || weekdayLongFromIso(slot.session_date);
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.day && clean(rule.day) !== wd) continue;
      if (canonicalClientSlug(rule.client_name) !== canonicalClientSlug(slot.client_name)) continue;
      if (!instructorRuleMatches(rule.instructors, slot.instructors)) continue;
      var sub = rule.slots || [];
      for (var j = 0; j < sub.length; j++) {
        if (
          clean(sub[j].time_slot) === clean(slot.time_slot) &&
          serviceKey(sub[j].service) === serviceKey(slot.service)
        ) {
          return (
            clean(rule.mergeKey) ||
            canonicalClientSlug(rule.client_name) + "_" + slugify(rule.instructors) + "_merged"
          );
        }
      }
    }
    if (
      wd === "Sunday" &&
      isMultiActivityService(slot.service) &&
      clean(slot.venue).toLowerCase() === "swimfarm" &&
      slotAreaKind(slot) === "hub"
    ) {
      var teamKey = sundayHubTeamKeyForClient(slot.client_name);
      if (teamKey) {
        return (
          SUNDAY_HUB_TEAM_MERGE_PREFIX +
          teamKey +
          "|" +
          canonicalClientSlug(slot.client_name)
        );
      }
    }
    return "";
  }

  function slotAreaKind(slot) {
    var a = sessionAreaKey(slot.area);
    if (a === "hub_room") return "hub";
    if (a === "climbing_wall") return "climb";
    if (a === "small_pool" || isAquaticService(slot.service)) return "aquatic";
    if (a === "big_pool") return "pool";
    return a;
  }

  /** 4th segment of portal_session_key may be area slug or legacy service slug. */
  function portalKeyAreaToken(raw) {
    var k = sessionAreaKey(raw);
    if (k === "multi_activity" || k === "multiactivity" || k === "bespoke_programme") return "";
    /* Unit suffix in portal_session_key (not roster pool/hub area slug). */
    if (k === "aquatic" || k === "day_centre") return "";
    return k;
  }

  /** Bespoke hub keys may use hub_room while roster area slug is swimfarm_hub_room. */
  function portalBespokeAreaTokensCompatible(pkArea, slotArea) {
    if (!pkArea || !slotArea) return true;
    if (pkArea === slotArea) return true;
    if (pkArea.indexOf("hub") >= 0 && slotArea.indexOf("hub") >= 0) return true;
    if (pkArea.indexOf("pool") >= 0 && slotArea.indexOf("pool") >= 0) return true;
    return false;
  }

  /** Acton aquatic keys may say small_pool while roster area is teaching_pool (same session). */
  function portalAquaticAreaTokensCompatible(pkArea, slotArea) {
    if (!pkArea || !slotArea) return true;
    if (pkArea === slotArea) return true;
    if (pkArea === "aquatic" || slotArea === "aquatic") return true;
    if (pkArea.indexOf("pool") >= 0 && slotArea.indexOf("pool") >= 0) return true;
    if (/swim|aquatic/.test(pkArea) && /swim|aquatic|pool/.test(slotArea)) return true;
    return false;
  }

  /** Area slug from portal_session_key segments (handles date|time|client|unit|area layouts). */
  function portalKeyAreaFromParts(parts) {
    if (!parts || parts.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return "";
    var pkArea = portalKeyAreaToken(parts[3]);
    if (!pkArea && parts.length >= 5) pkArea = portalKeyAreaToken(parts[4]);
    return pkArea;
  }

  function completedByMatchesInstructor(completedBy, instructorRaw) {
    var by = clean(completedBy).toLowerCase();
    var inst = clean(instructorRaw).toLowerCase();
    if (!by || !inst) return false;
    if (by === inst) return true;
    if (by.indexOf(inst) >= 0 || inst.indexOf(by) >= 0) return true;
    var tokens = by.split(/\s+/).filter(Boolean);
    if (tokens.indexOf(inst) >= 0) return true;
    if (tokens[0] && (tokens[0] === inst || inst.indexOf(tokens[0]) >= 0 || tokens[0].indexOf(inst) >= 0)) {
      return true;
    }
    if ((inst === "luliya" || inst === "lulia") && (by.indexOf("luliya") >= 0 || by.indexOf("lulia") >= 0 || by.indexOf("aida") >= 0)) {
      return true;
    }
    return false;
  }

  /** Acton aquatic: same client twice same day (e.g. Eiji 17:30 + 18:00) needs two feedbacks when instructors differ. */
  function aquaticSlotCountForClientOnDate(iso, clientName) {
    var cid = canonicalClientSlug(clientName);
    if (!iso || !cid) return 0;
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    var wd = weekdayLongFromIso(iso);
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!rosterRowAppliesOnDate(rows, r, iso, wd)) continue;
      if (canonicalClientSlug(r.client_name) !== cid) continue;
      if (!isAquaticService(r.service)) continue;
      if (!isRosterClient(r.client_name)) continue;
      n++;
    }
    return n;
  }

  /** True when the client has 2+ aquatic blocks that day with the same instructor (e.g. Serine both with Roberto). */
  function aquaticSameInstructorAllSlotsOnDate(iso, clientName) {
    var cid = canonicalClientSlug(clientName);
    if (!iso || !cid) return false;
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    var wd = weekdayLongFromIso(iso);
    var lead = "";
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!rosterRowAppliesOnDate(rows, r, iso, wd)) continue;
      if (canonicalClientSlug(r.client_name) !== cid) continue;
      if (!isAquaticService(r.service)) continue;
      if (!isRosterClient(r.client_name)) continue;
      n++;
      var inst = clean(r.instructors).toUpperCase();
      if (!inst) continue;
      if (!lead) lead = inst;
      else if (lead !== inst) return false;
    }
    return n > 1 && !!lead;
  }

  function clientNeedsPerSlotAquaticFeedback(slot) {
    if (!slot || !isAquaticService(slot.service)) return false;
    if (aquaticSlotCountForClientOnDate(slot.session_date, slot.client_name) <= 1) return false;
    return !aquaticSameInstructorAllSlotsOnDate(slot.session_date, slot.client_name);
  }

  function completedByMatchesSlotInstructors(completedBy, slot) {
    var insts = slot.instructors || [];
    if (!insts.length) return true;
    for (var i = 0; i < insts.length; i++) {
      if (completedByMatchesInstructor(completedBy, insts[i])) return true;
    }
    return false;
  }

  function completedByFitsSlotArea(completedBy, slot) {
    var by = clean(completedBy).toLowerCase();
    if (!by) return true;
    var insts = slot.instructors || [];
    if (!insts.length && slot.instructor_label) {
      insts = parseInstructors(slot.instructor_label);
    }
    if (insts.length) {
      for (var i = 0; i < insts.length; i++) {
        if (completedByMatchesInstructor(completedBy, insts[i])) return true;
      }
      return false;
    }
    var kind = slotAreaKind(slot);
    if (kind === "hub") return /godsway|giuseppe|lulia|luliya|bismark|john|berta/.test(by);
    if (kind === "pool") return /aurora|javier|roberto|dan|youssef/.test(by);
    if (kind === "climb") return /carlos|alex|bismark/.test(by);
    if (kind === "aquatic") return /aurora|javier|roberto|dan|youssef|bismark/.test(by);
    return true;
  }

  function feedbackTimeMatchesSlot(fb, slot) {
    var st = slot.time_start || normTimeKey(slot.time_slot);
    if (!st) return true;
    var ft = normTimeKey(fb.session_time);
    if (ft && ft === st) return true;
    if (fb.session_time && slot.day) {
      var parsed = parseTimeSlot(fb.session_time, slot.day);
      if (parsed.start && parsed.start === st) return true;
    }
    var pk = clean(fb.portal_session_key);
    if (pk) {
      var parts = pk.split("|").map(clean);
      if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
        if (!parts[1] && parts[2] && canonicalClientSlug(parts[2]) === canonicalClientSlug(slot.client_name)) {
          return true;
        }
        // feedback_unit_key layout: date|client|time|service|area
        if (
          parts[1] &&
          !normTimeKey(parts[1]) &&
          normTimeKey(parts[2]) === st &&
          canonicalClientSlug(parts[1]) === canonicalClientSlug(slot.client_name)
        ) {
          return true;
        }
      }
      if (parts.length >= 2 && normTimeKey(parts[1]) === st) return true;
      if (parts.length >= 3 && normTimeKey(parts[2]) === st) return true;
    }
    if (clientNeedsPerSlotAquaticFeedback(slot)) return false;
    return !ft;
  }

  function servicesCompatibleForSlot(fb, slot) {
    var fbSvc = serviceKey(clean(fb.service));
    var slotSvc = serviceKey(clean(slot.service));
    if (!fbSvc || !slotSvc || fbSvc === slotSvc) return true;
    if (isDayCentreService(slot.service) || isDayCentreService(fb.service)) {
      return dayCentreFeedbackServiceCompatible(fb, slot);
    }
    var kind = slotAreaKind(slot);
    if (kind === "climb" && isMultiActivityService(fb.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    if (kind === "climb" && isAquaticService(fb.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    if (kind === "pool" && isMultiActivityService(slot.service) && isAquaticService(fb.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    if (kind === "aquatic" && isMultiActivityService(fb.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    if (isAquaticService(fb.service) && isAquaticService(slot.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    if (isPhysicalActivityService(fb.service) && isPhysicalActivityService(slot.service)) {
      return true;
    }
    if (isBespokeService(fb.service) && isBespokeService(slot.service)) return true;
    if (isBespokeService(fb.service) && serviceKey(slot.service).indexOf("group session") !== -1) return true;
    if (isBespokeService(slot.service) && serviceKey(fb.service).indexOf("group session") !== -1) return true;
    if (isBespokeService(slot.service) && isMultiActivityService(fb.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    return false;
  }

  /** Roster day match; allows feedback saved next calendar day (e.g. Sunday session logged Monday). */
  function feedbackRosterDateMatches(fb, slot) {
    var sd = feedbackSessionDate(fb);
    if (!sd) return false;
    if (sd === slot.session_date) return true;
    if (fb.late_session_feedback === true && sd === addDaysIso(slot.session_date, 1)) return true;
    if (sd === addDaysIso(slot.session_date, 1)) {
      if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
      if (!completedByFitsSlotArea(fb.completed_by_name, slot)) return false;
      return true;
    }
    return false;
  }

  function isAbsentFeedbackRow(fb) {
    return !!(fb && fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0);
  }

  function isCancellationFeedbackRow(fb) {
    return !!(fb && fb._ashCancellationMark);
  }

  function isTerminalFeedbackRow(fb) {
    return isAbsentFeedbackRow(fb) || isCancellationFeedbackRow(fb);
  }

  function isPortalTestClientName(name) {
    return /^test\s*client$/i.test(String(name || "").trim());
  }

  /** Portal guide (Teflon) demo roster — visible in roster but excluded from session totals. */
  function isTeflonDemoRosterSlot(slot) {
    if (!slot) return false;
    var insts =
      slot.instructors && slot.instructors.length
        ? slot.instructors
        : parseInstructors(slot.instructor_label || "");
    if (!insts.length) return false;
    if (insts.length === 1) return clean(insts[0]).toUpperCase() === "TEFLON";
    return false;
  }

  /** One submitted row covers every slot in a sundayFeedbackMerges group (e.g. Yusuf 9:00 + 9:30 with Roberto). */
  function feedbackCoversMergeGroup(fb, slots) {
    if (!fb || !slots.length) return false;
    if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) return false;
    var sd = feedbackSessionDate(fb);
    if (!sd || sd !== slots[0].session_date) return false;
    if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slots[0].client_name)) return false;
    if (!completedByFitsSlotArea(fb.completed_by_name, slots[0])) return false;
    for (var i = 0; i < slots.length; i++) {
      if (feedbackFitsSlot(fb, slots[i])) return true;
    }
    return true;
  }

  /** Infer pool / hub / climb from portal key or submitter (Sunday multi blocks). */
  function feedbackAreaKindFromFb(fb) {
    if (!fb) return "";
    var pk = clean(fb.portal_session_key).toLowerCase();
    if (pk.indexOf("hub_room") >= 0 || pk.indexOf("|hub") >= 0) return "hub";
    if (pk.indexOf("big_pool") >= 0) return "pool";
    if (pk.indexOf("climbing") >= 0 || pk.indexOf("climb") >= 0) return "climb";
    if (pk.indexOf("small_pool") >= 0) return "aquatic";
    if (isClimbingService(fb.service)) return "climb";
    if (isAquaticService(fb.service)) return "aquatic";
    if (isMultiActivityService(fb.service)) {
      var by = clean(fb.completed_by_name).toLowerCase();
      if (/godsway|giuseppe|lulia|luliya|bismark|john|berta/.test(by)) return "hub";
      if (/aurora|javier|roberto|dan|youssef/.test(by)) return "pool";
    }
    return "";
  }

  /**
   * Sunday SwimFarm multi: one submitted row for a client+area (pool vs hub) covers every
   * roster block that day with the same area \u2013 times often differ between form and roster.
   */
  function sundaySwimFarmMultiAreaDayCovers(fb, slot) {
    if (!fb || !slot) return false;
    if (weekdayLongFromIso(slot.session_date) !== "Sunday") return false;
    if (clean(slot.venue).toLowerCase() !== "swimfarm") return false;
    if (!isMultiActivityService(slot.service)) return false;
    if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) return false;
    if (!feedbackRosterDateMatches(fb, slot)) return false;
    if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
    if (!completedByFitsSlotArea(fb.completed_by_name, slot)) return false;
    if (!isMultiActivityService(fb.service) && !servicesCompatibleForSlot(fb, slot)) return false;
    var slotKind = slotAreaKind(slot);
    var fbKind = feedbackAreaKindFromFb(fb);
    return !!(slotKind && fbKind && slotKind === fbKind);
  }

  /** Sunday Westway climb: Carlos (etc.) \u2013 session time on form often \u2260 roster block. */
  function sundayWestwayClimbDayCovers(fb, slot) {
    if (!fb || !slot) return false;
    if (weekdayLongFromIso(slot.session_date) !== "Sunday") return false;
    if (clean(slot.venue).toLowerCase() !== "westway") return false;
    if (!isClimbingService(slot.service)) return false;
    if (isAbsentFeedbackRow(fb)) return false;
    if (!feedbackRosterDateMatches(fb, slot)) return false;
    if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
    if (!completedByFitsSlotArea(fb.completed_by_name, slot)) return false;
    if (!isClimbingService(fb.service) && !servicesCompatibleForSlot(fb, slot)) return false;
    return feedbackAreaKindFromFb(fb) === "climb" || isClimbingService(fb.service);
  }

  /** SwimFarm bespoke: one attended feedback per client/day (hub staff), even if portal key time/area differ. */
  function bespokeSwimfarmHubDayCovers(fb, slot) {
    if (!fb || !slot) return false;
    if (!isBespokeService(slot.service)) return false;
    if (isAbsentFeedbackRow(fb)) return false;
    if (clean(slot.venue).toLowerCase() !== "swimfarm") return false;
    if (slotAreaKind(slot) !== "hub") return false;
    if (!feedbackRosterDateMatches(fb, slot)) return false;
    if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
    if (!completedByFitsSlotArea(fb.completed_by_name, slot)) return false;
    if (!servicesCompatibleForSlot(fb, slot)) return false;
    var er = fb.engagement_rating;
    if (er != null && er !== "" && !isNaN(Number(er))) return true;
    return !!clean(fb.positive_feedback);
  }

  function feedbackFitsSlot(fb, slot) {
    if (!fb || !slot) return false;
    if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) return false;
    if (!feedbackRosterDateMatches(fb, slot)) return false;
    if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
    if (isDayCentreService(slot.service)) {
      return dayCentreFeedbackServiceCompatible(fb, slot);
    }
    if (isBespokeMultiStaffSharedSlot(slot)) {
      if (isAbsentFeedbackRow(fb)) return false;
      if (!feedbackRosterDateMatches(fb, slot)) return false;
      if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
      if (!isBespokeService(fb.service) && !isDayCentreService(fb.service)) return false;
      return true;
    }
    if (sundayWestwayClimbDayCovers(fb, slot)) return true;
    if (sundaySwimFarmMultiAreaDayCovers(fb, slot)) return true;
    if (bespokeSwimfarmHubDayCovers(fb, slot)) return true;
    var fbSvc = serviceKey(clean(fb.service));
    var slotSvc = serviceKey(clean(slot.service));
    if (fbSvc && slotSvc && fbSvc !== slotSvc && !servicesCompatibleForSlot(fb, slot)) return false;
    if (!feedbackTimeMatchesSlot(fb, slot)) return false;
    var pk = clean(fb.portal_session_key).toLowerCase();
    if (pk) {
      var parts = pk.split("|").map(clean);
      if (parts.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
        var pkArea = portalKeyAreaFromParts(parts);
        var slotArea = sessionAreaKey(slot.area);
        if (pkArea && slotArea && pkArea !== slotArea) {
          if (isBespokeService(slot.service)) {
            if (portalBespokeAreaTokensCompatible(pkArea, slotArea)) return true;
            if (parts.length >= 5) {
              var pkAreaTail = portalKeyAreaToken(parts[4]);
              if (pkAreaTail && portalBespokeAreaTokensCompatible(pkAreaTail, slotArea)) return true;
            }
            return false;
          }
          if (isMultiActivityService(slot.service) || isClimbingService(slot.service)) {
            return completedByFitsSlotArea(fb.completed_by_name, slot);
          }
          if (isAquaticService(slot.service) && portalAquaticAreaTokensCompatible(pkArea, slotArea)) {
            if (clientNeedsPerSlotAquaticFeedback(slot)) {
              return completedByMatchesSlotInstructors(fb.completed_by_name, slot);
            }
            return completedByFitsSlotArea(fb.completed_by_name, slot);
          }
          return false;
        }
      }
    }
    if (isMultiActivityService(slot.service) || isClimbingService(slot.service)) {
      return completedByFitsSlotArea(fb.completed_by_name, slot);
    }
    if (clientNeedsPerSlotAquaticFeedback(slot)) {
      return completedByMatchesSlotInstructors(fb.completed_by_name, slot);
    }
    return true;
  }

  /** Support vs swim instructor on the same MA block are separate feedback units. */
  function primaryInstructorKey(slot) {
    var raw = "";
    if (slot.instructors && slot.instructors.length) raw = slot.instructors[0];
    else if (slot.instructor_label) {
      raw = String(slot.instructor_label).split(/[,/&]+|\s+and\s+/gi)[0];
    }
    return slugify(clean(raw)) || "staff";
  }

  /** Sunday SwimFarm: support worker vs swim instructor = separate feedback units. */
  function maFeedbackUnitUsesInstructorSplit(slot) {
    return !!(slot && isMultiActivityService(slot.service));
  }

  /** Climbing: Carlos / Alex / Bismark each owe separate feedback even on the same client day. */
  function climbingFeedbackUnitUsesInstructorSplit(slot) {
    return !!(slot && isClimbingService(slot.service));
  }

  /** Day Centre: one feedback per client per calendar day (any worker, any roster block). */
  function feedbackUnitKey(slot) {
    var mergeGroup = feedbackMergeGroupForSlot(slot);
    if (mergeGroup) {
      return slot.session_date + "|merge|" + mergeGroup;
    }
    var cid = canonicalClientSlug(slot.client_name);
    if (!slot.session_date || !cid) return "";
    if (isDayCentreService(slot.service)) {
      return slot.session_date + "|" + cid + "|day_centre";
    }
    if (isBespokeMultiStaffSharedSlot(slot)) {
      return slot.session_date + "|" + cid + "|bespoke_shared";
    }
    var t = slot.time_start || normTimeKey(slot.time_slot);
    if (isMultiActivityService(slot.service)) {
      var maKey =
        slot.session_date +
        "|" +
        cid +
        "|" +
        t +
        "|" +
        serviceKey(slot.service) +
        "|" +
        sessionAreaKey(slot.area);
      if (maFeedbackUnitUsesInstructorSplit(slot)) {
        return maKey + "|" + primaryInstructorKey(slot);
      }
      return maKey;
    }
    if (isBespokeService(slot.service)) {
      return (
        slot.session_date +
        "|" +
        cid +
        "|" +
        t +
        "|" +
        serviceKey(slot.service) +
        "|" +
        sessionAreaKey(slot.area)
      );
    }
    if (isAquaticService(slot.service)) {
      if (clientNeedsPerSlotAquaticFeedback(slot)) {
        return slot.session_date + "|" + cid + "|" + t + "|aquatic";
      }
      return slot.session_date + "|" + cid + "|aquatic";
    }
    if (isClimbingService(slot.service)) {
      var climbKey =
        slot.session_date +
        "|" +
        cid +
        "|" +
        t +
        "|" +
        serviceKey(slot.service) +
        "|" +
        sessionAreaKey(slot.area);
      if (climbingFeedbackUnitUsesInstructorSplit(slot)) {
        return climbKey + "|" + primaryInstructorKey(slot);
      }
      return climbKey;
    }
    return slot.session_key || slot.session_date + "|" + cid + "|" + t;
  }

  function groupSlotsForFeedback(slots) {
    var map = {};
    var order = [];
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var key = feedbackUnitKey(slot);
      if (!key) {
        order.push({ key: "row-" + i, slots: [slot] });
        continue;
      }
      if (!map[key]) {
        map[key] = { key: key, slots: [] };
        order.push(map[key]);
      }
      map[key].slots.push(slot);
    }
    return order;
  }

  function slotIsAfternoonSession(slot) {
    var st = slot.time_start || normTimeKey(slot.time_slot);
    return !!(st && st >= "16:00");
  }

  /** One overview row per feedback unit (Day Centre blocks collapse to one row per client). */
  function pickRepresentativeSlotForUnit(unit) {
    var slots = unit.slots;
    if (!slots || !slots.length) return null;
    var rep = slots[0];
    var si;
    for (si = 1; si < slots.length; si++) {
      if ((slots[si].time_start || "") < (rep.time_start || "")) rep = slots[si];
    }
    if (slots.length === 1 || !isDayCentreService(rep.service)) return rep;
    var last = rep;
    for (si = 0; si < slots.length; si++) {
      if ((slots[si].time_start || "") >= (last.time_start || "")) last = slots[si];
    }
    if (last === rep) return rep;
    var merged = Object.assign({}, rep);
    var a = clean(rep.time_slot);
    var b = clean(last.time_slot);
    if (a && b && a !== b) {
      var startPart = a.indexOf(" to ") >= 0 ? a.split(" to ")[0] : a;
      var endPart = b.indexOf(" to ") >= 0 ? b.split(" to ").pop() : b;
      merged.time_slot = startPart + " to " + endPart;
      var pt = parseTimeSlot(merged.time_slot, rep.day);
      merged.time_start = pt.start;
    }
    return merged;
  }

  function overviewDisplaySlotsFromUnits(hub, slots) {
    var units = groupSlotsForFeedback(slots);
    var out = [];
    for (var i = 0; i < units.length; i++) {
      var rep = pickOverviewRepresentativeSlot(hub, units[i]);
      if (!rep) continue;
      out.push(rep);
    }
    return out;
  }

  /** Prefer a visible roster row when merge groups hide duplicate aquatic blocks (e.g. Yusuf + Roberto). */
  function pickOverviewRepresentativeSlot(hub, unit) {
    var slots = unit && unit.slots ? unit.slots : [];
    if (!slots.length) return null;
    var rep = pickRepresentativeSlotForUnit(unit);
    if (rep && !shouldOmitOverviewSlot(hub, rep)) return rep;
    for (var i = 0; i < slots.length; i++) {
      if (!shouldOmitOverviewSlot(hub, slots[i])) return slots[i];
    }
    return null;
  }

  function expectedSessionsByWeekdayConfig() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && src.expectedSessionsByWeekday ? src.expectedSessionsByWeekday : null;
  }

  function countOverviewSessionBands(slots) {
    var am = 0;
    var pm = 0;
    for (var i = 0; i < slots.length; i++) {
      if (slotIsAfternoonSession(slots[i])) pm++;
      else am++;
    }
    return { morning: am, afternoon: pm, total: slots.length };
  }

  function htmlOverviewSessionCountHint(hub, iso, displaySlots, esc) {
    var useFeedbackUnits =
      hub &&
      typeof hub.getFeedbackUnitsForDate === "function" &&
      (hub.mode === "feedback" || hub.tab === "tracking");
    if (useFeedbackUnits) {
      var units = hub
        .getFeedbackUnitsForDate(iso)
        .map(function (u) {
          return {
            key: u.key,
            slots: u.slots.filter(function (s) {
              return !shouldOmitOverviewSlot(hub, s) && !isTeflonDemoRosterSlot(s) && hub.slotIncludedInDayStats(s);
            }),
          };
        })
        .filter(function (u) {
          return u.slots.length > 0;
        });
      var unitTotal = units.length;
      var wd = weekdayLongFromIso(iso);
      var expected = expectedSessionsByWeekdayConfig();
      var exp = expected && expected[wd];
      var label = unitTotal + " feedback units";
      if (!exp) {
        return (
          '<span class="ash-badge ash-badge--muted" style="margin-left:0.5rem">' +
          esc(label) +
          "</span>"
        );
      }
      var mismatch = unitTotal !== exp.total;
      var detail = " (expected " + exp.total + " feedback units)";
      return (
        '<span class="ash-badge' +
        (mismatch
          ? '" style="margin-left:0.5rem;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca"'
          : ' ash-badge--muted" style="margin-left:0.5rem"') +
        ">" +
        esc(label + detail) +
        "</span>"
      );
    }
    var bands = countOverviewSessionBands(displaySlots);
    var wd = weekdayLongFromIso(iso);
    var expected = expectedSessionsByWeekdayConfig();
    var exp = expected && expected[wd];
    var label =
      bands.morning +
      " morning + " +
      bands.afternoon +
      " afternoon = " +
      bands.total +
      " sessions";
    if (!exp) {
      return (
        '<span class="ash-badge ash-badge--muted" style="margin-left:0.5rem">' +
        esc(label) +
        "</span>"
      );
    }
    var mismatch =
      bands.total !== exp.total ||
      bands.morning !== exp.morning ||
      bands.afternoon !== exp.afternoon;
    var detail =
      " (expected " +
      exp.total +
      ": " +
      exp.morning +
      " AM + " +
      exp.afternoon +
      " PM)";
    return (
      '<span class="ash-badge' +
      (mismatch ? '" style="margin-left:0.5rem;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca"' : ' ash-badge--muted" style="margin-left:0.5rem"') +
      ">" +
      esc(label + detail) +
      "</span>"
    );
  }

  function formatInstructorPill(name) {
    var n = clean(name);
    if (!n) return "";
    var title = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    return '<span class="ash-pill">' + esc(title) + "</span>";
  }

  function emotionDotClass(emotionsText) {
    var t = clean(emotionsText).toLowerCase();
    if (!t) return "";
    if (/withdrawn|shutdown|disengaged/.test(t)) return "ash-emotion ash-emotion--blue";
    if (/anxious|worried|nervous|upset/.test(t)) return "ash-emotion ash-emotion--amber";
    if (/control|aggressive|meltdown|distress/.test(t)) return "ash-emotion ash-emotion--red";
    if (/happy|excited|calm|engaged|positive/.test(t)) return "ash-emotion ash-emotion--green";
    return "ash-emotion ash-emotion--green";
  }

  function categorizeEmotion(emotionsText) {
    var t = clean(emotionsText).toLowerCase();
    if (!t) return null;
    if (/withdrawn|shutdown|disengaged/.test(t)) return "withdrawn";
    if (/anxious|worried|nervous|upset/.test(t)) return "anxious";
    if (/control|aggressive|meltdown|distress/.test(t)) return "out_of_control";
    if (/happy|excited|calm|engaged|positive/.test(t)) return "happy";
    return "happy";
  }

  /** Split multi-select emotions from session feedback ("Happy; Anxious"). */
  function emotionTokens(raw) {
    return clean(raw)
      .split(/[;,]+/g)
      .map(function (x) {
        return clean(x);
      })
      .filter(Boolean);
  }

  function needsReviewRow(fb) {
    if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) return false;
    if (fb.late_session_feedback === true) return true;
    if (fb.incident_notification_requested === true) return true;
    if (clean(fb.exceptional_challenges)) return true;
    return false;
  }

  function independenceLabel(fb) {
    var p = fb.engagement_patterns;
    if (Array.isArray(p) && p.length) return p.join(", ");
    if (typeof p === "string" && clean(p)) return clean(p);
    return "\u2014";
  }

  function independenceTokens(fb) {
    var p = fb.engagement_patterns;
    if (Array.isArray(p)) {
      return p
        .map(function (x) {
          return clean(x);
        })
        .filter(Boolean);
    }
    if (typeof p === "string" && clean(p)) {
      return clean(p)
        .split(/[;,]+/g)
        .map(function (x) {
          return clean(x);
        })
        .filter(Boolean);
    }
    return [];
  }

  function categorizeIndependence(text) {
    var t = clean(text).toLowerCase();
    if (!t) return null;
    if (t.indexOf("full support") !== -1) return "full";
    if (t.indexOf("regular support") !== -1) return "regular";
    if (t.indexOf("prompt") !== -1) return "prompts";
    if (t.indexOf("independent") !== -1) return "independent";
    return null;
  }

  var ASH_EMOTION_FACE_SVG = {
    happy:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.25" fill="currentColor" stroke="none"/><path d="M8 14Q12 17.2 16 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>',
    anxious:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><path d="M8 8.5l2 1.5M16 8.5l-2 1.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M8.5 14.5h7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M17.2 6.3c.9.6.8 1.8 0 2.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
    withdrawn:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.25" fill="currentColor" stroke="none"/><path d="M8 15.5Q12 12.7 16 15.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>',
    out_of_control:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><path d="M8 8.5l3 2M16 8.5l-3 2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M9 15h6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
  };

  var ASH_INDEP_ICON_SVG = {
    independent:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    prompts:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/></svg>',
    regular:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    full:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };

  function incidentsSessionNotes(fb) {
    var bits = [];
    if (clean(fb.incidents)) bits.push(clean(fb.incidents));
    if (clean(fb.exceptional_challenges)) bits.push(clean(fb.exceptional_challenges));
    return bits.length ? bits.join("\n\n") : "\u2014";
  }

  function emotionFaceColor(cat) {
    if (cat === "withdrawn") return "#2563eb";
    if (cat === "anxious") return "#ca8a04";
    if (cat === "out_of_control") return "#dc2626";
    return "#16a34a";
  }

  function emotionFacesHtml(fb, escFn) {
    var tokens = emotionTokens(fb.client_emotions);
    if (!tokens.length && clean(fb.client_emotions)) tokens = [String(fb.client_emotions)];
    if (!tokens.length) return "\u2014";
    var out = [];
    var seen = {};
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var cat = categorizeEmotion(tok);
      if (!cat) continue;
      if (seen[cat]) continue;
      seen[cat] = true;
      var svg = ASH_EMOTION_FACE_SVG[cat];
      if (!svg) continue;
      out.push(
        '<span class="ash-regulation-face ash-regulation-face--' +
          cat +
          '" style="color:' +
          emotionFaceColor(cat) +
          '" title="' +
          escFn(tok) +
          '">' +
          svg +
          "</span>"
      );
    }
    return out.length ? '<span class="ash-regulation-group">' + out.join("") + "</span>" : "\u2014";
  }

  function termLabelFromRange(fromIso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso || "")) return "Selected range";
    var p = fromIso.split("-").map(Number);
    var m = p[1];
    if (m >= 4 && m <= 7) return "Summer Term " + p[0];
    if (m >= 9 && m <= 12) return "Autumn Term " + p[0];
    if (m >= 1 && m <= 3) return "Spring Term " + p[0];
    return "Term " + p[0];
  }

  function rowDateIso(val) {
    var s = clean(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (uk) {
      var y = uk[3].length === 2 ? 2000 + parseInt(uk[3], 10) : parseInt(uk[3], 10);
      return (
        y +
        "-" +
        String(parseInt(uk[2], 10)).padStart(2, "0") +
        "-" +
        String(parseInt(uk[1], 10)).padStart(2, "0")
      );
    }
    if (!s) return "";
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return isoFromDate(d);
  }

  function absentMarkDateIso(mk) {
    var fromSession = rowDateIso(mk && mk.session_date);
    if (fromSession) return fromSession;
    return rowDateIso(mk && mk.created_at);
  }

  function flattenTermWeekGroups(groups) {
    var out = [];
    for (var t = 0; t < groups.length; t++) {
      for (var w = 0; w < groups[t].weeks.length; w++) out.push(groups[t].weeks[w]);
    }
    out.sort(function (a, b) {
      return b.weekStart.localeCompare(a.weekStart);
    });
    return out;
  }

  /** Group rows into terms ? weeks (Mon\u2013Sun), newest first. */
  function groupByTermWeek(rows, getDateIso) {
    var byTerm = {};
    var termMeta = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var iso = getDateIso(row);
      if (!iso) continue;
      var term = termLabelFromRange(iso);
      var ws = mondayOfWeek(iso);
      if (!byTerm[term]) {
        byTerm[term] = {};
        termMeta[term] = iso;
      } else if (iso > termMeta[term]) {
        termMeta[term] = iso;
      }
      if (!byTerm[term][ws]) byTerm[term][ws] = [];
      byTerm[term][ws].push(row);
    }
    var terms = Object.keys(byTerm);
    terms.sort(function (a, b) {
      return String(termMeta[b] || "").localeCompare(String(termMeta[a] || ""));
    });
    return terms.map(function (term) {
      var weeksMap = byTerm[term];
      var weekStarts = Object.keys(weeksMap);
      weekStarts.sort(function (a, b) {
        return b.localeCompare(a);
      });
      var weeks = weekStarts.map(function (ws) {
        var items = weeksMap[ws].slice();
        items.sort(function (a, b) {
          return String(getDateIso(b) || "").localeCompare(String(getDateIso(a) || ""));
        });
        return {
          weekStart: ws,
          label: formatShortDate(ws) + " \u2013 " + formatShortDate(addDaysIso(ws, 6)),
          items: items,
        };
      });
      var total = 0;
      for (var w = 0; w < weeks.length; w++) total += weeks[w].items.length;
      return { label: term, weeks: weeks, total: total };
    });
  }

  function htmlWeekNavButtons(hub, opts) {
    opts = opts || {};
    var esc = hub.escapeHtml || esc;
    var thisWeekStart = mondayOfWeek(isoToday());
    var isThisWeek = hub.weekStart === thisWeekStart;
    var short = !!opts.shortLabels;
    return (
      '<div class="ash-week-nav">' +
      '<button type="button" class="ash-btn ash-btn--ghost" data-ash-week-prev>' +
      esc(short ? "\u2190 Prev" : "\u2190 Prev week") +
      "</button>" +
      '<button type="button" class="ash-btn ash-btn--ghost' +
      (isThisWeek ? " ash-btn--week-active" : "") +
      '" data-ash-week-this>' +
      esc("This week") +
      "</button>" +
      '<button type="button" class="ash-btn ash-btn--ghost" data-ash-week-next>' +
      esc(short ? "Next \u2192" : "Next week \u2192") +
      "</button></div>"
    );
  }

  function renderTermWeekLogHtml(opts) {
    var escFn = opts.escapeHtml || esc;
    var groups = groupByTermWeek(opts.rows || [], opts.getDateIso);
    var title = opts.title || "Activity log";
    var emptyMsg = opts.emptyMsg || "No records yet.";
    if (!groups.length) {
      return (
        '<section class="ash-activity-log">' +
        '<h3 class="ash-activity-log__title">' +
        escFn(title) +
        "</h3>" +
        '<p class="ash-empty">' +
        escFn(emptyMsg) +
        "</p></section>"
      );
    }
    var openTerm = opts.openTermLabel || "";
    var openWeek = opts.openWeekStart || "";
    var flatWeeks = !!opts.flatWeeks;
    var weekJumpOnly = !!opts.weekJumpOnly;
    var weekBodyHtml = opts.weekBodyHtml;
    var hint =
      opts.hint ||
      (weekJumpOnly
      ? 'Past weeks (Mon\u2013Sun). Click <strong>Show week \u2192</strong> to load that week above \u2014 stats, day buttons, and feedback for the selected day.'
      : flatWeeks
        ? 'Past weeks (Mon\u2013Sun). Expand a week for the day strip and feedback table, or use <strong>Show week \u2192</strong> to jump to the sticky week picker above.'
        : 'Grouped by term and week (Mon\u2013Sun). Use <strong>Show week \u2192</strong> or a <strong>date</strong> to open that week in the day view above (week buttons stay sticky at the top).');
    var out =
      '<section class="ash-activity-log">' +
      '<h3 class="ash-activity-log__title">' +
      escFn(title) +
      "</h3>" +
      '<p class="ash-activity-log__hint">' +
      hint +
      '</p><div class="ash-activity-log__tree' +
      (flatWeeks ? " ash-activity-log__tree--flat-weeks" : "") +
      '">';

    function renderWeekDetails(week, weekOpenAttr) {
      var wOut =
        '<details class="ash-log-week"' +
        weekOpenAttr +
        '><summary class="ash-log-week__summary">' +
        "Week " +
        escFn(week.label) +
        ' <span class="ash-log-count">(' +
        week.items.length +
        ")</span></summary>" +
        '<div class="ash-log-week__jump">' +
        '<button type="button" class="ash-btn ash-btn--ghost ash-log-jump" data-ash-log-jump-week="' +
        escFn(week.weekStart) +
        '">Show week \u2192</button></div>';
      if (weekBodyHtml) {
        wOut += '<div class="ash-log-week__body">' + weekBodyHtml(week, escFn) + "</div>";
      } else {
        var tableExtra = clean(opts.tableClass);
        wOut +=
          '<div class="ash-table-wrap ash-table-wrap--log"><table class="ash-table ash-table--compact' +
          (tableExtra ? tableExtra : "") +
          '"><thead><tr>' +
          opts.headHtml +
          "</tr></thead><tbody>";
        for (var r = 0; r < week.items.length; r++) {
          wOut += opts.rowHtml(week.items[r], escFn);
        }
        wOut += "</tbody></table></div>";
      }
      return wOut + "</details>";
    }

    if (flatWeeks) {
      var flat = flattenTermWeekGroups(groups);
      for (var fw = 0; fw < flat.length; fw++) {
        var fWeek = flat[fw];
        if (weekJumpOnly) {
          out +=
            '<div class="ash-log-week ash-log-week--jump-only">' +
            '<button type="button" class="ash-btn ash-btn--ghost ash-log-jump" data-ash-log-jump-week="' +
            escFn(fWeek.weekStart) +
            '">Show week \u2192</button> ' +
            "Week " +
            escFn(fWeek.label) +
            ' <span class="ash-log-count">(' +
            fWeek.items.length +
            ")</span></div>";
          continue;
        }
        var fOpen = openWeek && fWeek.weekStart === openWeek ? " open" : "";
        out += renderWeekDetails(fWeek, fOpen);
      }
      return out + "</div></section>";
    }

    for (var t = 0; t < groups.length; t++) {
      var term = groups[t];
      var termOpen = openTerm && term.label === openTerm ? " open" : "";
      out +=
        '<details class="ash-log-term"' +
        termOpen +
        '><summary class="ash-log-term__summary">' +
        escFn(term.label) +
        ' <span class="ash-log-count">(' +
        term.total +
        ")</span></summary><div class=\"ash-log-term__body\">";
      for (var w = 0; w < term.weeks.length; w++) {
        var week = term.weeks[w];
        var weekOpen =
          termOpen && openWeek && week.weekStart === openWeek ? " open" : "";
        out += renderWeekDetails(week, weekOpen);
      }
      out += "</div></details>";
    }
    return out + "</div></section>";
  }

  function reviewKindForRow(fb) {
    if (clean(fb.relevant_information)) return { kind: "relevant", title: "Relevant information \u2013 review", field: "relevant_information" };
    if (clean(fb.positive_feedback)) return { kind: "positive", title: "Positive feedback \u2013 review", field: "positive_feedback" };
    if (clean(fb.exceptional_challenges)) return { kind: "challenges", title: "Exceptional challenges \u2013 review", field: "exceptional_challenges" };
    if (fb.incident_notification_requested) return { kind: "notify", title: "Incident notification \u2013 review", field: "incidents" };
    if (fb.late_session_feedback) return { kind: "late", title: "Late session feedback \u2013 review", field: "positive_feedback" };
    return { kind: "general", title: "Session feedback \u2013 review", field: "positive_feedback" };
  }

  function AdminSessionsHub(root, opts) {
    this.root = root;
    this.opts = opts || {};
    this.escapeHtml = opts.escapeHtml || esc;
    this.mode = (opts && opts.mode) || "full";
    this.tab =
      (opts && opts.tab) ||
      (this.mode === "feedback" ? "feedback" : "tracking");
    this._modalFb = null;
    this._modalStep = null;
    this._reviewedKeys = {};
    try {
      var saved = localStorage.getItem("ash_feedback_reviewed_v1");
      if (saved) this._reviewedKeys = JSON.parse(saved) || {};
    } catch (e) {
      this._reviewedKeys = {};
    }
    this.weekStart = mondayOfWeek(isoToday());
    this.selectedDay = isoToday();
    this.feedbackMetricsDay = null;
    this._feedbackRangeCustom = false;
    this.rangeFrom = this.weekStart;
    this.rangeTo = addDaysIso(this.weekStart, 6);
    this.clientSearch = "";
    this.instructorFilter = "";
    this.serviceFilter = "";
    this.feedbackNoteFilter = "";
    this.scheduleDate = isoToday();
    this.payload = {
      session_feedback: [],
      incident_reports: [],
      schedule_overrides: [],
      session_quick_marks: [],
    };
    this.rosterRows = [];
    this.bundleError = "";
    this._absentBySessionKey = {};
  }

  AdminSessionsHub.prototype.setPayload = function (payload) {
    this.payload = payload || {};
    var adamDates = buildAdamAbSessionDateSet(this.rosterRows, this.payload.session_feedback);
    if (Array.isArray(this.payload.session_feedback)) {
      this.payload.session_feedback = normalizeMisnamedAdamAbFeedbackRows(
        this.payload.session_feedback,
        adamDates
      );
    }
    this.indexAbsentMarks();
    if (this.mode === "feedback") this.initFeedbackDateRange();
    if (this.opts && this.opts.externalTabs) {
      this.indexFeedback();
      this.renderPanels();
    } else {
      this.render();
    }
  };

  AdminSessionsHub.prototype.indexAbsentMarks = function () {
    var byKey = {};
    var list = (this.payload.session_quick_marks || []).slice();
    var seen = {};
    function absentDedupeKey(mk) {
      var sd = clean(mk.session_date);
      if (!sd) return "";
      var sk = clean(mk.portal_session_key).toLowerCase();
      if (sk) return sk + "|" + sd;
      return (
        "fb|" +
        sd +
        "|" +
        slugify(mk.client_name) +
        "|" +
        normTimeKey(mk.session_time)
      ).toLowerCase();
    }
    for (var i = 0; i < list.length; i++) {
      var dk = absentDedupeKey(list[i]);
      if (dk) seen[dk] = true;
    }
    var ovs = this.payload.schedule_overrides || [];
    for (var oi = 0; oi < ovs.length; oi++) {
      var ovMark = overrideToAbsentMark(ovs[oi]);
      if (!ovMark) continue;
      var ovDk = absentDedupeKey(ovMark);
      if (ovDk && seen[ovDk]) continue;
      if (ovDk) seen[ovDk] = true;
      list.push(ovMark);
    }
    var fbs = this.payload.session_feedback || [];
    for (var j = 0; j < fbs.length; j++) {
      var fb = fbs[j];
      if (!fb.attendance || String(fb.attendance).toLowerCase().indexOf("no") !== 0) continue;
      var sd = feedbackSessionDate(fb);
      if (!sd) continue;
      var sk = clean(fb.portal_session_key);
      var cn = clean(fb.client_name);
      if (isMislabeledRosterAreaClientName(cn)) {
        var parsedAbsent = parsePortalSessionKeyFields(sk);
        if (!parsedAbsent.clientSlug) continue;
        cn = resolveRosterClientName(parsedAbsent.clientSlug) || cn;
      }
      var entry = {
        portal_session_key: sk,
        session_date: sd,
        session_time: clean(fb.session_time),
        client_name: cn,
        service: clean(fb.service),
        staff_user_id: fb.submitted_by_user_id || "",
        staff_name: clean(fb.completed_by_name) || "",
        created_at: fb.created_at || null,
        mark_type: "absent",
        source: "session_feedback",
      };
      var dedupe = absentDedupeKey(entry);
      if (!dedupe || seen[dedupe]) continue;
      seen[dedupe] = true;
      list.push(entry);
    }
    for (var n = 0; n < list.length; n++) {
      list[n] = enrichAbsentMark(list[n]);
    }
    for (var n2 = 0; n2 < list.length; n2++) {
      var m2 = list[n2];
      var aliasFb = {
        portal_session_key: m2.portal_session_key,
        session_date: m2.session_date,
        session_time: m2.session_time,
        client_name: m2.client_name,
        service: m2.service,
        attendance: "No",
      };
      var markAliases = feedbackAliasKeysForRow(aliasFb);
      for (var ma = 0; ma < markAliases.length; ma++) {
        var ak = clean(markAliases[ma]).toLowerCase();
        if (!ak) continue;
        if (!byKey[ak]) byKey[ak] = [];
        byKey[ak].push(m2);
      }
      var slotMatch = this.slotForAbsentMark(m2);
      if (slotMatch) {
        var slotAliasKeys = feedbackAliasKeysForSlot(slotMatch);
        for (var sx = 0; sx < slotAliasKeys.length; sx++) {
          var sax = clean(slotAliasKeys[sx]).toLowerCase();
          if (!sax) continue;
          if (!byKey[sax]) byKey[sax] = [];
          byKey[sax].push(m2);
        }
      }
    }
    this._absentBySessionKey = byKey;
    this._absentMarksMerged = list;
  };

  AdminSessionsHub.prototype.absentCountForDate = function (iso) {
    return this.absentMarksForDate(iso).length;
  };

  AdminSessionsHub.prototype.isFeedbackAbsent = function (fb) {
    return !!(fb && fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0);
  };

  AdminSessionsHub.prototype.absentMarkDate = function (mk) {
    return absentMarkDateIso(mk);
  };

  AdminSessionsHub.prototype.preferredFeedbackDayInWeek = function (offset) {
    var hub = this;
    var days =
      hub.opts && hub.opts.showFullWeekDayStrip
        ? hub.weekDays()
        : hub.opts && hub.opts.hideEmptyWeekDays
          ? hub.weekDaysForDisplay()
          : hub.weekDays();
    if (!days.length) days = hub.weekDays();
    var off =
      typeof offset === "number" && offset >= 0 && offset < days.length
        ? offset
        : Math.max(0, days.indexOf(this.selectedDay));
    if (off < 0) off = 0;
    function openDay(iso) {
      if (hubDayIsProgrammeInactive(hub, iso)) return false;
      return !hubDayIsClubClosed(hub, iso);
    }
    if (openDay(days[off]) && this.feedbackCountForDate(days[off]) > 0) return days[off];
    for (var i = 0; i < days.length; i++) {
      if (openDay(days[i]) && this.feedbackCountForDate(days[i]) > 0) return days[i];
    }
    for (var j = 0; j < days.length; j++) {
      if (openDay(days[j])) return days[j];
    }
    return days[off] || days[0];
  };

  /** After week change, keep selectedDay on a navigable programme day. */
  AdminSessionsHub.prototype.snapSelectedDayToDisplayWeek = function () {
    var hub = this;
    if (!hub.opts || (!hub.opts.hideEmptyWeekDays && !hub.opts.showFullWeekDayStrip)) return;
    var days = hub.weekDaysForDisplay();
    if (!days.length) return;
    function selectable(iso) {
      if (hubDayIsProgrammeInactive(hub, iso)) return false;
      return days.indexOf(iso) >= 0;
    }
    if (selectable(hub.selectedDay)) return;
    hub.selectedDay = hub.preferredFeedbackDayInWeek(0);
    if (hub.mode === "feedback") hub.feedbackMetricsDay = hub.selectedDay;
  };

  /** Pick a day in the current week that has absents (keeps weekday offset when possible). */
  AdminSessionsHub.prototype.preferredAbsentDayInWeek = function (offset) {
    var days = this.weekDays();
    var off =
      typeof offset === "number" && offset >= 0 && offset < days.length
        ? offset
        : this.selectedDayOffsetInWeek();
    if (this.absentCountForDate(days[off]) > 0) return days[off];
    for (var i = 0; i < days.length; i++) {
      if (this.absentCountForDate(days[i]) > 0) return days[i];
    }
    return days[off] || days[0];
  };

  AdminSessionsHub.prototype.syncAbsentsWeekFromData = function () {
    var list = this._absentMarksMerged || [];
    var latest = null;
    for (var i = 0; i < list.length; i++) {
      var d = this.absentMarkDate(list[i]);
      if (!d) continue;
      if (!latest || d > latest) latest = d;
    }
    if (!latest) latest = isoToday();
    this.weekStart = mondayOfWeek(latest);
    this.selectedDay = latest;
    this.syncWeekRange();
  };

  /** Absents tab: default to calendar this week (Mon\u2013Sun), not the latest absent mark. */
  AdminSessionsHub.prototype.syncAbsentsWeekToCurrentWeek = function () {
    this.syncWeekPickerToCurrentWeek();
  };

  /** Week-picker tabs: default to this calendar week (Mon\u2013Sun). */
  AdminSessionsHub.prototype.syncWeekPickerToCurrentWeek = function () {
    this.weekStart = mondayOfWeek(isoToday());
    this.selectedDay = isoToday();
    this.syncWeekRange();
  };

  AdminSessionsHub.prototype.portalReportDateIso = function (r) {
    return rowDateIso(r && r.session_date) || rowDateIso(r && r.created_at);
  };

  AdminSessionsHub.prototype.incidentsForDate = function (iso) {
    var list = this.payload.incident_reports || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (this.portalReportDateIso(list[i]) !== iso) continue;
      out.push({ row: list[i], idx: i });
    }
    out.sort(function (a, b) {
      return String(b.row.created_at || "").localeCompare(String(a.row.created_at || ""));
    });
    if (this.opts && typeof this.opts.incidentScopeFilter === "function") {
      out = out.filter(function (item) {
        return this.incidentScopeFilter(item.row);
      }, this);
    }
    return out;
  };

  AdminSessionsHub.prototype.cancellationsForDate = function (iso) {
    var list = this.payload.cancellation_reports || [];
    var out = [];
    var seen = {};
    function cancelDedupeKey(row) {
      return (
        String(row.portal_session_key || "")
          .trim()
          .toLowerCase() ||
        String(row.session_date || "").trim() +
          "|" +
          canonicalClientSlug(row.client_name) +
          "|" +
          normTimeShort(row.session_time)
      );
    }
    for (var i = 0; i < list.length; i++) {
      if (this.portalReportDateIso(list[i]) !== iso) continue;
      var k0 = cancelDedupeKey(list[i]);
      if (k0) seen[k0] = true;
      out.push({ row: list[i], idx: i });
    }
    var ovs = this.payload.schedule_overrides || [];
    for (var oi = 0; oi < ovs.length; oi++) {
      var ovRow = overrideToCancellationRow(ovs[oi]);
      if (!ovRow || clean(ovRow.session_date) !== iso) continue;
      var k1 = cancelDedupeKey(ovRow);
      if (k1 && seen[k1]) continue;
      if (k1) seen[k1] = true;
      out.push({ row: ovRow, idx: "ov-" + String(ovs[oi].id || oi) });
    }
    out.sort(function (a, b) {
      return String(b.row.created_at || "").localeCompare(String(a.row.created_at || ""));
    });
    return out;
  };

  AdminSessionsHub.prototype.incidentCountForDate = function (iso) {
    return this.incidentsForDate(iso).length;
  };

  AdminSessionsHub.prototype.cancellationCountForDate = function (iso) {
    return this.cancellationsForDate(iso).length;
  };

  AdminSessionsHub.prototype.feedbackNotesCountForDate = function (iso, noteKind) {
    return this.feedbackNotesRowsForDay(noteKind || this.tab, iso).length;
  };

  AdminSessionsHub.prototype.preferredCountDayInWeek = function (offset, countFn) {
    var days = this.weekDays();
    var off =
      typeof offset === "number" && offset >= 0 && offset < days.length
        ? offset
        : this.selectedDayOffsetInWeek();
    if (countFn(days[off]) > 0) return days[off];
    for (var i = 0; i < days.length; i++) {
      if (countFn(days[i]) > 0) return days[i];
    }
    return days[off] || days[0];
  };

  AdminSessionsHub.prototype.preferredDayAfterWeekShift = function (offset) {
    var hub = this;
    if (this.tab === "absents") return this.preferredAbsentDayInWeek(offset);
    if (this.tab === "incidents") {
      return this.preferredCountDayInWeek(offset, function (d) {
        return hub.incidentCountForDate(d);
      });
    }
    if (this.tab === "cancellations") {
      return this.preferredCountDayInWeek(offset, function (d) {
        return hub.cancellationCountForDate(d);
      });
    }
    if (this.tab === "positive" || this.tab === "relevant") {
      var noteTab = this.tab;
      return this.preferredCountDayInWeek(offset, function (d) {
        return hub.feedbackNotesCountForDate(d, noteTab);
      });
    }
    if (
      this.mode === "feedback" ||
      (this.opts && (this.opts.hideEmptyWeekDays || this.opts.showFullWeekDayStrip))
    ) {
      return this.preferredFeedbackDayInWeek(offset);
    }
    return addDaysIso(this.weekStart, offset);
  };

  AdminSessionsHub.prototype.scrollToWeekPicker = function () {
    if (!this.root) return;
    var hub = this;
    function scroll() {
      var anchor =
        hub.root.querySelector(".ash-week-sticky-anchor") ||
        hub.root.querySelector(".ash-week-block") ||
        hub.root.querySelector(".ash-feedback-week");
      if (!anchor) return;
      try {
        anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        anchor.scrollIntoView(true);
      }
    }
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        requestAnimationFrame(scroll);
      });
    } else {
      setTimeout(scroll, 0);
    }
  };

  AdminSessionsHub.prototype.goToCalendarDay = function (iso, opts) {
    opts = opts || {};
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    this.weekStart = clampHubWeekStart(this, iso);
    this.selectedDay = iso;
    if (this.mode === "feedback") {
      this.feedbackMetricsDay = iso;
      this._feedbackRangeCustom = false;
    }
    this.syncWeekRange();
    if (this.opts && this.opts.externalTabs) this.renderPanels();
    else this.render();
    this.scrollToWeekPicker();
  };

  AdminSessionsHub.prototype.goToWeekStart = function (weekStartIso, opts) {
    opts = opts || {};
    if (!weekStartIso || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartIso)) return;
    if (this.mode === "feedback") this._feedbackRangeCustom = false;
    this.weekStart = clampHubWeekStart(this, weekStartIso);
    if (this.mode === "feedback") {
      this.selectedDay = opts.dayIso || this.preferredFeedbackDayInWeek(0);
      this.feedbackMetricsDay = this.selectedDay;
    } else if (this.tab === "absents") {
      this.selectedDay = opts.dayIso || this.preferredAbsentDayInWeek(0);
    } else if (this.tab === "incidents") {
      var hubInc = this;
      this.selectedDay =
        opts.dayIso ||
        this.preferredCountDayInWeek(0, function (d) {
          return hubInc.incidentCountForDate(d);
        });
    } else if (this.tab === "cancellations") {
      var hubCan = this;
      this.selectedDay =
        opts.dayIso ||
        this.preferredCountDayInWeek(0, function (d) {
          return hubCan.cancellationCountForDate(d);
        });
    } else if (this.tab === "positive" || this.tab === "relevant") {
      var hubNote = this;
      var noteTab = this.tab;
      this.selectedDay =
        opts.dayIso ||
        this.preferredCountDayInWeek(0, function (d) {
          return hubNote.feedbackNotesCountForDate(d, noteTab);
        });
    } else {
      this.selectedDay = opts.dayIso || addDaysIso(weekStartIso, 0);
    }
    this.syncWeekRange();
    this.snapSelectedDayToDisplayWeek();
    if (this.opts && this.opts.externalTabs) this.renderPanels();
    else this.render();
    this.scrollToWeekPicker();
  };

  AdminSessionsHub.prototype.absentMarksForDate = function (iso) {
    var list = this._absentMarksMerged || this.payload.session_quick_marks || [];
    var hub = this;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (hub.absentMarkDate(list[i]) === iso) out.push(list[i]);
    }
    out.sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
    if (this.opts && typeof this.opts.absentMarkScopeFilter === "function") {
      out = out.filter(this.opts.absentMarkScopeFilter);
    }
    return out;
  };

  AdminSessionsHub.prototype.slotForAbsentMark = function (mark) {
    mark = enrichAbsentMark(mark);
    var iso = absentMarkDateIso(mark) || clean(mark.session_date);
    var pk = clean(mark.portal_session_key);
    var parsed = parsePortalSessionKeyFields(pk);
    var clientSlug = canonicalClientSlug(mark.client_name) || parsed.clientSlug;
    if (!iso || !clientSlug) return null;
    var slots = this.expandSlotsForDate(iso);
    var timeHint = normTimeKey(mark.session_time, weekdayLongFromIso(iso)) || parsed.time;
    var key = pk.toLowerCase();
    var keyNorm = key.replace(/\|+/g, "|");
    var hits = [];
    for (var i = 0; i < slots.length; i++) {
      var sk = clean(slots[i].session_key).toLowerCase();
      if (sk && (sk === key || sk === keyNorm)) return slots[i];
      if (parsed.time && slots[i].time_start === parsed.time && canonicalClientSlug(slots[i].client_name) === clientSlug) {
        return slots[i];
      }
      if (canonicalClientSlug(slots[i].client_name) !== clientSlug) continue;
      hits.push(slots[i]);
    }
    if (!hits.length) return null;
    if (timeHint) {
      for (var j = 0; j < hits.length; j++) {
        if (hits[j].time_start === timeHint) return hits[j];
        if (normTimeKey(hits[j].time_slot) === timeHint) return hits[j];
      }
    }
    if (hits.length === 1) return hits[0];
    for (var k = 0; k < hits.length; k++) {
      if (isDayCentreService(hits[k].service)) return hits[k];
    }
    return hits[0];
  };

  AdminSessionsHub.prototype.absentMarkDisplay = function (mark) {
    mark = enrichAbsentMark(mark);
    var slot = this.slotForAbsentMark(mark);
    var client = slot ? slot.client_name : clean(mark.client_name) || "\u2014";
    var service = "\u2014";
    if (slot) {
      service = clean(slot.service) + (slot.time_slot ? " \u2013 " + clean(slot.time_slot) : "");
    } else if (clean(mark.service)) {
      service =
        clean(mark.service) +
        (clean(mark.session_time) ? " \u2013 " + clean(mark.session_time) : "");
    }
    var staff = clean(mark.staff_name) || "Staff";
    var whenParts = mark.created_at ? absentMarkedWhenParts(mark.created_at) : { date: "\u2014", time: "" };
    return {
      client: client,
      service: service,
      staff: staff,
      whenDate: whenParts.date,
      whenTime: whenParts.time,
    };
  };

  /** Feedback admin view: default to this calendar week; "All loaded" widens the range. */
  AdminSessionsHub.prototype.initFeedbackDateRange = function () {
    var today = isoToday();
    this._feedbackRangeCustom = false;
    this.weekStart = mondayOfWeek(today);
    this.rangeFrom = this.weekStart;
    this.rangeTo = addDaysIso(this.weekStart, 6);
    this.selectedDay = today;
    this.feedbackMetricsDay = today;
  };

  AdminSessionsHub.prototype.initFeedbackDateRangeAllLoaded = function () {
    var today = isoToday();
    var from = addDaysIso(today, -365);
    var list = this.payload.session_feedback || [];
    var minD = null;
    var maxD = null;
    for (var i = 0; i < list.length; i++) {
      var d = this.feedbackRowDate(list[i]);
      if (!d) continue;
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }
    if (minD) from = minD;
    this._feedbackRangeCustom = true;
    this.rangeFrom = from;
    this.rangeTo = maxD && maxD > today ? maxD : today;
    this.weekStart = mondayOfWeek(today);
    this.selectedDay = today;
    this.feedbackMetricsDay = today;
  };

  AdminSessionsHub.prototype.feedbackRowDate = function (fb) {
    var fromSession = rowDateIso(fb && fb.session_date);
    if (fromSession) return fromSession;
    return rowDateIso(fb && fb.created_at);
  };

  AdminSessionsHub.prototype.loadBundle = async function () {
    try {
      await loadScriptOnce(BUNDLE_SRC);
      this.refreshRosterRowsFromResolvedSource();
    } catch (e) {
      this.rosterRows = [];
      this.bundleError = e.message || String(e);
    }
    if (this.root && this.root.isConnected) this.render();
  };

  AdminSessionsHub.prototype.refreshRosterRowsFromResolvedSource = function () {
    try {
      if (typeof global.portalResolveStaffDashboardSource === "function") {
        global.portalResolveStaffDashboardSource();
      }
      var src = global.STAFF_DASHBOARD_SOURCE;
      this.rosterRows = src && Array.isArray(src.rows) ? src.rows : [];
      this.bundleError = this.rosterRows.length ? "" : "Roster bundle loaded but has no rows.";
      if (this.payload && Array.isArray(this.payload.session_feedback)) {
        var adamDates = buildAdamAbSessionDateSet(this.rosterRows, this.payload.session_feedback);
        this.payload.session_feedback = normalizeMisnamedAdamAbFeedbackRows(
          this.payload.session_feedback,
          adamDates
        );
      }
    } catch (e) {
      this.rosterRows = [];
      this.bundleError = e.message || String(e);
    }
  };

  function bindAdminSessionsHubRosterSourceListener() {
    if (global.__PORTAL_ASH_ROSTER_SOURCE_LISTENER__) return;
    global.__PORTAL_ASH_ROSTER_SOURCE_LISTENER__ = true;
    global.addEventListener("portal:staff-dashboard-source-updated", function () {
      if (!global.document) return;
      var roots = global.document.querySelectorAll(".admin-sessions-hub-root");
      for (var i = 0; i < roots.length; i++) {
        var hub = roots[i]._ashHubInstance;
        if (!hub || typeof hub.refreshRosterRowsFromResolvedSource !== "function") continue;
        hub.refreshRosterRowsFromResolvedSource();
        if (hub.root && hub.root.isConnected) hub.render();
      }
    });
  }

  AdminSessionsHub.prototype.feedbackCountForDate = function (iso) {
    var hub = this;
    var list = this.payload.session_feedback || [];
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var fb = list[i];
      if (feedbackSessionDate(fb) !== iso) continue;
      if (!hub.feedbackAllowedOnCalendarDay(fb)) continue;
      if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) continue;
      n++;
    }
    return n;
  };

  AdminSessionsHub.prototype.weekFeedbackReport = function () {
    var hub = this;
    return this.weekDays().map(function (iso) {
      var ds = hub.dayStats(iso);
      return {
        date: iso,
        day: weekdayLongFromIso(iso),
        expected: ds.total,
        submitted: ds.done,
        feedbackRows: hub.feedbackCountForDate(iso)
      };
    });
  };

  AdminSessionsHub.prototype.indexFeedback = function () {
    var hub = this;
    var list = this.payload.session_feedback || [];
    var byKey = {};
    var byDateClient = {};
    var absentByDateClient = {};
    for (var i = 0; i < list.length; i++) {
      var fb = list[i];
      var aliases = feedbackAliasKeysForRow(fb);
      for (var a = 0; a < aliases.length; a++) {
        registerFeedbackAlias(byKey, aliases[a], fb);
      }
      var sd = hub.feedbackRowDate(fb);
      if (!sd) continue;
      var cid = canonicalClientSlug(fb.client_name);
      var dk = sd + "|" + cid;
      if (dk.length > 11) {
        var prev = byDateClient[dk];
        if (!prev || (isAbsentFeedbackRow(prev) && !isAbsentFeedbackRow(fb))) {
          byDateClient[dk] = fb;
        }
      }
      if (hub.isFeedbackAbsent(fb) && cid) {
        absentByDateClient[dk] = fb;
        var svcK = serviceKey(clean(fb.service));
        if (svcK) absentByDateClient[dk + "|" + svcK] = fb;
      }
    }
    var acatByDate = {};
    for (var ai = 0; ai < list.length; ai++) {
      var afb = list[ai];
      if (!isAcatGroupClient(afb.client_name)) continue;
      var ad = feedbackSessionDate(afb);
      if (ad) acatByDate[ad] = afb;
    }
    this._fbByKey = byKey;
    this._fbByDateClient = byDateClient;
    this._absentFbByDateClient = absentByDateClient;
    this._acatFeedbackByDate = acatByDate;
    this.indexPortalReports();
  };

  AdminSessionsHub.prototype.statusExportRowForSlot = function (slot) {
    if (!slot) return null;
    var rows = statusExportRowsForDate(slot.session_date);
    for (var i = 0; i < rows.length; i++) {
      if (statusExportRowMatchesSlot(rows[i], slot)) return rows[i];
    }
    var ukey = clean(feedbackUnitKey(slot)).toLowerCase();
    if (ukey) {
      for (var j = 0; j < rows.length; j++) {
        var fk = clean(rows[j].feedbackUnitKey || rows[j].feedback_unit_key).toLowerCase();
        if (fk && fk === ukey) return rows[j];
      }
    }
    return null;
  };

  AdminSessionsHub.prototype.slotIncludedInDayStats = function (slot) {
    if (!slot) return false;
    if (shouldOmitOverviewSlot(this, slot) || isTeflonDemoRosterSlot(slot)) return false;
    if (clean(this.instructorFilter) || clean(this.serviceFilter) || clean(this.clientSearch)) {
      return this.slotPassesOverviewFilters(slot);
    }
    return true;
  };

  AdminSessionsHub.prototype.indexPortalReports = function () {
    var inc = {};
    var can = {};
    var listInc = this.payload.incident_reports || [];
    var listCan = this.payload.cancellation_reports || [];
    for (var i = 0; i < listInc.length; i++) {
      var r = listInc[i];
      var isd = rowDateIso(r.session_date);
      if (!isd) continue;
      var ik = isd + "|" + canonicalClientSlug(r.client_name);
      if (ik.length > 11) inc[ik] = true;
    }
    for (var j = 0; j < listCan.length; j++) {
      var c = listCan[j];
      var csd = rowDateIso(c.session_date);
      if (!csd) continue;
      var ck = csd + "|" + canonicalClientSlug(c.client_name);
      if (ck.length > 11) can[ck] = true;
    }
    var listOv = this.payload.schedule_overrides || [];
    for (var k = 0; k < listOv.length; k++) {
      var ovCan = overrideToCancellationRow(listOv[k]);
      if (!ovCan) continue;
      var csdOv = rowDateIso(ovCan.session_date);
      if (!csdOv) continue;
      var ckOv = csdOv + "|" + canonicalClientSlug(ovCan.client_name);
      if (ckOv.length > 11) can[ckOv] = true;
    }
    this._incidentByDateClient = inc;
    this._cancelByDateClient = can;
  };

  AdminSessionsHub.prototype.slotHasIncident = function (slot) {
    var k = slot.session_date + "|" + canonicalClientSlug(slot.client_name);
    return !!(this._incidentByDateClient && this._incidentByDateClient[k]);
  };

  AdminSessionsHub.prototype.slotHasCancellation = function (slot) {
    var ov = this.overrideForSlot(slot);
    if (ov && overrideIsCancelledType(ov)) return true;
    var k = slot.session_date + "|" + canonicalClientSlug(slot.client_name);
    return !!(this._cancelByDateClient && this._cancelByDateClient[k]);
  };

  AdminSessionsHub.prototype.findAcatGroupFeedbackForDate = function (iso) {
    if (this._acatFeedbackByDate && this._acatFeedbackByDate[iso]) {
      return this._acatFeedbackByDate[iso];
    }
    return findAcatGroupFeedbackInList(this.payload.session_feedback || [], iso);
  };

  AdminSessionsHub.prototype.acatGroupCoversSlot = function (slot) {
    if (!slot || !isAcatMemberClient(slot.client_name) || !isAcatMorningAquaticSlot(slot)) return false;
    return !!this.findAcatGroupFeedbackForDate(slot.session_date);
  };

  AdminSessionsHub.prototype.findFeedbackForSlot = function (slot) {
    if (this.acatGroupCoversSlot(slot)) {
      return this.findAcatGroupFeedbackForDate(slot.session_date);
    }
    if (isDayCentreService(slot.service)) {
      var dkDc = slot.session_date + "|" + canonicalClientSlug(slot.client_name);
      var fbDc = this._fbByDateClient && this._fbByDateClient[dkDc];
      if (fbDc && !isAbsentFeedbackRow(fbDc) && feedbackFitsSlot(fbDc, slot)) return fbDc;
    }
    var map = this._fbByKey || {};
    var aliases = feedbackAliasKeysForSlot(slot);
    for (var i = 0; i < aliases.length; i++) {
      var hit = map[clean(aliases[i]).toLowerCase()];
      if (hit && feedbackFitsSlot(hit, slot)) return hit;
    }
    var list = this.payload.session_feedback || [];
    for (var j = 0; j < list.length; j++) {
      if (feedbackFitsSlot(list[j], slot)) return list[j];
    }
    if (
      isBespokeService(slot.service) ||
      isDayCentreService(slot.service) ||
      isPhysicalActivityService(slot.service)
    ) {
      var dk = slot.session_date + "|" + canonicalClientSlug(slot.client_name);
      var fb = this._fbByDateClient && this._fbByDateClient[dk];
      if (fb && feedbackFitsSlot(fb, slot)) return fb;
    }
    return null;
  };

  AdminSessionsHub.prototype.matchFeedbackForSlot = function (slot) {
    return this.findFeedbackForSlot(slot);
  };

  AdminSessionsHub.prototype.matchFeedback = function (slot) {
    return this.matchFeedbackForSlot(slot);
  };

  AdminSessionsHub.prototype.getFeedbackUnitsForDate = function (iso) {
    return groupSlotsForFeedback(this.expandSlotsForDate(iso));
  };

  AdminSessionsHub.prototype.mergeGroupFeedbackComplete = function (iso, groupKey) {
    var hub = this;
    if (groupKey.indexOf(SUNDAY_HUB_TEAM_MERGE_PREFIX) === 0) {
      var gparts = groupKey.split("|");
      var teamKey = gparts[1] || "";
      var clientSlug = gparts[2] || "";
      if (!teamKey || !clientSlug) return false;
      var listTeam = hub.payload.session_feedback || [];
      for (var t = 0; t < listTeam.length; t++) {
        var fbt = listTeam[t];
        if (feedbackSessionDate(fbt) !== iso) continue;
        if (canonicalClientSlug(fbt.client_name) !== clientSlug) continue;
        if (isAbsentFeedbackRow(fbt)) continue;
        if (!feedbackFromSundayHubTeamWorker(fbt, teamKey)) continue;
        var fk = feedbackAreaKindFromFb(fbt);
        if (fk === "hub" || fk === "pool" || isMultiActivityService(fbt.service)) return true;
      }
      return false;
    }
    var slots = this.expandSlotsForDate(iso).filter(function (s) {
      return s.feedback_merge_group === groupKey;
    });
    if (!slots.length) return false;
    for (var i = 0; i < slots.length; i++) {
      if (hub.findFeedbackForSlot(slots[i])) return true;
    }
    var list = hub.payload.session_feedback || [];
    for (var j = 0; j < list.length; j++) {
      if (feedbackCoversMergeGroup(list[j], slots)) return true;
    }
    return false;
  };

  AdminSessionsHub.prototype.slotFeedbackComplete = function (slot) {
    if (this.acatGroupCoversSlot(slot)) return true;
    if (this.findFeedbackForSlot(slot)) return true;
    var mg = slot.feedback_merge_group;
    if (!mg) return false;
    return this.mergeGroupFeedbackComplete(slot.session_date, mg);
  };

  AdminSessionsHub.prototype.feedbackUnitComplete = function (unit) {
    for (var i = 0; i < unit.slots.length; i++) {
      if (this.slotFeedbackComplete(unit.slots[i])) return true;
    }
    return false;
  };

  /** Submitted feedback row matches any roster slot in the unit (lead feedback tab parity). */
  AdminSessionsHub.prototype.feedbackUnitHasSubmitted = function (unit) {
    if (!unit || !unit.slots || !unit.slots.length) return false;
    var hub = this;
    var day = clean(unit.slots[0].session_date);
    if (!day) return false;
    var submitted = hub.feedbackLogRowsForDay(day);
    for (var si = 0; si < unit.slots.length; si++) {
      var slot = unit.slots[si];
      if (shouldOmitOverviewSlot(hub, slot)) continue;
      if (hub.opts && hub.opts.slotScopeFilter && !hub.opts.slotScopeFilter(slot)) continue;
      for (var fi = 0; fi < submitted.length; fi++) {
        if (feedbackFitsSlot(submitted[fi], slot)) return true;
      }
    }
    return false;
  };

  /** Unit satisfied for overview stats / roster (matches Feedbacks tab awaiting rules). */
  AdminSessionsHub.prototype.feedbackUnitResolved = function (unit) {
    if (this.feedbackUnitAbsent(unit)) return true;
    if (this.feedbackUnitComplete(unit)) return true;
    for (var si = 0; si < unit.slots.length; si++) {
      var stEx = this.statusExportRowForSlot(unit.slots[si]);
      if (stEx && statusExportRowIsResolved(stEx)) return true;
    }
    if (this.opts && this.opts.feedbackMixAwaitingSlots && this.feedbackUnitHasSubmitted(unit)) {
      return true;
    }
    return false;
  };

  function absentFeedbackPerSlotUnit(slot) {
    return (
      clientNeedsPerSlotAquaticFeedback(slot) ||
      isClimbingService(slot.service) ||
      isMultiActivityService(slot.service)
    );
  }

  function absentFeedbackFitsSlot(fb, slot) {
    if (!fb || !slot) return false;
    if (!isAbsentFeedbackRow(fb)) return false;
    if (feedbackSessionDate(fb) !== slot.session_date) return false;
    if (canonicalClientSlug(fb.client_name) !== canonicalClientSlug(slot.client_name)) return false;
    var fbSvc = serviceKey(clean(fb.service));
    var slotSvc = serviceKey(clean(slot.service));
    if (fbSvc && slotSvc && fbSvc !== slotSvc) {
      if (!(isAquaticService(fb.service) && isAquaticService(slot.service))) {
        if (!(isClimbingService(fb.service) && isClimbingService(slot.service))) return false;
      }
    }
    var mt = normTimeKey(fb.session_time, weekdayLongFromIso(slot.session_date));
    var parsed = parsePortalSessionKeyFields(fb.portal_session_key);
    if (!mt && parsed.time) mt = parsed.time;
    var st = slot.time_start || normTimeKey(slot.time_slot, weekdayLongFromIso(slot.session_date));
    var perSlot = absentFeedbackPerSlotUnit(slot);
    if (mt && st && mt !== st) return false;
    if (perSlot && (!mt || !st)) return false;
    if (!mt && !st && !perSlot) return true;
    if (isClimbingService(slot.service) || isMultiActivityService(slot.service)) {
      var pk = clean(fb.portal_session_key);
      if (pk) {
        var pkArea = portalKeyAreaFromParts(pk.split("|").map(clean));
        var slotArea = sessionAreaKey(slot.area);
        if (pkArea && slotArea && pkArea !== slotArea) return false;
      }
    }
    return true;
  }

  AdminSessionsHub.prototype.findAbsentFeedbackForSlot = function (slot) {
    if (!slot) return null;
    var hub = this;
    var map = this._fbByKey || {};
    var aliases = feedbackAliasKeysForSlot(slot);
    for (var a = 0; a < aliases.length; a++) {
      var hit = map[clean(aliases[a]).toLowerCase()];
      if (hit && absentFeedbackFitsSlot(hit, slot)) return hit;
    }
    var list = this.payload.session_feedback || [];
    for (var i = 0; i < list.length; i++) {
      if (absentFeedbackFitsSlot(list[i], slot)) return list[i];
    }
    return null;
  };

  AdminSessionsHub.prototype.slotIsAbsent = function (slot) {
    if (!slot) return false;
    var stEx = this.statusExportRowForSlot(slot);
    if (stEx && statusExportRowIsAbsent(stEx)) return true;
    var ov = this.overrideForSlot(slot);
    if (ov && overrideIsAbsentType(ov)) return true;
    var cid = canonicalClientSlug(slot.client_name);
    var absentMap = this._absentFbByDateClient || {};
    var dk = slot.session_date + "|" + cid;
    var afb = absentMap[dk] || absentMap[dk + "|" + serviceKey(clean(slot.service))];
    if (afb) return true;
    if (this.findAbsentFeedbackForSlot(slot)) return true;
    var slotAliases = feedbackAliasKeysForSlot(slot);
    for (var sa = 0; sa < slotAliases.length; sa++) {
      var sak = clean(slotAliases[sa]).toLowerCase();
      if (sak && this._absentBySessionKey && this._absentBySessionKey[sak] && this._absentBySessionKey[sak].length) {
        return true;
      }
    }
    var key = clean(slot.session_key).toLowerCase();
    if (key && this._absentBySessionKey && this._absentBySessionKey[key] && this._absentBySessionKey[key].length) {
      return true;
    }
    var list = this._absentMarksMerged || [];
    var slotDayWord = weekdayLongFromIso(slot.session_date);
    for (var i = 0; i < list.length; i++) {
      var mk = list[i];
      if (this.slotForAbsentMark(mk) === slot) return true;
      if (feedbackSessionDate(mk) !== slot.session_date) continue;
      if (canonicalClientSlug(mk.client_name) !== canonicalClientSlug(slot.client_name)) continue;
      var mt = normTimeKey(mk.session_time, slotDayWord);
      var parsedMk = parsePortalSessionKeyFields(mk.portal_session_key);
      if (!mt && parsedMk.time) mt = parsedMk.time;
      var st = slot.time_start || normTimeKey(slot.time_slot, slotDayWord);
      var perSlot = absentFeedbackPerSlotUnit(slot);
      if (perSlot) {
        if (!mt || !st || mt !== st) continue;
      } else if (mt && st && mt !== st) {
        continue;
      }
      return true;
    }
    return false;
  };

  /** Display row for feedback tab when overview already shows absent but no session_feedback row. */
  AdminSessionsHub.prototype.syntheticAbsentDisplayRow = function (slot) {
    if (!slot) return null;
    var hub = this;
    var afb = hub.findAbsentFeedbackForSlot(slot);
    if (afb) return afb;
    var marks = hub.absentMarksForDate(slot.session_date) || [];
    for (var i = 0; i < marks.length; i++) {
      var mk = marks[i];
      if (canonicalClientSlug(mk.client_name) !== canonicalClientSlug(slot.client_name)) continue;
      if (hub.opts && hub.opts.absentMarkScopeFilter && !hub.opts.absentMarkScopeFilter(mk)) {
        continue;
      }
      var mt = normTimeKey(mk.session_time, weekdayLongFromIso(slot.session_date));
      var parsedMk = parsePortalSessionKeyFields(mk.portal_session_key);
      if (!mt && parsedMk.time) mt = parsedMk.time;
      var st = slot.time_start || normTimeKey(slot.time_slot, weekdayLongFromIso(slot.session_date));
      if (absentFeedbackPerSlotUnit(slot)) {
        if (!mt || !st || mt !== st) continue;
      } else if (mt && st && mt !== st) {
        continue;
      }
      return {
        client_name: slot.client_name,
        service: clean(mk.service) || slot.service || "\u2014",
        session_date: slot.session_date,
        session_time: mt || st || "",
        attendance: "No",
        completed_by_name: clean(mk.staff_name) || "\u2014",
        created_at: mk.created_at || null,
        engagement_rating: null,
        client_emotions: null,
        engagement_patterns: null,
        positive_feedback: null,
        relevant_information: null,
        _ashAbsentMark: true,
      };
    }
    return null;
  };

  AdminSessionsHub.prototype.feedbackUnitAbsent = function (unit) {
    for (var i = 0; i < unit.slots.length; i++) {
      if (this.slotIsAbsent(unit.slots[i])) return true;
    }
    return false;
  };

  AdminSessionsHub.prototype.expandSlotsForDate = function (isoDate) {
    var wd = weekdayLongFromIso(isoDate);
    var sunSwimOv = wd === "Sunday" ? sundayDateSwimOverride(isoDate) : null;
    var out = [];
    for (var i = 0; i < this.rosterRows.length; i++) {
      var r = this.rosterRows[i];
      if (!rosterRowAppliesOnDate(this.rosterRows, r, isoDate, wd)) continue;
      if (!isRosterClient(r.client_name)) continue;
      if (!clientAllowedOnWeekday(r.client_name, wd)) continue;
      if (!clientAllowedOnDate(r.client_name, isoDate)) continue;
      if (sunSwimOv && sunSwimOv.replaceSwimFarm && clean(r.venue) === "SwimFarm") continue;
      out.push(rosterRowToSlot(isoDate, wd, r));
    }
    if (sunSwimOv && sunSwimOv.rows && sunSwimOv.rows.length) {
      for (var j = 0; j < sunSwimOv.rows.length; j++) {
        var orow = sunSwimOv.rows[j];
        if (!orow || !isRosterClient(orow.client_name)) continue;
        if (!clientAllowedOnDate(orow.client_name, isoDate)) continue;
        out.push(rosterRowToSlot(isoDate, wd, orow));
      }
    }
    out.sort(function (a, b) {
      return a.time_start.localeCompare(b.time_start) || a.client_name.localeCompare(b.client_name);
    });
    if (this.opts && typeof this.opts.slotScopeFilter === "function") {
      out = out.filter(this.opts.slotScopeFilter);
    }
    return out;
  };

  AdminSessionsHub.prototype.weekDays = function () {
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDaysIso(this.weekStart, i));
    return days;
  };

  /** Full Mon–Sun strip, or only days with roster / club closed when hideEmptyWeekDays. */
  AdminSessionsHub.prototype.weekDaysForDisplay = function () {
    var hub = this;
    var days = this.weekDays();
    if (hub.opts && hub.opts.showFullWeekDayStrip) return days;
    if (!hub.opts || !hub.opts.hideEmptyWeekDays) return days;
    return days.filter(function (iso) {
      if (hubDayIsClubClosed(hub, iso)) return true;
      var st = hub.dayStats(iso);
      return st.total > 0;
    });
  };

  AdminSessionsHub.prototype.selectedDayOffsetInWeek = function () {
    var days = this.weekDays();
    var i;
    for (i = 0; i < days.length; i++) {
      if (days[i] === this.selectedDay) return i;
    }
    var today = isoToday();
    for (i = 0; i < days.length; i++) {
      if (days[i] === today) return i;
    }
    return 0;
  };

  AdminSessionsHub.prototype.dayStats = function (iso) {
    var hub = this;
    if (hub.opts && typeof hub.opts.getFeedbackDayStats === "function") {
      var ext = hub.opts.getFeedbackDayStats(iso);
      if (ext && typeof ext.required === "number") {
        var doneExt =
          typeof ext.completed === "number" ? ext.completed : 0;
        return { total: ext.required, done: doneExt };
      }
    }
    var slots = this.expandSlotsForDate(iso).filter(function (s) {
      return hub.slotIncludedInDayStats(s);
    });
    var units = this.getFeedbackUnitsForDate(iso)
      .map(function (u) {
        return {
          key: u.key,
          slots: u.slots.filter(function (s) {
            return hub.slotIncludedInDayStats(s);
          }),
        };
      })
      .filter(function (u) {
        return u.slots.length > 0;
      });
    var unitComplete = {};
    var unitAbsent = {};
    for (var ui = 0; ui < units.length; ui++) {
      unitComplete[units[ui].key] = hub.feedbackUnitResolved(units[ui]);
      unitAbsent[units[ui].key] = hub.feedbackUnitAbsent(units[ui]);
    }
    var displaySlots = overviewDisplaySlotsFromUnits(hub, slots);
    var total = displaySlots.length;
    var rosterDone = 0;
    for (var di = 0; di < displaySlots.length; di++) {
      var slot = displaySlots[di];
      var ukey = feedbackUnitKey(slot);
      if (unitAbsent[ukey] || hub.slotIsAbsent(slot)) {
        rosterDone++;
        continue;
      }
      if (hub.slotHasCancellation(slot)) {
        rosterDone++;
        continue;
      }
      if (unitComplete[ukey] || hub.slotFeedbackComplete(slot)) rosterDone++;
    }
    if (this.mode === "feedback") {
      if (units.length > 0) {
        var unitDoneCount = 0;
        for (var uj = 0; uj < units.length; uj++) {
          var uDone = units[uj];
          var resolved =
            unitAbsent[uDone.key] ||
            unitComplete[uDone.key] ||
            uDone.slots.some(function (s) {
              return hub.slotIsAbsent(s);
            });
          if (resolved) unitDoneCount++;
        }
        return { total: units.length, done: unitDoneCount };
      }
      if (total > 0) return { total: total, done: rosterDone };
      var submitted = this.feedbackCountForDate(iso);
      return { total: Math.max(1, submitted), done: submitted };
    }
    return { total: total, done: rosterDone };
  };

  /** Roster slots shown in Sessions Overview (omits ACAT group rows, overviewOmitRosterSlots, etc.). */
  AdminSessionsHub.prototype.overviewSlotsForDate = function (iso) {
    var hub = this;
    return this.expandSlotsForDate(iso).filter(function (s) {
      return !shouldOmitOverviewSlot(hub, s) && !isTeflonDemoRosterSlot(s);
    });
  };

  AdminSessionsHub.prototype.weekStats = function () {
    var days = this.weekDays();
    var total = 0;
    var done = 0;
    for (var i = 0; i < days.length; i++) {
      var st = this.dayStats(days[i]);
      total += st.total;
      done += st.done;
    }
    return { total: total, done: done };
  };

  AdminSessionsHub.prototype.feedbackMetricsScopeLabel = function () {
    if (this.mode !== "feedback") return termLabelFromRange(this.rangeFrom);
    if (this.feedbackMetricsDay) return formatLongDate(this.feedbackMetricsDay);
    var ws = this.weekStart;
    return "Week average \u2013 " + formatShortDate(ws) + " \u2013 " + formatShortDate(addDaysIso(ws, 6));
  };

  AdminSessionsHub.prototype.feedbackRowsForMetrics = function () {
    var hub = this;
    var ws = this.weekStart;
    var we = addDaysIso(ws, 6);
    var rows = this.feedbackInRange().filter(function (fb) {
      var d = hub.feedbackRowDate(fb);
      return d && d >= ws && d <= we;
    });
    if (this.feedbackMetricsDay) {
      rows = rows.filter(function (fb) {
        return hub.feedbackRowDate(fb) === hub.feedbackMetricsDay;
      });
    }
    var inst = clean(this.instructorFilter);
    if (inst) {
      rows = rows.filter(function (fb) {
        return completedByMatchesInstructor(fb.completed_by_name, inst);
      });
    }
    var svcFilter = clean(this.serviceFilter);
    if (svcFilter) {
      rows = rows.filter(function (fb) {
        return clean(hub.feedbackDisplayService(fb)) === svcFilter;
      });
    }
    return rows;
  };

  AdminSessionsHub.prototype.feedbackInstructorFilterOptionsHtml = function () {
    var esc = this.escapeHtml;
    var names = this.instructorFilterOptionsForDay(this.selectedDay);
    var html = '<option value="">All instructors</option>';
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      html +=
        '<option value="' +
        esc(n) +
        '"' +
        (this.instructorFilter === n ? " selected" : "") +
        ">" +
        esc(n) +
        "</option>";
    }
    return html;
  };

  AdminSessionsHub.prototype.instructorFilterOptionsForDay = function (dayIso) {
    var map = {};
    var rows = this.feedbackLogRowsForDay(dayIso);
    for (var i = 0; i < rows.length; i++) {
      var n = clean(rows[i].completed_by_name);
      if (n) map[n] = true;
    }
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b, "en", { sensitivity: "base" });
    });
  };

  AdminSessionsHub.prototype.overviewFilterOptionsForDay = function (dayIso) {
    var hub = this;
    var instMap = {};
    var svcMap = {};
    var slots = this.expandSlotsForDate(dayIso);
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (shouldOmitOverviewSlot(hub, s)) continue;
      if (isTeflonDemoRosterSlot(s)) continue;
      var svc = clean(s.service);
      if (svc) svcMap[svc] = true;
      var labels = (s.instructors || [])
        .concat(String(s.instructor_label || "").split(/,|\/|&|\band\b/gi))
        .map(function (x) {
          return clean(x);
        })
        .filter(Boolean);
      for (var j = 0; j < labels.length; j++) instMap[labels[j]] = true;
    }
    return {
      instructors: Object.keys(instMap).sort(function (a, b) {
        return a.localeCompare(b, "en", { sensitivity: "base" });
      }),
      services: Object.keys(svcMap).sort(function (a, b) {
        return a.localeCompare(b, "en", { sensitivity: "base" });
      }),
    };
  };

  AdminSessionsHub.prototype.slotPassesOverviewFilters = function (slot) {
    var q = clean(this.clientSearch).toLowerCase();
    if (q && slot.client_name.toLowerCase().indexOf(q) === -1) return false;
    var inst = clean(this.instructorFilter);
    if (inst) {
      var labels = (slot.instructors || [])
        .concat(String(slot.instructor_label || "").split(/,|\/|&|\band\b/gi))
        .map(function (x) {
          return clean(x);
        })
        .filter(Boolean);
      var hit = false;
      for (var li = 0; li < labels.length; li++) {
        if (completedByMatchesInstructor(labels[li], inst)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    var svcFilter = clean(this.serviceFilter);
    if (svcFilter && clean(slot.service) !== svcFilter) return false;
    return true;
  };

  AdminSessionsHub.prototype.overviewFilterRowHtml = function () {
    var esc = this.escapeHtml;
    var opts = this.overviewFilterOptionsForDay(this.selectedDay);
    var instHtml = '<option value="">All instructors</option>';
    for (var i = 0; i < opts.instructors.length; i++) {
      var n = opts.instructors[i];
      instHtml +=
        '<option value="' +
        esc(n) +
        '"' +
        (this.instructorFilter === n ? " selected" : "") +
        ">" +
        esc(n) +
        "</option>";
    }
    var svcHtml = '<option value="">All services</option>';
    for (var j = 0; j < opts.services.length; j++) {
      var s = opts.services[j];
      svcHtml +=
        '<option value="' +
        esc(s) +
        '"' +
        (this.serviceFilter === s ? " selected" : "") +
        ">" +
        esc(s) +
        "</option>";
    }
    return (
      '<div class="ash-filter-row ash-filter-row--feedback">' +
      '<label class="ash-filter-label">Search client<input type="search" id="ashClientSearch" class="ash-input ash-input--grow" placeholder="Name contains\u2026" value="' +
      esc(this.clientSearch) +
      '"></label>' +
      '<label class="ash-filter-label">Instructor<select id="ashInstructorFilter" class="ash-input ash-input--instructor">' +
      instHtml +
      "</select></label>" +
      '<label class="ash-filter-label">Service<select id="ashServiceFilter" class="ash-input ash-input--instructor">' +
      svcHtml +
      "</select></label></div>"
    );
  };

  AdminSessionsHub.prototype.weekPickerSearchRowHtml = function () {
    var esc = this.escapeHtml;
    return (
      '<div class="ash-filter-row">' +
      '<label class="ash-filter-label">Search client<input type="search" id="ashClientSearch" class="ash-input ash-input--grow" placeholder="Name contains\u2026" value="' +
      esc(this.clientSearch) +
      '"></label></div>'
    );
  };

  AdminSessionsHub.prototype.feedbackFilterRowHtml = function () {
    var esc = this.escapeHtml;
    return (
      '<div class="ash-filter-row ash-filter-row--feedback">' +
      '<label class="ash-filter-label">Search client<input type="search" id="ashClientSearch" class="ash-input ash-input--grow" placeholder="Name contains\u2026" value="' +
      esc(this.clientSearch) +
      '"></label>' +
      '<label class="ash-filter-label">Instructor<select id="ashInstructorFilter" class="ash-input ash-input--instructor">' +
      this.feedbackInstructorFilterOptionsHtml() +
      "</select></label>" +
      '<label class="ash-filter-label">From<input type="date" id="ashRangeFrom" class="ash-input" value="' +
      esc(this.rangeFrom) +
      '"></label>' +
      '<span class="ash-filter-date-end">' +
      '<label class="ash-filter-label">To<input type="date" id="ashRangeTo" class="ash-input" value="' +
      esc(this.rangeTo) +
      '"></label>' +
      '<button type="button" class="ash-btn ash-btn--secondary ash-filter-apply-btn" data-ash-feedback-apply>Apply dates</button>' +
      "</span></div>"
    );
  };

  AdminSessionsHub.prototype.refreshClientFilterView = function () {
    var hub = this;
    var esc = this.escapeHtml;
    var tbody = hub.root.querySelector("[data-ash-client-filter-tbody]");
    if (!tbody) {
      if (hub.opts && hub.opts.externalTabs) hub.renderPanels();
      else hub.render();
      return;
    }

    if (hub.tab === "feedback" && hub.mode === "feedback") {
      var rows = hub.feedbackRowsForSelectedDay();
      var tableRows = rows
        .map(function (fb, rowIdx) {
          return hub.htmlFeedbackTableRow(fb, esc, { rowIdx: rowIdx, clickable: true });
        })
        .join("");
      if (!tableRows) {
        tableRows =
          '<tr><td colspan="8"><div class="ash-empty">No feedback for this day.</div></td></tr>';
      }
      tbody.innerHTML = tableRows;
      return;
    }

    if (hub.tab === "positive" || hub.tab === "relevant") {
      var kind = hub.tab === "relevant" ? "relevant" : "positive";
      var noteRows = hub.feedbackNotesRows(kind);
      var noteField = kind === "relevant" ? "relevant_information" : "positive_feedback";
      var emptyMsg =
        kind === "relevant"
          ? "No relevant information notes in this date range."
          : "No positive feedback notes in this date range.";
      var tableRowsN = noteRows
        .map(function (fb, rowIdx) {
          var noteText =
            kind === "relevant" ? clean(fb.relevant_information) : clean(fb.positive_feedback);
          var reviewCls =
            noteText && !hub._reviewedKeys[hub.fbRowKey(fb)] ? " ash-fb-row--needs-review" : "";
          var submittedAt = feedbackSubmittedAt(fb);
          var reviewTime = formatFbTime(submittedAt);
          var sessionDay = formatFbDateShort(fb.session_date);
          var reviewDate = formatFbDate(submittedAt);
          var svcLabel = hub.feedbackDisplayService(fb) || "\u2014";
          var noteHtml = noteText
            ? noteText
                .split(/\n+/)
                .map(function (line) {
                  return esc(line);
                })
                .join("<br>")
            : "\u2014";
          return (
            '<tr class="ash-fb-row' +
            reviewCls +
            '" data-ash-fb-row="' +
            rowIdx +
            '" data-ash-note-field="' +
            noteField +
            '" tabindex="0" role="button">' +
            '<td><span class="ash-link">' +
            esc(fb.client_name) +
            "</span></td>" +
            "<td>" +
            esc(svcLabel) +
            (sessionDay ? '<div class="ash-cell-sub">' + esc(sessionDay) + "</div>" : "") +
            "</td>" +
            '<td class="ash-cell-note ash-fb-note-cell" data-ash-note-field="' +
            noteField +
            '">' +
            noteHtml +
            "</td>" +
            '<td class="ash-cell-instructor"><div class="ash-cell-main">' +
            esc(fb.completed_by_name || "\u2014") +
            '</div><div class="ash-cell-sub">' +
            esc(reviewDate) +
            (reviewTime ? '</div><div class="ash-cell-sub">' + esc(reviewTime) : "") +
            "</div></td>" +
            "</tr>"
          );
        })
        .join("");
      if (!tableRowsN) {
        tableRowsN = '<tr><td colspan="4"><div class="ash-empty">' + esc(emptyMsg) + "</div></td></tr>";
      }
      tbody.innerHTML = tableRowsN;
      return;
    }

    if (hub.tab === "tracking") {
      var slots = hub.expandSlotsForDate(hub.selectedDay);
      var units = hub.getFeedbackUnitsForDate(hub.selectedDay);
      var unitComplete = {};
      var unitAbsent = {};
      for (var u = 0; u < units.length; u++) {
        unitComplete[units[u].key] = hub.feedbackUnitResolved(units[u]);
        unitAbsent[units[u].key] = hub.feedbackUnitAbsent(units[u]);
      }
      var trackRows = slots
        .filter(function (s) {
          if (shouldOmitOverviewSlot(hub, s)) return false;
          return hub.slotPassesOverviewFilters(s);
        })
        .map(function (slot) {
          var ukey = feedbackUnitKey(slot);
          var fbDone = unitComplete[ukey] || hub.slotFeedbackComplete(slot);
          var isAbsent = unitAbsent[ukey] || hub.slotIsAbsent(slot);
          var fbCell = rosterFeedbackStatusHtml(isAbsent, fbDone);
          var svc =
            esc(slot.service) +
            (slot.time_slot ? '<div class="ash-cell-sub">' + esc(slot.time_slot) + "</div>" : "");
          var inst = slot.instructors.map(formatInstructorPill).join(" ") || "\u2014";
          var venue = clean(slot.venue) || "\u2014";
          var notes = clean(slot.area) || "\u2014";
          return (
            "<tr>" +
            '<td class="ash-td-center">' +
            svc +
            "</td>" +
            '<td class="ash-td-center">' +
            inst +
            "</td>" +
            '<td class="ash-td-center"><span class="ash-pill ash-pill--client">' +
            esc(slot.client_name) +
            "</span></td>" +
            '<td class="ash-td-center">' +
            esc(venue) +
            "</td>" +
            '<td class="ash-td-center ash-cell-muted">' +
            esc(notes) +
            "</td>" +
            '<td class="ash-td-center"><span class="ash-badge ash-badge--booked">Booked</span></td>' +
            '<td class="ash-td-center">' +
            fbCell +
            "</td>" +
            '<td class="ash-td-center">' +
            yesNoCell(hub.slotHasIncident(slot)) +
            "</td>" +
            '<td class="ash-td-center">' +
            yesNoCell(hub.slotHasCancellation(slot)) +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
      if (!trackRows) {
        trackRows =
          '<tr><td colspan="9"><div class="ash-empty">' +
          (hub.bundleError ? esc(hub.bundleError) : "No roster slots for this day.") +
          "</div></td></tr>";
      }
      tbody.innerHTML = trackRows;
    }
  };

  AdminSessionsHub.prototype.feedbackInRange = function () {
    var from = this.rangeFrom;
    var to = this.rangeTo;
    var q = clean(this.clientSearch).toLowerCase();
    var hub = this;
    return (this.payload.session_feedback || []).filter(function (fb) {
      if (hub.isFeedbackAbsent(fb)) return false;
      if (hub.opts && typeof hub.opts.feedbackRowScopeFilter === "function") {
        if (!hub.opts.feedbackRowScopeFilter(fb)) return false;
      }
      var d = hub.feedbackRowDate(fb);
      if (!d) return true;
      if (d < from || d > to) return false;
      if (q && clean(fb.client_name).toLowerCase().indexOf(q) === -1) return false;
      if (hub.feedbackNoteFilter === "positive" && !clean(fb.positive_feedback)) return false;
      if (hub.feedbackNoteFilter === "relevant" && !clean(fb.relevant_information)) return false;
      return true;
    });
  };

  AdminSessionsHub.prototype.engagementSummary = function (rows) {
    var sum = 0;
    var n = 0;
    var tags = { happy: 0, anxious: 0, withdrawn: 0, out_of_control: 0 };
    var indep = { independent: 0, prompts: 0, regular: 0, full: 0 };
    var needsReview = 0;
    var relevantNotes = 0;
    var positiveNotes = 0;
    for (var i = 0; i < rows.length; i++) {
      var fb = rows[i];
      if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) continue;
      if (fb.engagement_rating != null && fb.engagement_rating !== "") {
        sum += Number(fb.engagement_rating);
        n++;
      }
      if (clean(fb.relevant_information)) relevantNotes++;
      if (clean(fb.positive_feedback)) positiveNotes++;
      var tokens = emotionTokens(fb.client_emotions);
      if (!tokens.length && clean(fb.client_emotions)) tokens = [String(fb.client_emotions)];
      for (var j = 0; j < tokens.length; j++) {
        var cat = categorizeEmotion(tokens[j]);
        if (cat && tags[cat] != null) tags[cat]++;
      }
      var iTokens = independenceTokens(fb);
      if (!iTokens.length) {
        var lbl = independenceLabel(fb);
        if (lbl !== "\u2014") {
          iTokens = lbl.split(/[;,]+/g).map(function (x) {
            return clean(x);
          }).filter(Boolean);
        }
      }
      for (var k = 0; k < iTokens.length; k++) {
        var ic = categorizeIndependence(iTokens[k]);
        if (ic && indep[ic] != null) indep[ic]++;
      }
      if (needsReviewRow(fb)) needsReview++;
    }
    var tagTotal = tags.happy + tags.anxious + tags.withdrawn + tags.out_of_control;
    var indepTotal = indep.independent + indep.prompts + indep.regular + indep.full;
    return {
      avg: n ? (sum / n).toFixed(1) : "\u2014",
      scored: n,
      tags: tags,
      tagTotal: tagTotal,
      indep: indep,
      indepTotal: indepTotal,
      needsReview: needsReview,
      relevantNotes: relevantNotes,
      positiveNotes: positiveNotes,
      totalRows: rows.length
    };
  };

  AdminSessionsHub.prototype.overrideMatchesSlot = function (slot, ov) {
    if (!slot || !ov) return false;
    if (clean(ov.session_date) !== slot.session_date) return false;
    if (String(ov.status || "active").trim() !== "active") return false;
    var oCid = canonicalClientSlug(ov.anchor_client_id);
    var sCid = canonicalClientSlug(slot.client_name || slot.client_slug || slot.clientSlug);
    if (oCid && sCid && oCid !== sCid) return false;
    var oVen = clean(ov.anchor_venue).toLowerCase();
    var sVen = clean(slot.venue).toLowerCase();
    if (oVen && sVen && oVen !== sVen) return false;
    var oStart = normTimeShort(ov.anchor_start);
    var oEnd = normTimeShort(ov.anchor_end);
    var sStart = normTimeShort(slot.time_start || slot.anchor_start || slot.time_slot);
    var sEnd = normTimeShort(slot.time_end || slot.anchor_end);
    if (overrideIsAbsentType(ov)) {
      function mins(hm) {
        var p = String(hm || "").match(/^(\d{1,2}):(\d{2})/);
        if (!p) return NaN;
        return (parseInt(p[1], 10) || 0) * 60 + (parseInt(p[2], 10) || 0);
      }
      var lo1 = mins(oStart);
      var hi1 = mins(oEnd || oStart);
      var lo2 = mins(sStart);
      var hi2 = mins(sEnd || sStart);
      if (Number.isFinite(lo1) && Number.isFinite(hi1) && Number.isFinite(lo2) && Number.isFinite(hi2)) {
        return lo1 < hi2 && lo2 < hi1;
      }
    }
    if (oStart && sStart && oStart !== sStart) return false;
    return true;
  };

  AdminSessionsHub.prototype.overrideForSlot = function (slot) {
    var ovs = this.payload.schedule_overrides || [];
    var best = null;
    for (var i = 0; i < ovs.length; i++) {
      if (!this.overrideMatchesSlot(slot, ovs[i])) continue;
      if (
        !best ||
        (ovs[i].created_at &&
          (!best.created_at || String(ovs[i].created_at) > String(best.created_at)))
      ) {
        best = ovs[i];
      }
    }
    return best;
  };

  AdminSessionsHub.prototype.fbRowKey = function (fb) {
    return clean(fb.id) || clean(fb.portal_session_key) || clean(fb.session_date) + "|" + slugify(fb.client_name) + "|" + slugify(fb.completed_by_name);
  };

  AdminSessionsHub.readReviewedKeys = function () {
    try {
      return JSON.parse(localStorage.getItem("ash_feedback_reviewed_v1") || "{}") || {};
    } catch (e) {
      return {};
    }
  };

  function feedbackRowKey(fb) {
    return (
      clean(fb.id) ||
      clean(fb.portal_session_key) ||
      clean(fb.session_date) + "|" + slugify(fb.client_name) + "|" + slugify(fb.completed_by_name)
    );
  }

  AdminSessionsHub.countPendingRelevant = function (feedbackRows) {
    var reviewed = AdminSessionsHub.readReviewedKeys();
    var list = Array.isArray(feedbackRows) ? feedbackRows : [];
    var pending = 0;
    for (var i = 0; i < list.length; i++) {
      var fb = list[i] || {};
      if (!clean(fb.relevant_information)) continue;
      if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) continue;
      if (reviewed[feedbackRowKey(fb)]) continue;
      pending++;
    }
    return pending;
  };

  AdminSessionsHub.refreshRelevantAlerts = function (feedbackRows) {
    var pending = AdminSessionsHub.countPendingRelevant(feedbackRows);
    var nodes = document.querySelectorAll(".overview-card--do-relevant");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var countEl = el.querySelector("[data-relevant-pending-count]");
      if (countEl) countEl.textContent = String(pending);
      var hintEl = el.querySelector("[data-relevant-pending-hint]");
      if (hintEl) hintEl.textContent = pending > 0 ? "Tap to review ?" : "Review notes ?";
      el.classList.toggle("is-urgent", pending > 0);
      el.classList.toggle("is-clear", pending === 0);
      el.setAttribute(
        "title",
        pending > 0
          ? pending + " relevant notes need review"
          : "Review relevant information notes"
      );
      el.setAttribute(
        "aria-label",
        pending > 0
          ? pending + " session feedback with relevant information need review or action"
          : "All relevant information has been reviewed"
      );
    }
  };

  AdminSessionsHub.prototype.markFeedbackHandled = function (fb) {
    if (!fb) return;
    this._reviewedKeys[this.fbRowKey(fb)] = Date.now();
    this.persistReviewed();
    if (this.payload && Array.isArray(this.payload.session_feedback)) {
      AdminSessionsHub.refreshRelevantAlerts(this.payload.session_feedback);
    }
  };

  AdminSessionsHub.prototype.persistReviewed = function () {
    try {
      localStorage.setItem("ash_feedback_reviewed_v1", JSON.stringify(this._reviewedKeys));
    } catch (e) {}
  };

  AdminSessionsHub.prototype.closeModal = function () {
    this._modalFb = null;
    this._modalStep = null;
    var el = this.root.querySelector(".ash-modal-backdrop");
    if (el) el.remove();
  };

  AdminSessionsHub.prototype.isFeedbackNotesTab = function () {
    return this.tab === "positive" || this.tab === "relevant";
  };

  AdminSessionsHub.prototype.feedbackNotesRows = function (noteKind) {
    var kind = noteKind || this.tab;
    if (usesWeekDayPickerTab(kind) && clean(this.selectedDay)) {
      return this.feedbackNotesRowsForDay(kind, this.selectedDay);
    }
    return this.feedbackInRange().filter(function (fb) {
      if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) return false;
      if (kind === "positive") return !!clean(fb.positive_feedback);
      if (kind === "relevant") return !!clean(fb.relevant_information);
      return false;
    });
  };

  AdminSessionsHub.prototype.feedbackNotesRowsForDay = function (noteKind, iso) {
    var kind = noteKind || this.tab;
    var hub = this;
    var day = clean(iso);
    if (!day) return [];
    var q = clean(this.clientSearch).toLowerCase();
    return (this.payload.session_feedback || [])
      .filter(function (fb) {
        if (hub.feedbackRowDate(fb) !== day) return false;
        if (fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0) return false;
        if (q && clean(fb.client_name).toLowerCase().indexOf(q) === -1) return false;
        if (kind === "positive") return !!clean(fb.positive_feedback);
        if (kind === "relevant") return !!clean(fb.relevant_information);
        return false;
      })
      .sort(feedbackSortNewestFirst);
  };

  AdminSessionsHub.prototype.openReviewModal = function (fb, rowIdx, forceField) {
    var hub = this;
    var escFn = this.escapeHtml;
    var meta;
    if (forceField === "positive_feedback" && clean(fb.positive_feedback)) {
      meta = { kind: "positive", title: "Positive feedback \u2013 review", field: "positive_feedback" };
    } else if (forceField === "relevant_information" && clean(fb.relevant_information)) {
      meta = { kind: "relevant", title: "Relevant information \u2013 review", field: "relevant_information" };
    } else {
      meta = reviewKindForRow(fb);
    }
    var bodyText =
      meta.field === "relevant_information"
        ? clean(fb.relevant_information)
        : meta.field === "exceptional_challenges"
          ? clean(fb.exceptional_challenges)
          : meta.field === "incidents"
            ? clean(fb.incidents)
            : clean(fb.positive_feedback) || clean(fb.relevant_information) || clean(fb.exceptional_challenges) || "\u2014";
    var label =
      meta.kind === "relevant"
        ? "RELEVANT INFORMATION"
        : meta.kind === "challenges"
          ? "EXCEPTIONAL CHALLENGES"
          : meta.kind === "positive"
            ? "POSITIVE FEEDBACK"
            : "FEEDBACK NOTES";
    hub._modalFb = fb;
    hub._modalStep = "review";
    hub.closeModal();
    var backdrop = document.createElement("div");
    backdrop.className = "ash-modal-backdrop";
    backdrop.innerHTML =
      '<div class="ash-modal" role="dialog" aria-modal="true" aria-labelledby="ashModalTitle">' +
      '<h3 id="ashModalTitle" class="ash-modal__title">' + escFn(meta.title) + "</h3>" +
      '<p class="ash-modal__meta">' + escFn(fb.client_name) + " \u2013 " + escFn(formatFbDate(fb.session_date)) + " \u2013 " + escFn(fb.service || "\u2014") + "</p>" +
      '<p class="ash-modal__meta ash-modal__meta--sub">Instructor: ' + escFn(fb.completed_by_name || "\u2014") + "</p>" +
      '<div class="ash-modal__box"><div class="ash-modal__box-label">' + escFn(label) + '</div><p class="ash-modal__box-text">' + escFn(bodyText) + "</p></div>" +
      '<button type="button" class="ash-modal-btn ash-modal-btn--primary" data-ash-modal-reviewed>Reviewed</button>' +
      '<button type="button" class="ash-modal-btn ash-modal-btn--ghost" data-ash-modal-action>Take action</button>' +
      '<button type="button" class="ash-modal-btn ash-modal-btn--text" data-ash-modal-close>Close</button></div>';
    hub.root.appendChild(backdrop);
  };

AdminSessionsHub.prototype.openNotifyModal = function (fb) {
    var hub = this;
    var escFn = this.escapeHtml;
    var summary =
      (fb.completed_by_name || "Staff") +
      " has recorded feedback about " +
      (fb.client_name || "the participant") +
      " following the session dated " +
      formatFbDate(fb.session_date) +
      " (" +
      (fb.service || "session") +
      "). " +
      (clean(fb.positive_feedback) ? "Positive observations: " + clean(fb.positive_feedback).slice(0, 180) + "\u2014" : "");
    hub._modalFb = fb;
    hub._modalStep = "notify";
    hub.closeModal();
    var backdrop = document.createElement("div");
    backdrop.className = "ash-modal-backdrop";
    backdrop.innerHTML =
      '<div class="ash-modal ash-modal--wide" role="dialog" aria-modal="true">' +
      "<h3 class=\"ash-modal__title\">Notify stakeholders</h3>" +
      '<p class="ash-modal__lead">Choose how to communicate the <strong>outcome</strong> of this feedback. Demo only \u2013 no emails or chats are sent yet.</p>' +
      '<div class="ash-modal__box ash-modal__box--context"><div class="ash-modal__box-label">CONTEXT</div><p class="ash-modal__box-text">' +
      escFn(fb.client_name) +
      " \u2013 " +
      escFn(formatFbDate(fb.session_date)) +
      " \u2013 " +
      escFn(fb.service || "\u2014") +
      "</p></div>" +
      '<label class="ash-modal__field-label">Outcome / summary for channels</label>' +
      '<textarea class="ash-modal__textarea" id="ashNotifySummary" rows="5">' +
      escFn(summary) +
      "</textarea>" +
      '<div class="ash-modal__channels"><div class="ash-modal__box-label">CHANNELS</div>' +
      '<label class="ash-modal__check"><input type="checkbox" checked disabled> Parents \u2013 email with the outcome summary above</label>' +
      '<label class="ash-modal__check"><input type="checkbox" checked disabled> CEO \u2013 internal notification</label>' +
      '<label class="ash-modal__check"><input type="checkbox" checked disabled> Instructor \u2013 internal message</label>' +
      '<div class="ash-modal__delivery"><span>Delivery</span>' +
      '<label class="ash-modal__radio"><input type="radio" name="ashDelivery" value="team" checked> Team announcement</label>' +
      '<label class="ash-modal__radio"><input type="radio" name="ashDelivery" value="private"> Direct message</label></div></div>' +
      '<button type="button" class="ash-modal-btn ash-modal-btn--ghost" data-ash-modal-back>Back</button>' +
      '<button type="button" class="ash-modal-btn ash-modal-btn--primary" data-ash-modal-send>Send notifications (demo)</button>' +
      "</div>";
    backdrop.innerHTML = backdrop.innerHTML.replace(/<motion\.div/g, "<div").replace(/<\/motion\.div>/g, "</div>");
    hub.root.appendChild(backdrop);
  };

  AdminSessionsHub.prototype.logOpenContext = function () {
    return {
      openTermLabel: termLabelFromRange(this.weekStart),
      openWeekStart: this.weekStart,
    };
  };

  AdminSessionsHub.prototype.syncWeekRange = function () {
    if (this.mode === "feedback" && this._feedbackRangeCustom) return;
    this.rangeFrom = this.weekStart;
    this.rangeTo = addDaysIso(this.weekStart, 6);
  };

  AdminSessionsHub.prototype.htmlAbsentLogRow = function (mark, escFn) {
    var hub = this;
    var d = hub.absentMarkDisplay(mark);
    var sd = hub.absentMarkDate(mark);
    return (
      "<tr>" +
      '<td class="ash-td-center">' +
      (sd
        ? '<button type="button" class="ash-log-day-link" data-ash-log-jump-day="' +
          escFn(sd) +
          '">' +
          escFn(formatShortDate(sd)) +
          "</button>"
        : "\u2014") +
      "</td>" +
      '<td class="ash-td-center"><span class="ash-pill ash-pill--client">' +
      escFn(d.client) +
      "</span></td>" +
      '<td class="ash-td-center">' +
      escFn(d.service) +
      "</td>" +
      '<td class="ash-td-center">' +
      escFn(d.staff) +
      "</td>" +
      '<td class="ash-td-center ash-cell-muted">' +
      absentWhenStackHtml(d.whenDate, d.whenTime, escFn) +
      "</td></tr>"
    );
  };

  AdminSessionsHub.prototype.htmlAbsentsTermWeekLog = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var ctx = this.logOpenContext();
    var marks = this._absentMarksMerged || [];
    return renderTermWeekLogHtml({
      escapeHtml: esc,
      title: "Absents log",
      emptyMsg: "No absents in loaded data.",
      rows: marks,
      getDateIso: function (m) {
        return hub.absentMarkDate(m);
      },
      openTermLabel: ctx.openTermLabel,
      openWeekStart: ctx.openWeekStart,
      tableClass: " ash-table--overview",
      headHtml:
        '<th class="ash-td-center">Date</th><th class="ash-td-center">Participant</th><th class="ash-td-center">Service / session</th><th class="ash-td-center">Marked by</th><th class="ash-td-center">When</th>',
      rowHtml: function (m, escFn) {
        return hub.htmlAbsentLogRow(m, escFn);
      },
    });
  };

  AdminSessionsHub.ENGAGEMENT_STAR_HEADER =
    '<span class="ash-th-star__ico" role="img" aria-label="Engagement score, 1 to 5">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' +
    "</svg></span>";

  AdminSessionsHub.FEEDBACK_TABLE_HEAD =
    '<th>Participant</th><th>Service</th><th class="ash-th-star" title="Engagement (1–5)">' +
    AdminSessionsHub.ENGAGEMENT_STAR_HEADER +
    "</th><th>Regulation</th><th>Independence</th>" +
    "<th>Positive</th><th>Relevant</th><th>Reviewed by:</th>";

  /** Portal feedback row must match a roster slot on that calendar day (e.g. Tom Thu only, Gabriel Sun only). */
  AdminSessionsHub.prototype.feedbackAllowedOnCalendarDay = function (fb) {
    var hub = this;
    var iso = hub.feedbackRowDate(fb) || feedbackSessionDate(fb);
    if (!iso) return true;
    var name = clean(fb && fb.client_name);
    if (!name) return true;
    if (!hub.rosterRows || !hub.rosterRows.length) return true;
    var wd = weekdayLongFromIso(iso);
    if (!clientAllowedOnWeekday(name, wd)) return false;
    if (!clientAllowedOnDate(name, iso)) return false;
    var cid = canonicalClientSlug(name);
    var slots = hub.expandSlotsForDate(iso);
    for (var i = 0; i < slots.length; i++) {
      if (canonicalClientSlug(slots[i].client_name) === cid) return true;
    }
    return false;
  };

  AdminSessionsHub.prototype.feedbackLogRowsForDay = function (iso) {
    var hub = this;
    var day = clean(iso);
    var byKey = {};
    var out = [];

    function feedbackLogSlotKey(row) {
      return (
        canonicalClientSlug(row.client_name) +
        "|" +
        normTimeKey(row.session_time) +
        "|" +
        slugify(row.completed_by_name || "")
      );
    }

    function feedbackLogDedupeKey(row) {
      var kind = isCancellationFeedbackRow(row)
        ? "cancelled"
        : isAbsentFeedbackRow(row)
          ? "absent"
          : "attended";
      return feedbackLogSlotKey(row) + "|" + kind;
    }

    function pushRow(row) {
      if (isMislabeledRosterAreaClientName(row.client_name)) return;
      if (hub.opts && typeof hub.opts.feedbackRowScopeFilter === "function") {
        if (!hub.opts.feedbackRowScopeFilter(row)) return;
      }
      var k = feedbackLogDedupeKey(row);
      if (byKey[k]) return;
      byKey[k] = true;
      out.push(row);
    }

    var fbs = this.payload.session_feedback || [];
    for (var i = 0; i < fbs.length; i++) {
      var fb = fbs[i];
      var fbDay = hub.feedbackRowDate(fb) || feedbackSessionDate(fb);
      if (fbDay !== day) continue;
      if (isMislabeledRosterAreaClientName(fb.client_name)) continue;
      if (!hub.feedbackAllowedOnCalendarDay(fb)) continue;
      pushRow(fb);
    }
    var marks = this.absentMarksForDate(day);
    for (var j = 0; j < marks.length; j++) {
      var mk = marks[j];
      var cn = clean(mk.client_name);
      if (!cn) continue;
      var existing = null;
      for (var k = 0; k < out.length; k++) {
        if (canonicalClientSlug(out[k].client_name) !== canonicalClientSlug(cn)) continue;
        if (isAbsentFeedbackRow(out[k])) {
          existing = out[k];
          break;
        }
      }
      if (existing) continue;
      pushRow({
        client_name: cn,
        service: clean(mk.service) || "\u2014",
        session_date: day,
        session_time: clean(mk.session_time),
        attendance: "No",
        completed_by_name: clean(mk.staff_name) || "\u2014",
        created_at: mk.created_at || null,
        engagement_rating: null,
        client_emotions: null,
        engagement_patterns: null,
        positive_feedback: null,
        relevant_information: null,
        _ashAbsentMark: true,
      });
    }
    var cancels = hub.cancellationsForDate(day);
    for (var cj = 0; cj < cancels.length; cj++) {
      var can = cancels[cj].row;
      var cn = clean(can.client_name);
      if (!cn || isPortalTestClientName(cn)) continue;
      var cslug = canonicalClientSlug(cn);
      for (var rm = out.length - 1; rm >= 0; rm--) {
        if (
          canonicalClientSlug(out[rm].client_name) === cslug &&
          !isAbsentFeedbackRow(out[rm]) &&
          !isCancellationFeedbackRow(out[rm])
        ) {
          delete byKey[feedbackLogDedupeKey(out[rm])];
          out.splice(rm, 1);
        }
      }
      var reason = clean(can.reason_category) || "\u2014";
      var timing = clean(can.cancellation_timing);
      if (timing && reason !== "\u2014") reason = timing + " \u2014 " + reason;
      else if (timing) reason = timing;
      pushRow({
        client_name: cn,
        service: clean(can.service) || "\u2014",
        session_date: day,
        session_time: clean(can.session_time),
        attendance: "No",
        completed_by_name: clean(can.submitted_by_name) || "\u2014",
        created_at: can.created_at || null,
        engagement_rating: null,
        client_emotions: null,
        engagement_patterns: null,
        positive_feedback: null,
        relevant_information: reason,
        _ashCancellationMark: true,
      });
    }
    var bySlot = {};
    for (var d = 0; d < out.length; d++) {
      var row = out[d];
      var slotKey = feedbackLogSlotKey(row);
      if (!bySlot[slotKey]) {
        bySlot[slotKey] = row;
        continue;
      }
      if (isCancellationFeedbackRow(row) && !isCancellationFeedbackRow(bySlot[slotKey])) {
        bySlot[slotKey] = row;
      } else if (isAbsentFeedbackRow(row) && !isTerminalFeedbackRow(bySlot[slotKey])) {
        bySlot[slotKey] = row;
      }
    }
    out = Object.keys(bySlot).map(function (k) {
      return bySlot[k];
    });
    out.sort(feedbackSortNewestFirst);
    return out;
  };

  AdminSessionsHub.prototype.feedbackRowWithDisplaySlot = function (fb, slot) {
    if (!fb || fb._ashAwaitingSlot) return fb;
    var row = Object.assign({}, fb);
    row._ashDisplaySlot = slot;
    return row;
  };

  /** Lead MA: each submitted feedback once + awaiting rows (no merge duplicates). */
  AdminSessionsHub.prototype.feedbackMixRowsLeadUniqueDay = function (day) {
    var hub = this;
    day = clean(day || hub.selectedDay);
    var submitted = hub.feedbackLogRowsForDay(day);
    var units = hub.getFeedbackUnitsForDate(day);
    var out = submitted.slice();

    function scopedSlots(unit) {
      return unit.slots.filter(function (s) {
        if (shouldOmitOverviewSlot(hub, s)) return false;
        if (hub.opts.slotScopeFilter && !hub.opts.slotScopeFilter(s)) return false;
        return true;
      });
    }

    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      var slots = scopedSlots(unit);
      if (!slots.length) continue;
      var rep = slots[0];
      if (hub.feedbackUnitAbsent(unit) || hub.slotIsAbsent(rep)) {
        var afb =
          hub.findAbsentFeedbackForSlot(rep) || hub.syntheticAbsentDisplayRow(rep);
        if (!afb) {
          for (var ai = 0; ai < submitted.length; ai++) {
            if (
              isAbsentFeedbackRow(submitted[ai]) &&
              canonicalClientSlug(submitted[ai].client_name) ===
                canonicalClientSlug(rep.client_name)
            ) {
              afb = submitted[ai];
              break;
            }
          }
        }
        if (afb && out.indexOf(afb) < 0) out.push(afb);
        continue;
      }
      if (!hub.feedbackUnitResolved(unit)) {
        out.push({ _ashAwaitingSlot: true, slot: rep });
      }
    }

    out.sort(function (a, b) {
      var rankA = a && a._ashAwaitingSlot ? 0 : 1;
      var rankB = b && b._ashAwaitingSlot ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      var ca = canonicalClientSlug(
        (a && a._ashAwaitingSlot && a.slot ? a.slot.client_name : a.client_name) || ""
      );
      var cb = canonicalClientSlug(
        (b && b._ashAwaitingSlot && b.slot ? b.slot.client_name : b.client_name) || ""
      );
      if (ca !== cb) return ca.localeCompare(cb);
      return String(a.completed_by_name || "").localeCompare(String(b.completed_by_name || ""));
    });
    return out;
  };

  /** Feedback tab: submitted rows plus roster slots still awaiting feedback (lead overview). */
  AdminSessionsHub.prototype.feedbackMixRowsForDay = function (day) {
    var hub = this;
    day = clean(day || hub.selectedDay);
    var submitted = hub.feedbackLogRowsForDay(day);
    if (!hub.opts || !hub.opts.feedbackMixAwaitingSlots) return submitted;
    if (hubDayIsClubClosed(hub, day)) return submitted;
    if (hub.opts.feedbackMixLeadUnique) return hub.feedbackMixRowsLeadUniqueDay(day);

    var used = {};
    function markUsed(fb) {
      if (!fb || fb._ashAwaitingSlot) return;
      used[hub.fbRowKey(fb)] = true;
    }
    function isUsed(fb) {
      return fb && !fb._ashAwaitingSlot && used[hub.fbRowKey(fb)];
    }

    var slots = hub.expandSlotsForDate(day);
    var units = hub.getFeedbackUnitsForDate(day);
    var unitComplete = {};
    var unitAbsent = {};
    for (var u = 0; u < units.length; u++) {
      unitComplete[units[u].key] = hub.feedbackUnitResolved(units[u]);
      unitAbsent[units[u].key] = hub.feedbackUnitAbsent(units[u]);
    }
    var displaySlots = hub.sortOverviewSlotsForDisplay(
      slots.filter(function (s) {
        if (shouldOmitOverviewSlot(hub, s)) return false;
        if (hub.opts.slotScopeFilter && !hub.opts.slotScopeFilter(s)) return false;
        return true;
      }),
      unitComplete,
      unitAbsent
    );

    var out = [];
    for (var i = 0; i < displaySlots.length; i++) {
      var slot = displaySlots[i];
      var ukey = feedbackUnitKey(slot);
      var isAbsent = unitAbsent[ukey] || hub.slotIsAbsent(slot);
      var isCancelled = hub.slotHasCancellation(slot);
      if (isAbsent || isCancelled) {
        var afb =
          hub.findAbsentFeedbackForSlot(slot) || hub.syntheticAbsentDisplayRow(slot);
        if (!afb) {
          for (var si = 0; si < submitted.length; si++) {
            if (
              isAbsentFeedbackRow(submitted[si]) &&
              canonicalClientSlug(submitted[si].client_name) === canonicalClientSlug(slot.client_name)
            ) {
              afb = submitted[si];
              break;
            }
          }
        }
        if (!afb && isCancelled) {
          for (var sc = 0; sc < submitted.length; sc++) {
            if (
              isCancellationFeedbackRow(submitted[sc]) &&
              canonicalClientSlug(submitted[sc].client_name) === canonicalClientSlug(slot.client_name)
            ) {
              afb = submitted[sc];
              break;
            }
          }
        }
        if (afb && !isUsed(afb)) {
          out.push(afb);
          markUsed(afb);
        } else if (isAbsent) {
          var synthAbsent = hub.syntheticAbsentDisplayRow(slot);
          if (synthAbsent) {
            out.push(synthAbsent);
            markUsed(synthAbsent);
          }
        }
        continue;
      }
      if (hub.slotFeedbackComplete(slot)) {
        var fb = hub.findFeedbackForSlot(slot);
        if (fb && !isUsed(fb)) {
          out.push(fb);
          markUsed(fb);
        }
        continue;
      }
      out.push({ _ashAwaitingSlot: true, slot: slot });
    }
    for (var j = 0; j < submitted.length; j++) {
      if (!isUsed(submitted[j])) {
        out.push(submitted[j]);
        markUsed(submitted[j]);
      }
    }
    return out;
  };

  /** Feedback tab: all rows (incl. absents) for the selected calendar day + search/note filters. */
  AdminSessionsHub.prototype.feedbackRowsForSelectedDay = function () {
    var hub = this;
    var day = clean(this.selectedDay);
    if (!day) return [];
    var rows =
      hub.opts && hub.opts.feedbackMixAwaitingSlots
        ? this.feedbackMixRowsForDay(day)
        : this.feedbackLogRowsForDay(day);
    var q = clean(this.clientSearch).toLowerCase();
    var inst = clean(this.instructorFilter);
    if (!q && !inst && !this.feedbackNoteFilter) return rows;
    return rows.filter(function (fb) {
      var clientName = fb._ashAwaitingSlot && fb.slot ? fb.slot.client_name : fb.client_name;
      if (q && clean(clientName).toLowerCase().indexOf(q) === -1) return false;
      if (inst && fb._ashAwaitingSlot && fb.slot) {
        var labels = (fb.slot.instructors || [])
          .concat(String(fb.slot.instructor_label || "").split(/,|\/|&|\band\b/gi))
          .map(function (x) {
            return clean(x);
          })
          .filter(Boolean);
        var hit = false;
        for (var li = 0; li < labels.length; li++) {
          if (completedByMatchesInstructor(labels[li], inst)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      } else if (inst && !completedByMatchesInstructor(fb.completed_by_name, inst)) {
        return false;
      }
      if (hub.feedbackNoteFilter === "positive" && !clean(fb.positive_feedback)) return false;
      if (hub.feedbackNoteFilter === "relevant" && !clean(fb.relevant_information)) return false;
      return true;
    });
  };

  AdminSessionsHub.prototype.feedbackDisplayService = function (fb) {
    var svc = clean(fb && fb.service);
    if (svc) return svc;
    var iso = this.feedbackRowDate(fb);
    if (!iso) return "";
    var slots = this.expandSlotsForDate(iso);
    var cid = canonicalClientSlug(fb.client_name);
    for (var i = 0; i < slots.length; i++) {
      if (canonicalClientSlug(slots[i].client_name) !== cid) continue;
      if (clean(slots[i].service)) return clean(slots[i].service);
    }
    return "";
  };

  AdminSessionsHub.prototype.htmlFeedbackTableRow = function (fb, escFn, opts) {
    var hub = this;
    opts = opts || {};
    var esc = escFn || this.escapeHtml;

    if (fb && fb._ashAwaitingSlot && fb.slot) {
      var awaitSlot = fb.slot;
      if (hub.slotIsAbsent(awaitSlot)) {
        var absentRow =
          hub.findAbsentFeedbackForSlot(awaitSlot) ||
          hub.syntheticAbsentDisplayRow(awaitSlot);
        if (absentRow) return hub.htmlFeedbackTableRow(absentRow, escFn, opts);
        var awaitInstAbsent =
          awaitSlot.instructors && awaitSlot.instructors.length
            ? awaitSlot.instructors.map(formatInstructorPill).join(" ")
            : esc(awaitSlot.instructor_label || "\u2014");
        return (
          '<tr class="ash-fb-row ash-fb-row--awaiting">' +
          '<td><span class="ash-pill ash-pill--client">' +
          esc(awaitSlot.client_name) +
          "</span></td>" +
          "<td>" +
          esc(clean(awaitSlot.service) || "\u2014") +
          awaitTime +
          "</td>" +
          '<td colspan="5" class="ash-td-center">' +
          rosterFeedbackStatusHtml(true, false) +
          "</td>" +
          '<td class="ash-cell-instructor"><div class="ash-cell-main">' +
          awaitInstAbsent +
          "</div></td>" +
          "</tr>"
        );
      }
      var awaitSvc = clean(awaitSlot.service) || "\u2014";
      var awaitTime = awaitSlot.time_slot
        ? '<div class="ash-cell-sub">' + esc(awaitSlot.time_slot) + "</div>"
        : "";
      var awaitInst =
        awaitSlot.instructors && awaitSlot.instructors.length
          ? awaitSlot.instructors.map(formatInstructorPill).join(" ")
          : esc(awaitSlot.instructor_label || "\u2014");
      return (
        '<tr class="ash-fb-row ash-fb-row--awaiting">' +
        '<td><span class="ash-pill ash-pill--client">' +
        esc(awaitSlot.client_name) +
        "</span></td>" +
        "<td>" +
        esc(awaitSvc) +
        awaitTime +
        "</td>" +
        '<td colspan="5" class="ash-td-center">' +
        rosterFeedbackStatusHtml(false, false) +
        "</td>" +
        '<td class="ash-cell-instructor"><div class="ash-cell-main">' +
        awaitInst +
        "</div></td>" +
        "</tr>"
      );
    }

    function cellNoteHtml(text) {
      var t = clean(text);
      if (!t) return "\u2014";
      return t
        .split(/\n+/)
        .map(function (line) {
          return esc(line);
        })
        .join("<br>");
    }

    function cellNa() {
      return '<span class="ash-cell-muted">N/A</span>';
    }

    var absent = isAbsentFeedbackRow(fb);
    var cancelled = isCancellationFeedbackRow(fb);
    var terminal = isTerminalFeedbackRow(fb);
    var displaySlot = fb._ashDisplaySlot || null;
    var rawClient = clean((displaySlot && displaySlot.client_name) || fb.client_name);
    var clientLabel =
      rawClient ||
      resolveRosterClientName(canonicalClientSlug(fb.client_name)) ||
      "\u2014";
    var svcLabel =
      (displaySlot && clean(displaySlot.service)) ||
      hub.feedbackDisplayService(fb) ||
      "\u2014";
    var svcTimeSub =
      displaySlot && displaySlot.time_slot
        ? '<div class="ash-cell-sub">' + esc(displaySlot.time_slot) + "</div>"
        : "";
    var ind = terminal ? "N/A" : independenceLabel(fb);
    var pos = terminal ? "N/A" : clean(fb.positive_feedback) || "\u2014";
    var rel = terminal ? "N/A" : clean(fb.relevant_information) || "\u2014";
    var reviewCls =
      opts.clickable !== false && needsReviewRow(fb) && !hub._reviewedKeys[hub.fbRowKey(fb)]
        ? " ash-fb-row--needs-review"
        : "";
    var submittedAt = feedbackSubmittedAt(fb);
    var reviewTime = formatFbTime(submittedAt);
    var sessionDay = formatFbDateShort(fb.session_date) || formatFbDateShort(hub.feedbackRowDate(fb));
    var reviewDate = formatFbDate(submittedAt);
    var rowIdx = opts.rowIdx;
    var rowAttr =
      opts.clickable !== false && rowIdx != null && !isNaN(rowIdx)
        ? ' class="ash-fb-row' + reviewCls + '" data-ash-fb-row="' + rowIdx + '" tabindex="0" role="button"'
        : ' class="ash-fb-row' + reviewCls + '"';

    return (
      "<tr" + rowAttr + ">" +
      '<td><span class="ash-link">' +
      esc(clientLabel) +
      "</span>" +
      (cancelled
        ? '<div class="ash-cell-sub"><span class="ash-status ash-status--cancelled">Submitted (Cancelled)</span></div>'
        : absent
          ? '<div class="ash-cell-sub"><span class="ash-status ash-status--absent">Submitted (Absent)</span></div>'
          : "") +
      "</td>" +
      "<td>" +
      esc(svcLabel) +
      svcTimeSub +
      (sessionDay && !svcTimeSub ? '<div class="ash-cell-sub">' + esc(sessionDay) + "</div>" : "") +
      "</td>" +
      "<td>" +
      (terminal ? cellNa() : fb.engagement_rating != null ? esc(fb.engagement_rating) : "\u2014") +
      "</td>" +
      "<td>" +
      (terminal ? cellNa() : emotionFacesHtml(fb, esc)) +
      "</td>" +
      '<td class="ash-cell-note">' +
      (terminal ? cellNa() : cellNoteHtml(ind === "\u2014" ? "" : ind)) +
      "</td>" +
      '<td class="ash-cell-note">' +
      (terminal ? cellNa() : cellNoteHtml(pos === "\u2014" ? "" : pos)) +
      "</td>" +
      '<td class="ash-cell-note">' +
      (terminal ? cellNa() : cellNoteHtml(rel === "\u2014" ? "" : rel)) +
      "</td>" +
      '<td class="ash-cell-instructor"><div class="ash-cell-main">' +
      esc(fb.completed_by_name || "\u2014") +
      '</div><div class="ash-cell-sub">' +
      esc(reviewDate) +
      (reviewTime ? '</div><div class="ash-cell-sub">' + esc(reviewTime) : "") +
      "</div></td>" +
      "</tr>"
    );
  };

  AdminSessionsHub.prototype.htmlFeedbackLogRow = function (fb, escFn) {
    return this.htmlFeedbackTableRow(fb, escFn, { clickable: false });
  };

  AdminSessionsHub.prototype.htmlFeedbackTermWeekLog = function (opts) {
    var esc = this.escapeHtml;
    var hub = this;
    var ctx = this.logOpenContext();
    var rows =
      opts && opts.rows
        ? opts.rows.slice()
        : opts && opts.filterDayIso
          ? hub.feedbackLogRowsForDay(opts.filterDayIso)
          : (this.payload.session_feedback || []).slice();
    if (opts && opts.attendedOnly) {
      rows = rows.filter(function (fb) {
        return !fb.attendance || String(fb.attendance).toLowerCase().indexOf("no") !== 0;
      });
    }
    var weekJumpOnly = !!(opts && opts.weekJumpOnly);
    var fullColumns = !!(opts && opts.fullColumns) && !weekJumpOnly;
    if (opts && opts.flatDayLog && fullColumns) {
      var tableRows = rows
        .map(function (fb) {
          return hub.htmlFeedbackTableRow(fb, esc, { clickable: false });
        })
        .join("");
      if (!tableRows) {
        tableRows =
          '<tr><td colspan="8"><div class="ash-empty">' +
          esc((opts && opts.emptyMsg) || "No feedback for this day.") +
          "</div></td></tr>";
      }
      return (
        '<details class="ash-feedback-log ash-feedback-log--day" open>' +
        "<summary>" +
        esc((opts && opts.title) || "Session feedback log") +
        " \u2013 " +
        esc(formatLongDate(opts.filterDayIso)) +
        "</summary>" +
        '<p class="ash-feedback-log__note">Includes attended feedback, <strong>absents</strong>, and <strong>cancellations</strong> (N/A except Reviewed by / reason). See also Absents and Cancellations tabs.</p>' +
        '<div class="ash-table-wrap"><table class="ash-table ash-table--feedback"><thead><tr>' +
        AdminSessionsHub.FEEDBACK_TABLE_HEAD +
        "</tr></thead><tbody>" +
        tableRows +
        "</tbody></table></div></details>"
      );
    }
    var logOpts = {
      escapeHtml: esc,
      title: (opts && opts.title) || "Session feedback log",
      emptyMsg: (opts && opts.emptyMsg) || "No feedback in loaded data.",
      rows: rows,
      getDateIso: function (fb) {
        return hub.feedbackRowDate(fb);
      },
      openTermLabel: ctx.openTermLabel,
      openWeekStart: ctx.openWeekStart,
      tableClass: fullColumns ? " ash-table--feedback" : "",
      headHtml: fullColumns
        ? AdminSessionsHub.FEEDBACK_TABLE_HEAD
        : "<th>Session date</th><th>Participant</th><th>Service</th><th>Attendance</th><th>By</th>",
      rowHtml: function (fb, escFn) {
        if (fullColumns) return hub.htmlFeedbackTableRow(fb, escFn, { clickable: false });
        var sd = hub.feedbackRowDate(fb);
        var att =
          fb.attendance && String(fb.attendance).toLowerCase().indexOf("no") === 0 ? "Absent" : "Attended";
        return (
          "<tr>" +
          '<td class="ash-td-center">' +
          escFn(formatShortDate(sd)) +
          "</td>" +
          '<td class="ash-td-center"><span class="ash-pill ash-pill--client">' +
          escFn(fb.client_name || "\u2014") +
          "</span></td>" +
          '<td class="ash-td-center">' +
          escFn(fb.service || "\u2014") +
          "</td>" +
          '<td class="ash-td-center">' +
          escFn(att) +
          "</td>" +
          '<td class="ash-td-center">' +
          escFn(fb.completed_by_name || "\u2014") +
          "</td></tr>"
        );
      },
    };
    if (weekJumpOnly) {
      logOpts.flatWeeks = true;
      logOpts.weekJumpOnly = true;
      if (opts && opts.hint) logOpts.hint = opts.hint;
    } else if (fullColumns) {
      logOpts.flatWeeks = true;
      logOpts.weekBodyHtml = function (week, escFn) {
        return hub.htmlFeedbackLogWeekExpanded(week, escFn);
      };
    }
    return renderTermWeekLogHtml(logOpts);
  };

  /** Dates to count in Overview log (feedback/absents/incidents + visible week), not every calendar day. */
  AdminSessionsHub.prototype.overviewLogActiveDates = function () {
    var hub = this;
    var dates = {};
    function add(iso) {
      if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return;
      dates[iso] = true;
    }
    var fbs = this.payload.session_feedback || [];
    for (var i = 0; i < fbs.length; i++) add(hub.feedbackRowDate(fbs[i]));
    var marks = this._absentMarksMerged || this.payload.session_quick_marks || [];
    for (var j = 0; j < marks.length; j++) add(hub.absentMarkDate(marks[j]));
    var inc = this.payload.incident_reports || [];
    for (var k = 0; k < inc.length; k++) {
      add(rowDateIso(inc[k].session_date) || rowDateIso(inc[k].created_at));
    }
    var ws = this.weekStart;
    for (var w = 0; w < 7; w++) add(addDaysIso(ws, w));
    if (hub.selectedDay) add(hub.selectedDay);
    if (hub.rangeFrom && hub.rangeTo) {
      for (var d = hub.rangeFrom; d <= hub.rangeTo; d = addDaysIso(d, 1)) add(d);
    }
    return Object.keys(dates).sort();
  };

  AdminSessionsHub.prototype.overviewLogRows = function () {
    var hub = this;
    var dayList = this.overviewLogActiveDates();
    var out = [];
    for (var di = 0; di < dayList.length; di++) {
      var d = dayList[di];
      var slots = hub.expandSlotsForDate(d);
      for (var i = 0; i < slots.length; i++) {
        out.push({ date_iso: d, slot: slots[i] });
      }
    }
    return out;
  };

  AdminSessionsHub.prototype.htmlOverviewTermWeekLog = function () {
    var esc = this.escapeHtml;
    var hub = this;
    return renderTermWeekLogHtml({
      escapeHtml: esc,
      title: "Overview log",
      emptyMsg: "No roster sessions in loaded date span.",
      rows: hub.overviewLogRows(),
      getDateIso: function (row) {
        return row.date_iso;
      },
      flatWeeks: true,
      weekJumpOnly: true,
      hint:
        'Past weeks (Mon\u2013Sun). Click <strong>Show week \u2192</strong> to jump to that week at the top \u2013 day buttons and roster for the selected day.',
    });
  };

  AdminSessionsHub.prototype.bindEvents = function () {
    var hub = this;
    var root = this.root;
    if (!root || root.getAttribute("data-ash-events") === "1") return;
    root.setAttribute("data-ash-events", "1");
    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-ash-modal-close]") || t.closest(".ash-modal-backdrop") === t) {
        hub.closeModal();
        return;
      }
      if (t.closest("[data-ash-modal-reviewed]")) {
        if (hub._modalFb) hub.markFeedbackHandled(hub._modalFb);
        hub.closeModal();
        hub.renderPanels();
        return;
      }
      if (t.closest("[data-ash-modal-action]")) {
        if (hub._modalFb) {
          hub.markFeedbackHandled(hub._modalFb);
          hub.openNotifyModal(hub._modalFb);
        }
        return;
      }
      if (t.closest("[data-ash-modal-back]")) {
        if (hub._modalFb) hub.openReviewModal(hub._modalFb);
        return;
      }
      if (t.closest("[data-ash-modal-send]")) {
        if (hub._modalFb) hub.markFeedbackHandled(hub._modalFb);
        hub.closeModal();
        hub.renderPanels();
        return;
      }
      var fbRow = t.closest("[data-ash-fb-row]");
      if (fbRow && hub.mode === "feedback") {
        var idx = parseInt(fbRow.getAttribute("data-ash-fb-row"), 10);
        var noteField = fbRow.getAttribute("data-ash-note-field") || "";
        var rows = hub.isFeedbackNotesTab()
          ? hub.feedbackNotesRows(hub.tab)
          : hub.tab === "feedback"
            ? hub.feedbackRowsForSelectedDay()
            : hub.feedbackInRange().filter(function (fb) {
                return !fb.attendance || String(fb.attendance).toLowerCase().indexOf("no") !== 0;
              });
        if (!isNaN(idx) && rows[idx]) hub.openReviewModal(rows[idx], idx, noteField || undefined);
        return;
      }
      var portalNav = t.closest("[data-ash-portal-nav]");
      if (portalNav) {
        var navTarget = portalNav.getAttribute("data-ash-portal-nav");
        if (navTarget && hub.opts && typeof hub.opts.onPortalNavigate === "function") {
          hub.opts.onPortalNavigate(navTarget);
        }
        return;
      }
      var tabBtn = t.closest("[data-ash-tab]");
      if (tabBtn) {
        hub.tab = tabBtn.getAttribute("data-ash-tab");
        hub.render();
        return;
      }
      var fbMetricDay = t.closest("[data-ash-feedback-metric-day]");
      if (fbMetricDay && hub.mode === "feedback") {
        hub.feedbackMetricsDay = fbMetricDay.getAttribute("data-ash-feedback-metric-day");
        hub.selectedDay = hub.feedbackMetricsDay;
        hub.renderPanels();
        hub.scrollToWeekPicker();
        return;
      }
      if (t.closest("[data-ash-feedback-metrics-week]")) {
        hub.feedbackMetricsDay = null;
        hub.renderPanels();
        return;
      }
      var logWeekBtn = t.closest("[data-ash-log-jump-week]");
      if (logWeekBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        hub.goToWeekStart(logWeekBtn.getAttribute("data-ash-log-jump-week"), {});
        return;
      }
      var logDayBtn = t.closest("[data-ash-log-jump-day]");
      if (logDayBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        hub.goToCalendarDay(logDayBtn.getAttribute("data-ash-log-jump-day"));
        return;
      }
      var dayBtn = t.closest("[data-ash-day]");
      if (dayBtn) {
        hub.selectedDay = dayBtn.getAttribute("data-ash-day");
        if (hub.mode === "feedback") hub.feedbackMetricsDay = hub.selectedDay;
        if (hub.opts && hub.opts.externalTabs) hub.renderPanels();
        else hub.render();
        hub.scrollToWeekPicker();
        return;
      }
      if (t.closest("[data-ash-week-prev]")) {
        ev.preventDefault();
        var offPrev = hub.selectedDayOffsetInWeek();
        hub.weekStart = clampHubWeekStart(hub, addDaysIso(hub.weekStart, -7));
        hub.selectedDay = hub.preferredDayAfterWeekShift(offPrev);
        if (hub.mode === "feedback") {
          hub.feedbackMetricsDay = hub.selectedDay;
          hub._feedbackRangeCustom = false;
        }
        hub.syncWeekRange();
        hub.snapSelectedDayToDisplayWeek();
        if (hub.opts && hub.opts.externalTabs) hub.renderPanels();
        else hub.render();
        return;
      }
      if (t.closest("[data-ash-week-next]")) {
        ev.preventDefault();
        var offNext = hub.selectedDayOffsetInWeek();
        hub.weekStart = clampHubWeekStart(hub, addDaysIso(hub.weekStart, 7));
        hub.selectedDay = hub.preferredDayAfterWeekShift(offNext);
        if (hub.mode === "feedback") {
          hub.feedbackMetricsDay = hub.selectedDay;
          hub._feedbackRangeCustom = false;
        }
        hub.syncWeekRange();
        hub.snapSelectedDayToDisplayWeek();
        if (hub.opts && hub.opts.externalTabs) hub.renderPanels();
        else hub.render();
        return;
      }
      if (t.closest("[data-ash-week-this]")) {
        ev.preventDefault();
        if (usesWeekDayPickerTab(hub.tab)) {
          hub.syncWeekPickerToCurrentWeek();
        } else {
          hub.weekStart = mondayOfWeek(isoToday());
          hub.selectedDay = isoToday();
        }
        if (hub.mode === "feedback") {
          hub.feedbackMetricsDay = hub.selectedDay;
          hub._feedbackRangeCustom = false;
        }
        hub.syncWeekRange();
        hub.scheduleDate = isoToday();
        if (hub.opts && hub.opts.externalTabs) hub.renderPanels();
        else hub.render();
        hub.scrollToWeekPicker();
        return;
      }
      if (t.closest("[data-ash-feedback-apply]")) {
        var rf = hub.root.querySelector("#ashRangeFrom");
        var rt = hub.root.querySelector("#ashRangeTo");
        if (rf && rf.value) hub.rangeFrom = rf.value;
        if (rt && rt.value) hub.rangeTo = rt.value;
        if (hub.rangeFrom > hub.rangeTo) {
          var swap = hub.rangeFrom;
          hub.rangeFrom = hub.rangeTo;
          hub.rangeTo = swap;
        }
        if (hub.mode === "feedback") hub._feedbackRangeCustom = true;
        hub.renderPanels();
        return;
      }
      if (t.closest("[data-ash-feedback-this-week]")) {
        hub.weekStart = mondayOfWeek(isoToday());
        hub._feedbackRangeCustom = false;
        if (hub.mode === "feedback") {
          hub.selectedDay = isoToday();
          hub.feedbackMetricsDay = hub.selectedDay;
        }
        hub.syncWeekRange();
        hub.renderPanels();
        return;
      }
      if (t.closest("[data-ash-feedback-all-loaded]")) {
        hub.initFeedbackDateRangeAllLoaded();
        hub.renderPanels();
        return;
      }
      if (t.closest("[data-ash-feedback-clear-note-filter]")) {
        hub.feedbackNoteFilter = "";
        hub.renderPanels();
        return;
      }
    });
    this.root.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.id === "ashClientSearch") {
        hub.clientSearch = t.value;
        hub.refreshClientFilterView();
        return;
      }
      if (t.id === "ashInstructorFilter") {
        hub.instructorFilter = t.value || "";
        hub.refreshClientFilterView();
        return;
      }
      if (t.id === "ashServiceFilter") {
        hub.serviceFilter = t.value || "";
        hub.refreshClientFilterView();
        return;
      }
      if (t.id === "ashRangeFrom") hub.rangeFrom = t.value || hub.rangeFrom;
      if (t.id === "ashRangeTo") hub.rangeTo = t.value || hub.rangeTo;
      if (t.id === "ashScheduleDate") hub.scheduleDate = t.value || hub.scheduleDate;
    });
    this.root.addEventListener("input", function (ev) {
      if (ev.target && ev.target.id === "ashClientSearch") {
        hub.clientSearch = ev.target.value;
        hub.refreshClientFilterView();
      }
    });
    this.root.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var jump = ev.target && ev.target.closest && ev.target.closest("[role='button'].ash-log-jump");
      if (jump) {
        ev.preventDefault();
        jump.click();
        return;
      }
      var row = ev.target && ev.target.closest && ev.target.closest("[data-ash-fb-row]");
      if (!row || hub.mode !== "feedback") return;
      ev.preventDefault();
      row.click();
    });
    this.root.addEventListener("dblclick", function (ev) {
      var fbRow = ev.target && ev.target.closest && ev.target.closest("[data-ash-fb-row]");
      if (!fbRow || hub.mode !== "feedback") return;
      ev.preventDefault();
      clearTimeout(hub._fbRowClickTimer);
      var idx = parseInt(fbRow.getAttribute("data-ash-fb-row"), 10);
      var rows = hub.isFeedbackNotesTab()
        ? hub.feedbackNotesRows(hub.tab)
        : hub.feedbackInRange().filter(function (fb) {
            return !fb.attendance || String(fb.attendance).toLowerCase().indexOf("no") !== 0;
          });
      if (isNaN(idx) || !rows[idx]) return;
      var modal = global.PortalFormRecordModal;
      if (modal && typeof modal.openWithRow === "function") modal.openWithRow("feedback", rows[idx], idx);
    });
  };

  AdminSessionsHub.prototype.renderPanels = function () {
    this.indexAbsentMarks();
    this.indexFeedback();
    var shell = this.root.querySelector(".ash-panels") || this.root.querySelector(".ash-panels--feedback-only");
    if (!shell) return;
    if (this.tab === "tracking") shell.innerHTML = this.htmlTracking();
    else if (this.tab === "absents") shell.innerHTML = this.htmlAbsents();
    else if (this.tab === "incidents") shell.innerHTML = this.htmlIncidents();
    else if (this.tab === "cancellations") shell.innerHTML = this.htmlCancellations();
    else if (this.tab === "positive") shell.innerHTML = this.htmlFeedbackNotes("positive");
    else if (this.tab === "relevant") shell.innerHTML = this.htmlFeedbackNotes("relevant");
    else if (this.tab === "feedback") shell.innerHTML = this.htmlFeedback();
    else if (this.tab === "schedule") shell.innerHTML = this.htmlSchedule();
  };

  AdminSessionsHub.prototype.htmlWeekHeader = function () {
    var hub = this;
    var esc = this.escapeHtml;
    var weekRange =
      formatShortDate(this.weekStart) + " \u2013 " + formatShortDate(addDaysIso(this.weekStart, 6));
    var cards = this.weekDaysForDisplay()
      .map(function (iso, idx) {
        return htmlWeekDayCard(hub, iso, idx, esc);
      })
      .join("");
    return (
      '<div class="ash-week-sticky-anchor"><div class="ash-week-block">' +
      '<div class="ash-week-head">' +
      '<div class="ash-week-head__row">' +
      '<div class="ash-week-head__titles">' +
      '<div class="ash-week-summary__label">Week (Mon\u2013Sun)</div>' +
      '<span class="ash-week-summary__range">' +
      esc(weekRange) +
      "</span></div>" +
      htmlWeekNavButtons(this) +
      "</div></div>" +
      '<div class="ash-day-row ash-day-row--week">' +
      cards +
      "</div></div></div>"
    );
  };

  AdminSessionsHub.prototype.sortOverviewSlotsForDisplay = function (slots, unitComplete, unitAbsent) {
    var hub = this;
    var list = slots.slice();
    list.sort(function (a, b) {
      var ukeyA = a.feedback_unit_key || feedbackUnitKey(a);
      var ukeyB = b.feedback_unit_key || feedbackUnitKey(b);
      var absentA = unitAbsent[ukeyA] || hub.slotIsAbsent(a);
      var absentB = unitAbsent[ukeyB] || hub.slotIsAbsent(b);
      var cancelledA = hub.slotHasCancellation(a);
      var cancelledB = hub.slotHasCancellation(b);
      var doneA = unitComplete[ukeyA] || hub.slotFeedbackComplete(a);
      var doneB = unitComplete[ukeyB] || hub.slotFeedbackComplete(b);
      var rankA = overviewSlotFeedbackRank(absentA, doneA, cancelledA);
      var rankB = overviewSlotFeedbackRank(absentB, doneB, cancelledB);
      if (rankA !== rankB) return rankA - rankB;
      return a.time_start.localeCompare(b.time_start) || a.client_name.localeCompare(b.client_name);
    });
    return list;
  };

  AdminSessionsHub.prototype.htmlTracking = function () {
    var esc = this.escapeHtml;
    var hub = this;
    if (hubDayIsClubClosed(hub, this.selectedDay)) {
      return (
        this.htmlFeedbackWeekDaysRow({ overviewPicker: true }) +
        this.overviewFilterRowHtml() +
        '<h3 class="ash-table-title">' +
        esc(formatLongDate(this.selectedDay)) +
        ' <span class="ash-badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">Closed</span></h3>' +
        /* closed day — no count hint */
        '<div class="ash-table-wrap"><table class="ash-table ash-table--overview"><tbody><tr><td colspan="9">' +
        '<div class="ash-empty">Club closed \u2014 no sessions on this date.</div></td></tr></tbody></table></div>'
      );
    }
    var slots = this.expandSlotsForDate(this.selectedDay);
    var units = this.getFeedbackUnitsForDate(this.selectedDay);
    var unitComplete = {};
    var unitAbsent = {};
    for (var u = 0; u < units.length; u++) {
      unitComplete[units[u].key] = hub.feedbackUnitResolved(units[u]);
      unitAbsent[units[u].key] = hub.feedbackUnitAbsent(units[u]);
    }
    var scopedSlots = slots.filter(function (s) {
      return !shouldOmitOverviewSlot(hub, s) && !isTeflonDemoRosterSlot(s);
    });
    var displaySlots = hub.sortOverviewSlotsForDisplay(
      overviewDisplaySlotsFromUnits(hub, scopedSlots).filter(function (s) {
        return hub.slotPassesOverviewFilters(s);
      }),
      unitComplete,
      unitAbsent
    );
    var rows = displaySlots
      .map(function (slot) {
        var ukey = feedbackUnitKey(slot);
        var fbDone = unitComplete[ukey] || hub.slotFeedbackComplete(slot);
        var isAbsent = unitAbsent[ukey] || hub.slotIsAbsent(slot);
        var isCancelled = hub.slotHasCancellation(slot);
        var slotOv = hub.overrideForSlot(slot);
        var isUpdated = hubSlotShowsUpdatedChip(slot, slotOv);
        var fbCell;
        if (isAbsent) {
          fbCell = rosterFeedbackStatusHtml(true, fbDone);
        } else if (isCancelled) {
          fbCell = '<span class="ash-status ash-status--absent">Cancelled</span>';
        } else {
          fbCell = rosterFeedbackStatusHtml(false, fbDone);
        }
        var statusCell = isCancelled
          ? '<span class="ash-badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">Cancelled</span>'
          : isAbsent
            ? '<span class="ash-badge" style="background:#fff7ed;color:#c2410c;border:1px solid rgba(234,88,12,.35)">Absent</span>'
            : isUpdated
              ? '<span class="ash-badge ash-badge--booked">Booked</span> <span class="override-chip override--updated">' +
                esc(isUpdated && slotOv ? hubOverrideLabel(slotOv) : "Updated") +
                "</span>"
              : '<span class="ash-badge ash-badge--booked">Booked</span>';
        var svc =
          esc(slot.service) +
          (slot.time_slot ? '<div class="ash-cell-sub">' + esc(slot.time_slot) + "</div>" : "");
        var inst = slot.instructors.map(formatInstructorPill).join(" ") || "\u2014";
        var venue = clean(slot.venue) || "\u2014";
        var notes = clean(slot.area) || "\u2014";
        return (
          "<tr>" +
          '<td class="ash-td-center">' +
          svc +
          "</td>" +
          '<td class="ash-td-center">' +
          inst +
          "</td>" +
          '<td class="ash-td-center"><span class="ash-pill ash-pill--client">' +
          esc(slot.client_name) +
          "</span></td>" +
          '<td class="ash-td-center">' +
          esc(venue) +
          "</td>" +
          '<td class="ash-td-center ash-cell-muted">' +
          esc(notes) +
          "</td>" +
          '<td class="ash-td-center">' +
          statusCell +
          "</td>" +
          '<td class="ash-td-center">' +
          fbCell +
          "</td>" +
          '<td class="ash-td-center">' +
          yesNoCell(hub.slotHasIncident(slot)) +
          "</td>" +
          '<td class="ash-td-center">' +
          yesNoCell(isCancelled) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    if (!rows) {
      rows =
        '<tr><td colspan="9"><div class="ash-empty">' +
        (this.bundleError ? esc(this.bundleError) : "No roster slots for this day.") +
        "</div></td></tr>";
    }

    return (
      this.htmlFeedbackWeekDaysRow({ overviewPicker: true }) +
      this.overviewFilterRowHtml() +
      '<h3 class="ash-table-title">' +
      esc(formatLongDate(this.selectedDay)) +
      ' <span class="ash-badge ash-badge--booked">Roster</span>' +
      htmlOverviewSessionCountHint(hub, this.selectedDay, displaySlots.filter(function (s) {
        return !isTeflonDemoRosterSlot(s);
      }), esc) +
      "</h3>" +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--overview"><thead><tr>' +
      '<th class="ash-td-center">Service</th><th class="ash-td-center">Instructor</th><th class="ash-td-center">Participant</th><th class="ash-td-center">Venue</th><th class="ash-td-center">Notes</th><th class="ash-td-center">Status</th><th class="ash-td-center">Feedback</th>' +
      TH_ICON_INCIDENT +
      TH_ICON_CANCELLATION +
      "</tr></thead><tbody data-ash-client-filter-tbody>" +
      rows +
      "</tbody></table></div>" +
      this.htmlOverviewTermWeekLog()
    );
  };

  AdminSessionsHub.prototype.htmlRosterSessionsBreakdown = function (iso) {
    var esc = this.escapeHtml;
    var hub = this;
    var slots = this.expandSlotsForDate(iso);
    if (!slots.length) return "";
    var rows = slots
      .map(function (slot) {
        var slotAbsent = hub.slotIsAbsent(slot);
        var fb = slotAbsent ? hub.findAbsentFeedbackForSlot(slot) : hub.matchFeedbackForSlot(slot);
        if (!fb && !slotAbsent && slot.feedback_merge_group) {
          var mgSlots = slots.filter(function (s) {
            return s.feedback_merge_group === slot.feedback_merge_group;
          });
          for (var mi = 0; mi < mgSlots.length; mi++) {
            fb = hub.matchFeedbackForSlot(mgSlots[mi]);
            if (fb) break;
          }
        }
        var fbDone = !slotAbsent && hub.slotFeedbackComplete(slot);
        var fbLabelHtml;
        slotAbsent = slotAbsent || (fb && hub.isFeedbackAbsent(fb));
        fbLabelHtml = rosterFeedbackStatusHtml(slotAbsent, fbDone && !slotAbsent);
        var inst =
          slot.instructors && slot.instructors.length
            ? slot.instructors.map(formatInstructorPill).join(" ")
            : esc(slot.instructor_label || "\u2014");
        return (
          "<tr>" +
          '<td class="ash-td-center"><span class="ash-pill ash-pill--client">' +
          esc(slot.client_name) +
          "</span></td>" +
          '<td class="ash-td-center">' +
          esc(slot.service) +
          (slot.time_slot ? '<div class="ash-cell-sub">' + esc(slot.time_slot) + "</div>" : "") +
          "</td>" +
          '<td class="ash-td-center">' +
          inst +
          "</td>" +
          '<td class="ash-td-center">' +
          fbLabelHtml +
          "</td></tr>"
        );
      })
      .join("");
    return (
      '<details class="ash-roster-breakdown" open>' +
      "<summary>Roster sessions (" +
      esc(String(slots.length)) +
      ") \u2013 " +
      esc(formatLongDate(iso)) +
      "</summary>" +
      '<p class="ash-roster-breakdown__hint">Session count = roster rows for this day (each block needing feedback). Sunday Multi-Activity: Big Pool (swimming instructor) and Hub Room (support) are separate rows \u2013 typically 2 feedbacks per child per block pair. Aquatic and Climbing are separate rows. Some rows share one submitted form (e.g. Yusuf 9:00\u201310:15 with Roberto).</p>' +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--compact"><thead><tr>' +
      "<th>Participant</th><th>Service</th><th>Instructor</th><th>Feedback</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div></details>"
    );
  };

  AdminSessionsHub.prototype.htmlAbsents = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var iso = this.selectedDay;
    if (hubDayIsProgrammeInactive(hub, iso)) {
      return (
        this.htmlWeekHeader() +
        '<h3 class="ash-table-title">' +
        esc(formatLongDate(iso)) +
        ' <span class="ash-badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">Not scheduled</span></h3>' +
        '<div class="ash-table-wrap"><table class="ash-table ash-table--overview"><tbody><tr><td colspan="4">' +
        '<div class="ash-empty">Not a programme day for you \u2014 pick a highlighted day above.</div>' +
        "</td></tr></tbody></table></div>" +
        this.htmlAbsentsTermWeekLog()
      );
    }
    var marks = this.absentMarksForDate(iso);
    var rows = marks
      .map(function (mark) {
        var d = hub.absentMarkDisplay(mark);
        return (
          "<tr>" +
          '<td class="ash-td-center"><span class="ash-pill ash-pill--client">' +
          esc(d.client) +
          "</span></td>" +
          '<td class="ash-td-center">' +
          esc(d.service) +
          "</td>" +
          '<td class="ash-td-center">' +
          esc(d.staff) +
          "</td>" +
          '<td class="ash-td-center ash-cell-muted">' +
          absentWhenStackHtml(d.whenDate, d.whenTime, esc) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    if (!rows) {
      rows = '<tr><td colspan="4"><div class="ash-empty">No absents recorded for this day.</div></td></tr>';
    }

    return (
      this.htmlWeekHeader() +
      '<h3 class="ash-table-title">' +
      esc(formatLongDate(iso)) +
      ' <span class="ash-badge" style="background:#fef3c7;color:#92400e;">Absents</span> ' +
      '<span class="ash-badge ash-badge--booked">' +
      esc(String(marks.length)) +
      (marks.length === 1 ? " mark" : " marks") +
      "</span></h3>" +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--overview"><thead><tr>' +
      '<th class="ash-td-center">Participant</th><th class="ash-td-center">Service / session</th><th class="ash-td-center">Marked by</th><th class="ash-td-center">When</th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>" +
      this.htmlAbsentsTermWeekLog()
    );
  };

  AdminSessionsHub.prototype.htmlFeedbackMetricStrip = function (sum) {
    var esc = this.escapeHtml;
    var scope = this.feedbackMetricsScopeLabel();
    var scored = sum.scored;
    var avgNum = parseFloat(String(sum.avg).replace(",", "."));
    var fillPctRaw = Number.isFinite(avgNum) ? Math.min(100, Math.max(0, (avgNum / 5) * 100)) : 0;
    var fillPct = roundPct(fillPctRaw);
    var tagTotal = sum.tagTotal || 0;
    var indep = sum.indep || { independent: 0, prompts: 0, regular: 0, full: 0 };
    var indepTotal = sum.indepTotal || 0;
    function roundPct(n) {
      var x = Number(n);
      if (!Number.isFinite(x)) return 0;
      x = Math.min(100, Math.max(0, x));
      if (x >= 10) return Math.round(x * 10) / 10;
      return Math.round(x * 100) / 100;
    }
    function tagPct(key) {
      if (!tagTotal) return 0;
      return roundPct((100 * sum.tags[key]) / tagTotal);
    }
    function indepPct(key) {
      if (!indepTotal) return 0;
      return roundPct((100 * indep[key]) / indepTotal);
    }
    function pctLabel(n) {
      var x = roundPct(n);
      var s = String(x);
      if (s.indexOf(".") !== -1) s = s.replace(".", ",");
      return s + "%";
    }
    function metricHead(title) {
      return (
        '<div class="ash-metric-head">' +
        "<h4>" +
        esc(title) +
        "</h4>" +
        '<p class="ash-metric-term-line">(' +
        esc(scope) +
        ")</p></div>"
      );
    }
    function gaugeValueColor(pct) {
      var p = Number(pct) || 0;
      if (p >= 75) return "#15803d";
      if (p >= 50) return "#65a30d";
      if (p >= 25) return "#ea580c";
      return "#dc2626";
    }
    function polarGauge(cx, cy, r, deg) {
      var rad = (deg * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    }
    function gaugeArc(cx, cy, r, degStart, degEnd) {
      var s = polarGauge(cx, cy, r, degStart);
      var e = polarGauge(cx, cy, r, degEnd);
      var large = Math.abs(degEnd - degStart) > 180 ? 1 : 0;
      return (
        "M " +
        s.x.toFixed(2) +
        " " +
        s.y.toFixed(2) +
        " A " +
        r +
        " " +
        r +
        " 0 " +
        large +
        " 1 " +
        e.x.toFixed(2) +
        " " +
        e.y.toFixed(2)
      );
    }
    function gaugeTickLabels(cx, cy, labelR) {
      var specs = [
        { tick: 0, deg: 180, anchor: "end", dy: 5 },
        { tick: 25, deg: 135, anchor: "middle", dy: -5 },
        { tick: 50, deg: 90, anchor: "middle", dy: -9 },
        { tick: 75, deg: 45, anchor: "middle", dy: -5 },
        { tick: 100, deg: 0, anchor: "start", dy: 5 },
      ];
      var out = "";
      for (var ti = 0; ti < specs.length; ti++) {
        var spec = specs[ti];
        var lp = polarGauge(cx, cy, labelR, spec.deg);
        out +=
          '<text x="' +
          lp.x.toFixed(1) +
          '" y="' +
          (lp.y + spec.dy).toFixed(1) +
          '" text-anchor="' +
          spec.anchor +
          '" class="ash-gauge-tick">' +
          spec.tick +
          "%</text>";
      }
      return out;
    }
    function engagementGauge(pct, avgText) {
      var p = Math.min(100, Math.max(0, Number(pct) || 0));
      var cx = 120;
      var cy = 118;
      var r = 76;
      var strokeW = 22;
      var labelR = r + 28;
      var needleDeg = 180 - (p / 100) * 180;
      var needleReach = r - 6;
      var tip = polarGauge(cx, cy, needleReach, needleDeg);
      var valCol = gaugeValueColor(p);
      var tickLabels = gaugeTickLabels(cx, cy, labelR);
      var segColors = ["#e85d5d", "#f59e0b", "#a3e635", "#16a34a"];
      var segEnds = [
        [180, 135],
        [135, 90],
        [90, 45],
        [45, 0],
      ];
      var arcPaths = "";
      for (var si = 0; si < segEnds.length; si++) {
        arcPaths +=
          '<path d="' +
          gaugeArc(cx, cy, r, segEnds[si][0], segEnds[si][1]) +
          '" fill="none" stroke="' +
          segColors[si] +
          '" stroke-width="' +
          strokeW +
          '" stroke-linecap="round"/>';
      }
      return (
        '<div class="ash-gauge-wrap ash-gauge-wrap--modern" role="img" aria-label="Engagement ' +
        esc(pctLabel(p)) +
        ", average " +
        esc(String(avgText)) +
        ' out of 5">' +
        '<svg class="ash-gauge-svg" viewBox="0 0 240 152" aria-hidden="true">' +
        arcPaths +
        tickLabels +
        '<line x1="' +
        cx +
        '" y1="' +
        cy +
        '" x2="' +
        tip.x.toFixed(2) +
        '" y2="' +
        tip.y.toFixed(2) +
        '" stroke="#475569" stroke-width="2.5" stroke-linecap="round"/>' +
        '<circle cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="10" fill="#fff" stroke="#475569" stroke-width="2.5"/>' +
        '<circle cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="3.5" fill="#475569"/>' +
        "</svg>" +
        '<p class="ash-gauge-value" style="color:' +
        valCol +
        '">' +
        esc(pctLabel(p)) +
        '</p><p class="ash-gauge-sub">' +
        esc(String(avgText)) +
        " / 5 avg</p></div>"
      );
    }
    var LILAC = "#7c3aed";
    function donutRingHtml(fill, col) {
      var f = Math.min(100, Math.max(0, Number(fill) || 0));
      return (
        '<div class="ash-mini-donut-ring" style="--ash-fill:' +
        f +
        ";--ash-donut-col:" +
        col +
        '" aria-hidden="true">' +
        '<span class="ash-mini-donut-pct" style="color:' +
        col +
        '">' +
        esc(pctLabel(f)) +
        "</span></div>"
      );
    }
    function emotionDonutCell(key, col, pct, label, count) {
      var fill = Math.min(100, Math.max(0, Number(pct) || 0));
      var icon = ASH_EMOTION_FACE_SVG[key] || "";
      return (
        '<div class="ash-mini-donut-cell ash-mini-donut-cell--emotion ash-mini-donut-cell--' +
        key +
        '">' +
        '<span class="ash-mini-donut-icon" style="color:' +
        col +
        '">' +
        icon +
        "</span>" +
        '<strong class="ash-mini-donut-label">' +
        esc(label) +
        "</strong>" +
        donutRingHtml(fill, col) +
        '<small class="ash-mini-donut-count">' +
        esc(String(count)) +
        " tags</small></div>"
      );
    }
    function independenceBarChart(indepPctFn) {
      var items = [
        { key: "independent", title: "Independent", short: "Indep." },
        { key: "prompts", title: "With prompts", short: "Prompts" },
        { key: "regular", title: "Regular support", short: "Regular" },
        { key: "full", title: "Full support", short: "Full" },
      ];
      var cols = items
        .map(function (item) {
          var pct = Math.min(100, Math.max(0, Number(indepPctFn(item.key)) || 0));
          return (
            '<div class="ash-indep-bar-col ash-indep-bar-col--' +
            item.key +
            '">' +
            '<span class="ash-indep-bar-pct">' +
            esc(pctLabel(pct)) +
            "</span>" +
            '<div class="ash-indep-bar-stage" style="--ash-bar-h:' +
            pct +
            '%">' +
            '<span class="ash-indep-bar-fill"></span></div>' +
            '<span class="ash-indep-bar-label" title="' +
            esc(item.title) +
            '"><span class="ash-indep-bar-label__long">' +
            esc(item.title) +
            '</span><span class="ash-indep-bar-label__short">' +
            esc(item.short) +
            "</span></span></div>"
          );
        })
        .join("");
      return (
        '<div class="ash-indep-bars ash-indep-bars--simple" role="img" aria-label="Independence levels">' +
        '<div class="ash-indep-bars-cols">' +
        cols +
        "</div></div>"
      );
    }
    return (
      '<div class="ash-metrics-dashboard">' +
      '<div class="ash-metrics-row ash-metrics-row--top">' +
      '<div class="ash-metric-card ash-metric-card--engagement">' +
      metricHead("Engagement") +
      '<div class="ash-metric-chart ash-metric-chart--gauge">' +
      engagementGauge(fillPct, sum.avg) +
      "</div>" +
      '<p class="ash-metric-foot ash-metric-foot--center">' +
      esc(String(scored)) +
      " sessions with scores</p></div>" +
      '<div class="ash-metric-card ash-metric-card--emotions">' +
      metricHead("Regulation / emotions") +
      '<div class="ash-mini-donut-grid ash-mini-donut-grid--emotions">' +
      emotionDonutCell("happy", "#16a34a", tagPct("happy"), "Happy / excited", sum.tags.happy) +
      emotionDonutCell("anxious", "#ca8a04", tagPct("anxious"), "Anxious", sum.tags.anxious) +
      emotionDonutCell("withdrawn", "#2563eb", tagPct("withdrawn"), "Withdrawn", sum.tags.withdrawn) +
      emotionDonutCell("out_of_control", "#dc2626", tagPct("out_of_control"), "Out of control", sum.tags.out_of_control) +
      "</div></div>" +
      '<div class="ash-metric-card ash-metric-card--independence">' +
      metricHead("Independence") +
      '<div class="ash-metric-chart ash-metric-chart--indep-bars">' +
      independenceBarChart(indepPct) +
      "</div></div></div></div>"
    );
  };

  AdminSessionsHub.prototype.htmlFeedbackWeekDaysRow = function (opts) {
    opts = opts || {};
    var hub = this;
    var esc = this.escapeHtml;
    var days = this.weekDaysForDisplay();
    var dayAttr = opts.overviewPicker ? "data-ash-day" : "data-ash-feedback-metric-day";
    var weekLabel =
      formatShortDate(this.weekStart) + " \u2013 " + formatShortDate(addDaysIso(this.weekStart, 6));
    var cards = days
      .map(function (iso, idx) {
        var metricSel = hub.selectedDay === iso ? " ash-day-card--sel" : "";
        if (hubDayIsClubClosed(hub, iso)) {
          return (
            "<button type=\"button\" class=\"ash-day-card ash-day-card--feedback ash-day-card--closed" +
            metricSel +
            '" ' +
            dayAttr +
            '="' +
            esc(iso) +
            '" style="' +
            htmlClosedDayCardInlineStyle() +
            '">' +
            '<div class="ash-day-card__top">' +
            htmlWeekdayLabel(iso, esc) +
            '<span class="ash-day-card__dt">' +
            esc(formatShortDate(iso)) +
            '</span></div>' +
            '<div class="ash-day-card__bar" style="--ash-pct:0;--ash-col:#dc2626"></div>' +
            '<span class="ash-day-card__count"><span class="ash-day-card__count-full">Closed</span>' +
            '<span class="ash-day-card__count-short" aria-hidden="true">Closed</span></span></button>'
          );
        }
        var ds = hub.dayStats(iso);
        var col = DAY_COLORS[idx % DAY_COLORS.length];
        var tint = DAY_BG_TINTS[idx % DAY_BG_TINTS.length];
        var innerPct = 0;
        if (ds.total) {
          innerPct = Math.round((100 * ds.done) / ds.total);
          if (ds.done > 0 && innerPct < 12) innerPct = 12;
        }
        var stateCls = "";
        if (ds.total && ds.done === 0) stateCls = " ash-day-card--none";
        else if (ds.total && ds.done < ds.total) stateCls = " ash-day-card--partial";
        else if (ds.total && ds.done >= ds.total) stateCls = " ash-day-card--complete";
        var roCls = hub.opts && hub.opts.readOnlyOverview ? " ash-day-card--readonly" : "";
        return (
          '<button type="button" class="ash-day-card ash-day-card--feedback' +
          metricSel +
          stateCls +
          roCls +
          '" ' +
          dayAttr +
          '="' +
          esc(iso) +
          '" style="--ash-day-col:' +
          col +
          ";--ash-day-bg:" +
          tint +
          ";--ash-col:" +
          col +
          '">' +
          '<div class="ash-day-card__top">' +
          htmlWeekdayLabel(iso, esc) +
          '</div>' +
          '<div class="ash-day-card__bar" style="--ash-pct:' +
          innerPct +
          ";--ash-col:" +
          col +
          '"></div>' +
          htmlAshRatioCount(esc, ds.done + "/" + ds.total) +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="ash-week-sticky-anchor"><div class="ash-feedback-week">' +
      '<div class="ash-feedback-week__head">' +
      '<h4 class="ash-feedback-week__title">Feedback progress <span class="ash-metric-term">(' +
      esc(weekLabel) +
      ")</span></h4>" +
      htmlWeekNavButtons(this, { shortLabels: true }) +
      "</div>" +
      '<div class="ash-day-row ash-day-row--feedback">' +
      cards +
      "</div></div></div>"
    );
  };

  AdminSessionsHub.prototype.htmlFeedbackLogWeekExpanded = function (week, escFn) {
    var hub = this;
    var weekStart = week.weekStart;
    var weekEnd = addDaysIso(weekStart, 6);
    var q = hub.clientSearch.toLowerCase();
    var items = week.items.filter(function (fb) {
      if (q && clean(fb.client_name).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var cards = [];
    for (var i = 0; i < 7; i++) {
      var iso = addDaysIso(weekStart, i);
      var ds = hub.dayStats(iso);
      var col = DAY_COLORS[i % DAY_COLORS.length];
      var tint = DAY_BG_TINTS[i % DAY_BG_TINTS.length];
      var innerPct = 0;
      if (ds.total) {
        innerPct = Math.round((100 * ds.done) / ds.total);
        if (ds.done > 0 && innerPct < 12) innerPct = 12;
      }
      var stateCls = "";
      if (ds.total && ds.done === 0) stateCls = " ash-day-card--none";
      else if (ds.total && ds.done < ds.total) stateCls = " ash-day-card--partial";
      else if (ds.total && ds.done >= ds.total) stateCls = " ash-day-card--complete";
      cards.push(
        '<button type="button" class="ash-day-card ash-day-card--feedback' +
          stateCls +
          '" data-ash-log-jump-day="' +
          escFn(iso) +
          '" style="--ash-day-col:' +
          col +
          ";--ash-day-bg:" +
          tint +
          ";--ash-col:" +
          col +
          '">' +
          '<div class="ash-day-card__top">' +
          htmlWeekdayLabel(iso, escFn) +
          '</div>' +
          '<div class="ash-day-card__bar" style="--ash-pct:' +
          innerPct +
          ";--ash-col:" +
          col +
          '"></div>' +
          htmlAshRatioCount(escFn, ds.done + "/" + ds.total) +
          "</button>"
      );
    }
    var tableRows = items
      .map(function (fb, rowIdx) {
        return hub.htmlFeedbackTableRow(fb, escFn, { rowIdx: rowIdx, clickable: true });
      })
      .join("");
    if (!tableRows) {
      tableRows =
        '<tr><td colspan="8"><div class="ash-empty">No attended feedback this week.</div></td></tr>';
    }
    return (
      '<div class="ash-log-week__expanded">' +
      '<div class="ash-feedback-week ash-feedback-week--log">' +
      '<p class="ash-feedback-week__sub">Week ' +
      escFn(formatShortDate(weekStart)) +
      " \u2013 " +
      escFn(formatShortDate(weekEnd)) +
      "</p>" +
      '<div class="ash-day-row ash-day-row--feedback">' +
      cards.join("") +
      "</div></div>" +
      '<div class="ash-filter-row ash-filter-row--feedback ash-filter-row--log-static">' +
      '<span class="ash-filter-label">From <strong>' +
      escFn(formatShortDate(weekStart)) +
      '</strong></span><span class="ash-filter-label">To <strong>' +
      escFn(formatShortDate(weekEnd)) +
      '</strong></span><span class="ash-filter-label ash-filter-label--muted">' +
      escFn(String(items.length)) +
      " feedback" +
      (items.length === 1 ? "" : "s") +
      "</span></div>" +
      '<div class="ash-table-wrap ash-table-wrap--log-expanded"><table class="ash-table ash-table--feedback"><thead><tr>' +
      AdminSessionsHub.FEEDBACK_TABLE_HEAD +
      "</tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div></div>"
    );
  };

  AdminSessionsHub.prototype.htmlFeedbackNotes = function (noteKind) {
    var esc = this.escapeHtml;
    var hub = this;
    var kind = noteKind === "relevant" ? "relevant" : "positive";
    var rows = this.feedbackNotesRows(kind);
    var noteLabel = kind === "relevant" ? "Relevant" : "Positive";
    var noteField = kind === "relevant" ? "relevant_information" : "positive_feedback";
    var iso = this.selectedDay;
    var emptyMsg =
      kind === "relevant"
        ? "No relevant information notes for this day."
        : "No positive feedback notes for this day.";

    function cellNoteHtml(text) {
      var t = clean(text);
      if (!t) return "\u2014";
      return t
        .split(/\n+/)
        .map(function (line) {
          return esc(line);
        })
        .join("<br>");
    }

    var tableRows = rows
      .map(function (fb, rowIdx) {
        var noteText = kind === "relevant" ? clean(fb.relevant_information) : clean(fb.positive_feedback);
        var reviewCls =
          noteText && !hub._reviewedKeys[hub.fbRowKey(fb)] ? " ash-fb-row--needs-review" : "";
        var submittedAt = feedbackSubmittedAt(fb);
        var reviewTime = formatFbTime(submittedAt);
        var sessionDay = formatFbDateShort(fb.session_date);
        var reviewDate = formatFbDate(submittedAt);
        var svcLabel = hub.feedbackDisplayService(fb) || "\u2014";
        return (
          '<tr class="ash-fb-row' +
          reviewCls +
          '" data-ash-fb-row="' +
          rowIdx +
          '" data-ash-note-field="' +
          noteField +
          '" tabindex="0" role="button">' +
          '<td><span class="ash-link">' +
          esc(fb.client_name) +
          "</span></td>" +
          "<td>" +
          esc(svcLabel) +
          (sessionDay ? '<div class="ash-cell-sub">' + esc(sessionDay) + "</div>" : "") +
          "</td>" +
          '<td class="ash-cell-note ash-fb-note-cell" data-ash-note-field="' +
          noteField +
          '">' +
          cellNoteHtml(noteText) +
          "</td>" +
          '<td class="ash-cell-instructor"><div class="ash-cell-main">' +
          esc(fb.completed_by_name || "\u2014") +
          '</div><div class="ash-cell-sub">' +
          esc(reviewDate) +
          (reviewTime ? '</div><div class="ash-cell-sub">' + esc(reviewTime) : "") +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    if (!tableRows) {
      tableRows = '<tr><td colspan="4"><div class="ash-empty">' + esc(emptyMsg) + "</div></td></tr>";
    }

    return (
      this.htmlWeekHeader() +
      this.weekPickerSearchRowHtml() +
      '<h3 class="ash-table-title">' +
      esc(formatLongDate(iso)) +
      ' <span class="ash-badge" style="background:' +
      (kind === "relevant" ? "#fffbeb;color:#b45309" : "#ecfdf5;color:#047857") +
      ';">' +
      esc(kind === "relevant" ? "Relevant" : "Positive") +
      "</span> " +
      '<span class="ash-badge ash-badge--booked">' +
      esc(String(this.feedbackNotesRowsForDay(kind, iso).length)) +
      (this.feedbackNotesRowsForDay(kind, iso).length === 1 ? " note" : " notes") +
      "</span></h3>" +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--feedback ash-table--notes-only"><thead><tr>' +
      "<th>Participant</th><th>Service</th><th>" +
      esc(noteLabel) +
      "</th><th>Reviewed by:</th>" +
      "</tr></thead><tbody data-ash-client-filter-tbody>" +
      tableRows +
      "</tbody></table></div>" +
      this.htmlFeedbackTermWeekLog({
        title: kind === "relevant" ? "Relevant notes log" : "Positive notes log",
        rows: this.payload.session_feedback || [],
        getDateIso: function (fb) {
          return hub.feedbackRowDate(fb);
        },
      })
    );
  };

  AdminSessionsHub.prototype.htmlFeedback = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var rows = this.feedbackRowsForSelectedDay();
    var sum = this.engagementSummary(this.feedbackRowsForMetrics());

    var tableRows = rows
      .map(function (fb, rowIdx) {
        var awaiting = fb && fb._ashAwaitingSlot;
        return hub.htmlFeedbackTableRow(fb, esc, {
          rowIdx: awaiting ? null : rowIdx,
          clickable: !awaiting,
        });
      })
      .join("");

    if (hubDayIsProgrammeInactive(hub, this.selectedDay)) {
      tableRows =
        '<tr><td colspan="8"><div class="ash-empty">Not a programme day for you \u2014 pick a highlighted day above.</div></td></tr>';
    } else if (!tableRows) {
      tableRows =
        '<tr><td colspan="8"><div class="ash-empty">No feedback for this day.</div></td></tr>';
    }

    var weekBlock =
      hub.opts && hub.opts.showFullWeekDayStrip
        ? this.htmlWeekHeader()
        : this.htmlFeedbackWeekDaysRow();

    var truncateHtml = "";
    var fbTotal = this.payload.session_feedback_total;
    var fbLoaded = (this.payload.session_feedback || []).length;
    if (fbTotal != null && Number(fbTotal) > fbLoaded) {
      truncateHtml =
        '<p class="ash-feedback-filter-hint">Loaded <strong>' +
        esc(String(fbLoaded)) +
        "</strong> of <strong>" +
        esc(String(fbTotal)) +
        "</strong> feedback rows \u2013 older days may look incomplete until you refresh. If a day is still short, check Supabase directly.</p>";
    }

    var noteFilterHtml = "";
    if (this.feedbackNoteFilter === "positive") {
      noteFilterHtml =
        '<p class="ash-feedback-filter-hint">Showing sessions with <strong>positive feedback</strong>. ' +
        '<button type="button" class="ash-btn ash-btn--ghost" data-ash-feedback-clear-note-filter>Show all</button></p>';
    } else if (this.feedbackNoteFilter === "relevant") {
      noteFilterHtml =
        '<p class="ash-feedback-filter-hint">Showing sessions with <strong>relevant information</strong>. ' +
        '<button type="button" class="ash-btn ash-btn--ghost" data-ash-feedback-clear-note-filter>Show all</button></p>';
    }

    return (
      this.htmlFeedbackMetricStrip(sum) +
      weekBlock +
      truncateHtml +
      noteFilterHtml +
      this.feedbackFilterRowHtml() +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--feedback"><thead><tr>' +
      AdminSessionsHub.FEEDBACK_TABLE_HEAD +
      "</tr></thead><tbody data-ash-client-filter-tbody>" +
      tableRows +
      "</tbody></table></div>" +
      (hub.opts && hub.opts.showFullWeekDayStrip
        ? ""
        : '<p class="ash-metric-foot ash-metric-foot--center">Absents show as <strong>Submitted (Absent)</strong> with N/A (except Reviewed by). Use <strong>Overview</strong> for the roster table.</p>') +
      this.htmlFeedbackTermWeekLog({
        title: "Session feedback log",
        flatWeeks: true,
        weekJumpOnly: true,
        hint:
          'Past weeks (Mon\u2013Sun). Click <strong>Show week \u2192</strong> to jump to that week at the top \u2013 day buttons and feedback for the selected day.',
      })
    );
  };

  AdminSessionsHub.prototype.htmlIncidents = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var iso = this.selectedDay;
    if (hubDayIsProgrammeInactive(hub, iso)) {
      return (
        this.htmlWeekHeader() +
        '<h3 class="ash-table-title">' +
        esc(formatLongDate(iso)) +
        ' <span class="ash-badge" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">Not scheduled</span></h3>' +
        '<div class="ash-table-wrap"><table class="ash-table ash-table--overview"><tbody><tr><td colspan="6">' +
        '<div class="ash-empty">Not a programme day for you \u2014 pick a highlighted day above.</div>' +
        "</td></tr></tbody></table></div>" +
        this.htmlIncidentsTermWeekLog()
      );
    }
    var items = this.incidentsForDate(iso);
    var Pfrm = global.PortalFormRecordModal;
    var rows = items
      .map(function (item) {
        var r = item.row;
        var i = item.idx;
        if (Pfrm && typeof Pfrm.incidentTableRowHtml === "function") {
          return Pfrm.incidentTableRowHtml(r, i, esc, formatFbDate);
        }
        var cat = r.incident_category || "";
        var sessLine = [r.session_date, r.incident_time].filter(Boolean).join(" \u2013 ");
        var svc = clean(r.service) || "\u2014";
        var inj = incidentSubjectSub(r) || "\u2014";
        return (
          '<tr class="portal-forms-data-row" data-portal-forms-kind="incident" data-portal-forms-idx="' +
          i +
          '" title="Double-click to view full report">' +
          '<td class="ash-td-center col-date">' +
          esc(formatFbDate(r.created_at)) +
          "</td>" +
          '<td class="ash-td-center"><div class="portal-forms-cell-main">' +
          esc(r.submitted_by_name || "\u2014") +
          '</div><div class="portal-forms-cell-sub">' +
          esc(incidentSubjectSub(r) || incidentSubjectMain(r)) +
          "</div></td>" +
          '<td class="ash-td-center cell-wrap">' +
          esc(truncateCellText(cat, 36)) +
          "</td>" +
          '<td class="ash-td-center cell-wrap">' +
          esc(truncateCellText(sessLine, 40)) +
          "</td>" +
          '<td class="ash-td-center cell-wrap">' +
          esc(truncateCellText(svc, 32)) +
          "</td>" +
          '<td class="ash-td-center cell-wrap">' +
          esc(truncateCellText(clean(r.statement_during), 80)) +
          "</td>" +
          '<td class="ash-td-center cell-wrap">' +
          esc(truncateCellText(inj, 80)) +
          "</td></tr>"
        );
      })
      .join("");
    if (!rows) {
      rows =
        '<tr><td colspan="7"><div class="ash-empty">No incident reports for this day.</div></td></tr>';
    }
    return (
      this.htmlWeekHeader() +
      '<h3 class="ash-table-title">' +
      esc(formatLongDate(iso)) +
      ' <span class="ash-badge" style="background:#fee2e2;color:#991b1b;">Incidents</span> ' +
      '<span class="ash-badge ash-badge--booked">' +
      esc(String(items.length)) +
      (items.length === 1 ? " report" : " reports") +
      "</span></h3>" +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--overview portal-forms-table portal-forms-table--full-detail"><thead><tr>' +
      '<th class="ash-td-center col-date">When</th><th class="ash-td-center">Submitted by</th><th class="ash-td-center">Category</th><th class="ash-td-center">Session</th><th class="ash-td-center">Service</th><th class="ash-td-center">What happened</th><th class="ash-td-center col-incident-injuries">Outcome</th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>" +
      this.htmlIncidentsTermWeekLog()
    );
  };

  AdminSessionsHub.prototype.htmlIncidentsTermWeekLog = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var ctx = this.logOpenContext();
    return renderTermWeekLogHtml({
      escapeHtml: esc,
      title: "Incidents log",
      emptyMsg: "No incidents in loaded data.",
      rows: this.payload.incident_reports || [],
      getDateIso: function (r) {
        return hub.portalReportDateIso(r);
      },
      openTermLabel: ctx.openTermLabel,
      openWeekStart: ctx.openWeekStart,
      tableClass: " ash-table--overview",
      headHtml:
        "<th>Session date</th><th>Recorded</th><th>Reporter</th><th>Subject</th><th>Category</th>",
      rowHtml: function (r, escFn) {
        var sd = hub.portalReportDateIso(r);
        return (
          "<tr><td>" +
          escFn(formatFbDate(sd || r.session_date)) +
          "</td><td>" +
          escFn(formatFbDate(r.created_at)) +
          "</td><td>" +
          escFn(clean(r.submitted_by_name) || "\u2014") +
          "</td><td>" +
          escFn(incidentSubjectMain(r)) +
          "</td><td>" +
          escFn(truncateCellText(r.incident_category || "\u2014", 40)) +
          "</td></tr>"
        );
      },
    });
  };

  AdminSessionsHub.prototype.htmlCancellations = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var iso = this.selectedDay;
    var items = this.cancellationsForDate(iso);
    var rows = items
      .map(function (item) {
        var r = item.row;
        var i = item.idx;
        var who = clean(r.submitted_by_name || r.instructor_name) || "\u2014";
        return (
          '<tr class="portal-forms-data-row" data-portal-forms-kind="cancellation" data-portal-forms-idx="' +
          i +
          '" title="Double-click to view full report">' +
          '<td class="ash-td-center col-date">' +
          esc(formatFbDate(r.created_at)) +
          "</td>" +
          '<td class="ash-td-center"><div class="portal-forms-cell-main">' +
          esc(who) +
          "</div></td>" +
          '<td class="ash-td-center">' +
          esc(clean(r.client_name) || "\u2014") +
          "</td>" +
          '<td class="ash-td-center">' +
          esc(clean(r.session_date) || "\u2014") +
          "</td>" +
          '<td class="ash-td-center">' +
          esc(clean(r.session_time) || "\u2014") +
          "</td>" +
          '<td class="ash-td-center cell-wrap">' +
          esc(clean(r.service) || "\u2014") +
          "</td>" +
          '<td class="ash-td-center">' +
          esc(clean(r.cancellation_timing) || "\u2014") +
          "</td>" +
          '<td class="ash-td-center cell-wrap col-reason">' +
          esc(clean(r.reason_category) || "\u2014") +
          "</td></tr>"
        );
      })
      .join("");
    if (!rows) {
      rows =
        '<tr><td colspan="8"><div class="ash-empty">No cancellation reports for this day.</div></td></tr>';
    }
    return (
      this.htmlWeekHeader() +
      '<h3 class="ash-table-title">' +
      esc(formatLongDate(iso)) +
      ' <span class="ash-badge" style="background:#fef2f2;color:#b91c1b;">Cancellations</span> ' +
      '<span class="ash-badge ash-badge--booked">' +
      esc(String(items.length)) +
      (items.length === 1 ? " report" : " reports") +
      "</span></h3>" +
      '<div class="ash-table-wrap"><table class="ash-table ash-table--overview portal-forms-table portal-forms-table--full-detail"><thead><tr>' +
      '<th class="ash-td-center col-date">Recorded</th><th class="ash-td-center">Submitted by</th><th class="ash-td-center">Client</th><th class="ash-td-center">Session date</th><th class="ash-td-center">Session time</th><th class="ash-td-center">Service</th><th class="ash-td-center">Timing</th><th class="ash-td-center col-reason">Reason</th>' +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>" +
      this.htmlCancellationsTermWeekLog()
    );
  };

  AdminSessionsHub.prototype.htmlCancellationsTermWeekLog = function () {
    var esc = this.escapeHtml;
    var hub = this;
    var ctx = this.logOpenContext();
    return renderTermWeekLogHtml({
      escapeHtml: esc,
      title: "Cancellations log",
      emptyMsg: "No cancellations in loaded data.",
      rows: this.payload.cancellation_reports || [],
      getDateIso: function (r) {
        return hub.portalReportDateIso(r);
      },
      openTermLabel: ctx.openTermLabel,
      openWeekStart: ctx.openWeekStart,
      headHtml:
        "<th>Session date</th><th>Recorded</th><th>By</th><th>Client</th><th>Service</th><th>Reason</th>",
      rowHtml: function (r, escFn) {
        var sd = hub.portalReportDateIso(r);
        return (
          "<tr><td>" +
          escFn(formatFbDate(sd || r.session_date)) +
          "</td><td>" +
          escFn(formatFbDate(r.created_at)) +
          "</td><td>" +
          escFn(clean(r.submitted_by_name || r.instructor_name) || "\u2014") +
          "</td><td>" +
          escFn(clean(r.client_name) || "\u2014") +
          "</td><td>" +
          escFn(truncateCellText(r.service || "\u2014", 32)) +
          "</td><td>" +
          escFn(truncateCellText(r.reason_category || "\u2014", 48)) +
          "</td></tr>"
        );
      },
    });
  };

  AdminSessionsHub.prototype.htmlSchedule = function () {
    var iso = this.scheduleDate;
    var slots = this.expandSlotsForDate(iso);
    var rows = slots
      .map(function (slot) {
        var ov = this.overrideForSlot(slot);
        var ovLabel = ov ? esc(ov.override_type || "Override") : "\u2014";
        var inst = slot.instructors.map(formatInstructorPill).join(" ") || "\u2014";
        var client = isRosterClient(slot.client_name)
          ? '<span class="ash-pill ash-pill--client">' + esc(slot.client_name) + "</span>"
          : '<span class="ash-muted">NO CLIENT</span>';
        return (
          "<tr>" +
          "<td>" + esc(slot.time_slot || slot.time_start) + "</td>" +
          "<td>" + esc(slot.venue) + "</td>" +
          "<td>" + inst + "</td>" +
          "<td>" + client + "</td>" +
          '<td><span class="ash-badge ash-badge--booked">Booked</span></td>' +
          "<td>" + ovLabel + "</td>" +
          "</tr>"
        );
      }, this)
      .join("");
    if (!rows) rows = '<tr><td colspan="6"><div class="ash-empty">No schedule rows for this date.</div></td></tr>';

    return (
      '<div class="ash-schedule-head">' +
      "<h3>Sessions \u2013 Schedule &amp; covers</h3>" +
      "<p>Base schedule from the roster bundle (same data as staff feedback forms). Overrides shown when saved in Portal Supabase.</p>" +
      "</div>" +
      '<div class="ash-filter-row">' +
      '<label class="ash-filter-label">Date<input type="date" id="ashScheduleDate" class="ash-input" value="' + esc(iso) + '"></label>' +
      "</div>" +
      '<h4 class="ash-table-title">' + esc(formatLongDate(iso)) + ' \u2013 <span class="ash-badge ash-badge--booked">Base schedule</span></h4>' +
      '<div class="ash-table-wrap"><table class="ash-table"><thead><tr>' +
      "<th>Time</th><th>Venue</th><th>Instructor</th><th>Participant</th><th>Roster</th><th>Override</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>"
    );
  };

  AdminSessionsHub.prototype.render = function () {
    this.indexAbsentMarks();
    this.indexFeedback();
    var warn = this.bundleError
      ? '<p class="ash-bundle-warn">' + esc(this.bundleError) + "</p>"
      : "";
    if (this.mode === "feedback") {
      this.root.innerHTML = warn + '<div class="ash-panels ash-panels--feedback-only"></div>';
      this.renderPanels();
      return;
    }
    if (this.opts && this.opts.externalTabs) {
      this.root.innerHTML = warn + '<div class="ash-panels"></div>';
      this.renderPanels();
      return;
    }
    var tabs =
      '<button type="button" class="ash-tab' +
      (this.tab === "tracking" ? " is-active" : "") +
      '" data-ash-tab="tracking">Overview</button>' +
      '<button type="button" class="ash-tab ash-tab--portal" data-ash-portal-nav="sessions-feedback">Feedback</button>' +
      '<button type="button" class="ash-tab ash-tab--portal" data-ash-portal-nav="lead-reports">Lead report</button>' +
      '<button type="button" class="ash-tab ash-tab--portal" data-ash-portal-nav="incidents">Incidents</button>' +
      '<button type="button" class="ash-tab ash-tab--portal" data-ash-portal-nav="cancellations">Cancellations</button>';
    if (this.mode === "full") {
      tabs +=
        '<button type="button" class="ash-tab' +
        (this.tab === "feedback" ? " is-active" : "") +
        '" data-ash-tab="feedback">Session feedback</button>';
    }
    this.root.innerHTML =
      '<div class="ash-tabs ash-tabs--service-overview">' + tabs + "</div>" + warn + '<div class="ash-panels"></div>';
    this.renderPanels();
  };

  AdminSessionsHub.prototype.diagnoseDay = function (iso) {
    var day = clean(iso) || this.selectedDay;
    var hub = this;
    var slots = this.expandSlotsForDate(day);
    var awaiting = [];
    var done = [];
    var used = {};
    for (var u = 0; u < slots.length; u++) {
      var slot = slots[u];
      var fb = hub.findFeedbackForSlot(slot);
      var row = {
        client: slot.client_name,
        service: slot.service,
        time: slot.time_slot,
        area: slot.area,
        merge: slot.feedback_merge_group || "",
        instructors: slot.instructor_label || (slot.instructors || []).join(", ")
      };
      if (hub.slotIsAbsent(slot)) {
        row.status = "absent";
        done.push(row);
        continue;
      }
      if (hub.slotIsAbsent(slot)) {
        row.status = "absent";
        done.push(row);
        continue;
      }
      if (hub.slotFeedbackComplete(slot)) {
        row.status = "submitted";
        if (fb) {
          row.completed_by = clean(fb.completed_by_name);
          row.portal_session_key = clean(fb.portal_session_key);
          if (fb.id != null) used[String(fb.id)] = true;
          else used[clean(fb.portal_session_key) + "|" + clean(fb.completed_by_name)] = true;
        } else {
          row.completed_by = "(shared merge group)";
        }
        done.push(row);
      } else {
        row.status = "awaiting";
        awaiting.push(row);
      }
    }
    var orphans = [];
    var list = this.payload.session_feedback || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (feedbackSessionDate(f) !== day) continue;
      var idKey = f.id != null ? String(f.id) : clean(f.portal_session_key) + "|" + clean(f.completed_by_name);
      if (used[idKey]) continue;
      var matched = false;
      for (var j = 0; j < slots.length; j++) {
        if (hub.findFeedbackForSlot(slots[j]) === f) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        orphans.push({
          client: f.client_name,
          time: f.session_time,
          service: f.service,
          completed_by: f.completed_by_name,
          portal_session_key: f.portal_session_key
        });
      }
    }
    var st = this.dayStats(day);
    return {
      date: day,
      total: st.total,
      submitted: st.done,
      awaiting: awaiting,
      done: done,
      orphanFeedback: orphans
    };
  };

  AdminSessionsHub.ensureRosterBundle = function () {
    return loadScriptOnce(BUNDLE_SRC);
  };

  AdminSessionsHub.rosterSessionCountForIso = function (isoDate) {
    var iso = isoDate || isoToday();
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    var wd = weekdayLongFromIso(iso);
    if (!wd) return 0;
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (clean(r.day) !== wd) continue;
      if (!isRosterClient(r.client_name)) continue;
      n++;
    }
    return n;
  };

  AdminSessionsHub.mount = async function (root, opts) {
    if (!root) return null;
    if (root._ashHubInstance) {
      var existing = root._ashHubInstance;
      if (opts && opts.mode) existing.mode = opts.mode;
      if (opts && opts.tab) existing.tab = opts.tab;
      if (opts && opts.payload) existing.setPayload(opts.payload);
      return existing;
    }
    var hub = new AdminSessionsHub(root, opts || {});
    root._ashHubInstance = hub;
    bindAdminSessionsHubRosterSourceListener();
    if (opts && opts.mode) hub.mode = opts.mode;
    if (opts && opts.tab) hub.tab = opts.tab;
    hub.bindEvents();
    if (opts && opts.payload) {
      hub.payload = opts.payload;
      hub.indexAbsentMarks();
      if (hub.mode === "feedback") hub.initFeedbackDateRange();
    }
    if (hub.mode === "feedback") {
      hub.render();
      hub.loadBundle().catch(function () {});
      return hub;
    }
    await hub.loadBundle();
    hub.render();
    return hub;
  };

  AdminSessionsHub.renderTermWeekLogHtml = renderTermWeekLogHtml;
  AdminSessionsHub.groupByTermWeek = groupByTermWeek;
  AdminSessionsHub.rowDateIso = rowDateIso;
  AdminSessionsHub.termLabelFromIso = termLabelFromRange;

  global.AdminSessionsHub = AdminSessionsHub;
})(typeof window !== "undefined" ? window : globalThis);

