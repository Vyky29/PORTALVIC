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

  function statusRowsForStaffDate(iso, staffId) {
    const src =
      typeof window !== "undefined" && window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE;
    if (!src || !Array.isArray(src.rows)) return [];
    const day = String(iso || "").trim().substring(0, 10);
    return src.rows.filter(function (st) {
      return (
        String(st.date || "").trim().substring(0, 10) === day &&
        staffOwnsInstructor(staffId, st.instructor)
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

  function sessionComplete(iso, staffId, s, clientNotesById, mergedRec) {
    const rec = mergedRec || {};
    if (rec.feedbackDone || rec.absent || rec.cancelled) return true;
    const status = statusRowsForStaffDate(iso, staffId);
    const stHit = status.find(function (st) {
      return clientMatch(st, s, clientNotesById) && statusRowDone(st);
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
    sessionComplete: sessionComplete,
    metricsForClient: metricsForClient,
    portalFeedbackRowsForClientName: portalFeedbackRowsForClientName,
  };
})();
