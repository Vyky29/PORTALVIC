/**
 * Session feedback narrative — Filter with AI splits narrative into Positive + Relevant.
 */
(function (global) {
  "use strict";

  var FILTER_FN = "portal-feedback-narrative-filter";
  var MIN_NARRATIVE_CHARS = 80;

  /** Training-demo copy — must not be submitted as live feedback. */
  var DEMO_POSITIVE_MARKER =
    "The participant arrived happy and ready to begin the session";

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
    liveAiUsed: false,
    narrativeSnapshot: "",
    contextKey: "",
  };

  var els = {};

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.getForm) cfg.getForm = options.getForm;
  }

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function normGenderValue(v) {
    v = String(v == null ? "" : v)
      .trim()
      .toLowerCase();
    if (v === "m" || v === "male" || v === "boy") return "m";
    if (v === "f" || v === "female" || v === "girl") return "f";
    return "";
  }

  function photoKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function participantFirstName(name) {
    var parts = clean(name).split(/\s+/).filter(Boolean);
    return parts[0] || clean(name) || "Participant";
  }

  function participantGender(name) {
    var n = photoKey(name);
    var first = n.split(/\s+/)[0] || "";
    try {
      var map = global.PORTAL_CLIENT_GENDER_OVERRIDES || {};
      var g = normGenderValue(map[n]) || normGenderValue(map[first]);
      if (g) return g;
    } catch (_) {}
    return "";
  }

  function previewFilterAllowed() {
    try {
      if (global.location && global.location.search) {
        if (/[?&]localPreview=1(?:&|$)/.test(global.location.search)) return true;
      }
    } catch (_) {}
    return !!global.__PORTAL_FEEDBACK_ALLOW_PREVIEW_FILTER;
  }

  function isDemoTemplateOutput(positive, relevant, participantName) {
    var pos = clean(positive);
    var rel = clean(relevant);
    if (!pos && !rel) return false;
    if (pos.indexOf(DEMO_POSITIVE_MARKER) !== -1) return true;
    if (rel.indexOf("requested to finish the session approximately ten minutes early") !== -1) {
      return true;
    }
    var first = participantFirstName(participantName);
    if (first && first !== "Participant") {
      if (/\bthe participant\b/i.test(pos)) return true;
      if (pos && pos.indexOf(first) === -1 && rel.indexOf(first) === -1) {
        if (pos.indexOf("Seahorse") !== -1 || pos.indexOf("Intensive Interaction") !== -1) {
          return true;
        }
      }
    }
    return false;
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
    els.filterBtn.disabled = state.filtering || len < MIN_NARRATIVE_CHARS;
  }

  function syncSubmitGate() {
    if (!els.submitBtn) return;
    if (els.submitBtn.textContent === "Submitting") return;
    els.submitBtn.disabled = !state.filtered || !state.liveAiUsed;
    var hint = global.document.getElementById("fbSubmitHint");
    if (hint) {
      if (!state.filtered) {
        hint.textContent = "Run Filter with AI before submitting.";
      } else if (!state.liveAiUsed) {
        hint.textContent = "Live AI filter required — tap Filter with AI again (do not use training demo copy).";
      } else {
        hint.textContent = "Ready to submit — edit Positive or Relevant if needed.";
      }
    }
  }

  function showAiOutput(show) {
    if (!els.aiSection) return;
    els.aiSection.hidden = !show;
  }

  function resetFilteredState() {
    state.filtered = false;
    state.liveAiUsed = false;
    state.narrativeSnapshot = "";
    if (els.positive) els.positive.value = "";
    if (els.relevant) els.relevant.value = "";
    setAiFieldsRequired(false);
    showAiOutput(false);
    setStatus("");
    syncFilterButton();
    syncSubmitGate();
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
    var dateEl = form.querySelector("#fbSessionDate, [name='sessionDate']");
    var participantName = participantEl ? clean(participantEl.value) : "";
    var gender = participantGender(participantName);

    return {
      engagement_rating: engagementRaw,
      client_emotions: emotions,
      independence_level: independence,
      participant_name: participantName,
      participant_gender: gender,
      service: serviceEl ? clean(serviceEl.value) : "",
      session_date: dateEl ? clean(dateEl.value).slice(0, 10) : "",
    };
  }

  function buildContextKey() {
    var ctx = readFormContext();
    return [
      ctx.participant_name,
      ctx.service,
      ctx.session_date,
    ]
      .map(function (v) {
        return clean(v).toLowerCase();
      })
      .join("|");
  }

  function onSessionContextChange() {
    var key = buildContextKey();
    if (state.contextKey && key && key !== state.contextKey) {
      resetFilteredState();
      setStatus("Participant or session changed — write or record this session, then Filter with AI.");
    }
    state.contextKey = key;
  }

  function applyFilterResult(positive, relevant, liveAi) {
    if (els.positive) els.positive.value = positive;
    if (els.relevant) els.relevant.value = relevant;
    state.filtered = true;
    state.liveAiUsed = !!liveAi;
    state.narrativeSnapshot = narrativeText();
    setAiFieldsRequired(true);
    showAiOutput(true);
    syncSubmitGate();
    if (liveAi) {
      setStatus("Filtered from your narrative — edit Positive and Relevant if needed, then Submit.");
    } else {
      setStatus("Preview only — sign in on the portal and run Filter with AI again before Submit.");
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
    setStatus("Filtering with AI from your narrative…");

    var context = readFormContext();
    var result = await callFilterEdge(narrative, context);

    if (!result.ok) {
      state.filtering = false;
      if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
      syncFilterButton();
      var err = result.error || "filter_failed";
      if (err === "session_expired") {
        setStatus("Sign in on the portal, then tap Filter with AI again.");
        global.alert(
          "Your session expired. Sign in again, then tap Filter with AI on YOUR transcribed narrative before Submit.",
        );
        return;
      }
      if (err === "template_response" || err === "generic_participant_label" || err === "invented_details") {
        setStatus("AI returned a generic template — edit your narrative or try Filter again.");
        global.alert(
          "Filter with AI did not accept a generic training example. Use YOUR voice transcript or typed notes for this participant, then tap Filter with AI again.",
        );
        return;
      }
      setStatus("Could not filter — check your connection and try again.");
      global.alert(
        "Filter with AI failed (" +
          String(err).replace(/_/g, " ") +
          "). Check your connection and try again. Do not paste text from the training demo.",
      );
      return;
    }

    if (
      isDemoTemplateOutput(
        result.positive_feedback,
        result.relevant_information,
        context.participant_name,
      )
    ) {
      state.filtering = false;
      if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
      syncFilterButton();
      setStatus("Output looks like the training demo — use your own narrative.");
      global.alert(
        "This looks like the training demo example, not your transcription. Record or type what happened in THIS session, then tap Filter with AI again.",
      );
      return;
    }

    applyFilterResult(result.positive_feedback, result.relevant_information, true);

    state.filtering = false;
    if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
    syncFilterButton();
  }

  function validateBeforeSubmit() {
    var narrative = narrativeText();
    if (!narrative) {
      global.alert("Please complete the session narrative (Reception, Session, Handover).");
      return false;
    }
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      global.alert("Please add more detail to the session narrative before submitting.");
      return false;
    }
    if (!state.filtered) {
      global.alert("Tap Filter with AI first — Positive and Relevant are filled from your narrative.");
      return false;
    }
    if (!state.liveAiUsed) {
      global.alert(
        "Live Filter with AI is required. Do not submit training-demo copy — tap Filter with AI on your own narrative.",
      );
      return false;
    }
    if (narrative !== state.narrativeSnapshot) {
      global.alert("You edited the narrative after filtering. Tap Filter with AI again.");
      return false;
    }
    var ctx = readFormContext();
    var positive = clean(els.positive && els.positive.value);
    var relevant = clean(els.relevant && els.relevant.value);
    if (isDemoTemplateOutput(positive, relevant, ctx.participant_name)) {
      global.alert(
        "Positive/Relevant still match the training demo example. Use Filter with AI on YOUR transcribed session narrative.",
      );
      return false;
    }
    if (!positive) {
      global.alert("Positive feedback is empty — run Filter with AI again.");
      return false;
    }
    if (!relevant) {
      global.alert("Relevant information is empty — run Filter with AI again.");
      return false;
    }
    return true;
  }

  function isFiltered() {
    return state.filtered && state.liveAiUsed;
  }

  function getSessionNarrativeForSubmit() {
    return narrativeText();
  }

  function reset() {
    if (els.narrative) els.narrative.value = "";
    resetFilteredState();
    state.contextKey = buildContextKey();
  }

  function wireFormListeners(form) {
    if (!form) return;
    form.addEventListener("change", function () {
      onSessionContextChange();
      invalidateIfNarrativeChanged();
    });
  }

  function invalidateIfNarrativeChanged() {
    if (!state.filtered) return;
    if (narrativeText() === state.narrativeSnapshot) return;
    resetFilteredState();
    setStatus("Narrative changed — run Filter with AI again.");
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
    state.contextKey = buildContextKey();
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
    onSessionContextChange: onSessionContextChange,
    getSessionNarrativeForSubmit: getSessionNarrativeForSubmit,
    isDemoTemplateOutput: isDemoTemplateOutput,
  };
})(typeof window !== "undefined" ? window : globalThis);
