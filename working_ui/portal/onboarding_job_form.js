/**
 * Job application form — field order matches Staff Matrix / club onboarding:
 * personal details → nationality → right to work (non-British only) → bank (last).
 */
(function (global) {
  "use strict";

  function normNat(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  global.portalJobFormIsBritishNationality = function portalJobFormIsBritishNationality(nat) {
    var n = normNat(nat);
    if (!n) return false;
    return (
      /^(uk|u\.k\.|united kingdom|british|britain|great britain|english|england|scottish|scotland|welsh|wales|northern ireland)$/.test(
        n
      ) ||
      n.indexOf("british") >= 0 ||
      n.indexOf("united kingdom") >= 0
    );
  };

  function rtwBlock() {
    return global.document && global.document.getElementById("jobRtwSection");
  }

  global.portalJobFormSyncRightToWorkVisibility = function portalJobFormSyncRightToWorkVisibility() {
    var form = global.document && global.document.getElementById("jobForm");
    var block = rtwBlock();
    if (!form || !block) return;
    var natEl = form.elements.namedItem("nationality");
    var nat = natEl && "value" in natEl ? String(natEl.value || "").trim() : "";
    var show = nat && !global.portalJobFormIsBritishNationality(nat);
    block.hidden = !show;
    block.setAttribute("aria-hidden", show ? "false" : "true");
    if (!show) {
      ["right_to_work", "right_to_work_share_code"].forEach(function (name) {
        var el = form.elements.namedItem(name);
        if (el && "value" in el) el.value = "";
        if (el && "required" in el) el.required = false;
      });
    } else {
      var rtw = form.elements.namedItem("right_to_work");
      if (rtw && "required" in rtw) rtw.required = true;
    }
  };

  global.portalJobFormPrefillFromProfile = function portalJobFormPrefillFromProfile(form) {
    if (!form) return;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var prof = box.staff_profile || {};
      var session = box.session || {};
      var user = session.user || {};
      function setIfEmpty(name, val) {
        var el = form.elements.namedItem(name);
        if (!el || !("value" in el) || String(el.value || "").trim()) return;
        if (val) el.value = String(val);
      }
      setIfEmpty("full_name", prof.full_name || prof.username);
      setIfEmpty("email", user.email);
      setIfEmpty("nationality", prof.nationality);
    } catch (_) {}
    global.portalJobFormSyncRightToWorkVisibility();
  };

  global.portalJobFormFill = function portalJobFormFill(form, payload) {
    if (!form || !payload || typeof payload !== "object") return;
    if (payload.right_to_work_details && !payload.right_to_work) {
      payload.right_to_work = payload.right_to_work_details;
    }
    Object.keys(payload).forEach(function (k) {
      if (k === "confirm" || k === "_portal") return;
      var el = form.elements.namedItem(k);
      if (el && "value" in el) el.value = payload[k] || "";
    });
    global.portalJobFormSyncRightToWorkVisibility();
  };

  global.portalJobFormReadPayload = function portalJobFormReadPayload(form) {
    var fd = new FormData(form);
    var out = {};
    fd.forEach(function (v, k) {
      if (k === "confirm") return;
      out[k] = String(v || "").trim();
    });
    if (global.portalJobFormIsBritishNationality(out.nationality)) {
      delete out.right_to_work;
      delete out.right_to_work_share_code;
    }
    return out;
  };

  global.portalJobFormValidate = function portalJobFormValidate(form) {
    var payload = global.portalJobFormReadPayload(form);
    if (!String(payload.nationality || "").trim()) {
      return "Please enter your nationality.";
    }
    if (
      !global.portalJobFormIsBritishNationality(payload.nationality) &&
      !String(payload.right_to_work || "").trim()
    ) {
      return "Please add your right to work details (share code, visa, or passport).";
    }
    return "";
  };

  global.portalJobFormBind = function portalJobFormBind(form) {
    if (!form || form.__portalJobFormBound) return;
    form.__portalJobFormBound = true;
    var natEl = form.elements.namedItem("nationality");
    if (natEl) {
      natEl.addEventListener("input", global.portalJobFormSyncRightToWorkVisibility);
      natEl.addEventListener("change", global.portalJobFormSyncRightToWorkVisibility);
    }
    global.portalJobFormSyncRightToWorkVisibility();
  };
})(typeof window !== "undefined" ? window : globalThis);
