/**
 * Staff dashboard ↔ SESSION_FEEDBACK_PORTAL_SOURCE / SESSION_FEEDBACK_STATUS_PORTAL_SOURCE.
 * Term calendar and client stats use the same rows as admin Session Overview.
 */
(function () {
  function slug(v) {
    return String(v || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function canonicalStaffRosterKey(value) {
    const k = String(value || "").trim().toLowerCase();
    if (!k) return "";
    if (k === "luliya" || k === "aida" || k === "stf021") return "lulia";
    if (k === "yousef" || k === "youssef" || k === "yousseff" || k === "yusef") return "youssef";
    return k;
  }

  function staffOwnsInstructor(staffId, instructor) {
    const sid = canonicalStaffRosterKey(staffId);
    const blob = String(instructor || "").trim();
    if (!sid || !blob) return false;
    const parts = blob.split(/[,/&]+|\s+and\s+/gi);
    for (let i = 0; i < parts.length; i++) {
      const p = String(parts[i] || "").trim().toLowerCase();
      if (!p) continue;
      const first = canonicalStaffRosterKey((p.split(/\s+/)[0] || "").trim());
      if (canonicalStaffRosterKey(p) === sid || first === sid) return true;
    }
    return false;
  }

  function rosterKeyForSession(s, clientNotesById) {
    const cid = String((s && s.clientId) || "").trim().toLowerCase();
    if (!cid) return "";
    try {
      const notes = clientNotesById && clientNotesById[cid];
      const name = notes && String(notes.name || "").trim();
      if (name) return slug(name);
    } catch (_) {}
    return slug(cid);
  }

  function clientMatch(st, s, clientNotesById) {
    const rosterKey = rosterKeyForSession(s, clientNotesById);
    const statusKey = slug(st && (st.client || st.clientName));
    if (!rosterKey || !statusKey) return false;
    if (rosterKey === statusKey) return true;
    if (/_ah$/.test(rosterKey) && /_ah$/.test(statusKey)) return false;
    return rosterKey.indexOf(statusKey) >= 0 || statusKey.indexOf(rosterKey) >= 0;
  }

  function staffOwnsStatusRow(staffId, st) {
    if (!st) return false;
    return (
      staffOwnsInstructor(staffId, st.instructor) ||
      staffOwnsInstructor(staffId, st.matchedFeedbackBy)
    );
  }

  function statusRowsForStaffDate(iso, staffId) {
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return [];
    const day = String(iso || "").trim().substring(0, 10);
    return src.rows.filter(function (st) {
      return (
        String(st.date || "").trim().substring(0, 10) === day &&
        staffOwnsStatusRow(staffId, st)
      );
    });
  }

  /** All status rows on a calendar day (any instructor) — shared Bespoke / merge groups. */
  function statusRowsForDateAll(iso) {
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return [];
    const day = String(iso || "").trim().substring(0, 10);
    return src.rows.filter(function (st) {
      return String(st.date || "").trim().substring(0, 10) === day;
    });
  }

  function submittedRowsForStaffDate(iso, staffId) {
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return [];
    const day = String(iso || "").trim().substring(0, 10);
    return src.rows.filter(function (r) {
      return (
        String(r.date || "").trim().substring(0, 10) === day &&
        staffOwnsInstructor(staffId, r.instructor)
      );
    });
  }

  /** All submitted feedback on a date (any instructor) — Day Centre / shared slots. */
  function submittedRowsForDateAll(iso) {
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return [];
    const day = String(iso || "").trim().substring(0, 10);
    return src.rows.filter(function (r) {
      return String(r.date || "").trim().substring(0, 10) === day;
    });
  }

  function isDayCentreServiceLabel(label) {
    const k = String(label || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, " ");
    return (
      k.indexOf("day centre") >= 0 ||
      k.indexOf("day centre") >= 0 ||
      k.indexOf("daycentre") >= 0
    );
  }

  function isDayCentreStatusRow(st) {
    if (!st) return false;
    const u = String(st.feedbackUnitKey || "");
    if (u.indexOf("day_centre") >= 0) return true;
    return isDayCentreServiceLabel(st.service);
  }

  /** Climbing / MA / per-slot Aquatic: each instructor+area unit is separate — not Day Centre / Bespoke / merge groups. */
  function statusRowNeedsPerStaffUnitFeedback(st) {
    if (!st || isDayCentreStatusRow(st) || isBespokeStatusRow(st)) return false;
    if (String(st.feedbackMergeGroup || "").trim()) return false;
    const svc = String(st.service || "").toLowerCase();
    if (/multi[-\s]?activity/.test(svc)) return true;
    if (svc.indexOf("climbing") >= 0 || svc.indexOf("climb") >= 0) return true;
    if (svc.indexOf("aquatic") >= 0 || svc.indexOf("swimming") >= 0) {
      const uk = String(st.feedbackUnitKey || "");
      return /^\d{4}-\d{2}-\d{2}\|[^|]+\|\d{1,2}:\d{2}\|aquatic/i.test(uk);
    }
    const uk = String(st.feedbackUnitKey || "");
    if (/multi[-\s]?activity|climbing|climb/.test(uk)) return true;
    if (uk.split("|").length >= 5 && uk.indexOf("bespoke") < 0 && uk.indexOf("day_centre") < 0) {
      return true;
    }
    return false;
  }

  function isBespokeStatusRow(st) {
    if (!st) return false;
    const u = String(st.feedbackUnitKey || "").toLowerCase();
    if (u.indexOf("bespoke") >= 0) return true;
    return serviceKindFromLabel(st.service) === "bespoke";
  }

  function isBespokeRosterSession(s) {
    const act = String((s && (s.activity || s.rosterService || s.service)) || "")
      .trim()
      .toLowerCase();
    return act.indexOf("bespoke") >= 0;
  }

  /** 2:1 / 3:1 Bespoke SwimFarm Hub — one feedback covers all co-instructors (e.g. Tinashe). */
  function isBespokeSharedRosterSession(s) {
    if (!isBespokeRosterSession(s)) return false;
    if (String((s && s.venue) || "").trim().toLowerCase() !== "swimfarm") return false;
    const instBlob = String((s && (s.instructors || s.staffNames)) || "").trim();
    if (instBlob) {
      const parts = instBlob.split(/[,/&+]+|\s+and\s+/gi).filter(function (p) {
        return String(p || "").trim();
      });
      if (parts.length >= 2) return true;
    }
    const cid = slug(String((s && s.clientId) || ""));
    return cid === "tinashe";
  }

  function isBespokeSharedStatusRow(st) {
    if (!st) return false;
    const u = String(st.feedbackUnitKey || "");
    if (u.indexOf("bespoke_shared") >= 0) return true;
    return isBespokeStatusRow(st) && isBespokeSharedRosterSession({ service: st.service, venue: st.venue, clientId: st.client || st.clientName, instructors: st.instructor });
  }

  function submittedRowIsBespoke(r) {
    if (serviceKindFromLabel(r && r.service) === "bespoke") return true;
    const pk = String((r && (r.portalSessionKey || r.portal_session_key)) || "").toLowerCase();
    return pk.indexOf("bespoke") >= 0;
  }

  function bespokeClientResolved(iso, clientSlug) {
    const key = String(clientSlug || "").trim();
    if (!key) return false;
    return submittedRowsForDateAll(iso).some(function (r) {
      if (submittedRowMarksAbsent(r)) return false;
      if (!submittedRowIsBespoke(r)) return false;
      const rKey = slug(r.clientName);
      return rKey === key || rKey.indexOf(key) >= 0 || key.indexOf(rKey) >= 0;
    });
  }

  /** Yusuf / Cyrus: Aquatic + Multi-Activity same instructor → one feedback covers the merge group. */
  function submittedCoversMergeGroup(iso, st) {
    const mg = String(st && st.feedbackMergeGroup ? st.feedbackMergeGroup : "").trim();
    if (!mg) return false;
    const groupRows = statusRowsForDateAll(iso).filter(function (row) {
      return String(row.feedbackMergeGroup || "").trim() === mg;
    });
    if (!groupRows.length) return false;
    return submittedRowsForDateAll(iso).some(function (r) {
      if (submittedRowMarksAbsent(r)) return false;
      if (!submittedRowMatchesStatusClient(r, st)) return false;
      for (let i = 0; i < groupRows.length; i++) {
        if (staffOwnsInstructor(groupRows[i].instructor, r.instructor)) return true;
      }
      return false;
    });
  }

  function serviceKindFromLabel(label) {
    const k = String(label || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, " ");
    if (k.indexOf("climbing") >= 0 || k.indexOf("climb") >= 0) return "climbing";
    if (/multi[-\s]?activity/.test(k) || k.indexOf("multi activity") >= 0) return "multi_activity";
    if (k.indexOf("bespoke") >= 0) return "bespoke";
    return "";
  }

  function portalKeyTimeToken(key) {
    const parts = String(key || "")
      .split("|")
      .map(function (p) {
        return String(p || "").trim();
      })
      .filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
      }
    }
    return "";
  }

  function portalKeyAreaToken(key) {
    const parts = String(key || "")
      .split("|")
      .map(function (p) {
        return String(p || "").trim().toLowerCase();
      })
      .filter(Boolean);
    if (parts.length < 4) return "";
    /* date|client|HH:mm|service|area|instructor — last segment is instructor, not area */
    if (
      parts.length >= 6 &&
      /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) &&
      /^\d{1,2}:\d{2}$/.test(parts[2]) &&
      /multi|climb|aquatic|bespoke|day_centre|swim/.test(parts[3])
    ) {
      return parts[4] || "";
    }
    const last = parts[parts.length - 1];
    if (last === "day_centre") return last;
    if (/^\d{4}-\d{2}-\d{2}$/.test(last) || /^\d{1,2}:\d{2}$/.test(last)) return "";
    if (parts.length >= 5) return last;
    if (/^\d{1,2}:\d{2}$/.test(parts[1])) return last;
    return "";
  }

  function portalKeyAreaTokensCompatible(a, b) {
    const aa = portalKeyAreaToken(a);
    const bb = portalKeyAreaToken(b);
    if (!aa && !bb) return true;
    if (aa && bb) {
      if (aa === bb) return true;
      if (
        (aa.indexOf("climb") >= 0 || aa === "climbing" || aa === "climbing_wall") &&
        (bb.indexOf("climb") >= 0 || bb === "climbing" || bb === "climbing_wall")
      ) {
        return true;
      }
      return false;
    }
    return true;
  }

  function rosterSessionStartHm(s) {
    return portalKeyTimeToken(String(s && s.start != null ? s.start : ""));
  }

  /** Match status export row to one roster session (client + slot time + service), not every row that day. */
  function statusRowMatchesRosterSession(st, s, clientNotesById) {
    if (!clientMatch(st, s, clientNotesById)) return false;
    if (isBespokeSharedStatusRow(st) || isBespokeSharedRosterSession(s)) {
      const stKind = serviceKindFromLabel(st.service);
      const act = String(
        (s && (s.activity || s.rosterService || s.service)) || ""
      )
        .trim()
        .toLowerCase();
      if (stKind === "bespoke" && act.indexOf("bespoke") < 0) return false;
      return true;
    }
    const rowTime = portalKeyTimeToken(st.feedbackUnitKey);
    const rosterTime = rosterSessionStartHm(s);
    if (rowTime && rosterTime && rowTime !== rosterTime) return false;
    const stKind = serviceKindFromLabel(st.service);
    const act = String(
      (s && (s.activity || s.rosterService || s.service)) || ""
    )
      .trim()
      .toLowerCase();
    if (stKind === "climbing" && act.indexOf("climb") < 0) return false;
    if (stKind === "multi_activity" && !/multi[-\s]?activity/.test(act)) return false;
    if (stKind === "bespoke" && act.indexOf("bespoke") < 0) return false;
    return true;
  }

  function submittedRowMatchesStatusUnit(r, st) {
    if (!r || !st) return false;
    const stKind = serviceKindFromLabel(st.service);
    let rKind = serviceKindFromLabel(r.service);
    const rPk = String((r && (r.portalSessionKey || r.portal_session_key)) || "").trim();
    const stUk = String(st.feedbackUnitKey || "").trim();
    if (!rKind && rPk) {
      const pkLow = rPk.toLowerCase();
      if (pkLow.indexOf("climb") >= 0) rKind = "climbing";
      else if (pkLow.indexOf("multi") >= 0) rKind = "multi_activity";
      else if (pkLow.indexOf("bespoke") >= 0) rKind = "bespoke";
    }
    if (stKind && rKind && stKind !== rKind) return false;
    if (rPk && stUk && !portalKeyAreaTokensCompatible(rPk, stUk)) return false;
    return true;
  }

  function rosterSessionNeedsUnitSuffix(s) {
    const act = String((s && (s.activity || s.rosterService || s.service)) || "")
      .trim()
      .toLowerCase();
    if (/day\s*centre/.test(act)) return false;
    if (act.indexOf("bespoke") >= 0) return false;
    if (/multi[-\s]?activity/.test(act)) return true;
    if (act.indexOf("climbing") >= 0 || act.indexOf("climb") >= 0) return true;
    return false;
  }

  function submittedRowMatchesRosterServiceUnit(r, s) {
    if (!r || !s || !rosterSessionNeedsUnitSuffix(s)) return true;
    const act = String((s.activity || s.rosterService || s.service) || "").toLowerCase();
    const pk = String((r.portalSessionKey || r.portal_session_key) || "").toLowerCase();
    const rSvc = String(r.service || "").toLowerCase();
    if (act.indexOf("climbing") >= 0 || act.indexOf("climb") >= 0) {
      return (
        pk.indexOf("climb") >= 0 ||
        rSvc.indexOf("climb") >= 0 ||
        serviceKindFromLabel(r.service) === "climbing"
      );
    }
    if (/multi[-\s]?activity/.test(act)) {
      return (
        pk.indexOf("multi") >= 0 ||
        rSvc.indexOf("multi") >= 0 ||
        serviceKindFromLabel(r.service) === "multi_activity"
      );
    }
    return true;
  }

  function isDayCentreRosterSession(s) {
    if (!s) return false;
    const blob = String(
      (s.rosterService || s.activity || s.service || "") + " " + (s.clientId || "")
    );
    return isDayCentreServiceLabel(blob) || /day_centre|day_centre/i.test(blob);
  }

  function portalAttendanceIsAbsent(attendance) {
    const att = String(attendance != null ? attendance : "")
      .trim()
      .toLowerCase();
    if (!att) return false;
    if (att === "no" || att === "n" || att === "false" || att === "0") return true;
    if (/^(no[\s\-/]|n\/)/.test(att)) return true;
    if (/\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel)/.test(att)) {
      return true;
    }
    return false;
  }

  function statusOverviewIsAbsent(st) {
    return String(st && st.overviewStatus ? st.overviewStatus : "")
      .trim()
      .toLowerCase() === "absent";
  }

  function statusRowDone(st) {
    if (!st) return false;
    const os = String(st.overviewStatus || "")
      .trim()
      .toLowerCase();
    if (os === "absent" || os === "cancelled") return true;
    if (statusRowNeedsPerStaffUnitFeedback(st)) return false;
    if (st.feedbackComplete === true) return true;
    if (os === "feedback_submitted") return true;
    return false;
  }

  function submittedRowMarksAbsent(r) {
    return portalAttendanceIsAbsent(r && r.attendance);
  }

  function submittedRowDone(r) {
    return !!r;
  }

  function statusClientSlug(st) {
    return slug(st && (st.client || st.clientName));
  }

  function submittedRowMatchesStatusClient(r, st) {
    const stKey = statusClientSlug(st);
    const rKey = slug(r && r.clientName);
    if (!stKey || !rKey) return false;
    if (stKey === rKey) return true;
    return stKey.indexOf(rKey) >= 0 || rKey.indexOf(stKey) >= 0;
  }

  /** Submitted row completes a status slot only for the same instructor/unit (not support vs swim). */
  function submittedCoversStatusRow(iso, st) {
    if (!st) return false;
    if (isDayCentreStatusRow(st)) {
      return submittedRowsForDateAll(iso).some(function (r) {
        return submittedRowMatchesStatusClient(r, st) && !submittedRowMarksAbsent(r);
      });
    }
    if (isBespokeSharedStatusRow(st)) {
      return submittedRowsForDateAll(iso).some(function (r) {
        return (
          submittedRowMatchesStatusClient(r, st) &&
          !submittedRowMarksAbsent(r) &&
          submittedRowIsBespoke(r)
        );
      });
    }
    if (isBespokeStatusRow(st)) {
      return submittedRowsForDateAll(iso).some(function (r) {
        return (
          submittedRowMatchesStatusClient(r, st) &&
          !submittedRowMarksAbsent(r) &&
          submittedRowIsBespoke(r)
        );
      });
    }
    if (submittedCoversMergeGroup(iso, st)) return true;
    return submittedRowsForDateAll(iso).some(function (r) {
      if (!submittedRowMatchesStatusClient(r, st)) return false;
      if (submittedRowMarksAbsent(r)) return false;
      if (!submittedRowMatchesStatusUnit(r, st)) return false;
      if (staffOwnsInstructor(st.instructor, r.instructor)) return true;
      if (st.matchedFeedbackBy && staffOwnsInstructor(st.matchedFeedbackBy, r.instructor)) {
        return true;
      }
      const rPk = String(
        (r && (r.portalSessionKey || r.portal_session_key)) || ""
      ).trim();
      const stUk = String(st.feedbackUnitKey || "").trim();
      if (rPk && stUk && rPk === stUk) {
        if (statusRowNeedsPerStaffUnitFeedback(st)) {
          return staffOwnsInstructor(st.instructor, r.instructor);
        }
        return true;
      }
      return false;
    });
  }

  /** Status row done in overview OR covered by a matching instructor's submitted feedback. */
  function statusSlotResolved(iso, st) {
    if (!st) return false;
    if (statusOverviewIsAbsent(st)) return true;
    if (String(st.feedbackMergeGroup || "").trim()) {
      if (submittedCoversMergeGroup(iso, st)) return true;
      return submittedCoversStatusRow(iso, st);
    }
    if (statusRowNeedsPerStaffUnitFeedback(st)) {
      return submittedCoversStatusRow(iso, st);
    }
    if (statusRowDone(st)) return true;
    return submittedCoversStatusRow(iso, st);
  }

  function submittedRowCoversRosterSession(r, s, clientNotesById) {
    const rosterKey = rosterKeyForSession(s, clientNotesById);
    const rKey = slug(r && r.clientName);
    if (!rosterKey || !rKey) return false;
    if (rosterKey === rKey) return true;
    if (/_ah$/.test(rosterKey) && /_ah$/.test(rKey) && rosterKey !== rKey) return false;
    return rosterKey.indexOf(rKey) >= 0 || rKey.indexOf(rosterKey) >= 0;
  }

  function staffSubmittedCoversRosterSession(iso, staffId, s, clientNotesById) {
    const clientKey = rosterKeyForSession(s, clientNotesById);
    if (
      (isBespokeSharedRosterSession(s) || isBespokeRosterSession(s)) &&
      clientKey &&
      bespokeClientResolved(iso, clientKey)
    ) {
      return true;
    }
    return submittedRowsForStaffDate(iso, staffId).some(function (r) {
      return (
        !submittedRowMarksAbsent(r) &&
        submittedRowCoversRosterSession(r, s, clientNotesById) &&
        submittedRowMatchesRosterServiceUnit(r, s)
      );
    });
  }

  function anySubmittedCoversRosterSession(iso, s, clientNotesById) {
    return staffSubmittedCoversRosterSession(iso, "", s, clientNotesById);
  }

  function anyAbsentSubmittedCoversRosterSession(iso, s, clientNotesById) {
    const day = String(iso || "").trim().substring(0, 10);
    return submittedRowsForDateAll(day).some(function (r) {
      return (
        submittedRowMarksAbsent(r) &&
        submittedRowCoversRosterSession(r, s, clientNotesById)
      );
    });
  }

  function rosterSessionMarkedAbsent(iso, staffId, s, clientNotesById) {
    if (anyAbsentSubmittedCoversRosterSession(iso, s, clientNotesById)) return true;
    const owned = statusRowsForStaffDate(iso, staffId);
    const allDay = statusRowsForDateAll(iso);
    const matchingOwned = owned.filter(function (st) {
      return clientMatch(st, s, clientNotesById);
    });
    const pool = matchingOwned.length
      ? matchingOwned
      : allDay.filter(function (st) {
          return clientMatch(st, s, clientNotesById);
        });
    return pool.some(statusOverviewIsAbsent);
  }

  function reviewFlagsForResolvedSession(iso, staffId, s, clientNotesById) {
    const absent = rosterSessionMarkedAbsent(iso, staffId, s, clientNotesById);
    return {
      feedbackDone: !absent,
      incident: false,
      absent: absent,
      cancelled: false,
    };
  }

  /** Co-instructors: merge group complete when this staff owns a row in the group and it is resolved. */
  function mergeGroupResolved(iso, staffId, groupKey) {
    const g = String(groupKey || "").trim();
    if (!g) return false;
    const ownedInGroup = statusRowsForStaffDate(iso, staffId).filter(function (st) {
      return String(st.feedbackMergeGroup || "").trim() === g;
    });
    if (!ownedInGroup.length) return false;
    return ownedInGroup.some(function (st) {
      return statusSlotResolved(iso, st);
    });
  }

  function feedbackUnitKeyResolved(iso, staffId, unitKey) {
    const u = String(unitKey || "").trim();
    if (!u) return false;
    return statusRowsForStaffDate(iso, staffId).some(function (st) {
      return (
        String(st.feedbackUnitKey || "").trim() === u &&
        statusSlotResolved(iso, st)
      );
    });
  }

  function dayCentreClientResolved(iso, staffId, clientSlug) {
    const key = String(clientSlug || "").trim();
    if (!key) return false;
    const status = statusRowsForStaffDate(iso, staffId);
    const hits = status.filter(function (st) {
      return isDayCentreStatusRow(st) && statusClientSlug(st) === key;
    });
    if (
      hits.some(function (st) {
        return statusSlotResolved(iso, st);
      })
    ) {
      return true;
    }
    return submittedRowsForDateAll(iso).some(function (r) {
      const rKey = slug(r.clientName);
      return rKey === key || rKey.indexOf(key) >= 0 || key.indexOf(rKey) >= 0;
    });
  }

  function feedbackCoverageThroughIso() {
    const meta =
      typeof window !== "undefined" &&
      window.SESSION_FEEDBACK_PORTAL_SOURCE &&
      window.SESSION_FEEDBACK_PORTAL_SOURCE.meta;
    return meta ? String(meta.coverageThroughIso || "").trim() : "";
  }

  /**
   * Sessions that count for term feedback on this calendar day (staff-scoped from portal exports).
   */
  function termSessionsForDate(
    dayWord,
    iso,
    staffId,
    rosterSessions,
    clientNotesById
  ) {
    const roster = Array.isArray(rosterSessions) ? rosterSessions : [];
    const status = statusRowsForStaffDate(iso, staffId);
    if (status.length) {
      return roster.filter(function (s) {
        return status.some(function (st) {
          return clientMatch(st, s, clientNotesById);
        });
      });
    }
    const sub = submittedRowsForStaffDate(iso, staffId);
    if (sub.length) {
      return roster.filter(function (s) {
        return sub.some(function (r) {
          return clientMatch({ clientName: r.clientName }, s, clientNotesById);
        });
      });
    }
    return roster;
  }

  /**
   * Day-level completion from portal exports only (ignores roster client-id matching).
   * @returns {{ applicable: number, unresolved: number } | null} null = no export rows for this day
   */
  function dayFeedbackCountsFromPortalExports(iso, staffId) {
    const status = statusRowsForStaffDate(iso, staffId);
    const sub = submittedRowsForStaffDate(iso, staffId);
    const thru = feedbackCoverageThroughIso();
    function applicableStatusCount(rows) {
      const mergeSeen = Object.create(null);
      let n = 0;
      rows.forEach(function (st) {
        const mg = String(st.feedbackMergeGroup || "").trim();
        if (mg) {
          if (mergeSeen[mg]) return;
          mergeSeen[mg] = true;
        }
        n++;
      });
      return n;
    }
    if (status.length) {
      const dayCentreDone = Object.create(null);
      const bespokeSharedDone = Object.create(null);
      const mergeDone = Object.create(null);
      let unresolved = 0;
      status.forEach(function (st) {
        if (statusSlotResolved(iso, st)) return;
        const mg = String(st.feedbackMergeGroup || "").trim();
        if (mg) {
          if (mergeDone[mg]) return;
          if (mergeGroupResolved(iso, staffId, mg)) {
            mergeDone[mg] = true;
            return;
          }
        }
        if (isDayCentreStatusRow(st)) {
          const ck = statusClientSlug(st);
          if (ck && dayCentreDone[ck]) return;
          if (ck && dayCentreClientResolved(iso, staffId, ck)) {
            dayCentreDone[ck] = true;
            return;
          }
        }
        if (isBespokeSharedStatusRow(st)) {
          const ck = statusClientSlug(st);
          if (ck && bespokeSharedDone[ck]) return;
          if (ck && bespokeClientResolved(iso, ck)) {
            bespokeSharedDone[ck] = true;
            return;
          }
        }
        unresolved++;
      });
      if (unresolved > 0 && thru && iso > thru) {
        if (sub.length) return { applicable: Math.max(status.length, sub.length), unresolved: 0 };
        let unresolvedShared = 0;
        status.forEach(function (st) {
          if (!statusSlotResolved(iso, st)) unresolvedShared++;
        });
        if (unresolvedShared === 0) {
          return { applicable: applicableStatusCount(status), unresolved: 0 };
        }
        return null;
      }
      return { applicable: applicableStatusCount(status), unresolved: unresolved };
    }
    if (sub.length) {
      return { applicable: sub.length, unresolved: 0 };
    }
    return null;
  }

  /**
   * Day green from status export (merge groups / shared units), staff-owned rows only.
   */
  function exportMarksDayComplete(iso, staffId) {
    const c = dayFeedbackCountsFromPortalExports(iso, staffId);
    if (c && c.applicable > 0 && c.unresolved === 0) return true;
    if (c === null && submittedRowsForStaffDate(iso, staffId).length > 0) return true;
    const status = statusRowsForStaffDate(iso, staffId);
    if (!status.length) return false;
    const mergeDone = Object.create(null);
    for (let i = 0; i < status.length; i++) {
      const st = status[i];
      if (statusSlotResolved(iso, st)) continue;
      const mg = String(st.feedbackMergeGroup || "").trim();
      if (mg) {
        if (mergeDone[mg]) continue;
        mergeDone[mg] = true;
        if (mergeGroupResolved(iso, staffId, mg)) continue;
      }
      const uk = String(st.feedbackUnitKey || "").trim();
      if (uk && feedbackUnitKeyResolved(iso, staffId, uk)) continue;
      return false;
    }
    return true;
  }

  function rosterSessionCompleteForTerm(
    sessionDateIso,
    staffId,
    sessionRow,
    clientNotesById,
    mergedRec
  ) {
    return sessionComplete(
      sessionDateIso,
      staffId,
      sessionRow,
      clientNotesById,
      mergedRec || {}
    );
  }

  function sessionComplete(iso, staffId, s, clientNotesById, mergedRec) {
    const rec = mergedRec || {};
    if (rec.absent || rec.cancelled) return true;
    if (rosterSessionMarkedAbsent(iso, staffId, s, clientNotesById)) return true;
    if (staffSubmittedCoversRosterSession(iso, staffId, s, clientNotesById)) return true;
    const clientKey = rosterKeyForSession(s, clientNotesById);
    if (
      isDayCentreRosterSession(s) &&
      clientKey &&
      dayCentreClientResolved(iso, staffId, clientKey)
    ) {
      return true;
    }
    if (isBespokeSharedRosterSession(s) && clientKey && bespokeClientResolved(iso, clientKey)) {
      return true;
    }
    if (isBespokeRosterSession(s) && clientKey && bespokeClientResolved(iso, clientKey)) {
      return true;
    }
    const owned = statusRowsForStaffDate(iso, staffId);
    const matchingOwned = owned.filter(function (st) {
      return statusRowMatchesRosterSession(st, s, clientNotesById);
    });
    if (
      matchingOwned.some(function (st) {
        return statusSlotResolved(iso, st);
      })
    ) {
      return true;
    }
    const mergeSources = matchingOwned;
    const mg = mergeSources
      .map(function (st) {
        return String(st.feedbackMergeGroup || "").trim();
      })
      .find(Boolean);
    if (mg && mergeGroupResolved(iso, staffId, mg)) return true;
    const unitKey = mergeSources
      .map(function (st) {
        return String(st.feedbackUnitKey || "").trim();
      })
      .find(Boolean);
    if (unitKey && feedbackUnitKeyResolved(iso, staffId, unitKey)) return true;
    const sub = submittedRowsForStaffDate(iso, staffId);
    const fbHit = sub.find(function (r) {
      return (
        clientMatch({ clientName: r.clientName }, s, clientNotesById) &&
        submittedRowMatchesRosterServiceUnit(r, s)
      );
    });
    return !!fbHit && submittedRowDone(fbHit);
  }

  function portalFeedbackRowsForClientName(displayName, staffId) {
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows) || !String(displayName || "").trim()) {
      return [];
    }
    const sid = String(staffId || "").trim().toLowerCase();
    const want = slug(displayName);
    return src.rows.filter(function (r) {
      if (sid && !staffOwnsInstructor(sid, r.instructor)) return false;
      const key = slug(r.clientName);
      if (!key || !want) return false;
      return key === want || key.indexOf(want) >= 0 || want.indexOf(key) >= 0;
    });
  }

  function metricsForClient(displayName, opts) {
    opts = opts || {};
    const rows = portalFeedbackRowsForClientName(
      displayName,
      opts.staffId || ""
    );
    let attended = 0;
    let missed = 0;
    const engagementVals = [];
    rows.forEach(function (r) {
      const att = String(r.attendance != null ? r.attendance : "")
        .trim()
        .toLowerCase();
      if (att === "no" || att === "n" || att === "false" || att === "0") missed++;
      else attended++;
      const eng = r.engagement;
      if (eng != null && eng !== "" && !isNaN(Number(eng))) {
        const n = Number(eng);
        if (n >= 1 && n <= 5) engagementVals.push(n);
      }
    });
    const n = rows.length;
    const denom = attended + missed;
    const attPct =
      denom > 0
        ? Math.round((100 * attended) / denom)
        : n > 0
          ? Math.round((100 * attended) / n)
          : null;
    const engagementAvg = engagementVals.length
      ? Math.round(
          (engagementVals.reduce(function (a, b) {
            return a + b;
          }, 0) /
            engagementVals.length) *
            10
        ) / 10
      : null;
    return { n: n, attended: attended, missed: missed, attPct: attPct, engagementAvg: engagementAvg };
  }

  window.PortalStaffFeedbackBridge = {
    slug: slug,
    staffOwnsInstructor: staffOwnsInstructor,
    clientMatch: clientMatch,
    portalAttendanceIsAbsent: portalAttendanceIsAbsent,
    statusOverviewIsAbsent: statusOverviewIsAbsent,
    statusRowDone: statusRowDone,
    submittedRowMarksAbsent: submittedRowMarksAbsent,
    rosterSessionMarkedAbsent: rosterSessionMarkedAbsent,
    reviewFlagsForResolvedSession: reviewFlagsForResolvedSession,
    statusRowsForStaffDate: statusRowsForStaffDate,
    statusRowsForDateAll: statusRowsForDateAll,
    submittedRowsForStaffDate: submittedRowsForStaffDate,
    submittedRowsForDateAll: submittedRowsForDateAll,
    statusSlotResolved: statusSlotResolved,
    statusRowMatchesRosterSession: statusRowMatchesRosterSession,
    submittedCoversStatusRow: submittedCoversStatusRow,
    anySubmittedCoversRosterSession: anySubmittedCoversRosterSession,
    dayCentreClientResolved: dayCentreClientResolved,
    mergeGroupResolved: mergeGroupResolved,
    feedbackUnitKeyResolved: feedbackUnitKeyResolved,
    exportMarksDayComplete: exportMarksDayComplete,
    rosterSessionCompleteForTerm: rosterSessionCompleteForTerm,
    staffOwnsStatusRow: staffOwnsStatusRow,
    termSessionsForDate: termSessionsForDate,
    dayFeedbackCountsFromPortalExports: dayFeedbackCountsFromPortalExports,
    sessionComplete: sessionComplete,
    metricsForClient: metricsForClient,
    portalFeedbackRowsForClientName: portalFeedbackRowsForClientName,
  };
})();
