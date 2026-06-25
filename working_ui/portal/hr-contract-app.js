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
  const roleScaleStore = {};
  const SCALE_OPTIONS = C.SCALE_OPTIONS || ["Scale 1", "Scale 2", "Scale 3"];
  const STAFF_LINK_MOD = "./hr-contract-staff-link.js?v=20260622-staff";
  let staffRoster = [];
  let portalLinkVerified = false;
  let selectedPortalLogin = "";

  function contractRefDateIso() {
    const el = $("contractDate");
    return el && el.value ? String(el.value).trim().slice(0, 10) : "";
  }

  function refreshContractReference() {
    const nameEl = $("employeeName");
    contractReference = C.generateReference(
      nameEl ? nameEl.value : "",
      contractKind,
      contractRefDateIso()
    );
  }

  function syncContractTypeFields() {
    const fixed = contractKind === "fixed_term";
    document.querySelectorAll(".zero-hours-field").forEach((el) => el.classList.toggle("hidden", fixed));
    document.querySelectorAll(".fixed-term-field").forEach((el) => el.classList.toggle("hidden", !fixed));
    if ($("roleScalesContainer")) {
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
      Object.keys(roleScaleStore).forEach((k) => delete roleScaleStore[k]);
    }
    syncContractTypeFields();
    refreshContractReference();
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

  async function loadStaffRosterDropdown() {
    const sel = $("portalStaffSelect");
    if (!sel) return;
    const auth = portalClient();
    if (!auth) {
      sel.innerHTML = '<option value="">Sign in to load staff roster</option>';
      return;
    }
    try {
      const mod = await import(STAFF_LINK_MOD);
      staffRoster = await mod.loadPortalStaffRoster(auth.supabase);
      sel.innerHTML = '<option value="">Select staff (Portal login name)</option>';
      staffRoster.forEach((s, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        const suffix = s.loginName && s.loginName !== s.displayName ? " — login: " + s.loginName : "";
        opt.textContent = s.displayName + suffix;
        opt.dataset.authEmail = s.authEmail;
        opt.dataset.displayName = s.displayName;
        opt.dataset.loginName = s.loginName;
        sel.appendChild(opt);
      });
    } catch (err) {
      console.warn("[hr-contract] staff roster", err);
      sel.innerHTML = '<option value="">Could not load staff roster</option>';
    }
  }

  async function onPortalStaffChange() {
    const sel = $("portalStaffSelect");
    const statusEl = $("portalLinkStatus");
    portalLinkVerified = false;
    selectedPortalLogin = "";
    if ($("portalAuthEmail")) $("portalAuthEmail").value = "";
    if (!sel || sel.value === "") {
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.className = "portal-link-status";
      }
      updatePreview();
      return;
    }
    const opt = sel.options[sel.selectedIndex];
    const authEmail = opt.dataset.authEmail || "";
    const displayName = opt.dataset.displayName || "";
    const loginName = opt.dataset.loginName || "";
    selectedPortalLogin = loginName;
    if ($("portalAuthEmail")) $("portalAuthEmail").value = authEmail;
    if (displayName && $("employeeName")) $("employeeName").value = displayName;
    try {
      const mod = await import(STAFF_LINK_MOD);
      if (
        $("employeeEmail") &&
        !mod.isPlaceholderPortalEmail(authEmail) &&
        !$("employeeEmail").value.trim()
      ) {
        $("employeeEmail").value = authEmail;
      }
      const auth = portalClient();
      if (statusEl) {
        statusEl.textContent = "Checking Portal account…";
        statusEl.className = "portal-link-status";
      }
      if (auth && authEmail) {
        const v = await mod.verifyPortalStaffLink(auth.supabase, authEmail);
        portalLinkVerified = v.ok;
        if (statusEl) {
          statusEl.textContent = v.ok
            ? "Portal account linked (" + loginName + "). Contract will appear on their dashboard."
            : v.error || "No Portal account found for this staff member.";
          statusEl.className = "portal-link-status " + (v.ok ? "ok" : "warn");
        }
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || "Could not verify Portal link.";
        statusEl.className = "portal-link-status warn";
      }
    }
    if ($("employeeName")) {
      refreshContractReference();
    }
    updatePreview();
  }

  function getPortalStaffLogin() {
    return selectedPortalLogin || "";
  }

  function getPortalAuthEmail() {
    return $("portalAuthEmail") ? $("portalAuthEmail").value.trim().toLowerCase() : "";
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

  function syncRoleScaleStoreFromInputs() {
    document.querySelectorAll("[data-role-scale]").forEach((sel) => {
      roleScaleStore[sel.dataset.roleKey] = sel.value;
    });
  }

  function renderRoleScaleInputs() {
    const container = $("roleScalesContainer");
    if (!container) return;
    syncRoleScaleStoreFromInputs();
    const roles = getSelectedRoles();
    if (contractKind === "fixed_term" || !roles.length) {
      container.innerHTML = "";
      container.closest(".form-group")?.classList.add("hidden");
      return;
    }
    container.closest(".form-group")?.classList.remove("hidden");
    Object.keys(roleScaleStore).forEach((role) => {
      if (roles.indexOf(role) < 0) delete roleScaleStore[role];
    });
    const esc = (s) =>
      String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    let html = '<p class="role-scale-intro">Select the pay scale for each role</p>';
    roles.forEach((role, i) => {
      const id = "role_scale_" + i;
      const current = roleScaleStore[role] || "";
      roleScaleStore[role] = current;
      html +=
        '<div class="role-scale-row">' +
        '<label for="' + id + '">' + esc(role) + "</label>" +
        '<select id="' + id + '" data-role-key="' + esc(role) + '" data-role-scale required>' +
        '<option value="">Select scale</option>' +
        SCALE_OPTIONS.map(
          (scale) =>
            '<option value="' + esc(scale) + '"' + (scale === current ? " selected" : "") + ">" + esc(scale) + "</option>"
        ).join("") +
        "</select></div>";
    });
    container.innerHTML = html;
    container.querySelectorAll("[data-role-scale]").forEach((sel) => {
      sel.addEventListener("change", () => {
        roleScaleStore[sel.dataset.roleKey] = sel.value;
        updatePreview();
      });
    });
  }

  function syncScaleFromRoles() {
    renderRoleScaleInputs();
  }

  function getRoleScales() {
    syncRoleScaleStoreFromInputs();
    const out = {};
    getSelectedRoles().forEach((role) => {
      if (roleScaleStore[role]) out[role] = roleScaleStore[role];
    });
    return out;
  }

  function formatRoleScaleLabel() {
    const roles = getSelectedRoles();
    const scales = getRoleScales();
    return roles
      .map((role) => (scales[role] ? role + " (" + scales[role] + ")" : role))
      .join("; ");
  }

  function allRoleScalesSelected() {
    const roles = getSelectedRoles();
    if (!roles.length) return false;
    const scales = getRoleScales();
    return roles.every((role) => !!scales[role]);
  }

  function buildRateSummary() {
    const roles = getSelectedRoles();
    const scales = getRoleScales();
    if (!roles.length || !allRoleScalesSelected()) return null;
    const parts = roles
      .map((role) => {
        const rate = C.getDeliveryRate(role, scales[role]);
        return rate != null ? C.GBP + rate + "/h - " + role + " (" + scales[role] + ")" : null;
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
      roleScales: getRoleScales(),
      scale: contractKind === "fixed_term" ? "" : formatRoleScaleLabel(),
      portalStaffLogin: getPortalStaffLogin(),
      portalAuthEmail: getPortalAuthEmail(),
      places: getPlaces(),
      normalHours: getNormalHoursText(),
      directorName: $("directorName").value.trim(),
      hrNotes: $("hrNotes").value.trim()
    };
  }

  function buildTemplateDataForPreview() {
    const places = getPlaces();
    if (!contractReference) refreshContractReference();
    return C.buildTemplateData({
      contractKind,
      contractReference: contractReference,
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
      roleScales: getRoleScales(),
      scale: contractKind === "fixed_term" ? "" : formatRoleScaleLabel(),
      portalStaffLogin: getPortalStaffLogin(),
      portalAuthEmail: getPortalAuthEmail(),
      placeOfWork: places.length ? places.map((p, i) => i + 1 + ". " + p).join("\n") : C.EM,
      normalHoursOfWork: getNormalHoursText(),
      directorName: $("directorName").value.trim(),
      directorSignatureDataUrl: directorSignatureDataUrl,
      employeePending: true
    });
  }

  function updatePreview() {
    if (!contractReference) refreshContractReference();
    const badgeRef = $("badgeReference");
    if (badgeRef) badgeRef.textContent = "Reference: " + contractReference;
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
        $("rateDisplay").textContent = "Select at least one role and a scale for each role.";
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
      const staffOk = $("portalStaffSelect") && $("portalStaffSelect").value !== "";
      $("fgPortalStaff")?.classList.toggle("invalid", !staffOk);
      if (!staffOk) valid = false;
      if ($("portalStaffSelect") && $("portalStaffSelect").value && !portalLinkVerified) {
        valid = false;
      }
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
        $("fgScale").classList.toggle("invalid", !allRoleScalesSelected());
        if (!allRoleScalesSelected()) valid = false;
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
      const login = getPortalStaffLogin();
      $("sendSummary").textContent =
        $("employeeName").value.trim() +
        " (" +
        $("employeeEmail").value.trim() +
        ")" +
        (login ? " · Portal: " + login : "") +
        " — " +
        (contractKind === "fixed_term" ? "Fixed term" : "Zero hours") +
        " — " +
        formatRoleLabel(getSelectedRoles()) +
        (contractKind === "fixed_term" ? "" : " — " + formatRoleScaleLabel());
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
      const mod = await import("./hr-contract-publish.js?v=20260625-recent-actions");
      const result = await mod.portalPublishEmploymentContract(auth.supabase, auth.user.id, {
        contractReference,
        templateData,
        formPayload: getFormPayload(),
        directorSignature: directorSignatureDataUrl,
        employeeEmail: $("employeeEmail").value.trim(),
        portalAuthEmail: getPortalAuthEmail(),
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
        roleScales: getRoleScales(),
        scale: formatRoleScaleLabel(),
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

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function contractDocumentPath(row) {
    const doc =
      row.documents && !Array.isArray(row.documents)
        ? row.documents
        : Array.isArray(row.documents)
          ? row.documents[0]
          : null;
    return doc && doc.file_url ? String(doc.file_url) : "";
  }

  function recentActionsHtml(row) {
    const filePath = contractDocumentPath(row);
    let html = '<div class="recent-actions">';
    if (row.status === "completed" && filePath) {
      html +=
        '<button type="button" class="btn-recent btn-dl" data-recent-action="download" data-contract-id="' +
        escHtml(row.id) +
        '" data-file-path="' +
        escHtml(filePath) +
        '" data-contract-ref="' +
        escHtml(row.contract_reference) +
        '">Download PDF</button>';
    }
    if (row.status === "awaiting_employee") {
      html +=
        '<a class="recent-link" href="contract_sign.html?contract_id=' +
        encodeURIComponent(row.id) +
        '">Staff view</a>';
    }
    html +=
      '<button type="button" class="btn-recent btn-del" data-recent-action="delete" data-contract-id="' +
      escHtml(row.id) +
      '" data-contract-ref="' +
      escHtml(row.contract_reference) +
      '">Delete</button>';
    html += "</div>";
    return html;
  }

  function bindRecentContractActions() {
    const tbody = $("recentBody");
    if (!tbody || tbody.dataset.boundRecentActions) return;
    tbody.dataset.boundRecentActions = "1";
    tbody.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-recent-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-recent-action");
      const id = btn.getAttribute("data-contract-id");
      const filePath = btn.getAttribute("data-file-path") || "";
      const ref = btn.getAttribute("data-contract-ref") || "this contract";
      const auth = portalClient();
      if (!auth) return;
      const mod = await import("./hr-contract-publish.js?v=20260625-recent-actions");
      if (action === "download") {
        btn.disabled = true;
        try {
          await mod.portalDownloadEmploymentContractPdf(auth.supabase, filePath, ref);
        } catch (e) {
          alert((e && e.message) || "Download failed.");
        } finally {
          btn.disabled = false;
        }
        return;
      }
      if (action === "delete") {
        if (
          !confirm(
            "Delete " +
              ref +
              "? This removes the contract, dashboard notice and signed PDF. This cannot be undone."
          )
        ) {
          return;
        }
        btn.disabled = true;
        try {
          await mod.portalAdminDeleteEmploymentContract(auth.supabase, id);
          loadRecentFromSupabase();
        } catch (e) {
          alert((e && e.message) || "Could not delete contract.");
          btn.disabled = false;
        }
      }
    });
  }

  async function loadRecentFromSupabase() {
    const auth = portalClient();
    if (!auth) return;
    try {
      const mod = await import("./hr-contract-publish.js?v=20260625-recent-actions");
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
        tr.innerHTML =
          "<td>" +
          escHtml(row.contract_reference) +
          "</td><td>" +
          escHtml(row.employee_name) +
          "</td><td>" +
          escHtml(row.role) +
          "</td><td>" +
          escHtml(row.scale) +
          "</td><td>" +
          dateStr +
          "</td><td>" +
          statusLabel(row.status) +
          "</td><td>" +
          recentActionsHtml(row) +
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
    if ($("portalStaffSelect")) {
      $("portalStaffSelect").addEventListener("change", onPortalStaffChange);
    }
    document.querySelectorAll("#roleCheckboxes input").forEach((cb) => {
      cb.addEventListener("change", () => {
        syncScaleFromRoles();
        updatePreview();
      });
    });
    ["employeeName", "employeeAddress", "employeeEmail", "contractDate", "commencementDate", "directorName", "termEndDate", "annualSalary", "weeklyHours"].forEach(
      (id) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("input", () => {
          if (id === "employeeName" || id === "contractDate") refreshContractReference();
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
    Object.keys(roleScaleStore).forEach((k) => delete roleScaleStore[k]);
    staffRoster = [];
    portalLinkVerified = false;
    selectedPortalLogin = "";
    if ($("portalLinkStatus")) {
      $("portalLinkStatus").textContent = "";
      $("portalLinkStatus").className = "portal-link-status";
    }
    const form = $("contractForm");
    if (form) form.reset();
    selectContractType("zero_hours");
    loadStaffRosterDropdown();
    const sendOk = $("sendSuccess");
    if (sendOk) sendOk.classList.remove("visible");
    const sendErr = $("sendError");
    if (sendErr) sendErr.style.display = "none";
    const sendBtn = $("sendContractBtn");
    if (sendBtn) sendBtn.disabled = true;
    refreshContractReference();
    $("directorSignatureDate").value = C.formatUKDate(new Date().toISOString().slice(0, 10));
    setStep(1);
    updatePreview();
    loadRecentFromSupabase();
  }

  function init() {
    if (!$("contractForm")) return;
    refreshContractReference();
    $("directorSignatureDate").value = C.formatUKDate(new Date().toISOString().slice(0, 10));
    bindEvents();
    bindRecentContractActions();
    syncContractTypeFields();
    setStep(1);
    loadStaffRosterDropdown();
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
