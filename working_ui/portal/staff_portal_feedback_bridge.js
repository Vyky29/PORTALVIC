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

  function staffOwnsInstructor(staffId, instructor) {
    const sid = String(staffId || "").trim().toLowerCase();
    const ins = String(instructor || "").trim().toLowerCase();
    if (!sid || !ins) return false;
    if (ins === sid) return true;
    return ins.indexOf(sid) >= 0;
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
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return false;
    const day = String(iso || "").trim().substring(0, 10);
    return src.rows.some(function (r) {
      return (
        String(r.date || "").trim().substring(0, 10) === day &&
        submittedRowMatchesStatusClient(r, st)
      );
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
    if (status.length) {
      let unresolved = 0;
      status.forEach(function (st) {
        if (statusRowDone(st)) return;
        if (sub.some(function (r) { return submittedRowMatchesStatusClient(r, st); })) {
          return;
        }
        if (anySubmittedCoversStatusRow(iso, st)) return;
        unresolved++;
      });
      if (unresolved > 0 && thru && iso > thru) {
        if (sub.length) return { applicable: Math.max(status.length, sub.length), unresolved: 0 };
        return null;
      }
      return { applicable: status.length, unresolved: unresolved };
    }
    if (sub.length) {
      return { applicable: sub.length, unresolved: 0 };
    }
    return null;
  }

  function sessionComplete(iso, staffId, s, clientNotesById, mergedRec) {
    const rec = mergedRec || {};
    if (rec.feedbackDone || rec.absent || rec.cancelled) return true;
    const status = statusRowsForStaffDate(iso, staffId);
    const stHit = status.find(function (st) {
      return (
        staffOwnsStatusRow(staffId, st) &&
        clientMatch(st, s, clientNotesById) &&
        statusRowDone(st)
      );
    });
    if (stHit) return true;
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
    submittedRowsForStaffDate: submittedRowsForStaffDate,
    termSessionsForDate: termSessionsForDate,
    dayFeedbackCountsFromPortalExports: dayFeedbackCountsFromPortalExports,
    sessionComplete: sessionComplete,
    metricsForClient: metricsForClient,
    portalFeedbackRowsForClientName: portalFeedbackRowsForClientName,
  };
})();
