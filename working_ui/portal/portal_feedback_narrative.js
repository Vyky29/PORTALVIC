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
    aiUnavailable: false,
    manualMode: false,
    unifiedParentFeedback: false,
    narrativeSnapshot: "",
    filterPositiveSnapshot: "",
    filterRelevantSnapshot: "",
    contextKey: "",
    voiceAutoFilterPending: false,
    adminFilters: false,
    counts: { validate: 0, filter: 0 },
  };

  var els = {};

  // Admin-filters mode: instructors submit the RAW narrative only (no Check /
  // Filter with AI). The admin runs the AI filter + releases to the family.
  // Off by default; enable with window.PORTAL_FEEDBACK_ADMIN_FILTERS = true
  // or the ?adminFilters=1 URL param (for preview).
  function resolveAdminFiltersFlag() {
    try {
      if (global.PORTAL_FEEDBACK_ADMIN_FILTERS === true) return true;
      if (global.PORTAL_FEEDBACK_ADMIN_FILTERS === false) return false;
      var qs = global.location && global.location.search
        ? new global.URLSearchParams(global.location.search)
        : null;
      if (qs && (qs.get("adminFilters") === "1" || qs.get("adminfilters") === "1")) {
        return true;
      }
    } catch (_e) {}
    return false;
  }

  var aiHealthProbeStarted = false;
  var aiDetectTimer = null;

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

  var AI_DOWN_SUBMIT_MSG =
    "AI is temporarily unavailable — type at least 80 characters, then Submit without Check narrative or Filter with AI. This stays in admin only until Session feedback → Take action → Filter and release to parent portal.";

  var MANUAL_ENTRY_HINT =
    "Manual mode: write Positive feedback and Relevant information yourself, then Submit. Positive goes to the family app as written.";

  /** True when the edge function failed because OpenAI/Whisper is unreachable or out of quota. */
  function isAiDownError(result) {
    if (!result) return false;
    var e = result.error ? String(result.error) : "";
    if (e === "openai_failed" || e === "no_openai" || e === "openai_bad_response") return true;
    return result.status === 503;
  }

  function isRecoverableApiError(result) {
    if (!result || result.ok) return false;
    if (result.error === "session_expired") return false;
    if (isAiDownError(result)) return true;
    var err = result.error ? String(result.error) : "";
    if (err === "validate_failed" || err === "filter_failed") return true;
    var status = result.status || 0;
    return status === 404 || status >= 500;
  }

  function narrativeLengthHint() {
    var len = narrativeText().length;
    if (len >= MIN_NARRATIVE_CHARS) return "";
    return "Add at least " + MIN_NARRATIVE_CHARS + " characters (" + len + "/" + MIN_NARRATIVE_CHARS + ").";
  }

  /** Silent, one-shot check so staff can submit without tapping anything when the
   * AI is down. If AI is up we apply the validation result (auto Check narrative);
   * if it's down/out of quota we unlock Submit with the raw narrative. */
  function scheduleAiDownDetect() {
    if (aiHealthProbeStarted) return;
    if (aiDetectTimer) global.clearTimeout(aiDetectTimer);
    aiDetectTimer = global.setTimeout(function () {
      if (aiHealthProbeStarted) return;
      if (!isTypedMode()) return;
      if (state.aiUnavailable || state.validated || state.filtered || state.validating) return;
      var narrative = narrativeText();
      if (narrative.length < MIN_NARRATIVE_CHARS) return;
      aiHealthProbeStarted = true;
      var context = readFormContext();
      callValidateEdge(narrative, context)
        .then(function (result) {
          if (result && result.ok) {
            applyValidationResult(result);
          } else if (isRecoverableApiError(result)) {
            enterAiDegraded(true);
          }
        })
        .catch(function () {});
    }, 1200);
  }

  /** Typed submit at 80+ chars when AI is down — admin filters before parent release. */
  function enterAiDegraded(fromSilent) {
    var narrative = narrativeText();
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      setStatus("Add more detail to the session narrative first.");
      return;
    }
    state.aiUnavailable = true;
    state.filtered = false;
    state.liveAiUsed = false;
    state.narrativeSnapshot = narrative;
    state.filterPositiveSnapshot = "";
    state.filterRelevantSnapshot = "";
    if (els.positive) els.positive.value = "";
    if (els.relevant) els.relevant.value = "";
    setAiFieldsRequired(false);
    showAiOutput(false);
    state.filtering = false;
    if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
    syncFilterButton();
    syncSubmitGate();
    if (!fromSilent) setStatus(AI_DOWN_SUBMIT_MSG);
    return true;
  }

  /** User-initiated escape hatch: write Positive + Relevant by hand and submit
   * without the AI filter (e.g. AI keeps rejecting). A lead is never blocked. */
  function enableManualEntry() {
    var narrative = narrativeText();
    if (narrative.length < MIN_NARRATIVE_CHARS) {
      var msg = "Write the session narrative first (Reception, Session, Handover — at least " + MIN_NARRATIVE_CHARS + " characters), then you can enter Session Feedback and Notes manually.";
      setStatus(msg);
      try { global.alert(msg); } catch (_e) {}
      syncSubmitGate();
      return false;
    }
    state.manualMode = true;
    state.aiUnavailable = false;
    state.filtered = false;
    state.liveAiUsed = false;
    state.narrativeSnapshot = narrative;
    setAiFieldsRequired(false);
    showAiOutput(true);
    if (els.filterBtn) els.filterBtn.textContent = "Filter with AI";
    state.filtering = false;
    syncFilterButton();
    setStatus(MANUAL_ENTRY_HINT);
    syncSubmitGate();
    if (els.positive && !clean(els.positive.value)) {
      try { els.positive.focus(); } catch (_e) {}
    }
    return true;
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
    if (state.adminFilters) {
      els.modeNote.textContent =
        state.inputMode === "voice"
          ? "Voice: tap the mic and speak the session (Reception · Session · Handover). It's transcribed to English. Review, then Submit — the office prepares the family summary."
          : "Written: type the session (Reception · Session · Handover) in English, then Submit. The office prepares the family summary.";
      return;
    }
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
    var len = narrativeText().length;
    var hint = global.document.getElementById("fbSubmitHint");
    if (state.adminFilters) {
      els.submitBtn.disabled = len < MIN_NARRATIVE_CHARS;
      if (hint) {
        hint.textContent = len < MIN_NARRATIVE_CHARS
          ? narrativeLengthHint()
          : "Write the session narrative, then Submit.";
      }
      return;
    }
    if (state.aiUnavailable) {
      els.submitBtn.disabled = len < MIN_NARRATIVE_CHARS;
      if (hint) {
        hint.textContent =
          len < MIN_NARRATIVE_CHARS ? narrativeLengthHint() : AI_DOWN_SUBMIT_MSG;
      }
      return;
    }
    if (state.manualMode) {
      var mPos = clean(els.positive && els.positive.value);
      var mRel = clean(els.relevant && els.relevant.value);
      // Unified flow: Relevant AI box is unused; optional Notes are separate.
      els.submitBtn.disabled =
        len < MIN_NARRATIVE_CHARS || !mPos || (!state.unifiedParentFeedback && !mRel);
      if (hint) {
        if (len < MIN_NARRATIVE_CHARS) hint.textContent = narrativeLengthHint();
        else if (!mPos || (!state.unifiedParentFeedback && !mRel)) hint.textContent = MANUAL_ENTRY_HINT;
        else hint.textContent = "Ready to submit (entered manually — no AI filter).";
      }
      return;
    }
    var needsValidate =
      validationRequired() &&
      (!state.validated || narrativeText() !== state.validationSnapshot);
    els.submitBtn.disabled = !state.filtered || !state.liveAiUsed || needsValidate;
    if (hint) {
      if (len < MIN_NARRATIVE_CHARS) {
        hint.textContent = narrativeLengthHint();
      } else if (needsValidate) {
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
    state.aiUnavailable = false;
    state.unifiedParentFeedback = false;
    state.narrativeSnapshot = "";
    state.filterPositiveSnapshot = "";
    state.filterRelevantSnapshot = "";
    state.manualMode = false;
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
    aiHealthProbeStarted = false;
    if (aiDetectTimer) {
      global.clearTimeout(aiDetectTimer);
      aiDetectTimer = null;
    }
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
    // Advisory check: running it counts as validated. A flagged section is
    // guidance (shown in the checklist), not a hard block — never wall a submit.
    state.validated = !!result;
    state.validationSnapshot = narrativeText();
    state.counts.validate += 1;
    renderValidationChecklist(result);
    syncValidateButton();
    syncFilterButton();
    syncSubmitGate();
    if (result && result.all_complete) {
      setStatus("All three sections covered — tap Filter with AI when ready.");
    } else {
      setStatus("Highlighted sections could use more detail — you can still Filter with AI and submit.");
    }
  }

  function applyFilterResult(positive, relevant, liveAi, unified) {
    var ctx = readFormContext();
    var participantName = ctx.participant_name || "";
    if (global.PortalParticipantFeedbackName && participantName) {
      positive = global.PortalParticipantFeedbackName.enforceParticipantFirstNameInText(
        positive,
        participantName,
      );
      if (relevant && !unified) {
        relevant = global.PortalParticipantFeedbackName.enforceParticipantFirstNameInText(
          relevant,
          participantName,
        );
      }
    }
    if (els.positive) els.positive.value = positive;
    // From 7 Jul 2026: one parent-facing text. Optional Notes are staff-typed
    // (sessionNotes → relevant_information on submit), not AI-invented.
    if (els.relevant) {
      if (unified) {
        els.relevant.value = "";
      } else {
        els.relevant.value = /^none$/i.test(clean(relevant)) ? "" : relevant;
      }
    }
    state.filtered = true;
    state.liveAiUsed = !!liveAi;
    state.unifiedParentFeedback = !!unified;
    if (liveAi) state.aiUnavailable = false;
    state.narrativeSnapshot = narrativeText();
    state.filterPositiveSnapshot = positive;
    state.filterRelevantSnapshot = unified ? "" : clean(relevant);
    state.counts.filter += 1;
    setAiFieldsRequired(true);
    if (unified && els.relevant) els.relevant.removeAttribute("required");
    showAiOutput(true);
    syncSubmitGate();
    if (liveAi) {
      setStatus(
        unified
          ? "Filtered — one parent message ready. Edit if needed, then Submit. Optional Notes stay in the Notes field."
          : "Filtered — edit Positive or Relevant if needed, then Submit.",
      );
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
      unified_parent_feedback: !!body.unified_parent_feedback,
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
      if (isRecoverableApiError(result)) {
        enterAiDegraded(false);
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
          global.alert("Typed feedback: tap Check narrative once before Filter with AI.");
        }
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
        if (!opts.silent) {
          global.alert("Your session expired. Sign in again, then Filter with AI.");
        }
        return;
      }
      if (isRecoverableApiError(result)) {
        enterAiDegraded(opts.silent);
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

    applyFilterResult(
      result.positive_feedback,
      result.relevant_information,
      true,
      !!result.unified_parent_feedback,
    );

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
    if (state.aiUnavailable) {
      state.narrativeSnapshot = narrativeText();
      syncSubmitGate();
      return;
    }
    if (state.manualMode) {
      state.narrativeSnapshot = narrativeText();
      syncSubmitGate();
      return;
    }
    if (!state.filtered && !state.validated) {
      scheduleAiDownDetect();
      syncSubmitGate();
      return;
    }
    var narrative = narrativeText();
    if (state.filtered && narrative !== state.narrativeSnapshot) {
      resetFilteredState();
      resetValidatedState();
      setStatus("Narrative changed — check and filter again.");
    } else if (!state.filtered && state.validated && narrative !== state.validationSnapshot) {
      resetValidatedState();
      setStatus("Narrative changed — check again.");
    }
    syncSubmitGate();
  }

  function getSubmitAuditMeta() {
    var positive = clean(els.positive && els.positive.value);
    var relevant = clean(els.relevant && els.relevant.value);
    return {
      input_mode: state.inputMode,
      admin_filters: !!state.adminFilters,
      ai_unavailable: !!state.aiUnavailable,
      unified_parent_feedback: !!state.unifiedParentFeedback,
      // In admin-filters mode the parent-facing text is prepared later by the
      // office, so submit stores the raw narrative only (positive/relevant cleared).
      ai_filter_pending: !!state.aiUnavailable || !!state.adminFilters,
      manual_entry: !!state.manualMode,
      validate_count: state.counts.validate,
      filter_count: state.counts.filter,
      positive_edited_after_filter:
        state.filtered && positive !== clean(state.filterPositiveSnapshot),
      relevant_edited_after_filter:
        state.filtered &&
        !state.unifiedParentFeedback &&
        relevant !== clean(state.filterRelevantSnapshot),
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
    if (state.adminFilters) {
      // Raw submit: no Check / Filter required from the instructor.
      return true;
    }
    if (state.aiUnavailable) {
      return true;
    }
    if (state.manualMode) {
      var mCtx = readFormContext();
      var mPositive = clean(els.positive && els.positive.value);
      var mRelevant = clean(els.relevant && els.relevant.value);
      if (isDemoTemplateOutput(mPositive, mRelevant, mCtx.participant_name)) {
        global.alert("Positive/Relevant match the training demo — write your own before submitting.");
        return false;
      }
      if (!mPositive) {
        global.alert("Positive feedback is empty — write it yourself, then Submit.");
        return false;
      }
      if (!state.unifiedParentFeedback && !mRelevant) {
        global.alert("Relevant information is empty — write it (or 'None'), then Submit.");
        return false;
      }
      return true;
    }
    if (validationRequired()) {
      if (!state.validated || narrative !== state.validationSnapshot) {
        global.alert("Tap Check narrative once (Reception, Session, Handover) before submitting.");
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
    if (!state.unifiedParentFeedback && !relevant) {
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

  function hideEl(el) {
    if (el) {
      el.hidden = true;
      el.style.display = "none";
    }
  }

  function showEl(el, display) {
    if (el) {
      el.hidden = false;
      el.style.display = display || "";
    }
  }

  function setVoiceBarVisible(on) {
    // The voice module wraps the narrative textarea and inserts a mic bar.
    var bar = global.document.querySelector(".portal-fb-voice-bar");
    if (bar) bar.style.display = on ? "" : "none";
  }

  function wireInputChoice() {
    var choice = global.document.getElementById("fbInputChoice");
    var field = global.document.getElementById("fbNarrativeField");
    var voiceBtn = global.document.getElementById("fbIoVoice");
    var writtenBtn = global.document.getElementById("fbIoWritten");
    var micHint = global.document.getElementById("fbVoiceMicHint");
    var notesField = global.document.getElementById("fbSessionNotesField");
    if (!choice || !field || !voiceBtn || !writtenBtn) return;
    if (choice.getAttribute("data-fb-io-wired") === "1") {
      /* Already wired — keep chooser visible; do not bind again. */
      showEl(choice);
      return;
    }
    choice.setAttribute("data-fb-io-wired", "1");

    showEl(choice);
    // Hide the narrative (and its mic hint + optional Notes) until the
    // instructor picks voice or written.
    hideEl(field);
    hideEl(micHint);
    hideEl(notesField);
    setVoiceBarVisible(false);

    function mark(btn, on) {
      if (!btn) return;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.style.borderColor = on ? "#2d84b3" : "var(--line,#d9dee5)";
      btn.style.background = on ? "rgba(45,132,179,.08)" : "#fff";
      btn.style.boxShadow = on ? "0 0 0 3px rgba(45,132,179,.12)" : "none";
    }

    function choose(mode) {
      state.inputMode = mode === "voice" ? "voice" : "typed";
      mark(voiceBtn, mode === "voice");
      mark(writtenBtn, mode !== "voice");
      showEl(field);
      // Mic tips only make sense for Voice; Notes (optional) shows for both.
      if (mode === "voice") showEl(micHint);
      else hideEl(micHint);
      showEl(notesField);
      setVoiceBarVisible(mode === "voice");
      syncModeNote();
      syncSubmitGate();
      try {
        if (mode !== "voice" && els.narrative) els.narrative.focus();
      } catch (_e) {}
    }

    voiceBtn.addEventListener("click", function () { choose("voice"); });
    writtenBtn.addEventListener("click", function () { choose("written"); });
  }

  function applyAdminFiltersMode() {
    // Hide everything the instructor no longer needs: the AI check/filter
    // buttons, the manual-entry link, and the Positive/Relevant output boxes.
    if (els.filterBtn) hideEl(els.filterBtn.closest(".fb-filter-row") || els.filterBtn);
    if (els.validateBtn) hideEl(els.validateBtn);
    if (els.aiSection) hideEl(els.aiSection);
    if (els.validatePanel) hideEl(els.validatePanel);
    var manualRow = global.document.querySelector(".fb-manual-entry-row");
    if (manualRow) hideEl(manualRow);
    setAiFieldsRequired(false);
    if (els.modeNote) {
      els.modeNote.textContent =
        "Write the session (Reception · Session · Handover) and submit. The office prepares the family-facing summary.";
    }
    var hint = global.document.getElementById("fbSubmitHint");
    if (hint) hint.textContent = "Write the session narrative, then Submit.";
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

    if (!els.narrative) return;

    state.adminFilters = resolveAdminFiltersFlag();

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

    if (els.filterBtn) {
      els.filterBtn.addEventListener("click", function () {
        filterWithAi();
      });
    }

    els.manualBtn = global.document.getElementById("btnManualFeedbackEntry");
    if (els.manualBtn) {
      els.manualBtn.addEventListener("click", function () {
        enableManualEntry();
      });
    }

    // In manual mode the submit gate depends on the typed Positive/Relevant.
    if (els.positive) {
      els.positive.addEventListener("input", function () {
        if (state.manualMode) syncSubmitGate();
      });
    }
    if (els.relevant) {
      els.relevant.addEventListener("input", function () {
        if (state.manualMode) syncSubmitGate();
      });
    }

    if (!global.__portalFeedbackVoiceDoneBound) {
      global.__portalFeedbackVoiceDoneBound = true;
      global.addEventListener("portal:feedback-voice-transcript-done", function () {
        onVoiceTranscriptDone();
      });
    }

    wireFormListeners(cfg.getForm());
    state.contextKey = buildContextKey();
    setAiFieldsRequired(false);
    /* Always offer Voice vs Written before the narrative box (before other UI sync). */
    wireInputChoice();
    syncModeNote();
    syncValidateButton();
    syncFilterButton();
    syncSubmitGate();
    if (state.adminFilters) applyAdminFiltersMode();
  }

  global.PortalFeedbackNarrative = {
    configure: configure,
    init: init,
    reset: reset,
    isFiltered: isFiltered,
    validateBeforeSubmit: validateBeforeSubmit,
    validateNarrative: validateNarrative,
    filterWithAi: filterWithAi,
    enableManualEntry: enableManualEntry,
    syncSubmitGate: syncSubmitGate,
    onSessionContextChange: onSessionContextChange,
    getSessionNarrativeForSubmit: getSessionNarrativeForSubmit,
    getSubmitAuditMeta: getSubmitAuditMeta,
    participantGender: participantGender,
    isDemoTemplateOutput: isDemoTemplateOutput,
  };
})(typeof window !== "undefined" ? window : globalThis);
