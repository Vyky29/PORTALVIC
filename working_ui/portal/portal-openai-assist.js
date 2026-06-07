/**
 * Portal OpenAI assist — calls portal-openai-assist Edge Function.
 * Tasks: help (staff), report_draft / report_improve (admin).
 */
(function (global) {
  "use strict";

  var cfg = {
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "https://cklpnwhlqsulpmkipmqb.supabase.co";
    },
    getAnonKey: function () {
      return "";
    },
  };

  var availability = {
    checked: false,
    openai: false,
    model: "",
  };

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function baseUrl() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  async function probe(force) {
    if (availability.checked && !force) return availability;
    var token = await authToken();
    if (!token) {
      availability = { checked: true, openai: false, model: "" };
      return availability;
    }
    try {
      var res = await fetch(baseUrl() + "/functions/v1/portal-openai-assist", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      availability = {
        checked: true,
        openai: !!(j && j.ok && j.openai),
        model: j && j.model ? String(j.model) : "",
      };
    } catch (_e2) {
      availability = { checked: true, openai: false, model: "" };
    }
    return availability;
  }

  function isAvailable() {
    return availability.checked ? availability.openai : false;
  }

  async function callAssist(payload) {
    var token = await authToken();
    if (!token) return { ok: false, error: "session_expired" };
    var res = await fetch(baseUrl() + "/functions/v1/portal-openai-assist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: JSON.stringify(payload || {}),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      return {
        ok: false,
        error: (j && (j.error || j.message)) || res.statusText || "assist_failed",
      };
    }
    return { ok: true, text: String(j.text || "") };
  }

  async function helpAnswer(question, knowledge) {
    return callAssist({
      task: "help",
      question: question,
      knowledge: knowledge || [],
    });
  }

  async function reportDraft(opts) {
    opts = opts || {};
    return callAssist({
      task: "report_draft",
      reportType: opts.reportType || "progress",
      clientName: opts.clientName || "",
      context: opts.context || "",
    });
  }

  async function reportImprove(opts) {
    opts = opts || {};
    return callAssist({
      task: "report_improve",
      reportType: opts.reportType || "progress",
      clientName: opts.clientName || "",
      existingText: opts.existingText || "",
    });
  }

  global.PortalOpenAiAssist = {
    configure: configure,
    probe: probe,
    isAvailable: isAvailable,
    helpAnswer: helpAnswer,
    reportDraft: reportDraft,
    reportImprove: reportImprove,
  };
})(typeof window !== "undefined" ? window : globalThis);
