/**
 * Staff / Lead instructor tablets — Aquatic Activity slots.
 *
 * Roster stores 30' blocks; some clients book 60' (2×30') or 90' (3×30') with the
 * same instructor. Those appear as duplicate/consecutive rows but need ONE card and
 * ONE feedback on the instructor dashboard.
 *
 * When the same client has aquatic blocks with different instructors the same day,
 * each instructor keeps a separate card and feedback (admin overview counts both).
 */
(function (global) {
  "use strict";

  function slugClient(nameOrId) {
    if (typeof global.portalCanonicalParticipantClientId === "function") {
      return global.portalCanonicalParticipantClientId(nameOrId);
    }
    return String(nameOrId || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function isAquaticActivity(activity) {
    var p = String(activity || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, " ");
    return (
      p.indexOf("aquatic") >= 0 ||
      p.indexOf("swimming") >= 0 ||
      p.indexOf("swim ") >= 0 ||
      p === "swim"
    );
  }

  function weekdayLongFromIso(iso) {
    if (typeof global.portalWeekdayLongFromIsoDate === "function") {
      return global.portalWeekdayLongFromIsoDate(iso);
    }
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
    return dt.toLocaleDateString("en-GB", { weekday: "long" });
  }

  function rosterRows() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  function rowAppliesOnDate(r, iso, dayWord) {
    var dw = dayWord || weekdayLongFromIso(iso);
    if (typeof global.portalSessionSpreadsheetRowMatchesCalendarDate === "function") {
      return global.portalSessionSpreadsheetRowMatchesCalendarDate(
        {
          session_date: r.session_date || r.date,
          sessionDate: r.session_date || r.date,
          day: r.day,
        },
        iso,
        dw
      );
    }
    var sd = String(r.session_date || r.date || "").slice(0, 10);
    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) return sd === String(iso || "").slice(0, 10);
    return String(r.day || "").trim() === String(dw || "").trim();
  }

  function rowIsAquatic(r) {
    return isAquaticActivity(String(r.service || r.activity || r.rosterService || ""));
  }

  function rowIsBookedClient(r) {
    var n = String(r.client_name || "").trim().toLowerCase();
    return (
      !!n &&
      n !== "closed" &&
      n !== "no client" &&
      n !== "noclient" &&
      n !== "no_client"
    );
  }

  function aquaticSlotCountForClientOnDate(iso, clientId, dayWord) {
    var cid = slugClient(clientId);
    if (!iso || !cid) return 0;
    var rows = rosterRows();
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!rowAppliesOnDate(r, iso, dayWord)) continue;
      if (slugClient(r.client_name) !== cid) continue;
      if (!rowIsAquatic(r)) continue;
      if (!rowIsBookedClient(r)) continue;
      n++;
    }
    return n;
  }

  /** True when 2+ aquatic rows that day share the same instructor token (merge → one feedback). */
  function aquaticSameInstructorAllSlotsOnDate(iso, clientId, dayWord) {
    var cid = slugClient(clientId);
    if (!iso || !cid) return false;
    var rows = rosterRows();
    var lead = "";
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!rowAppliesOnDate(r, iso, dayWord)) continue;
      if (slugClient(r.client_name) !== cid) continue;
      if (!rowIsAquatic(r)) continue;
      if (!rowIsBookedClient(r)) continue;
      n++;
      var inst = String(r.instructors || "")
        .trim()
        .toUpperCase();
      if (!inst) continue;
      if (!lead) lead = inst;
      else if (lead !== inst) return false;
    }
    return n > 1 && !!lead;
  }

  /**
   * Distinct covering instructors delivering aquatic to one client on a calendar day.
   *
   * Per-slot feedback is only for SPLIT instructor covers (different instructors on
   * different slots). When the SAME instructor covers two consecutive 30' halves of a
   * 1-hour session (split only so admin can reassign half), that is ONE logical session
   * → ONE card + ONE feedback, so it must count as a single unit.
   */
  function aquaticInstructorCoverUnitsOnDate(iso, clientId, dayWord) {
    var cid = slugClient(clientId);
    if (!iso || !cid) return 0;
    var rows =
      typeof global.portalScheduleOverrideRowsAll === "function"
        ? global.portalScheduleOverrideRowsAll()
        : Array.isArray(global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__)
          ? global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__
          : [];
    var seen = Object.create(null);
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var ov = rows[i];
      if (!ov) continue;
      if (String(ov.status || "active") !== "active") continue;
      if (String(ov.override_type || "").trim() !== "instructor_reassign") continue;
      var sd = String(ov.session_date || "").slice(0, 10);
      if (sd && sd !== String(iso || "").slice(0, 10)) continue;
      if (slugClient(ov.anchor_client_id) !== cid) continue;
      var aquatic = false;
      var src = rosterRows();
      for (var j = 0; j < src.length; j++) {
        var r = src[j];
        if (!rowAppliesOnDate(r, iso, dayWord)) continue;
        if (slugClient(r.client_name) !== cid) continue;
        if (rowIsAquatic(r)) {
          aquatic = true;
          break;
        }
      }
      if (!aquatic) continue;
      var cover = String((ov.payload && ov.payload.covering_staff_id) || "")
        .trim()
        .toUpperCase();
      if (!cover || seen[cover]) continue;
      seen[cover] = true;
      n++;
    }
    return n;
  }

  function canonicalHmToken(hm) {
    if (typeof global.portalCanonicalHmToken === "function") {
      return global.portalCanonicalHmToken(hm) || String(hm || "").trim();
    }
    var m = String(hm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return String(hm || "").trim();
    return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
  }

  /** Earliest aquatic delivery start that day (roster row or instructor cover). */
  function earliestAquaticDeliveryStartHm(iso, clientId, dayWord) {
    var cid = slugClient(clientId);
    if (!iso || !cid) return "";
    var earliest = "";
    var rows = rosterRows();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!rowAppliesOnDate(r, iso, dayWord)) continue;
      if (slugClient(r.client_name) !== cid) continue;
      if (!rowIsAquatic(r) || !rowIsBookedClient(r)) continue;
      var st = canonicalHmToken(r.start || "");
      if (st && (!earliest || st < earliest)) earliest = st;
    }
    var ovs =
      typeof global.portalScheduleOverrideRowsAll === "function"
        ? global.portalScheduleOverrideRowsAll()
        : Array.isArray(global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__)
          ? global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__
          : [];
    for (var k = 0; k < ovs.length; k++) {
      var ov = ovs[k];
      if (!ov) continue;
      if (String(ov.status || "active") !== "active") continue;
      if (String(ov.override_type || "").trim() !== "instructor_reassign") continue;
      var sd = String(ov.session_date || "").slice(0, 10);
      if (sd && sd !== String(iso || "").slice(0, 10)) continue;
      if (slugClient(ov.anchor_client_id) !== cid) continue;
      var st2 =
        typeof global.portalHmFromDbTime === "function"
          ? global.portalHmFromDbTime(ov.anchor_start) || ""
          : String(ov.anchor_start || "").trim().slice(0, 5);
      st2 = canonicalHmToken(st2);
      if (st2 && (!earliest || st2 < earliest)) earliest = st2;
    }
    return earliest;
  }

  function clientNeedsPerSlotAquaticFeedbackOnDate(iso, clientId, dayWord) {
    if (aquaticInstructorCoverUnitsOnDate(iso, clientId, dayWord) > 1) return true;
    if (aquaticSlotCountForClientOnDate(iso, clientId, dayWord) <= 1) return false;
    return !aquaticSameInstructorAllSlotsOnDate(iso, clientId, dayWord);
  }

  /** When per-slot aquatic feedback applies, only accept server keys for this card's start (legacy day keys → earliest slot only). */
  function feedbackKeyMatchesAquaticSlot(key, iso, clientId, startHm, dayWord) {
    if (!clientNeedsPerSlotAquaticFeedbackOnDate(iso, clientId, dayWord)) return true;
    var keyStr = String(key || "").trim();
    if (!keyStr) return false;
    var want = canonicalHmToken(startHm);
    var parts = keyStr.split("|").map(function (p) {
      return String(p || "").trim();
    });
    var keyTime = "";
    for (var i = 0; i < parts.length; i++) {
      if (/^\d{1,2}:\d{2}$/.test(parts[i])) {
        keyTime = canonicalHmToken(parts[i]);
        break;
      }
    }
    if (keyTime) return !!want && keyTime === want;
    if (parts.length >= 3 && parts[parts.length - 1].toLowerCase() === "aquatic") {
      return !!want && want === earliestAquaticDeliveryStartHm(iso, clientId, dayWord);
    }
    if (parts.length >= 2 && parts[1] === "") {
      return !!want && want === earliestAquaticDeliveryStartHm(iso, clientId, dayWord);
    }
    return false;
  }

  function buildAquaticSessionReviewKey(iso, clientId, s, dayWord) {
    var cid = String(clientId || "")
      .trim()
      .toLowerCase();
    if (!iso || !cid) return "";
    if (clientNeedsPerSlotAquaticFeedbackOnDate(iso, cid, dayWord)) {
      var st = String((s && s.start) || "").trim();
      return iso + "|" + cid + "|" + st + "|aquatic";
    }
    return iso + "|" + cid + "|aquatic";
  }

  function hmFromBaseSession(base) {
    return {
      start: String((base && base.start) || "").trim(),
      end: String((base && base.end) || "").trim(),
    };
  }

  function formatSlotRangeUk(start, end) {
    function part(t) {
      var bits = String(t || "").split(":");
      var h = Number(bits[0]);
      var m = Number(bits[1] || 0);
      if (!Number.isFinite(h)) return String(t || "").trim();
      var h12 = h > 12 ? h - 12 : h;
      if (h12 === 0) h12 = 12;
      if (m === 0) return String(h12);
      if (m === 30) return h12 + ".30";
      return h12 + "." + String(m).padStart(2, "0");
    }
    if (!start && !end) return "";
    if (start && end) return part(start) + " to " + part(end);
    return part(start || end);
  }

  function itemIsAquaticClientCard(it) {
    if (!it || it.kind !== "client") return false;
    if (it.noSessionFeedbackRequired) return false;
    return isAquaticActivity(it.activity);
  }

  function isMultiActivity(activity) {
    var p = String(activity || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, " ");
    return p.indexOf("multi") >= 0 && p.indexOf("activ") >= 0;
  }

  function isBespokeProgramme(activity) {
    var p = String(activity || "").toLowerCase();
    return /\bbespoke\b/.test(p) || /\bfitfun\b/.test(p) || /\bfit fun\b/.test(p);
  }

  function isDayCentreActivity(activity) {
    return /day\s*centre/i.test(String(activity || ""));
  }

  /** Multi-Activity / Bespoke / Day Centre: consecutive blocks, same client + venue → one Today card. */
  function isConsecutiveHalfHourMergeActivity(activity) {
    return isMultiActivity(activity) || isBespokeProgramme(activity) || isDayCentreActivity(activity);
  }

  function hmToMinutes(hm) {
    var p = String(hm || "").split(":");
    var h = Number(p[0]);
    var m = Number(p[1] || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
  }

  function slotsAreConsecutive(endHm, startHm) {
    var a = hmToMinutes(canonicalHmToken(endHm));
    var b = hmToMinutes(canonicalHmToken(startHm));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return a === b;
  }

  function itemVenueToken(it) {
    var base = (it && it.__portalBaseSession) || {};
    return String(it && it.sessionVenue != null ? it.sessionVenue : base.venue || "")
      .trim()
      .toLowerCase();
  }

  function itemIsConsecutiveHalfHourMergeCandidate(it) {
    if (!it || it.kind !== "client" || it.noSessionFeedbackRequired) return false;
    if (String(it.feedbackMergeGroup || "").trim()) return false;
    if (it.__portalAquaticMergedCount) return false;
    return isConsecutiveHalfHourMergeActivity(it.activity);
  }

  function consecutiveMergeGroupKey(it) {
    var cid = slugClient(it.clientId || (it.__portalBaseSession && it.__portalBaseSession.clientId));
    var venue = itemVenueToken(it);
    var act = String(it.activity || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, " ");
    return cid + "|" + venue + "|" + act;
  }

  function memberSessionReviewKeys(chain, iso, dayWord) {
    var keys = [];
    var seen = Object.create(null);
    function add(k) {
      k = String(k || "").trim();
      if (!k || seen[k]) return;
      seen[k] = true;
      keys.push(k);
    }
    for (var i = 0; i < chain.length; i++) {
      var it = chain[i];
      add(it.sessionKey);
      var s = it.__portalBaseSession;
      if (typeof global.portalSessionReviewKeyForModelRow === "function" && s) {
        add(global.portalSessionReviewKeyForModelRow(s, dayWord, iso));
      }
    }
    return keys;
  }

  /** Weekday Multi-Activity / Bespoke: consecutive 30' blocks, same client + venue → one card + one feedback. */
  function mergeTodayConsecutiveHalfHourClientSlots(items, iso, dayWord) {
    if (!items || !items.length) return items || [];
    var passthrough = [];
    var byKey = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!itemIsConsecutiveHalfHourMergeCandidate(it)) {
        passthrough.push(it);
        continue;
      }
      var k = consecutiveMergeGroupKey(it);
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(it);
    }
    var out = passthrough.slice();
    Object.keys(byKey).forEach(function (k) {
      var list = byKey[k];
      if (!list.length) return;
      list.sort(function (a, b) {
        return (a.sessionStartTs || 0) - (b.sessionStartTs || 0);
      });
      var chains = [];
      var chain = [list[0]];
      for (var j = 1; j < list.length; j++) {
        var prev = chain[chain.length - 1];
        var cur = list[j];
        var prevEnd = hmFromBaseSession(prev.__portalBaseSession).end;
        var curStart = hmFromBaseSession(cur.__portalBaseSession).start;
        if (slotsAreConsecutive(prevEnd, curStart)) chain.push(cur);
        else {
          chains.push(chain);
          chain = [cur];
        }
      }
      chains.push(chain);
      chains.forEach(function (ch) {
        if (!ch.length) return;
        if (ch.length === 1) {
          out.push(ch[0]);
          return;
        }
        var rep = ch[0];
        var last = ch[ch.length - 1];
        var startHm = hmFromBaseSession(rep.__portalBaseSession).start;
        var endHm = hmFromBaseSession(last.__portalBaseSession).end;
        var mg = k + "|" + canonicalHmToken(startHm);
        var merged = Object.assign({}, rep);
        merged.sessionEndTs = last.sessionEndTs;
        merged.time = formatSlotRangeUk(startHm, endHm) || rep.time;
        merged.feedbackMergeGroup = mg;
        merged.sessionKey = String(iso || "").slice(0, 10) + "|merge|" + mg;
        merged.__portalFeedbackMergeCount = ch.length;
        merged.__portalFeedbackMergeMemberKeys = memberSessionReviewKeys(ch, iso, dayWord);
        out.push(merged);
      });
    });
    out.sort(function (a, b) {
      return (a.sessionStartTs || 0) - (b.sessionStartTs || 0);
    });
    return out;
  }

  function staffMatchesMergeInstructors(ruleInstructors, staffId) {
    var want = String(ruleInstructors || "").trim().toUpperCase();
    var sid = String(staffId || "").trim().toUpperCase();
    if (!want || !sid) return !want;
    if (want === sid) return true;
    if (want.indexOf(sid) >= 0) return true;
    if (sid === "ROBERTO" && want.indexOf("ROBERTO") >= 0) return true;
    if (sid === "JAVIER" && want.indexOf("JAVIER") >= 0) return true;
    return false;
  }

  function sundayFeedbackMergeRules() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.sundayFeedbackMerges) ? src.sundayFeedbackMerges : [];
  }

  function cardMatchesMergeSlot(it, slot, dayWord) {
    if (!it || !slot) return false;
    var base = it.__portalBaseSession || {};
    var day = String(dayWord || base.day || "").trim();
    var ts = String(base.timeSlotLabel || it.time || "").trim();
    var svc = String(base.rosterService || base.activity || it.activity || "").trim();
    if (slot.time_slot && String(slot.time_slot).trim() !== ts) return false;
    if (slot.service && String(slot.service).trim().toLowerCase() !== svc.toLowerCase()) return false;
    return true;
  }

  function feedbackMergeGroupForTodayItem(it, dayWord, staffId) {
    var rules = sundayFeedbackMergeRules();
    if (!rules.length || !it) return "";
    var cid = slugClient(it.clientId || (it.__portalBaseSession && it.__portalBaseSession.clientId));
    if (!cid) return "";
    var dw = String(dayWord || "").trim();
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.day && String(rule.day).trim() !== dw) continue;
      if (slugClient(rule.client_name) !== cid) continue;
      if (!staffMatchesMergeInstructors(rule.instructors, staffId)) continue;
      var sub = rule.slots || [];
      for (var j = 0; j < sub.length; j++) {
        if (cardMatchesMergeSlot(it, sub[j], dw)) {
          return String(rule.mergeKey || "").trim() || cid + "_merged";
        }
      }
    }
    return "";
  }

  /** Aquatic + Multi-Activity (e.g. Yusuf Sun with Roberto) → one Today card + one feedback. */
  function mergeTodayFeedbackMergeGroups(items, iso, dayWord, staffId) {
    if (!items || !items.length) return items || [];
    items = mergeTodayConsecutiveHalfHourClientSlots(items, iso, dayWord);
    var rules = sundayFeedbackMergeRules();
    if (!rules.length) return items;
    var sid = String(staffId || "").trim().toLowerCase();
    var dw = String(dayWord || "").trim();
    var byGroup = Object.create(null);
    var passthrough = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.kind !== "client" || it.noSessionFeedbackRequired) {
        passthrough.push(it);
        continue;
      }
      var mg = feedbackMergeGroupForTodayItem(it, dw, sid);
      if (!mg) {
        passthrough.push(it);
        continue;
      }
      if (!byGroup[mg]) byGroup[mg] = [];
      byGroup[mg].push(it);
    }
    var out = passthrough.slice();
    Object.keys(byGroup).forEach(function (mg) {
      var list = byGroup[mg];
      if (!list.length) return;
      if (list.length === 1) {
        var only = list[0];
        only.feedbackMergeGroup = mg;
        only.sessionKey = String(iso || "").slice(0, 10) + "|merge|" + mg;
        out.push(only);
        return;
      }
      list.sort(function (a, b) {
        return (a.sessionStartTs || 0) - (b.sessionStartTs || 0);
      });
      var rep = list[0];
      var last = list[list.length - 1];
      var startHm = hmFromBaseSession(rep.__portalBaseSession).start;
      var endHm = hmFromBaseSession(last.__portalBaseSession).end;
      var merged = Object.assign({}, rep);
      merged.sessionEndTs = last.sessionEndTs;
      merged.time = formatSlotRangeUk(startHm, endHm) || rep.time;
      merged.feedbackMergeGroup = mg;
      merged.sessionKey = String(iso || "").slice(0, 10) + "|merge|" + mg;
      merged.__portalFeedbackMergeCount = list.length;
      var acts = list
        .map(function (x) {
          return String(x.activity || "").trim();
        })
        .filter(Boolean);
      if (acts.some(isAquaticActivity) && acts.some(isMultiActivity)) {
        merged.activity = "Aquatic + Multi-Activity";
      }
      out.push(merged);
    });
    out.sort(function (a, b) {
      return (a.sessionStartTs || 0) - (b.sessionStartTs || 0);
    });
    return out;
  }

  function mergeTodayAquaticCards(items, iso, dayWord) {
    if (!items || !items.length) return items || [];
    var passthrough = [];
    var byClient = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!itemIsAquaticClientCard(it)) {
        passthrough.push(it);
        continue;
      }
      var cid = String(it.clientId || "")
        .trim()
        .toLowerCase();
      if (!cid) {
        passthrough.push(it);
        continue;
      }
      if (clientNeedsPerSlotAquaticFeedbackOnDate(iso, cid, dayWord)) {
        passthrough.push(it);
        continue;
      }
      if (!byClient[cid]) byClient[cid] = [];
      byClient[cid].push(it);
    }
    var merged = passthrough.slice();
    Object.keys(byClient).forEach(function (cid) {
      var list = byClient[cid];
      if (!list.length) return;
      if (list.length === 1) {
        var only = list[0];
        only.sessionKey = buildAquaticSessionReviewKey(
          iso,
          cid,
          only.__portalBaseSession || {},
          dayWord
        );
        merged.push(only);
        return;
      }
      list.sort(function (a, b) {
        return (a.sessionStartTs || 0) - (b.sessionStartTs || 0);
      });
      var rep = list[0];
      var last = list[list.length - 1];
      var startHm = hmFromBaseSession(rep.__portalBaseSession).start;
      var endHm = hmFromBaseSession(last.__portalBaseSession).end;
      if (!startHm && rep.sessionStartTs) {
        startHm = new Date(rep.sessionStartTs).toTimeString().slice(0, 5);
      }
      if (!endHm && last.sessionEndTs) {
        endHm = new Date(last.sessionEndTs).toTimeString().slice(0, 5);
      }
      var m = Object.assign({}, rep);
      m.sessionEndTs = last.sessionEndTs;
      m.time = formatSlotRangeUk(startHm, endHm) || rep.time;
      m.sessionKey = buildAquaticSessionReviewKey(iso, cid, rep.__portalBaseSession || {}, dayWord);
      m.__portalAquaticMergedCount = list.length;
      merged.push(m);
    });
    merged.sort(function (a, b) {
      return (a.sessionStartTs || 0) - (b.sessionStartTs || 0);
    });
    return merged;
  }

  /** Day-only keys (date||client) are for merged same-instructor aquatic, day centre, bespoke — not per-slot multi-instructor days. */
  function reviewKeyAllowsDateClientOnlyAlias(s, iso, dayWord) {
    if (
      typeof global.portalRosterSessionNeedsPerStaffOwnFeedbackOnly === "function" &&
      global.portalRosterSessionNeedsPerStaffOwnFeedbackOnly(s, iso)
    ) {
      return false;
    }
    var act = String((s && (s.activity || s.rosterService || s.service)) || "")
      .trim()
      .toLowerCase();
    if (/multi[-\s]?activity/.test(act)) return false;
    if (act.indexOf("climbing") >= 0 || act.indexOf("climb") >= 0) return false;
    if (
      typeof global.portalRosterSessionIsDayCentre === "function" &&
      global.portalRosterSessionIsDayCentre(s)
    ) {
      return true;
    }
    if (
      typeof global.portalRosterSessionIsBespokeShared === "function" &&
      global.portalRosterSessionIsBespokeShared(s)
    ) {
      return true;
    }
    var activity = String(
      (s && (s.activity || s.rosterService || s.service)) || ""
    ).trim();
    if (isAquaticActivity(activity)) {
      var cid = slugClient(s && s.clientId);
      if (clientNeedsPerSlotAquaticFeedbackOnDate(iso, cid, dayWord)) return false;
      return true;
    }
    var st = String((s && s.start) || "").trim();
    if (st && /^\d{1,2}:\d{2}$/.test(st)) return false;
    return true;
  }

  global.portalStaffLeadIsAquaticActivity = isAquaticActivity;
  global.portalStaffLeadAquaticSessionReviewKey = buildAquaticSessionReviewKey;
  global.portalStaffLeadClientNeedsPerSlotAquaticFeedback = clientNeedsPerSlotAquaticFeedbackOnDate;
  global.portalStaffLeadAquaticInstructorCoverUnitsOnDate = aquaticInstructorCoverUnitsOnDate;
  global.portalStaffLeadFeedbackKeyMatchesAquaticSlot = feedbackKeyMatchesAquaticSlot;
  global.portalStaffLeadReviewKeyAllowsDateClientOnlyAlias = reviewKeyAllowsDateClientOnlyAlias;
  global.portalMergeStaffLeadTodayAquaticCards = mergeTodayAquaticCards;
  global.portalMergeStaffTodayFeedbackMergeGroups = mergeTodayFeedbackMergeGroups;
  global.portalMergeStaffTodayConsecutiveHalfHourSlots = mergeTodayConsecutiveHalfHourClientSlots;
  global.portalStaffFeedbackMergeGroupForTodayItem = feedbackMergeGroupForTodayItem;
})(typeof window !== "undefined" ? window : globalThis);
