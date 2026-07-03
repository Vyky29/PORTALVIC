/**
 * Session feedback narrative — Filter with AI splits narrative into Positive + Relevant.
 */
(function (global) {
  "use strict";

  var FILTER_FN = "portal-feedback-narrative-filter";
  var MIN_NARRATIVE_CHARS = 80;

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
    getForm: function () {
      return null;
    },
  };

  var state = {
    filtered: false,
    filtering: false,
    narrativeSnapshot: "",
  };

  var els = {};

  /** Preview output when edge function unavailable (local / offline). */
  var PREVIEW_FILTER = {
    positive:
      "The participant arrived happy and ready to begin the session. Throughout the session, he remained calm and enjoyed exploring the aquatic environment. By following his interests and using Intensive Interaction alongside a First–Then routine, he successfully participated in several structured activities, including Seahorse and Front Kicking with a noodle. He responded positively when activities were presented in short, predictable sequences with regular movement breaks. The session finished with a smooth transition and a positive handover with his family.",
    relevant:
      "The participant initially demonstrated low engagement with the planned session activities and did not respond to verbal instructions, choices or available motivators. Engagement increased after approximately five minutes of Intensive Interaction and following his preferred interests. A First–Then strategy was effective in supporting participation in structured activities. The participant requested to finish the session approximately ten minutes early, indicating that he was hungry and wished to go to the sauna. This information was shared with his mother during the handover.",
  };

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.getForm) cfg.getForm = options.getForm;
  }

  function baseUrl() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  function clean(v) {
    return String(v == null ? "" : v).trim();
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

  function narrativeText() {
    return els.narrative ? clean(els.narrative.value) : "";
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || "";
  }

  function setAiFieldsRequired(on) {
    if (els.positive) {
      if (on) els.positive.setAttribute("required", "");
      else els.positive.removeAttribute("required");
    }
    if (els.relevant) {
      if (on) els.relevant.setAttribute("required", "");
      else els.relevant.removeAttribute("required");
    }
  }

  function syncFilterButton() {
    if (!els.filterBtn) return;
    var len = narrativeText().length;
    els.filterBtn.disabled =
      state.filtering || len < MIN_NARRATIVE_CHARS;
  }

  function syncSubmitGate() {
    if (!els.submitBtn) return;
    if (els.submitBtn.textContent === "Submitting") return;
    els.submitBtn.disabled = !state.filtered;
    var hint = global.document.getElementById("fbSubmitHint");
    if (hint) {
      hint.textContent = state.filtered
        ? "Ready to submit."
        : "Run Filter with AI before submitting.";
    }
  }

  function showAiOutput(show) {
    if (!els.aiSection) return;
    els.aiSection.hidden = !show;
  }

  function resetFilteredState() {
    state.filtered = false;
    state.narrativeSnapshot = "";
    if (els.positive) els.positive.value = "";
    if (els.relevant) els.relevant.value = "";
    setAiFieldsRequired(false);
    showAiOutput(false);
    setStatus("");
    syncFilterButton();
    syncSubmitGate();
  }

  function invalidateIfNarrativeChanged() {
    if (!state.filtered) return;
    if (narrativeText() === state.narrativeSnapshot) return;
    resetFilteredState();
    setStatus("Narrative changed — run Filter with AI again.");
  }

  function readFormContext() {
    var form = cfg.getForm();
    if (!form) return {};

    var engagementRaw = "";
    var engagementChecked = form.querySelector('input[name="engagementRating"]:checked');
    if (engagementChecked) engagementRaw = String(engagementChecked.value || "");

    var emotionChecked = Array.prototype.slice.call(
      form.querySelectorAll('input[name="clientEmotions"]:checked'),
    );
    var emotions = emotionChecked
      .map(function (inp) {
        return clean(inp.value);
      })
      .filter(Boolean)
      .join("; ");

    var independenceChecked = Array.prototype.slice.call(
      form.querySelectorAll('input[name="independenceLevel"]:checked'),
    );
    var independence = independenceChecked
      .map(function (inp) {
        return clean(inp.value);
      })
      .filter(Boolean)
      .join("; ");

    var participantEl = form.querySelector("#fbParticipantName, [name='participantName']");
    var serviceEl = form.querySelector("#fbService, [name='service']");

    return {
      engagement_rating: engagementRaw,
      client_emotions: emotions,
      independence_level: independence,
      participant_name: participantEl ? clean(participantEl.value) : "",
      service: serviceEl ? clean(serviceEl.value) : "",
    };
  }

  function applyFilterResult(positive, relevant, previewMode) {
    if (els.positive) els.positive.value = positive;
    if (els.relevant) els.relevant.value = relevant;
    state.filtered = true;
    state.narrativeSnapshot = narrativeText();
    setAiFieldsRequired(true);
    showAiOutput(true);
    syncSubmitGate();
    if (previewMode) {
      setStatus(
        "Preview filter applied (sign in on portal for live AI). Review below, then Submit.",
      );
    } else {
      setStatus("Filtered — review Positive and Relevant, then Submit.");
    }
  }

  async function callFilterEdge(narrative, context) {
    var token = await authToken();
    if (!token) return { ok: false, error: "session_expired" };

    var res = await fetch(baseUrl() + "/functions/v1/" + FILTER_FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: JSON.stringify(
        Object.assign({ narrative_en: narrative }, context || {}),
      ),
    });

    var body = null;
    try {
      body = await res.json();
    } catch (_e) {
      body = null;
    }

    if (!res.ok || !body || !body.ok) {
      return {
        ok: false,
        error: (body && body.error) || "filter_failed",
        status: res.status,
      };
    }

    return {
      ok: true,
      positive_feedback: clean(body.positive_feedback),
      relevant_information: clean(body.relevant_information),
    };
  }

  async function runPreviewFilter() {
    await new Promise(function (r) {
      setTimeout(r, 700);
    });
    return {
      ok: true,
      positive_feedback: PREVIEW_FILTER.positive,
      relevant_information: PREVIEW_FILTER.relevant,
      preview: true,
    };
  }

  async function filterWithAi() {
    if (state.filtering) return;
    var narrative = narrativeText();
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      setStatus("Add more detail to the session narrative first.");
      return;
    }

    state.filtering = true;
    syncFilterButton();
    if (els.filterBtn) els.filterBtn.textContent = "Filtering…";
    setStatus("Filtering with AI…");

    var context = readFormContext();
    var result = await callFilterEdge(narrative, context);

    if (!result.ok) {
      var usePreview =
        result.error === "session_expired" ||
        result.status === 401 ||
        result.status === 503 ||
        result.status === 502 ||
        result.error === "filter_failed";

      if (usePreview) {
        result = await runPreviewFilter();
      } else {
        state.filtering = false;
        if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
        syncFilterButton();
        setStatus("Could not filter — try again or check your connection.");
        return;
      }
    }

    applyFilterResult(
      result.positive_feedback,
      result.relevant_information,
      !!result.preview,
    );

    state.filtering = false;
    if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
    syncFilterButton();
  }

  function validateBeforeSubmit() {
    var narrative = narrativeText();
    if (!narrative) {
      alert("Please complete the session narrative (Reception, Session, Handover).");
      return false;
    }
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      alert("Please add more detail to the session narrative before submitting.");
      return false;
    }
    if (!state.filtered) {
      alert("Tap Filter with AI first — Positive and Relevant are filled from your narrative.");
      return false;
    }
    if (narrative !== state.narrativeSnapshot) {
      alert("You edited the narrative after filtering. Tap Filter with AI again.");
      return false;
    }
    if (!clean(els.positive && els.positive.value)) {
      alert("Positive feedback is empty — run Filter with AI again.");
      return false;
    }
    if (!clean(els.relevant && els.relevant.value)) {
      alert("Relevant information is empty — run Filter with AI again.");
      return false;
    }
    return true;
  }

  function isFiltered() {
    return state.filtered;
  }

  function reset() {
    if (els.narrative) els.narrative.value = "";
    resetFilteredState();
  }

  function wireFormListeners(form) {
    if (!form) return;
    form.addEventListener("change", function () {
      invalidateIfNarrativeChanged();
    });
  }

  function init(options) {
    configure(options);

    els.narrative = global.document.getElementById("fbSessionNarrative");
    els.filterBtn = global.document.getElementById("btnFilterFeedbackAi");
    els.status = global.document.getElementById("filterAiStatus");
    els.aiSection = global.document.getElementById("fbAiOutputSection");
    els.positive = global.document.getElementById("fbPositiveFeedback");
    els.relevant = global.document.getElementById("fbRelevantInformation");
    els.submitBtn = global.document.getElementById("submitBtn");

    if (!els.narrative || !els.filterBtn) return;

    if (els.narrative) {
      els.narrative.addEventListener("input", function () {
        invalidateIfNarrativeChanged();
        syncFilterButton();
      });
    }

    els.filterBtn.addEventListener("click", function () {
      filterWithAi();
    });

    wireFormListeners(cfg.getForm());
    setAiFieldsRequired(false);
    syncFilterButton();
    syncSubmitGate();
  }

  global.PortalFeedbackNarrative = {
    configure: configure,
    init: init,
    reset: reset,
    isFiltered: isFiltered,
    validateBeforeSubmit: validateBeforeSubmit,
    filterWithAi: filterWithAi,
    syncSubmitGate: syncSubmitGate,
  };
})(typeof window !== "undefined" ? window : globalThis);
