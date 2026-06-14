/**
 * Job application — column order matches Staff Matrix / Make export.
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

  function isYes(value) {
    return /^yes$/i.test(String(value || "").trim());
  }

  function rtwBlock() {
    return global.document && global.document.getElementById("jobRtwSection");
  }

  function criminalInfoBlock() {
    return global.document && global.document.getElementById("jobCriminalInfoWrap");
  }

  global.portalJobFormSyncConditionalFields = function portalJobFormSyncConditionalFields() {
    var form = global.document && global.document.getElementById("jobForm");
    var rtw = rtwBlock();
    var crim = criminalInfoBlock();
    if (!form) return;

    var natEl = form.elements.namedItem("nationality");
    var nat = natEl && "value" in natEl ? String(natEl.value || "").trim() : "";
    var showRtw = nat && !global.portalJobFormIsBritishNationality(nat);
    if (rtw) {
      rtw.hidden = !showRtw;
      rtw.setAttribute("aria-hidden", showRtw ? "false" : "true");
      ["rtwork", "rtwork_code"].forEach(function (name) {
        var el = form.elements.namedItem(name);
        if (!el) return;
        if (!showRtw && "value" in el) el.value = "";
        if ("required" in el) el.required = showRtw;
      });
    }

    var crEl = form.elements.namedItem("criminal_record");
    var showCrim = crEl && "value" in crEl && isYes(crEl.value);
    if (crim) {
      crim.hidden = !showCrim;
      crim.setAttribute("aria-hidden", showCrim ? "false" : "true");
      var info = form.elements.namedItem("criminal_record_info");
      if (info) {
        if (!showCrim && "value" in info) info.value = "";
        if ("required" in info) info.required = showCrim;
      }
    }
  };

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
    if (!p.phone && p.mobile) p.phone = p.mobile;
    if (!p.rtwork && p.right_to_work) p.rtwork = p.right_to_work;
    if (!p.rtwork_code && p.right_to_work_share_code) p.rtwork_code = p.right_to_work_share_code;
    if (!p.bank_account && p.bank_account_name) p.bank_account = p.bank_account_name;
    if (!p.sort_code && p.bank_sort_code) p.sort_code = p.bank_sort_code;
    if (!p.account_number && p.bank_account_number) p.account_number = p.bank_account_number;
    return p;
  }

  global.portalJobFormPrefillFromProfile = function portalJobFormPrefillFromProfile(form) {
    if (!form) return;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var prof = box.staff_profile || {};
      function setIfEmpty(name, val) {
        var el = form.elements.namedItem(name);
        if (!el || !("value" in el) || String(el.value || "").trim()) return;
        if (val) el.value = String(val);
      }
      var split = splitFullName(prof.full_name || prof.username || "");
      setIfEmpty("name", split.name);
      setIfEmpty("surname", split.surname);
      setIfEmpty("phone", prof.mobile || prof.phone);
      setIfEmpty("nationality", prof.nationality);
      setIfEmpty("role", prof.staff_role || prof.job_title);
    } catch (_) {}
    global.portalJobFormSyncConditionalFields();
  };

  global.portalJobFormFill = function portalJobFormFill(form, payload) {
    if (!form || !payload || typeof payload !== "object") return;
    payload = normalizeLegacyPayload(payload);
    Object.keys(payload).forEach(function (k) {
      if (k === "confirm" || k === "_portal") return;
      var el = form.elements.namedItem(k);
      if (!el) return;
      if (el instanceof RadioNodeList) {
        var val = String(payload[k] || "");
        for (var i = 0; i < el.length; i++) {
          if (el[i].value === val) el[i].checked = true;
        }
        return;
      }
      if ("value" in el) el.value = payload[k] || "";
      if (el.type === "checkbox" && "checked" in el) {
        el.checked = payload[k] === true || payload[k] === "true" || payload[k] === "on";
      }
    });
    global.portalJobFormSyncConditionalFields();
  };

  global.portalJobFormReadPayload = function portalJobFormReadPayload(form) {
    var fd = new FormData(form);
    var out = {};
    fd.forEach(function (v, k) {
      if (k === "confirm") return;
      out[k] = String(v || "").trim();
    });
    if (global.portalJobFormIsBritishNationality(out.nationality)) {
      delete out.rtwork;
      delete out.rtwork_code;
    }
    if (!isYes(out.criminal_record)) {
      delete out.criminal_record_info;
    }
    return out;
  };

  global.portalJobFormValidate = function portalJobFormValidate(form, opts) {
    opts = opts || {};
    var payload = global.portalJobFormReadPayload(form);
    if (!String(payload.name || "").trim()) return "Please enter your name.";
    if (!String(payload.surname || "").trim()) return "Please enter your surname.";
    if (!String(payload.nationality || "").trim()) return "Please enter your nationality.";
    if (
      !global.portalJobFormIsBritishNationality(payload.nationality) &&
      !String(payload.rtwork || "").trim()
    ) {
      return "Please add your right to work details.";
    }
    if (isYes(payload.criminal_record) && !String(payload.criminal_record_info || "").trim()) {
      return "Please provide criminal record details.";
    }
    if (opts.submit) {
      var confirmEl = form.elements.namedItem("confirm");
      if (confirmEl && "checked" in confirmEl && !confirmEl.checked) {
        return "Please confirm the information is accurate.";
      }
    }
    return "";
  };

  global.portalJobFormBind = function portalJobFormBind(form) {
    if (!form || form.__portalJobFormBound) return;
    form.__portalJobFormBound = true;
    var natEl = form.elements.namedItem("nationality");
    if (natEl) {
      natEl.addEventListener("input", global.portalJobFormSyncConditionalFields);
      natEl.addEventListener("change", global.portalJobFormSyncConditionalFields);
    }
    var crEl = form.elements.namedItem("criminal_record");
    if (crEl) crEl.addEventListener("change", global.portalJobFormSyncConditionalFields);
    global.portalJobFormSyncConditionalFields();
  };
})(typeof window !== "undefined" ? window : globalThis);
