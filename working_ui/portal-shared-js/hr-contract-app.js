/* Employment contracts ? Portal Vic (admin, same Supabase session) */
(function () {
  "use strict";
  const C = window.ContractCore;
  if (!C) return;

  const STORAGE_KEY = "clubSENsational_hr_contracts";
  const $ = (id) => document.getElementById(id);

  let currentStep = 1;
  let contractKind = "zero_hours";
  let contractReference = "";
  let directorSignatureDataUrl = "";
  let directorPadApi = null;
  let directorPadReady = false;
  const venueHoursStore = {};

  function syncContractTypeFields() {
    const fixed = contractKind === "fixed_term";
    document.querySelectorAll(".zero-hours-field").forEach((el) => el.classList.toggle("hidden", fixed));
    document.querySelectorAll(".fixed-term-field").forEach((el) => el.classList.toggle("hidden", !fixed));
    if ($("scale")) {
      $("scale").required = !fixed;
      syncScaleFromRoles();
    }
    ["termEndDate", "annualSalary", "weeklyHours"].forEach((id) => {
      const el = $(id);
      if (el) el.required = fixed;
    });
  }

  function selectContractType(kind) {
    contractKind = kind === "fixed_term" ? "fixed_term" : "zero_hours";
    document.querySelectorAll("[data-contract-kind]").forEach((card) => {
      const active = card.dataset.contractKind === contractKind;
      card.classList.toggle("active", active);
      card.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (contractKind === "fixed_term") {
      $("scale").value = "";
    }
    syncContractTypeFields();
    contractReference = C.generateReference($("employeeName").value, contractKind);
    updatePreview();
  }

  function bindContractTypeCards() {
    document.querySelectorAll("[data-contract-kind]").forEach((card) => {
      card.addEventListener("click", () => selectContractType(card.dataset.contractKind));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectContractType(card.dataset.contractKind);
        }
      });
    });
  }

  function portalClient() {
    const box = window.__PORTAL_SUPABASE__;
    return box && box.client ? { supabase: box.client, user: box.session && box.session.user } : null;
  }

  function getSelectedVenues() {
    const venues = [];
    document.querySelectorAll("#placeCheckboxes input:checked").forEach((cb) => {
      if (cb.value === "Other") {
        const o = $("otherLocation").value.trim();
        venues.push({ key: "other:" + (o || "__pending__"), name: o || "Other (specify location above)" });
      } else {
        venues.push({ key: cb.value, name: cb.value });
      }
    });
    return venues;
  }

  function getPlaces() {
    return getSelectedVenues()
      .filter((v) => !v.key.startsWith("other:") || v.key !== "other:__pending__")
      .map((v) => v.name);
  }

  function getSelectedRoles() {
    const roles = [];
    document.querySelectorAll("#roleCheckboxes input:checked").forEach((cb) => {
      roles.push(cb.value);
    });
    return roles;
  }

  function formatRoleLabel(roles) {
    return roles.length ? roles.join(" & ") : "";
  }

  function syncScaleFromRoles() {
    if (!$("scale")) return;
    const roles = getSelectedRoles();
    $("scale").disabled = contractKind === "fixed_term" || !roles.length;
    if (contractKind === "fixed_term" || !roles.length) $("scale").value = "";
  }

  function buildRateSummary() {
    const roles = getSelectedRoles();
    const scale = $("scale").value;
    if (!roles.length || !scale) return null;
    const parts = roles
      .map((role) => {
        const rate = C.getDeliveryRate(role, scale);
        return rate != null ? C.GBP + rate + "/h - " + role : null;
      })
      .filter(Boolean);
    if (!parts.length) return null;
    return parts.join("; ") + ". Administrative tasks: " + C.GBP + C.ADMIN_RATE + "/h.";
  }

  function syncVenueHoursFromInputs() {
    document.querySelectorAll("[data-venue-hours]").forEach((inp) => {
      venueHoursStore[inp.dataset.venueKey] = inp.value;
    });
  }

  function renderVenueHoursInputs() {
    const container = $("venueHoursContainer");
    syncVenueHoursFromInputs();
    const venues = getSelectedVenues();
    if (!venues.length) {
      container.classList.add("hidden");
      container.innerHTML = "";
      return;
    }
    container.classList.remove("hidden");
    let html = '<p class="venue-hours-intro">Normal hours of work at each selected venue</p>';
    venues.forEach((v, i) => {
      const val = venueHoursStore[v.key] || "Variable hours";
      venueHoursStore[v.key] = val;
      const id = "venue_hours_" + i;
      const esc = (s) =>
        String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      html +=
        '<div class="venue-hours-row">' +
        '<label for="' + id + '">' + esc(v.name) + "</label>" +
        '<input type="text" id="' + id + '" data-venue-key="' + esc(v.key) + '" data-venue-hours value="' + esc(val) + '" placeholder="e.g. Variable hours">' +
        "</div>";
    });
    container.innerHTML = html;
    container.querySelectorAll("[data-venue-hours]").forEach((inp) => {
      inp.addEventListener("input", () => {
        venueHoursStore[inp.dataset.venueKey] = inp.value;
        updatePreview();
      });
    });
  }

  function getNormalHoursText() {
    const venues = getSelectedVenues().filter((v) => v.key !== "other:__pending__");
    if (!venues.length) return C.EM;
    syncVenueHoursFromInputs();
    return venues
      .map((v) => {
        const hours = (venueHoursStore[v.key] || "Variable hours").trim() || "Variable hours";
        return v.name + ": " + hours;
      })
      .join("\n");
  }

  function getFormPayload() {
    return {
      contractKind,
      contractDate: $("contractDate").value,
      commencementDate: $("commencementDate").value,
      termEndDate: $("termEndDate") ? $("termEndDate").value : "",
      annualSalary: $("annualSalary") ? $("annualSalary").value : "",
      weeklyHours: $("weeklyHours") ? $("weeklyHours").value : "",
      roles: getSelectedRoles(),
      role: formatRoleLabel(getSelectedRoles()),
      scale: contractKind === "fixed_term" ? "" : $("scale").value,
      places: getPlaces(),
      normalHours: getNormalHoursText(),
      directorName: $("directorName").value.trim(),
      hrNotes: $("hrNotes").value.trim()
    };
  }

  function buildTemplateDataForPreview() {
    const places = getPlaces();
    return C.buildTemplateData({
      contractKind,
      contractReference: contractReference || C.generateReference($("employeeName").value, contractKind),
      employeeName: $("employeeName").value.trim(),
      employeeAddress: $("employeeAddress").value.trim(),
      employeeEmail: $("employeeEmail").value.trim(),
      contractDate: $("contractDate").value,
      commencementDate: $("commencementDate").value,
      termEndDate: $("termEndDate") ? $("termEndDate").value : "",
      annualSalary: $("annualSalary") ? $("annualSalary").value : "",
      weeklyHours: $("weeklyHours") ? $("weeklyHours").value : "",
      roles: getSelectedRoles(),
      role: formatRoleLabel(getSelectedRoles()),
      scale: contractKind === "fixed_term" ? "" : $("scale").value,
      placeOfWork: places.length ? places.map((p, i) => i + 1 + ". " + p).join("\n") : C.EM,
      normalHoursOfWork: getNormalHoursText(),
      directorName: $("directorName").value.trim(),
      directorSignatureDataUrl: directorSignatureDataUrl,
      employeePending: true
    });
  }

  function updatePreview() {
    if (!contractReference) contractReference = C.generateReference($("employeeName").value, contractKind);
    $("badgeReference").textContent = "Contract Reference: " + contractReference;
    $("badgeVersion").textContent = "Contract Version: " + C.CONTRACT_VERSION;
    const data = buildTemplateDataForPreview();
    data.CONTRACT_REFERENCE = contractReference;
    const kind = data.CONTRACT_KIND || contractKind;
    $("livePreview").innerHTML = C.renderContractHtml(C.fillTemplate(data, kind), false, {
      directorSignatureDataUrl: directorSignatureDataUrl
    }, kind);
    if (contractKind === "fixed_term") {
      const salary = $("annualSalary") ? $("annualSalary").value : "";
      const hours = $("weeklyHours") ? $("weeklyHours").value : "";
      const msg = salary
        ? "Annual salary: " + C.formatSalary(salary) + " (inclusive of holiday pay). Contracted: " + (hours || C.EM) + " hours/week."
        : "Enter annual salary and weekly hours.";
      $("rateDisplay").textContent = msg;
      $("reviewSummary").textContent = msg;
    } else {
      const rateMsg = buildRateSummary();
      if (rateMsg) {
        $("rateDisplay").textContent = rateMsg;
        $("reviewSummary").textContent = rateMsg;
      } else {
        $("rateDisplay").textContent = "Select at least one role and scale to view hourly rate.";
        $("reviewSummary").textContent = "";
      }
    }
    const canSend = canSendContract();
    $("sendContractBtn").disabled = !canSend;
    const warn = $("sendWarning");
    if (warn) warn.style.display = canSend ? "none" : "block";
  }

  function validateStep(step) {
    let valid = true;
    const show = (id, ok) => {
      const el = $(id);
      if (el) el.classList.toggle("invalid", !ok);
      if (!ok) valid = false;
    };
    if (step === 1) {
      show("fgName", $("employeeName").value.trim().length > 0);
      show("fgAddress", $("employeeAddress").value.trim().length > 0);
      const email = $("employeeEmail").value.trim();
      show("fgEmail", email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    }
    if (step === 2) {
      show("fgContractDate", !!$("contractDate").value);
      show("fgCommencement", !!$("commencementDate").value);
      const roles = getSelectedRoles();
      $("fgRole").classList.toggle("invalid", !roles.length);
      if (!roles.length) valid = false;
      if (contractKind === "fixed_term") {
        show("fgTermEnd", $("termEndDate") && !!$("termEndDate").value);
        show("fgAnnualSalary", $("annualSalary") && !!$("annualSalary").value && Number($("annualSalary").value) > 0);
        show("fgWeeklyHours", $("weeklyHours") && !!$("weeklyHours").value && Number($("weeklyHours").value) > 0);
      } else {
        show("fgScale", !!$("scale").value);
      }
      const places = getPlaces();
      $("fgPlace").classList.toggle("invalid", places.length === 0);
      if (!places.length) valid = false;
      show("fgDirector", $("directorName").value.trim().length > 0);
      $("fgDirectorSignature").classList.toggle("invalid", !directorSignatureDataUrl);
      if (!directorSignatureDataUrl) valid = false;
    }
    return valid;
  }

  function canSendContract() {
    return validateStep(1) && validateStep(2);
  }

  function setStep(step) {
    currentStep = step;
    document.querySelectorAll(".step-panel").forEach((p) => {
      p.classList.toggle("active", parseInt(p.dataset.step, 10) === step);
    });
    document.querySelectorAll(".progress-step").forEach((p) => {
      const n = parseInt(p.dataset.step, 10);
      p.classList.remove("active", "done");
      if (n === step) p.classList.add("active");
      else if (n < step) p.classList.add("done");
    });
    $("btnPrev").disabled = step === 1;
    $("btnNext").style.display = step === 4 ? "none" : "";
    if (step === 2) {
      $("directorSignatureDate").value = C.formatUKDate(new Date().toISOString().slice(0, 10));
      ensureDirectorPad();
    }
    if (step === 4) {
      $("sendSummary").textContent =
        $("employeeName").value.trim() +
        " (" +
        $("employeeEmail").value.trim() +
        ") - " +
        (contractKind === "fixed_term" ? "Fixed term" : "Zero hours") +
        " — " +
        formatRoleLabel(getSelectedRoles()) +
        (contractKind === "fixed_term" ? "" : ", " + $("scale").value);
      $("sendContractBtn").disabled = !canSendContract();
    }
  }

  function ensureDirectorPad() {
    if (directorPadReady) {
      directorPadApi.resize();
      return;
    }
    directorPadApi = C.setupSignaturePad($("directorSignatureCanvas"), { drawing: false }, (url) => {
      directorSignatureDataUrl = url;
      $("fgDirectorSignature").classList.remove("invalid");
      updatePreview();
    });
    directorPadReady = true;
  }

  function clearDirectorSignature() {
    if (directorPadApi) directorPadApi.clear();
    directorSignatureDataUrl = "";
    updatePreview();
  }

  async function sendContractToEmployee() {
    if (!canSendContract()) return;
    const auth = portalClient();
    if (!auth || !auth.user) {
      $("sendError").textContent = "Not signed in. Reload and sign in as admin.";
      $("sendError").style.display = "block";
      return;
    }

    const btn = $("sendContractBtn");
    const errBox = $("sendError");
    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Sending?";

    const templateData = buildTemplateDataForPreview();
    templateData.CONTRACT_REFERENCE = contractReference;

    try {
      const mod = await import("./hr-contract-publish.js?v=20260521-2");
      const result = await mod.portalPublishEmploymentContract(auth.supabase, auth.user.id, {
        contractReference,
        templateData,
        formPayload: getFormPayload(),
        directorSignature: directorSignatureDataUrl,
        employeeEmail: $("employeeEmail").value.trim(),
        employeeName: $("employeeName").value.trim()
      });

      $("sendSuccess").classList.add("visible");
      $("signingUrlInput").value = result.portalSignUrl || "";
      $("sendEmailNote").textContent =
        "Published on the employee Portal dashboard (same as an announcement). They sign at contract_sign; PDF goes to My Documents.";

      saveToLocalStorage({
        contractReference,
        employeeName: $("employeeName").value.trim(),
        employeeEmail: $("employeeEmail").value.trim(),
        roles: getSelectedRoles(),
      role: formatRoleLabel(getSelectedRoles()),
        scale: $("scale").value,
        generatedTimestamp: C.formatDateTime(),
        signedStatus: "Awaiting employee",
        signingUrl: result.portalSignUrl
      });
      renderRecent();
      loadRecentFromSupabase();
    } catch (err) {
      errBox.textContent = err.message || "Could not send contract.";
      errBox.style.display = "block";
    } finally {
      btn.disabled = !canSendContract();
      btn.textContent = "Send contract to employee";
    }
  }

  function copySigningUrl() {
    const input = $("signingUrlInput");
    input.select();
    navigator.clipboard.writeText(input.value).catch(() => document.execCommand("copy"));
    $("copyUrlBtn").textContent = "Copied!";
    setTimeout(() => {
      $("copyUrlBtn").textContent = "Copy link";
    }, 2000);
  }

  function saveToLocalStorage(meta) {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    list.unshift(meta);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)));
  }

  function statusLabel(status) {
    const map = {
      awaiting_employee: "Awaiting employee",
      completed: "Signed",
      expired: "Expired"
    };
    return map[status] || status;
  }

  async function loadRecentFromSupabase() {
    const auth = portalClient();
    if (!auth) return;
    try {
      const mod = await import("./hr-contract-publish.js?v=20260521-2");
      const rows = await mod.portalListEmploymentContracts(auth.supabase);
      const tbody = $("recentBody");
      const noRecent = $("noRecent");
      tbody.innerHTML = "";
      if (!rows.length) {
        noRecent.style.display = "block";
        return;
      }
      noRecent.style.display = "none";
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        const date = row.completed_at || row.sent_at || row.created_at;
        const dateStr = date ? new Date(date).toLocaleString("en-GB") : "?";
        const link =
          row.status === "awaiting_employee"
            ? ' <a href="contract_sign.html?contract_id=' + row.id + '">Staff view</a>'
            : "";
        tr.innerHTML =
          "<td>" +
          row.contract_reference +
          "</td><td>" +
          row.employee_name +
          "</td><td>" +
          row.role +
          "</td><td>" +
          row.scale +
          "</td><td>" +
          dateStr +
          "</td><td>" +
          statusLabel(row.status) +
          link +
          "</td>";
        tbody.appendChild(tr);
      });
    } catch (_) {}
  }

  function renderRecent() {
    loadRecentFromSupabase();
  }

  function bindEvents() {
    bindContractTypeCards();
    syncContractTypeFields();
    document.querySelectorAll("#roleCheckboxes input").forEach((cb) => {
      cb.addEventListener("change", () => {
        syncScaleFromRoles();
        updatePreview();
      });
    });
    $("scale").addEventListener("change", updatePreview);
    ["employeeName", "employeeAddress", "employeeEmail", "contractDate", "commencementDate", "directorName", "termEndDate", "annualSalary", "weeklyHours"].forEach(
      (id) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("input", () => {
          if (id === "employeeName") contractReference = C.generateReference($("employeeName").value, contractKind);
          updatePreview();
        });
      }
    );
    document.querySelectorAll("#placeCheckboxes input").forEach((cb) => {
      cb.addEventListener("change", () => {
        $("otherLocationWrap").classList.toggle("hidden", !$("placeOther").checked);
        renderVenueHoursInputs();
        updatePreview();
      });
    });
    $("otherLocation").addEventListener("input", () => {
      if ($("placeOther").checked) renderVenueHoursInputs();
      updatePreview();
    });
    $("clearDirectorSignature").addEventListener("click", clearDirectorSignature);
    $("btnNext").addEventListener("click", () => {
      if (currentStep < 4) {
        if (currentStep <= 2 && !validateStep(currentStep)) return;
        setStep(currentStep + 1);
      }
    });
    $("btnPrev").addEventListener("click", () => {
      if (currentStep > 1) setStep(currentStep - 1);
    });
    $("sendContractBtn").addEventListener("click", sendContractToEmployee);
    $("copyUrlBtn").addEventListener("click", copySigningUrl);
    $("newContractBtn").addEventListener("click", () => {
      if (document.getElementById("hrContractEmbed") && window.HRContractApp && window.HRContractApp.reset) {
        window.HRContractApp.reset();
      } else {
        location.reload();
      }
    });
    window.addEventListener("resize", () => {
      if (directorPadReady && directorPadApi) directorPadApi.resize();
    });
  }

  function reset() {
    contractKind = "zero_hours";
    directorSignatureDataUrl = "";
    directorPadReady = false;
    directorPadApi = null;
    Object.keys(venueHoursStore).forEach((k) => delete venueHoursStore[k]);
    const form = $("contractForm");
    if (form) form.reset();
    selectContractType("zero_hours");
    const sendOk = $("sendSuccess");
    if (sendOk) sendOk.classList.remove("visible");
    const sendErr = $("sendError");
    if (sendErr) sendErr.style.display = "none";
    const sendBtn = $("sendContractBtn");
    if (sendBtn) sendBtn.disabled = true;
    contractReference = C.generateReference("", contractKind);
    $("badgeReference").textContent = "Contract Reference: " + contractReference;
    $("directorSignatureDate").value = C.formatUKDate(new Date().toISOString().slice(0, 10));
    setStep(1);
    updatePreview();
    loadRecentFromSupabase();
  }

  function init() {
    if (!$("contractForm")) return;
    contractReference = C.generateReference("", contractKind);
    $("badgeReference").textContent = "Contract Reference: " + contractReference;
    $("directorSignatureDate").value = C.formatUKDate(new Date().toISOString().slice(0, 10));
    bindEvents();
    syncContractTypeFields();
    setStep(1);
    C.loadLogo().then((url) => {
      if (url) C.logoDataUrl = url;
      updatePreview();
      loadRecentFromSupabase();
    });
  }

  window.HRContractApp = { init: init, reset: reset };

  function boot() {
    if (window.__HR_CONTRACT_DEFER_INIT__) return;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
  boot();
})();
