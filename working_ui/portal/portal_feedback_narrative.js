/**
 * Session feedback narrative — validate (typed) + filter with AI → Positive + Relevant.
 */
(function (global) {
  "use strict";

  var VALIDATE_FN = "portal-feedback-narrative-validate";
  var FILTER_FN = "portal-feedback-narrative-filter";
  var MIN_NARRATIVE_CHARS = 80;

  var DEMO_POSITIVE_MARKER =
    "The participant arrived happy and ready to begin the session";

  var SECTION_LABELS = {
    reception: "Reception",
    session: "Session",
    handover: "Handover",
  };

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
    inputMode: "typed",
    validated: false,
    validating: false,
    validationSnapshot: "",
    validationResult: null,
    filtered: false,
    filtering: false,
    liveAiUsed: false,
    narrativeSnapshot: "",
    filterPositiveSnapshot: "",
    filterRelevantSnapshot: "",
    contextKey: "",
    voiceAutoFilterPending: false,
    counts: { validate: 0, filter: 0 },
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

  function isTypedMode() {
    return state.inputMode !== "voice";
  }

  function validationRequired() {
    return isTypedMode();
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

  function renderValidationChecklist(result) {
    if (!els.validatePanel || !els.validateList) return;
    if (!result) {
      els.validatePanel.hidden = true;
      els.validateList.innerHTML = "";
      return;
    }
    els.validatePanel.hidden = false;
    var keys = ["reception", "session", "handover"];
    els.validateList.innerHTML = keys
      .map(function (key) {
        var sec = (result && result[key]) || {};
        var ok = sec.covered === true;
        var note = clean(sec.note);
        return (
          '<li class="fb-validate-item' +
          (ok ? " fb-validate-item--ok" : " fb-validate-item--miss") +
          '">' +
          '<span class="fb-validate-item__icon" aria-hidden="true">' +
          (ok ? "✓" : "!") +
          "</span>" +
          '<span class="fb-validate-item__copy">' +
          "<strong>" +
          (SECTION_LABELS[key] || key) +
          "</strong>" +
          (note && !ok ? " — " + escHtml(note) : ok ? " — covered" : "") +
          "</span></li>"
        );
      })
      .join("");
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function syncModeNote() {
    if (!els.modeNote) return;
    if (state.inputMode === "voice") {
      els.modeNote.textContent =
        "Voice: when you finish recording, Filter with AI runs automatically. You can still edit Positive or Relevant before Submit.";
    } else {
      els.modeNote.textContent =
        "Typed: Check narrative first (Reception, Session, Handover). Then Filter with AI creates parent-friendly Positive + internal Relevant. Edit anytime and check or filter again.";
    }
  }

  function syncValidateButton() {
    if (!els.validateBtn) return;
    var len = narrativeText().length;
    els.validateBtn.hidden = !isTypedMode();
    els.validateBtn.disabled = state.validating || len < MIN_NARRATIVE_CHARS;
  }

  function syncFilterButton() {
    if (!els.filterBtn) return;
    var len = narrativeText().length;
    var needsValidate = validationRequired() && (!state.validated || narrativeText() !== state.validationSnapshot);
    els.filterBtn.disabled = state.filtering || len < MIN_NARRATIVE_CHARS || needsValidate;
  }

  function syncSubmitGate() {
    if (!els.submitBtn) return;
    if (els.submitBtn.textContent === "Submitting") return;
    var needsValidate =
      validationRequired() &&
      (!state.validated || narrativeText() !== state.validationSnapshot);
    els.submitBtn.disabled = !state.filtered || !state.liveAiUsed || needsValidate;
    var hint = global.document.getElementById("fbSubmitHint");
    if (hint) {
      if (needsValidate) {
        hint.textContent = "Check narrative (Reception, Session, Handover) before filtering or submit.";
      } else if (!state.filtered) {
        hint.textContent = isTypedMode()
          ? "Check narrative, then Filter with AI before submitting."
          : "Run Filter with AI before submitting.";
      } else if (!state.liveAiUsed) {
        hint.textContent = "Live AI filter required — tap Filter with AI again.";
      } else {
        hint.textContent = "Ready to submit — edit fields and re-check or re-filter if needed.";
      }
    }
  }

  function showAiOutput(show) {
    if (!els.aiSection) return;
    els.aiSection.hidden = !show;
  }

  function resetValidatedState() {
    state.validated = false;
    state.validationSnapshot = "";
    state.validationResult = null;
    renderValidationChecklist(null);
    syncValidateButton();
    syncFilterButton();
    syncSubmitGate();
  }

  function resetFilteredState() {
    state.filtered = false;
    state.liveAiUsed = false;
    state.narrativeSnapshot = "";
    state.filterPositiveSnapshot = "";
    state.filterRelevantSnapshot = "";
    if (els.positive) els.positive.value = "";
    if (els.relevant) els.relevant.value = "";
    setAiFieldsRequired(false);
    showAiOutput(false);
    syncFilterButton();
    syncSubmitGate();
  }

  function resetAllAiState() {
    resetValidatedState();
    resetFilteredState();
    setStatus("");
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
    return [ctx.participant_name, ctx.service, ctx.session_date]
      .map(function (v) {
        return clean(v).toLowerCase();
      })
      .join("|");
  }

  function onSessionContextChange() {
    var key = buildContextKey();
    if (state.contextKey && key && key !== state.contextKey) {
      resetAllAiState();
      state.counts = { validate: 0, filter: 0 };
      state.inputMode = "typed";
      syncModeNote();
      setStatus("Participant or session changed — write or record this session.");
    }
    state.contextKey = key;
  }

  function applyValidationResult(result) {
    state.validationResult = result;
    state.validated = !!(result && result.all_complete);
    state.validationSnapshot = narrativeText();
    state.counts.validate += 1;
    renderValidationChecklist(result);
    syncValidateButton();
    syncFilterButton();
    syncSubmitGate();
    if (result && result.all_complete) {
      setStatus("All three sections covered — tap Filter with AI when ready.");
    } else {
      setStatus("Add what's missing in your narrative, then Check narrative again.");
    }
  }

  function applyFilterResult(positive, relevant, liveAi) {
    if (els.positive) els.positive.value = positive;
    if (els.relevant) els.relevant.value = relevant;
    state.filtered = true;
    state.liveAiUsed = !!liveAi;
    state.narrativeSnapshot = narrativeText();
    state.filterPositiveSnapshot = positive;
    state.filterRelevantSnapshot = relevant;
    state.counts.filter += 1;
    setAiFieldsRequired(true);
    showAiOutput(true);
    syncSubmitGate();
    if (liveAi) {
      setStatus("Filtered — edit Positive or Relevant if needed, then Submit.");
    }
  }

  async function callValidateEdge(narrative, context) {
    var token = await authToken();
    if (!token) return { ok: false, error: "session_expired" };

    var res = await fetch(baseUrl() + "/functions/v1/" + VALIDATE_FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: JSON.stringify(Object.assign({ narrative_en: narrative }, context || {})),
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
        error: (body && body.error) || "validate_failed",
        status: res.status,
      };
    }

    return {
      ok: true,
      all_complete: !!body.all_complete,
      reception: body.reception,
      session: body.session,
      handover: body.handover,
      missing: body.missing || [],
    };
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
      body: JSON.stringify(Object.assign({ narrative_en: narrative }, context || {})),
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

  async function validateNarrative() {
    if (state.validating || !isTypedMode()) return;
    var narrative = narrativeText();
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      setStatus("Add more detail to the session narrative first.");
      return;
    }

    state.validating = true;
    syncValidateButton();
    if (els.validateBtn) els.validateBtn.textContent = "Checking…";
    setStatus("Checking Reception, Session and Handover…");

    var context = readFormContext();
    var result = await callValidateEdge(narrative, context);

    state.validating = false;
    if (els.validateBtn) els.validateBtn.textContent = "Check narrative";
    syncValidateButton();

    if (!result.ok) {
      if (result.error === "session_expired") {
        setStatus("Sign in on the portal, then try again.");
        global.alert("Your session expired. Sign in again, then Check narrative.");
        return;
      }
      setStatus("Could not check narrative — try again.");
      return;
    }

    applyValidationResult(result);
  }

  async function filterWithAi(opts) {
    opts = opts || {};
    if (state.filtering) return;
    var narrative = narrativeText();
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      setStatus("Add more detail to the session narrative first.");
      return;
    }
    if (validationRequired()) {
      if (!state.validated || narrative !== state.validationSnapshot) {
        setStatus("Check narrative first (Reception, Session, Handover).");
        if (!opts.silent) {
          global.alert("Typed feedback: tap Check narrative and fix missing sections before Filter with AI.");
        }
        return;
      }
      if (!state.validationResult || !state.validationResult.all_complete) {
        setStatus("Complete all three sections before filtering.");
        return;
      }
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
        global.alert("Your session expired. Sign in again, then Filter with AI.");
        return;
      }
      if (
        err === "template_response" ||
        err === "generic_participant_label" ||
        err === "invented_details"
      ) {
        setStatus("AI returned a generic template — edit your narrative or try Filter again.");
        return;
      }
      setStatus("Could not filter — check your connection and try again.");
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
      return;
    }

    applyFilterResult(result.positive_feedback, result.relevant_information, true);

    state.filtering = false;
    if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
    syncFilterButton();
  }

  function onVoiceTranscriptDone() {
    state.inputMode = "voice";
    state.voiceAutoFilterPending = true;
    syncModeNote();
    syncValidateButton();
    syncFilterButton();
    setStatus("Voice transcribed — filtering for parent-friendly text…");
    global.setTimeout(function () {
      state.voiceAutoFilterPending = false;
      void filterWithAi({ silent: true });
    }, 400);
  }

  function onNarrativeInput(fromVoice) {
    syncValidateButton();
    syncFilterButton();
    if (fromVoice) return;
    if (state.inputMode === "voice" && !state.voiceAutoFilterPending) {
      state.inputMode = "typed";
      syncModeNote();
      syncValidateButton();
    }
    if (!state.filtered && !state.validated) return;
    if (narrativeText() !== state.narrativeSnapshot) {
      resetFilteredState();
      resetValidatedState();
      setStatus("Narrative changed — check and filter again.");
    }
  }

  function getSubmitAuditMeta() {
    var positive = clean(els.positive && els.positive.value);
    var relevant = clean(els.relevant && els.relevant.value);
    return {
      input_mode: state.inputMode,
      validate_count: state.counts.validate,
      filter_count: state.counts.filter,
      positive_edited_after_filter:
        state.filtered && positive !== clean(state.filterPositiveSnapshot),
      relevant_edited_after_filter:
        state.filtered && relevant !== clean(state.filterRelevantSnapshot),
      narrative_edited_after_filter:
        state.filtered && narrativeText() !== clean(state.narrativeSnapshot),
    };
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
    if (validationRequired()) {
      if (!state.validated || narrative !== state.validationSnapshot) {
        global.alert("Check narrative first — Reception, Session and Handover must be covered.");
        return false;
      }
      if (!state.validationResult || !state.validationResult.all_complete) {
        global.alert("Your narrative is still missing sections. Check narrative and add detail.");
        return false;
      }
    }
    if (!state.filtered) {
      global.alert("Tap Filter with AI first — Positive and Relevant are filled from your narrative.");
      return false;
    }
    if (!state.liveAiUsed) {
      global.alert("Live Filter with AI is required.");
      return false;
    }
    if (narrative !== state.narrativeSnapshot) {
      global.alert("You edited the narrative after filtering. Check narrative and Filter with AI again.");
      return false;
    }
    var ctx = readFormContext();
    var positive = clean(els.positive && els.positive.value);
    var relevant = clean(els.relevant && els.relevant.value);
    if (isDemoTemplateOutput(positive, relevant, ctx.participant_name)) {
      global.alert("Positive/Relevant match the training demo — use Filter with AI on your narrative.");
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
    state.inputMode = "typed";
    state.counts = { validate: 0, filter: 0 };
    resetAllAiState();
    syncModeNote();
    syncValidateButton();
    state.contextKey = buildContextKey();
  }

  function wireFormListeners(form) {
    if (!form) return;
    form.addEventListener("change", function () {
      onSessionContextChange();
    });
  }

  function init(options) {
    configure(options);

    els.narrative = global.document.getElementById("fbSessionNarrative");
    els.validateBtn = global.document.getElementById("btnValidateFeedbackNarrative");
    els.filterBtn = global.document.getElementById("btnFilterFeedbackAi");
    els.status = global.document.getElementById("filterAiStatus");
    els.aiSection = global.document.getElementById("fbAiOutputSection");
    els.positive = global.document.getElementById("fbPositiveFeedback");
    els.relevant = global.document.getElementById("fbRelevantInformation");
    els.submitBtn = global.document.getElementById("submitBtn");
    els.validatePanel = global.document.getElementById("fbNarrativeValidatePanel");
    els.validateList = global.document.getElementById("fbNarrativeValidateList");
    els.modeNote = global.document.getElementById("fbNarrativeModeNote");

    if (!els.narrative || !els.filterBtn) return;

    if (els.narrative) {
      els.narrative.addEventListener("input", function () {
        onNarrativeInput(false);
      });
    }

    if (els.validateBtn) {
      els.validateBtn.addEventListener("click", function () {
        validateNarrative();
      });
    }

    els.filterBtn.addEventListener("click", function () {
      filterWithAi();
    });

    if (!global.__portalFeedbackVoiceDoneBound) {
      global.__portalFeedbackVoiceDoneBound = true;
      global.addEventListener("portal:feedback-voice-transcript-done", function () {
        onVoiceTranscriptDone();
      });
    }

    wireFormListeners(cfg.getForm());
    state.contextKey = buildContextKey();
    setAiFieldsRequired(false);
    syncModeNote();
    syncValidateButton();
    syncFilterButton();
    syncSubmitGate();
  }

  global.PortalFeedbackNarrative = {
    configure: configure,
    init: init,
    reset: reset,
    isFiltered: isFiltered,
    validateBeforeSubmit: validateBeforeSubmit,
    validateNarrative: validateNarrative,
    filterWithAi: filterWithAi,
    syncSubmitGate: syncSubmitGate,
    onSessionContextChange: onSessionContextChange,
    getSessionNarrativeForSubmit: getSessionNarrativeForSubmit,
    getSubmitAuditMeta: getSubmitAuditMeta,
    participantGender: participantGender,
    isDemoTemplateOutput: isDemoTemplateOutput,
  };
})(typeof window !== "undefined" ? window : globalThis);
