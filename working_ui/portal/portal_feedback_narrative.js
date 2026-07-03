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

  /** Offline preview only — uses participant name; live filter uses OpenAI. */
  function buildPreviewFilter(participantName, gender, narrative) {
    var first = participantFirstName(participantName);
    var g = normGenderValue(gender);
    var subj = g === "m" ? "He" : g === "f" ? "She" : first;
    var pos = g === "m" ? "his" : g === "f" ? "her" : first + "'s";
    var snippet = clean(narrative).slice(0, 220);
    return {
      positive:
        first +
        " had a good session today. " +
        subj +
        " took part in the activities described in your narrative" +
        (snippet ? " (" + snippet.replace(/\s+/g, " ") + "…)" : "") +
        ". " +
        subj +
        " finished with a calm handover to " +
        pos +
        " family.",
      relevant:
        "Session notes from staff narrative for " +
        first +
        ". " +
        (snippet
          ? "Key points: " + snippet.replace(/\s+/g, " ") + "…"
          : "Review the full narrative on file.") +
        " Sign in on the portal for live AI filtering.",
    };
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
    try {
      var notes = global.clientNotesById;
      if (notes && typeof notes === "object") {
        var keys = Object.keys(notes);
        for (var i = 0; i < keys.length; i++) {
          var note = notes[keys[i]];
          if (!note) continue;
          var nm = photoKey(note.name || note.clientName || "");
          if (!nm) continue;
          if (nm === n || nm.split(/\s+/)[0] === first || n.indexOf(nm.split(/\s+/)[0]) === 0) {
            var g2 = normGenderValue(note.gender);
            if (g2) return g2;
          }
        }
      }
    } catch (_2) {}
    return "";
  }

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
        ? "Ready to submit — edit Positive or Relevant if needed."
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
    var participantName = participantEl ? clean(participantEl.value) : "";
    var gender = participantGender(participantName);

    return {
      engagement_rating: engagementRaw,
      client_emotions: emotions,
      independence_level: independence,
      participant_name: participantName,
      participant_gender: gender,
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
      setStatus("Filtered — edit Positive and Relevant if needed, then Submit.");
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

  async function runPreviewFilter(participantName, gender, narrative) {
    await new Promise(function (r) {
      setTimeout(r, 700);
    });
    var preview = buildPreviewFilter(participantName, gender, narrative);
    return {
      ok: true,
      positive_feedback: preview.positive,
      relevant_information: preview.relevant,
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
        result = await runPreviewFilter(
          context.participant_name,
          context.participant_gender,
          narrative,
        );
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
