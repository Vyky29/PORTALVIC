/**
 * Health questionnaire — yes/no pairs + three confirmations (Staff Matrix / Make).
 */
(function (global) {
  "use strict";

  var YES_NO_PAIRS = [
    { q: "medical_conditions", info: "medical_condition_info" },
    { q: "medication", info: "medication_info" },
    { q: "allergies", info: "allergies_info" },
    { q: "mental_health", info: "mental_health_info" },
    { q: "musculoskeletal", info: "musculoskeletal_info" },
    { q: "respiratory", info: "respiratory_info" },
    { q: "hearing_impairments", info: "hearing_impairments_info" },
    { q: "communicable_diseases", info: "communicable_diseases_info" },
    { q: "surgeries_or_hospital_admissions", info: "hospital_admissions_info" },
    { q: "require_workplace_adjustments", info: "adjustments_info" },
  ];

  function isYes(value) {
    return /^yes$/i.test(String(value || "").trim());
  }

  function splitFullName(full) {
    var parts = String(full || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return { name: "", surname: "" };
    if (parts.length === 1) return { name: parts[0], surname: "" };
    return { name: parts[0], surname: parts.slice(1).join(" ") };
  }

  function normalizeLegacyPayload(payload) {
    if (!payload || typeof payload !== "object") return payload;
    var p = Object.assign({}, payload);
    if (!p.name && !p.surname && p.full_name) {
      var split = splitFullName(p.full_name);
      p.name = split.name;
      p.surname = split.surname;
    }
    if (p.gp_details && !p.medical_condition_info) {
      /* legacy stub — keep as extra if present */
    }
    return p;
  }

  global.portalHealthFormSyncConditionalFields = function portalHealthFormSyncConditionalFields() {
    var form = global.document && global.document.getElementById("healthForm");
    if (!form) return;
    YES_NO_PAIRS.forEach(function (pair) {
      var qEl = form.elements.namedItem(pair.q);
      var show = qEl && "value" in qEl && isYes(qEl.value);
      var wrap = global.document.getElementById("healthInfo_" + pair.info);
      var infoEl = form.elements.namedItem(pair.info);
      if (wrap) {
        wrap.hidden = !show;
        wrap.setAttribute("aria-hidden", show ? "false" : "true");
      }
      if (infoEl) {
        if (!show && "value" in infoEl) infoEl.value = "";
        if ("required" in infoEl) infoEl.required = show;
      }
    });
  };

  global.portalHealthFormPrefillFromProfile = function portalHealthFormPrefillFromProfile(form) {
    if (!form) return;
    try {
      var prof = (global.__PORTAL_SUPABASE__ || {}).staff_profile || {};
      function setIfEmpty(name, val) {
        var el = form.elements.namedItem(name);
        if (!el || !("value" in el) || String(el.value || "").trim()) return;
        if (val) el.value = String(val);
      }
      var split = splitFullName(prof.full_name || prof.username || "");
      setIfEmpty("name", split.name);
      setIfEmpty("surname", split.surname);
      setIfEmpty("role", prof.staff_role || prof.job_title);
    } catch (_) {}
    global.portalHealthFormSyncConditionalFields();
  };

  global.portalHealthFormFill = function portalHealthFormFill(form, payload) {
    if (!form || !payload || typeof payload !== "object") return;
    payload = normalizeLegacyPayload(payload);
    Object.keys(payload).forEach(function (k) {
      if (k.indexOf("confirmation_") === 0 || k === "_portal") return;
      var el = form.elements.namedItem(k);
      if (!el) return;
      if (el.type === "checkbox" && "checked" in el) {
        el.checked =
          payload[k] === true || payload[k] === "true" || payload[k] === "on" || payload[k] === "yes";
        return;
      }
      if ("value" in el) el.value = payload[k] || "";
    });
    ["confirmation_1", "confirmation_2", "confirmation_3"].forEach(function (k) {
      var el = form.elements.namedItem(k);
      if (el && el.type === "checkbox" && "checked" in el) {
        el.checked =
          payload[k] === true || payload[k] === "true" || payload[k] === "on" || payload[k] === "yes";
      }
    });
    global.portalHealthFormSyncConditionalFields();
  };

  global.portalHealthFormReadPayload = function portalHealthFormReadPayload(form) {
    var fd = new FormData(form);
    var out = {};
    fd.forEach(function (v, k) {
      if (k.indexOf("confirmation_") === 0) return;
      out[k] = String(v || "").trim();
    });
    ["confirmation_1", "confirmation_2", "confirmation_3"].forEach(function (k) {
      var el = form.elements.namedItem(k);
      out[k] = el && el.type === "checkbox" && el.checked ? "yes" : "";
    });
    YES_NO_PAIRS.forEach(function (pair) {
      if (!isYes(out[pair.q])) delete out[pair.info];
    });
    return out;
  };

  global.portalHealthFormValidate = function portalHealthFormValidate(form, opts) {
    opts = opts || {};
    var payload = global.portalHealthFormReadPayload(form);
    if (!String(payload.name || "").trim()) return "Please enter your name.";
    if (!String(payload.surname || "").trim()) return "Please enter your surname.";
    if (!String(payload.dob || "").trim()) return "Please enter your date of birth.";
    var i;
    for (i = 0; i < YES_NO_PAIRS.length; i++) {
      var pair = YES_NO_PAIRS[i];
      if (!String(payload[pair.q] || "").trim()) {
        return "Please answer all health questions (Yes or No).";
      }
      if (isYes(payload[pair.q]) && !String(payload[pair.info] || "").trim()) {
        return "Please provide details where you answered Yes.";
      }
    }
    if (opts.submit) {
      if (payload.confirmation_1 !== "yes" || payload.confirmation_2 !== "yes" || payload.confirmation_3 !== "yes") {
        return "Please confirm all three declarations before submitting.";
      }
    }
    return "";
  };

  global.portalHealthFormBind = function portalHealthFormBind(form) {
    if (!form || form.__portalHealthFormBound) return;
    form.__portalHealthFormBound = true;
    YES_NO_PAIRS.forEach(function (pair) {
      var qEl = form.elements.namedItem(pair.q);
      if (qEl) qEl.addEventListener("change", global.portalHealthFormSyncConditionalFields);
    });
    global.portalHealthFormSyncConditionalFields();
  };
})(typeof window !== "undefined" ? window : globalThis);
