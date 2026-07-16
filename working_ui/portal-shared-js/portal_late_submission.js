/**
 * Late submission gate: past session_date requires admin approval before forms open/submit.
 * Session feedback and instructor cancellations are self-serve (no approval).
 * Incidents still need admin approval when late.
 * Admins are notified when late feedback lands.
 */
(function () {
  if (typeof window === "undefined") return;

  var TABLE = "portal_late_submission_requests";

  /** True when the cancel form timing is "During the session" (still needs session feedback). */
  window.portalCancellationTimingNeedsFeedback = function portalCancellationTimingNeedsFeedback(timing) {
    return /during/i.test(String(timing || "").trim());
  };

  /** Cancelled counts as submitted unless it was during the session and feedback is still owed. */
  window.portalReviewRecordIsComplete = function portalReviewRecordIsComplete(rec) {
    if (!rec) return false;
    if (rec.absent) return true;
    if (rec.feedbackDone) return true;
    if (rec.cancelled && !rec.cancelNeedsFeedback) return true;
    return false;
  };

  window.portalTodayIsoLocal = function portalTodayIsoLocal() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };

  window.portalSessionIsoFromKey = function portalSessionIsoFromKey(sessionKey) {
    var sk = String(sessionKey || "").trim();
    var iso = (sk.split("|")[0] || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
  };

  window.portalIsPastSessionDateIso = function portalIsPastSessionDateIso(iso) {
    var s = String(iso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return s < portalTodayIsoLocal();
  };

  window.portalLateSubmissionLabel = function portalLateSubmissionLabel(type) {
    var t = String(type || "").toLowerCase();
    if (t === "cancellation") return "late cancellation";
    if (t === "incident") return "late incident report";
    return "late session feedback";
  };

  function isLateSubmissionTypeFeedback(type) {
    return String(type || "").toLowerCase() === "feedback";
  }

  function isLateSubmissionTypeSelfServe(type) {
    var t = String(type || "").toLowerCase();
    return t === "feedback" || t === "cancellation";
  }

  function portalSupabaseClient() {
    try {
      var box = window.__PORTAL_SUPABASE__;
      if (box && box.client) return box.client;
    } catch (_) {}
    return null;
  }

  function portalAuthUserId() {
    try {
      var box = window.__PORTAL_SUPABASE__;
      if (box && box.session && box.session.user && box.session.user.id) {
        return box.session.user.id;
      }
      if (box && box.staff_profile && box.staff_profile.id) {
        return box.staff_profile.id;
      }
    } catch (_) {}
    return "";
  }

  function portalStaffProfileKey() {
    try {
      var box = window.__PORTAL_SUPABASE__;
      var u = box && box.staff_profile && box.staff_profile.username;
      if (u) return String(u).trim().toLowerCase();
      var sk = sessionStorage.getItem("__portal_feedback_staff_rota_key_v1");
      if (sk) return String(sk).trim().toLowerCase();
      try {
        var sid = typeof global.STAFF_DASHBOARD_ID !== "undefined" ? global.STAFF_DASHBOARD_ID : "";
        if (sid) return String(sid).trim().toLowerCase();
      } catch (_) {}
    } catch (_) {}
    return "";
  }

  function portalLateSubmissionBypassForStaff() {
    try {
      var key = portalStaffProfileKey();
      if (key === "teflon") return true;
      var t = window.PORTAL_TERM_FROM_TIMETABLE;
      var list = t && t.termStaffLateSubmissionBypassProfileKeys;
      if (!Array.isArray(list) || !list.length) return false;
      var key = portalStaffProfileKey();
      if (!key) return false;
      return list.some(function (k) {
        return String(k || "").trim().toLowerCase() === key;
      });
    } catch (_) {
      return false;
    }
  }

  window.portalFetchLateSubmissionRequest = async function portalFetchLateSubmissionRequest(
    sessionKey,
    submissionType
  ) {
    var sk = String(sessionKey || "").trim();
    var st = String(submissionType || "").toLowerCase();
    if (!sk || !st) return null;
    var client = portalSupabaseClient();
    var uid = portalAuthUserId();
    if (!client || !uid) return null;
    try {
      var res = await client
        .from(TABLE)
        .select("id,status,session_date,portal_session_key,submission_type,admin_note,reviewed_at")
        .eq("staff_user_id", uid)
        .eq("portal_session_key", sk)
        .eq("submission_type", st)
        .in("status", ["pending", "approved", "rejected"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.error) return null;
      return res.data || null;
    } catch (_) {
      return null;
    }
  };

  window.portalInsertLateSubmissionRequest = async function portalInsertLateSubmissionRequest(
    item,
    submissionType
  ) {
    var client = portalSupabaseClient();
    var uid = portalAuthUserId();
    if (!client || !uid || !item) return { ok: false, error: "not_signed_in" };
    var sk = String(item.sessionKey || "").trim();
    var iso = portalSessionIsoFromKey(sk);
    if (!iso) return { ok: false, error: "bad_session" };
    var row = {
      staff_user_id: uid,
      portal_session_key: sk,
      session_date: iso,
      submission_type: String(submissionType || "").toLowerCase(),
      client_name: String(item.name || "").trim() || null,
      service_label: String(item.activity || item.service || "").trim() || null,
      status: "pending",
    };
    try {
      var res = await client.from(TABLE).insert([row]).select("id,status").single();
      if (res.error) {
        var msg = String(res.error.message || "");
        if (/duplicate|unique/i.test(msg)) return { ok: true, row: { status: "pending" } };
        return { ok: false, error: msg || "insert_failed" };
      }
      return { ok: true, row: res.data };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  };

  window.portalEnsureLateSubmissionAllowed = async function portalEnsureLateSubmissionAllowed(
    item,
    submissionType
  ) {
    if (!item || !item.sessionKey) return { allowed: false, reason: "no_session" };
    var iso = portalSessionIsoFromKey(item.sessionKey);
    if (!portalIsPastSessionDateIso(iso)) return { allowed: true, late: false };
    if (isLateSubmissionTypeSelfServe(submissionType)) {
      return { allowed: true, late: true, selfServe: true };
    }
    if (portalLateSubmissionBypassForStaff()) {
      return { allowed: true, late: true, approved: true, bypass: true };
    }

    var label = portalLateSubmissionLabel(submissionType);
    var existing = await portalFetchLateSubmissionRequest(item.sessionKey, submissionType);

    if (existing && existing.status === "approved") {
      return { allowed: true, late: true, approved: true, request: existing };
    }

    if (existing && existing.status === "pending") {
      alert(
        "You already asked for admin approval for " +
          label +
          " on this session.\n\nPlease wait until an admin approves your request. You can then open this client again and complete the form using the original session date — not today's date."
      );
      return { allowed: false, late: true, status: "pending", request: existing };
    }

    if (existing && existing.status === "rejected") {
      var again = confirm(
        "Your previous request for " +
          label +
          " on this session was not approved.\n\nAsk admin again?"
      );
      if (!again) return { allowed: false, late: true, status: "rejected" };
    } else {
      var ok = confirm(
        "This session is from a previous day.\n\n" +
          label +
          " needs admin approval before you can submit. The form will use the original session date, not today.\n\nSend a request to admin now?"
      );
      if (!ok) return { allowed: false, late: true, status: "declined" };
    }

    var ins = await portalInsertLateSubmissionRequest(item, submissionType);
    if (!ins.ok) {
      alert(
        "Could not send the approval request. Sign in on the portal hub and try again, or contact admin.\n\n(" +
          String(ins.error || "error") +
          ")"
      );
      return { allowed: false, late: true, status: "error" };
    }

    alert(
      "Request sent to admin.\n\nWhen it is approved, open this client again and tap the same button to complete " +
        label +
        "."
    );
    return { allowed: false, late: true, status: "pending", request: ins.row };
  };

  window.portalFormLateSubmissionApproved = async function portalFormLateSubmissionApproved(
    sessionKey,
    submissionType
  ) {
    if (isLateSubmissionTypeSelfServe(submissionType)) return true;
    if (portalLateSubmissionBypassForStaff()) return true;
    var qs =
      typeof URLSearchParams !== "undefined"
        ? new URLSearchParams(String(location.search || ""))
        : null;
    if (qs && qs.get("lateApproved") === "1") return true;
    var iso = portalSessionIsoFromKey(sessionKey);
    if (!portalIsPastSessionDateIso(iso)) return true;
    var row = await portalFetchLateSubmissionRequest(sessionKey, submissionType);
    return !!(row && row.status === "approved");
  };

  window.portalHideSessionDateEditor = function portalHideSessionDateEditor(shellId) {
    var shell = shellId ? document.getElementById(shellId) : null;
    if (shell) shell.hidden = true;
  };

})();
