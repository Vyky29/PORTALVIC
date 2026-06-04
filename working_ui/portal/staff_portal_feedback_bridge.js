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

  function isDayCentreRosterSession(s) {
    if (!s) return false;
    const blob = String(
      (s.rosterService || s.activity || s.service || "") + " " + (s.clientId || "")
    );
    return isDayCentreServiceLabel(blob) || /day_centre|day_centre/i.test(blob);
  }

  function statusRowDone(st) {
    return (
      st &&
      (st.overviewStatus === "absent" ||
        st.feedbackComplete === true ||
        String(st.overviewStatus || "").trim() === "feedback_submitted")
    );
  }

  function submittedRowDone(r) {
    const att = String(r.attendance != null ? r.attendance : "")
      .trim()
      .toLowerCase();
    if (att === "no" || att === "n" || att === "false" || att === "0") return true;
    return true;
  }

  function statusClientSlug(st) {
    return slug(st && (st.client || st.clientName));
  }

  /** Same client/day as admin overview — any instructor's submitted row can complete a slot. */
  function submittedRowMatchesStatusClient(r, st) {
    const stKey = statusClientSlug(st);
    const rKey = slug(r && r.clientName);
    if (!stKey || !rKey) return false;
    if (stKey === rKey) return true;
    return stKey.indexOf(rKey) >= 0 || rKey.indexOf(stKey) >= 0;
  }

  function anySubmittedCoversStatusRow(iso, st) {
    return submittedRowsForDateAll(iso).some(function (r) {
      return submittedRowMatchesStatusClient(r, st);
    });
  }

  /** Status row done in overview OR covered by anyone's submitted feedback (admin parity). */
  function statusSlotResolved(iso, st) {
    if (!st) return false;
    if (statusRowDone(st)) return true;
    if (anySubmittedCoversStatusRow(iso, st)) return true;
    const by = String(st.matchedFeedbackBy || "").trim();
    if (by && anySubmittedCoversStatusRow(iso, { client: st.client, clientName: st.client })) {
      return true;
    }
    return false;
  }

  function anySubmittedCoversRosterSession(iso, s, clientNotesById) {
    const day = String(iso || "").trim().substring(0, 10);
    const rosterKey = rosterKeyForSession(s, clientNotesById);
    if (!rosterKey) return false;
    return submittedRowsForDateAll(day).some(function (r) {
      const rKey = slug(r.clientName);
      if (!rKey) return false;
      if (rosterKey === rKey) return true;
      return rosterKey.indexOf(rKey) >= 0 || rKey.indexOf(rosterKey) >= 0;
    });
  }

  /** Co-instructors: any row in the merge group on this day (admin mergeGroupFeedbackComplete parity). */
  function mergeGroupResolved(iso, staffId, groupKey) {
    const g = String(groupKey || "").trim();
    if (!g) return false;
    return statusRowsForDateAll(iso).some(function (st) {
      return (
        String(st.feedbackMergeGroup || "").trim() === g &&
        statusSlotResolved(iso, st)
      );
    });
  }

  function feedbackUnitKeyResolved(iso, unitKey) {
    const u = String(unitKey || "").trim();
    if (!u) return false;
    return statusRowsForDateAll(iso).some(function (st) {
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
    if (hits.some(function (st) {
      return statusSlotResolved(iso, st);
    })) {
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
    const subAll = submittedRowsForDateAll(iso);
    if (subAll.length) {
      return roster.filter(function (s) {
        return subAll.some(function (r) {
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
    if (status.length) {
      const dayCentreDone = Object.create(null);
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
        unresolved++;
      });
      if (unresolved > 0 && thru && iso > thru) {
        if (sub.length) return { applicable: Math.max(status.length, sub.length), unresolved: 0 };
        let unresolvedShared = 0;
        status.forEach(function (st) {
          if (!statusSlotResolved(iso, st)) unresolvedShared++;
        });
        if (unresolvedShared === 0) {
          return { applicable: status.length, unresolved: 0 };
        }
        return null;
      }
      return { applicable: status.length, unresolved: unresolved };
    }
    if (sub.length) {
      return { applicable: sub.length, unresolved: 0 };
    }
    return null;
  }

  /**
   * Day green from status export (merge groups / shared units), any instructor on that day.
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
      if (uk && feedbackUnitKeyResolved(iso, uk)) continue;
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
    if (rec.feedbackDone || rec.absent || rec.cancelled) return true;
    if (anySubmittedCoversRosterSession(iso, s, clientNotesById)) return true;
    const clientKey = rosterKeyForSession(s, clientNotesById);
    if (isDayCentreRosterSession(s) && clientKey && dayCentreClientResolved(iso, staffId, clientKey)) {
      return true;
    }
    const owned = statusRowsForStaffDate(iso, staffId);
    const allDay = statusRowsForDateAll(iso);
    const matchingAll = allDay.filter(function (st) {
      return clientMatch(st, s, clientNotesById);
    });
    const matchingOwned = owned.filter(function (st) {
      return clientMatch(st, s, clientNotesById);
    });
    if (
      matchingAll.some(function (st) {
        return statusSlotResolved(iso, st);
      })
    ) {
      return true;
    }
    const mergeSources = matchingOwned.length ? matchingOwned : matchingAll;
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
    if (unitKey && feedbackUnitKeyResolved(iso, unitKey)) return true;
    const sub = submittedRowsForStaffDate(iso, staffId);
    const fbHit = sub.find(function (r) {
      return clientMatch({ clientName: r.clientName }, s, clientNotesById);
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
    statusRowsForStaffDate: statusRowsForStaffDate,
    statusRowsForDateAll: statusRowsForDateAll,
    submittedRowsForStaffDate: submittedRowsForStaffDate,
    submittedRowsForDateAll: submittedRowsForDateAll,
    statusSlotResolved: statusSlotResolved,
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
