/**
 * Family portal — client registration form in update mode (?from=portal&contact_id=…).
 */
(function (global) {
  "use strict";

  var SESSION_KEY = "clubsens_parent_portal_session_v1";

  function qs() {
    try {
      return new URLSearchParams(global.location.search || "");
    } catch (_e) {
      return new URLSearchParams();
    }
  }

  function readSession() {
    try {
      var raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || !j.token) return null;
      return j;
    } catch (_e) {
      return null;
    }
  }

  function supabaseUrl() {
    return String(global.SUPABASE_URL || "").replace(/\/$/, "");
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || "");
  }

  function fn(name) {
    return supabaseUrl() + "/functions/v1/" + name;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setVal(form, name, value) {
    if (value == null || value === "") return;
    var el = form.elements[name];
    if (!el) return;
    if (el.type === "radio" || el.type === "checkbox") return;
    el.value = String(value);
  }

  function setRadio(form, name, value) {
    if (!value) return;
    form.querySelectorAll('[name="' + name + '"]').forEach(function (el) {
      el.checked = String(el.value) === String(value);
      if (el.checked) el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function setChecks(form, name, value) {
    if (!value) return;
    var parts = String(value)
      .split(";")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    if (!parts.length) return;
    form.querySelectorAll('[name="' + name + '"]').forEach(function (el) {
      el.checked = parts.indexOf(String(el.value)) >= 0;
    });
  }

  function applyAnswers(form, answers) {
    answers = answers || {};
    setVal(form, "parent_name", answers.parent_name);
    setRadio(form, "relationship", answers.relationship);
    setVal(form, "parent_phone", answers.parent_phone);
    setVal(form, "parent_email", answers.parent_email);
    setVal(form, "parent_address", answers.parent_address);
    setVal(form, "parent_postcode", answers.parent_postcode);
    setVal(form, "participant_name", answers.participant_name);
    setVal(form, "participant_dob", answers.participant_dob);
    setVal(form, "participant_gender", answers.participant_gender);
    setVal(form, "participant_school", answers.participant_school);
    setRadio(form, "ehcp", answers.ehcp);
    setVal(form, "ehcp_details", answers.ehcp_details);
    setRadio(form, "social_worker", answers.social_worker);
    setVal(form, "social_worker_contact", answers.social_worker_contact);
    setVal(form, "motivators", answers.motivators);
    setVal(form, "dislikes", answers.dislikes);
    setVal(form, "medication", answers.medication);
    setVal(form, "allergies", answers.allergies);
    setVal(form, "medical_conditions", answers.medical_conditions);
    setRadio(form, "health_plan", answers.health_plan);
    setVal(form, "health_plan_details", answers.health_plan_details);
    setChecks(form, "triggers", answers.triggers);
    setChecks(form, "strategies", answers.strategies);
    setVal(form, "behaviour_notes", answers.behaviour_notes);
    setRadio(form, "support_regulated", answers.support_regulated);
    setRadio(form, "support_dysregulated", answers.support_dysregulated);
    setChecks(form, "expressive_comm", answers.expressive_comm);
    setRadio(form, "understand_instructions", answers.understand_instructions);
    setVal(form, "comm_strategies", answers.comm_strategies);
    setRadio(form, "mobility", answers.mobility);
    setRadio(form, "personal_care", answers.personal_care);
    setRadio(form, "task_engagement", answers.task_engagement);
    setRadio(form, "transitions", answers.transitions);
    setRadio(form, "risk_awareness", answers.risk_awareness);
    setVal(form, "anything_else", answers.anything_else);
  }

  function collectFullPayload(form, helpers) {
    helpers = helpers || {};
    var val = helpers.val || function () {
      return "";
    };
    var radio = helpers.radio || function () {
      return "";
    };
    var checks = helpers.checks || function () {
      return "";
    };
    return {
      parent_name: val("parent_name"),
      parent_phone: val("parent_phone"),
      parent_email: val("parent_email"),
      parent_address: val("parent_address"),
      parent_postcode: val("parent_postcode"),
      participant_name: val("participant_name"),
      participant_dob: val("participant_dob"),
      relationship: radio("relationship"),
      participant_gender: val("participant_gender"),
      participant_school: val("participant_school"),
      ehcp: radio("ehcp"),
      ehcp_details: val("ehcp_details"),
      social_worker: radio("social_worker"),
      social_worker_contact: val("social_worker_contact"),
      motivators: val("motivators"),
      dislikes: val("dislikes"),
      medication: val("medication"),
      allergies: val("allergies"),
      medical_conditions: val("medical_conditions"),
      health_plan: radio("health_plan"),
      health_plan_details: val("health_plan_details"),
      triggers: checks("triggers"),
      strategies: checks("strategies"),
      behaviour_notes: val("behaviour_notes"),
      support_regulated: radio("support_regulated"),
      support_dysregulated: radio("support_dysregulated"),
      expressive_comm: checks("expressive_comm"),
      understand_instructions: radio("understand_instructions"),
      comm_strategies: val("comm_strategies"),
      mobility: radio("mobility"),
      personal_care: radio("personal_care"),
      task_engagement: radio("task_engagement"),
      transitions: radio("transitions"),
      risk_awareness: radio("risk_awareness"),
      anything_else: val("anything_else"),
      portal_update: "1",
    };
  }

  function savePortalRegistration(contactId, sessionToken, answers, participantDob) {
    return fetch(fn("parent-portal-registration-save"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": sessionToken,
      },
      body: JSON.stringify({
        contact_id: contactId,
        answers: answers,
        participant_dob: participantDob || null,
      }),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok || !j.ok) throw new Error("portal_save_failed");
        return j;
      });
    });
  }

  function initPortalRegistrationMode(form, helpers) {
    var params = qs();
    var fromPortal = params.get("from") === "portal" || !!params.get("contact_id");
    if (!fromPortal) return Promise.resolve(null);

    var contactId = params.get("contact_id") || params.get("contact") || "";
    var returnUrl = params.get("return") || "/parent/app";
    var session = readSession();
    if (!contactId || !session || !session.token) {
      return Promise.resolve(null);
    }

    var bar = document.getElementById("portalRegBar");
    var title = document.querySelector(".title-block h1");
    var subtitle = document.querySelector(".title-block p");
    var notice = document.getElementById("formNotice");
    var submitBtn = document.getElementById("submitBtn");
    var photoInput = document.getElementById("participant_photo");

    if (bar) {
      bar.hidden = false;
      bar.innerHTML =
        '<a class="portal-reg-back" href="' +
        esc(returnUrl) +
        '">← Back to family portal</a>';
    }
    if (title) title.textContent = "Update registration information";
    if (subtitle) {
      subtitle.textContent =
        "Review and update the full registration questionnaire. Changes are shared with instructors and admin.";
    }
    if (notice) {
      notice.innerHTML =
        "Update any answers that have changed. All sections are required unless noted. Submit to save — a PDF copy is kept on your device.";
    }
    if (submitBtn) submitBtn.textContent = "Save updates";

    global.__portalRegistrationMode = {
      contactId: contactId,
      returnUrl: returnUrl,
      sessionToken: session.token,
      collectPayload: function () {
        return collectFullPayload(form, helpers);
      },
      afterSubmitSuccess: function () {
        var answers = collectFullPayload(form, helpers);
        return savePortalRegistration(
          contactId,
          session.token,
          answers,
          helpers.val ? helpers.val("participant_dob") : "",
        ).then(function () {
          if (returnUrl) global.location.href = returnUrl;
        });
      },
    };

    return fetch(fn("parent-portal-registration-load"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": session.token,
      },
      body: JSON.stringify({ contact_id: contactId }),
    })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || !j.ok) throw new Error("load_failed");
          applyAnswers(form, j.answers || {});
          if (j.participant && j.participant.has_photo && photoInput) {
            photoInput.removeAttribute("required");
            var photoField = photoInput.closest(".field");
            if (photoField) {
              var hint = photoField.querySelector(".hint");
              if (hint) {
                hint.textContent =
                  "Optional — photo on file. Upload only if you want to replace it.";
              }
            }
          }
        });
      })
      .catch(function () {
        if (notice) {
          notice.innerHTML =
            "Could not load your saved answers — you can still complete the form and submit.";
        }
      });
  }

  global.ParentRegistrationPortal = {
    initPortalRegistrationMode: initPortalRegistrationMode,
    collectFullPayload: collectFullPayload,
  };
})(typeof window !== "undefined" ? window : globalThis);
