/**
 * Session feedback narrative audit — submit backup + admin recovery lookup.
 */
(function (global) {
  "use strict";

  var AUDIT_FN = "portal-feedback-narrative-audit";

  var cfg = {
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
  };

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function baseUrl() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    try {
      var sessResp = await client.auth.getSession();
      var session = sessResp && sessResp.data && sessResp.data.session;
      return session && session.access_token ? session.access_token : null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Fire-and-forget audit row after successful feedback submit.
   */
  async function logSubmitAudit(payload) {
    payload = payload || {};
    var narrative = clean(payload.narrative_en);
    if (narrative.length < 8) return { ok: false, error: "narrative_too_short" };
    var token = await authToken();
    if (!token || !baseUrl()) return { ok: false, error: "no_session" };
    try {
      var res = await fetch(baseUrl() + "/functions/v1/" + AUDIT_FN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify(payload),
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e2) {
        j = null;
      }
      if (!res.ok || !j || !j.ok) {
        return { ok: false, error: (j && j.error) || "audit_failed" };
      }
      return { ok: true };
    } catch (_e3) {
      return { ok: false, error: "audit_failed" };
    }
  }

  /**
   * Admin recovery: latest audit narrative for participant + session date.
   */
  async function fetchLatestForFeedbackRow(row) {
    row = row || {};
    if (clean(row.session_narrative)) {
      return { ok: true, narrative: clean(row.session_narrative), source: "session_feedback" };
    }
    var client = cfg.getClient();
    if (!client) return { ok: false, error: "no_client" };
    var participant = clean(row.client_name);
    var sessionDate = clean(row.session_date).slice(0, 10);
    if (!participant || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return { ok: false, error: "missing_context" };
    }
    try {
      var q = client
        .from("session_feedback_narrative_audit")
        .select(
          "id,created_at,source,narrative_en,filter_positive,filter_relevant,staff_display_name,session_feedback_id",
        )
        .eq("participant_name", participant)
        .eq("session_date", sessionDate)
        .order("created_at", { ascending: false })
        .limit(5);
      var feedbackId = clean(row.id);
      if (feedbackId) {
        var byId = await client
          .from("session_feedback_narrative_audit")
          .select(
            "id,created_at,source,narrative_en,filter_positive,filter_relevant,staff_display_name,session_feedback_id",
          )
          .eq("session_feedback_id", feedbackId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!byId.error && byId.data && clean(byId.data.narrative_en)) {
          return { ok: true, row: byId.data, source: "audit_linked" };
        }
      }
      var resp = await q;
      if (resp.error) return { ok: false, error: resp.error.message || "query_failed" };
      var rows = resp.data || [];
      for (var i = 0; i < rows.length; i++) {
        if (clean(rows[i].narrative_en)) {
          return { ok: true, row: rows[i], source: "audit_match" };
        }
      }
      return { ok: false, error: "not_found" };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  /**
   * Admin: full audit timeline for a feedback row (validates, filters, submit).
   */
  async function fetchAuditHistoryForFeedbackRow(row) {
    row = row || {};
    var client = cfg.getClient();
    if (!client) return { ok: false, error: "no_client" };
    var participant = clean(row.client_name);
    var sessionDate = clean(row.session_date).slice(0, 10);
    if (!participant || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return { ok: false, error: "missing_context" };
    }
    var selectCols =
      "id,created_at,source,narrative_en,filter_positive,filter_relevant,filter_status,staff_display_name,session_feedback_id,meta";
    try {
      var feedbackId = clean(row.id);
      var rows = [];
      if (feedbackId) {
        var linked = await client
          .from("session_feedback_narrative_audit")
          .select(selectCols)
          .eq("session_feedback_id", feedbackId)
          .order("created_at", { ascending: true });
        if (!linked.error && linked.data && linked.data.length) {
          rows = linked.data;
        }
      }
      if (!rows.length) {
        var resp = await client
          .from("session_feedback_narrative_audit")
          .select(selectCols)
          .eq("participant_name", participant)
          .eq("session_date", sessionDate)
          .order("created_at", { ascending: true })
          .limit(40);
        if (resp.error) return { ok: false, error: resp.error.message || "query_failed" };
        rows = resp.data || [];
      }
      var counts = { validate: 0, filter: 0, submit: 0, voice: 0, total_tokens: 0 };
      rows.forEach(function (r) {
        var src = clean(r.source);
        if (src === "narrative_validate") counts.validate += 1;
        if (src === "narrative_filter") counts.filter += 1;
        if (src === "feedback_submit") counts.submit += 1;
        if (src === "voice_transcribe") counts.voice += 1;
        var meta = r.meta && typeof r.meta === "object" ? r.meta : {};
        var tok = Number(meta.total_tokens || 0);
        if (Number.isFinite(tok) && tok > 0) counts.total_tokens += tok;
      });
      return { ok: true, rows: rows, counts: counts };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  global.PortalSessionFeedbackNarrativeAudit = {
    configure: configure,
    logSubmitAudit: logSubmitAudit,
    fetchLatestForFeedbackRow: fetchLatestForFeedbackRow,
    fetchAuditHistoryForFeedbackRow: fetchAuditHistoryForFeedbackRow,
  };
})(typeof window !== "undefined" ? window : globalThis);
