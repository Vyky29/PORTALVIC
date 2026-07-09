/**
 * Admin H&R — Learning & Development funding application review (Phase 2–3).
 */
(function (global) {
  "use strict";

  var TABLE = "portal_staff_ld_funding_applications";
  var SELECT_COLS =
    "id, created_at, updated_at, submitted_by_user_id, status, employee_name, job_title, service_department, " +
    "application_date, course_title, training_provider, course_start_date, course_end_date, delivery_method, " +
    "total_course_cost_gbp, why_learning, role_improvement, participants_benefit, apply_share_plan, " +
    "applying_for_scheme, can_pay_upfront, requests_exceptional_funding, exceptional_funding_note, " +
    "declaration_accepted, origin, reviewed_by_user_id, reviewed_at, review_notes, funding_amount_gbp, " +
    "reimbursement_schedule, exceptional_funding_arrangement, additional_conditions, " +
    "letter_document_id, letter_generated_at, decline_reason_codes, decline_reason_other, decision_letter_text";

  function lettersApi() {
    return global.PortalLDFundingLetters || null;
  }

  var DEFAULT_FUNDING_PCT = 40;
  var FUNDING_MODE_STANDARD = "40";
  var FUNDING_MODE_OTHER = "other";
  var FUNDING_PCT_OTHER_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  var REIMB_PRESET_5050 = "5050";
  var REIMB_PRESET_OTHER = "other";
  var REIMB_TEXT_5050 =
    "50% after 6 months of continuous employment following course completion; 50% after 12 months.";

  function courseCost(app) {
    var n = Number(app && app.total_course_cost_gbp);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function fundingAmountFromPct(app, pct) {
    var cost = courseCost(app);
    var p = Number(pct);
    if (cost == null || !Number.isFinite(p) || p <= 0) return null;
    return Math.round(((cost * p) / 100) * 100) / 100;
  }

  function snapFundingPct(p) {
    var n = Math.round(Number(p) / 10) * 10;
    if (!Number.isFinite(n) || n < 10) return 10;
    if (n > 100) return 100;
    return n;
  }

  function inferRawFundingPct(app) {
    var cost = courseCost(app);
    var amount = Number(app && app.funding_amount_gbp);
    if (cost == null || !Number.isFinite(amount) || amount < 0) return DEFAULT_FUNDING_PCT;
    return snapFundingPct(Math.round((amount / cost) * 100));
  }

  function inferFundingMode(app) {
    var pct = inferRawFundingPct(app);
    if (pct === DEFAULT_FUNDING_PCT) {
      return { mode: FUNDING_MODE_STANDARD, otherPct: DEFAULT_FUNDING_PCT };
    }
    return { mode: FUNDING_MODE_OTHER, otherPct: pct };
  }

  function fundingPctFromForm(screen) {
    var modeEl = screen.querySelector("#ldfFundingMode");
    var mode = modeEl ? clean(modeEl.value) : FUNDING_MODE_STANDARD;
    if (mode === FUNDING_MODE_STANDARD) return DEFAULT_FUNDING_PCT;
    var otherEl = screen.querySelector("#ldfFundingPctOther");
    var pct = otherEl ? Number(otherEl.value) : DEFAULT_FUNDING_PCT;
    return snapFundingPct(pct);
  }

  function isValidFundingPct(pct) {
    return FUNDING_PCT_OTHER_OPTIONS.indexOf(snapFundingPct(pct)) >= 0;
  }

  function inferReimbPreset(text) {
    var t = clean(text).toLowerCase();
    if (!t) return REIMB_PRESET_5050;
    if (/50\s*%/.test(t) && /6/.test(t) && /12/.test(t)) return REIMB_PRESET_5050;
    return REIMB_PRESET_OTHER;
  }

  function reimbursementFromForm(screen) {
    var sel = screen.querySelector("#ldfReimbSchedule");
    var key = sel ? clean(sel.value) : REIMB_PRESET_5050;
    if (key === REIMB_PRESET_5050) return { key: key, text: REIMB_TEXT_5050 };
    return {
      key: key,
      text: clean((screen.querySelector("#ldfReimbScheduleOther") || {}).value) || null,
    };
  }

  function fundingPreviewText(app, pct) {
    var cost = courseCost(app);
    var amount = fundingAmountFromPct(app, pct);
    if (cost == null) {
      return "Course cost not stated on application — percentage cannot be calculated.";
    }
    if (amount == null) return "";
    return (
      fmtMoney(amount) +
      " (" +
      String(pct) +
      "% of " +
      fmtMoney(cost) +
      " course cost)"
    );
  }

  function buildFundingPctSelect(app) {
    var funding = inferFundingMode(app);
    var html =
      '<div class="ldf-field"><label for="ldfFundingMode">Approved funding (% of course cost)</label>' +
      '<select id="ldfFundingMode" name="funding_mode">' +
      '<option value="' +
      FUNDING_MODE_STANDARD +
      '"' +
      (funding.mode === FUNDING_MODE_STANDARD ? " selected" : "") +
      ">40% (standard)</option>" +
      '<option value="' +
      FUNDING_MODE_OTHER +
      '"' +
      (funding.mode === FUNDING_MODE_OTHER ? " selected" : "") +
      ">Other</option></select></div>" +
      '<div class="ldf-field' +
      (funding.mode === FUNDING_MODE_OTHER ? "" : " is-hidden") +
      '" id="ldfFundingOtherWrap"><label for="ldfFundingPctOther">Other percentage</label>' +
      '<select id="ldfFundingPctOther" name="funding_pct_other">';
    FUNDING_PCT_OTHER_OPTIONS.forEach(function (p) {
      html +=
        '<option value="' +
        p +
        '"' +
        (p === funding.otherPct ? " selected" : "") +
        ">" +
        p +
        "%</option>";
    });
    html +=
      '</select></div><p class="ldf-hint" id="ldfFundingPreview">' +
      esc(
        fundingPreviewText(
          app,
          funding.mode === FUNDING_MODE_STANDARD ? DEFAULT_FUNDING_PCT : funding.otherPct
        )
      ) +
      "</p>";
    return html;
  }

  function buildReimbScheduleFields(app) {
    var preset = inferReimbPreset(app.reimbursement_schedule);
    var otherText =
      preset === REIMB_PRESET_OTHER ? clean(app.reimbursement_schedule || "") : "";
    var html =
      '<div class="ldf-field"><label for="ldfReimbSchedule">Reimbursement schedule</label>' +
      '<select id="ldfReimbSchedule" name="reimbursement_schedule">' +
      '<option value="' +
      REIMB_PRESET_5050 +
      '"' +
      (preset === REIMB_PRESET_5050 ? " selected" : "") +
      ">50% at 6 months · 50% at 12 months</option>" +
      '<option value="' +
      REIMB_PRESET_OTHER +
      '"' +
      (preset === REIMB_PRESET_OTHER ? " selected" : "") +
      ">Other</option></select></div>" +
      '<div class="ldf-field' +
      (preset === REIMB_PRESET_OTHER ? "" : " is-hidden") +
      '" id="ldfReimbOtherWrap"><label for="ldfReimbScheduleOther">Other reimbursement schedule</label>' +
      '<textarea id="ldfReimbScheduleOther" placeholder="Describe the agreed reimbursement schedule">' +
      esc(otherText) +
      "</textarea></div>";
    return html;
  }

  function bindDecisionFormControls(screen, app) {
    if (!screen) return;
    var reimbSel = screen.querySelector("#ldfReimbSchedule");
    var reimbWrap = screen.querySelector("#ldfReimbOtherWrap");
    function syncReimbOther() {
      if (!reimbWrap || !reimbSel) return;
      var show = clean(reimbSel.value) === REIMB_PRESET_OTHER;
      reimbWrap.classList.toggle("is-hidden", !show);
    }
    if (reimbSel) {
      reimbSel.addEventListener("change", syncReimbOther);
      syncReimbOther();
    }

    var fundingModeSel = screen.querySelector("#ldfFundingMode");
    var fundingOtherWrap = screen.querySelector("#ldfFundingOtherWrap");
    var fundingOtherSel = screen.querySelector("#ldfFundingPctOther");
    var preview = screen.querySelector("#ldfFundingPreview");

    function syncFundingOther() {
      if (!fundingOtherWrap || !fundingModeSel) return;
      var show = clean(fundingModeSel.value) === FUNDING_MODE_OTHER;
      fundingOtherWrap.classList.toggle("is-hidden", !show);
    }

    function syncFundingPreview() {
      if (!preview) return;
      preview.textContent = fundingPreviewText(app, fundingPctFromForm(screen));
    }

    function onFundingChange() {
      syncFundingOther();
      syncFundingPreview();
    }

    if (fundingModeSel) {
      fundingModeSel.addEventListener("change", onFundingChange);
    }
    if (fundingOtherSel) {
      fundingOtherSel.addEventListener("change", syncFundingPreview);
    }
    syncFundingOther();
    syncFundingPreview();

    var statusSel = screen.querySelector("#ldfStatus");
    var approvalWrap = screen.querySelector("#ldfApprovalWrap");
    var declineWrap = screen.querySelector("#ldfDeclineWrap");
    var declineOtherCheck = screen.querySelector("#ldfDeclineOtherCheck");
    var declineOtherWrap = screen.querySelector("#ldfDeclineOtherWrap");

    function syncDecisionSections() {
      var st = statusSel ? clean(statusSel.value) : "approved";
      var declined = st === "declined";
      if (approvalWrap) approvalWrap.classList.toggle("is-hidden", declined);
      if (declineWrap) declineWrap.classList.toggle("is-hidden", !declined);
    }

    function syncDeclineOther() {
      if (!declineOtherWrap || !declineOtherCheck) return;
      declineOtherWrap.classList.toggle("is-hidden", !declineOtherCheck.checked);
    }

    function syncLetterDraftFromForm() {
      var editor = screen.querySelector("#ldfLetterEditor");
      var L = lettersApi();
      if (!editor || !L) return;
      var draftApp = readFormApp(screen, app);
      // Drop sticky saved letter so Declined/Approved drafts match the form.
      draftApp.decision_letter_text = null;
      editor.value = L.buildEmailBody(draftApp);
      app.decision_letter_text = null;
      var msg = screen.querySelector("#ldfLetterMsg");
      if (msg) {
        msg.textContent = "Letter updated from decision.";
        msg.className = "ldf-msg is-ok";
      }
    }

    if (statusSel) {
      statusSel.addEventListener("change", function () {
        syncDecisionSections();
        syncFundingPreview();
        syncLetterDraftFromForm();
      });
    }
    if (declineOtherCheck) {
      declineOtherCheck.addEventListener("change", function () {
        syncDeclineOther();
        syncLetterDraftFromForm();
      });
    }
    screen.querySelectorAll('input[name="ldfDeclineReason"]').forEach(function (el) {
      el.addEventListener("change", syncLetterDraftFromForm);
    });
    var declineOtherText = screen.querySelector("#ldfDeclineOtherText");
    if (declineOtherText) {
      declineOtherText.addEventListener("input", syncLetterDraftFromForm);
    }
    syncDecisionSections();
    syncDeclineOther();
  }

  function decisionStatusValue(app) {
    var st = clean(app && app.status).toLowerCase();
    if (st === "declined") return "declined";
    return "approved";
  }

  function declineReasonsFromForm(screen) {
    var codes = [];
    screen.querySelectorAll('input[name="ldfDeclineReason"]:checked').forEach(function (el) {
      var v = clean(el.value);
      if (v) codes.push(v);
    });
    var other =
      clean((screen.querySelector("#ldfDeclineOtherText") || {}).value) || null;
    return { codes: codes, other: other };
  }

  function buildDeclineReasonFields(app) {
    var L = lettersApi();
    var reasons = (L && L.DECLINE_REASONS) || [];
    var otherCode = (L && L.DECLINE_REASON_OTHER) || "other";
    var saved =
      L && L.normalizeDeclineCodes
        ? L.normalizeDeclineCodes(app.decline_reason_codes)
        : [];
    var isDeclined = decisionStatusValue(app) === "declined";
    var html =
      '<div class="ldf-fieldset' +
      (isDeclined ? "" : " is-hidden") +
      '" id="ldfDeclineWrap">';
    html +=
      '<fieldset class="ldf-checklist"><legend>Reasons for decline <span class="muted">(select all that apply)</span></legend>';
    reasons.forEach(function (r) {
      html +=
        '<label class="ldf-check"><input type="checkbox" name="ldfDeclineReason" value="' +
        esc(r.code) +
        '"' +
        (saved.indexOf(r.code) >= 0 ? " checked" : "") +
        ' /> <span>' +
        esc(r.label) +
        "</span></label>";
    });
    var otherChecked = saved.indexOf(otherCode) >= 0;
    html +=
      '<label class="ldf-check"><input type="checkbox" id="ldfDeclineOtherCheck" name="ldfDeclineReason" value="' +
      esc(otherCode) +
      '"' +
      (otherChecked ? " checked" : "") +
      ' /> <span>Other</span></label></fieldset>';
    html +=
      '<div class="ldf-field' +
      (otherChecked ? "" : " is-hidden") +
      '" id="ldfDeclineOtherWrap"><label for="ldfDeclineOtherText">Other reason (included in email)</label>' +
      '<textarea id="ldfDeclineOtherText" placeholder="Describe the reason sent to the employee">' +
      esc(app.decline_reason_other || "") +
      "</textarea></div></div>";
    return html;
  }

  function buildDecisionStatusSelect(app) {
    var selected = decisionStatusValue(app);
    return (
      '<div class="ldf-field"><label for="ldfStatus">Decision</label>' +
      '<select id="ldfStatus" name="status" required>' +
      '<option value="approved"' +
      (selected === "approved" ? " selected" : "") +
      ">Approved</option>" +
      '<option value="declined"' +
      (selected === "declined" ? " selected" : "") +
      ">Declined</option></select></div>"
    );
  }

  function readDecisionFields(screen, app) {
    var statusEl = screen.querySelector("#ldfStatus");
    var status = statusEl ? clean(statusEl.value) : "approved";
    var isApproval = status === "approved";
    var isDeclined = status === "declined";
    var fundingAmount = null;
    var fundingPct = null;
    var reimb = reimbursementFromForm(screen);
    var declineReasonCodes = null;
    var declineReasonOther = null;

    if (isDeclined) {
      var decline = declineReasonsFromForm(screen);
      var otherCode =
        (lettersApi() && lettersApi().DECLINE_REASON_OTHER) || "other";
      if (!decline.codes.length) {
        return { error: "Select at least one reason for decline." };
      }
      if (
        decline.codes.indexOf(otherCode) >= 0 &&
        !decline.other &&
        decline.codes.length === 1
      ) {
        return { error: "Enter the other decline reason or select additional reasons." };
      }
      declineReasonCodes = decline.codes;
      declineReasonOther =
        decline.codes.indexOf(otherCode) >= 0 ? decline.other : null;
    }

    if (isApproval) {
      fundingPct = fundingPctFromForm(screen);
      if (!isValidFundingPct(fundingPct)) {
        return { error: "Choose a valid funding percentage (10%–100%)." };
      }
      fundingAmount = fundingAmountFromPct(app, fundingPct);
      if (fundingAmount == null) {
        return {
          error:
            "Application has no course cost — cannot calculate funding from percentage.",
        };
      }
      if (reimb.key === REIMB_PRESET_OTHER && !reimb.text) {
        return { error: "Enter the other reimbursement schedule or choose the standard option." };
      }
    }

    return {
      status: status,
      funding_amount_gbp: isApproval ? fundingAmount : null,
      funding_pct: isApproval ? fundingPct : null,
      reimbursement_schedule: isApproval ? reimb.text : null,
      exceptional_funding_arrangement: isApproval
        ? clean((screen.querySelector("#ldfExceptionalArr") || {}).value) || null
        : null,
      additional_conditions: isApproval
        ? clean((screen.querySelector("#ldfConditions") || {}).value) || null
        : null,
      decline_reason_codes: isDeclined ? declineReasonCodes : null,
      decline_reason_other: isDeclined ? declineReasonOther : null,
      review_notes: clean((screen.querySelector("#ldfReviewNotes") || {}).value) || null,
    };
  }

  var deps = {
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    toast: function (m) {
      try {
        console.log("[ld-funding-admin]", m);
      } catch (_) {}
    },
    openScreen: null,
    closeScreen: null,
    icon: null,
  };

  function esc(s) {
    return deps.esc(s);
  }
  function ico(name, px) {
    return typeof deps.icon === "function" ? deps.icon(name, px || 17) : "";
  }

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function fmtDate(iso) {
    var s = clean(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
    try {
      return new Date(s + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_) {
      return s;
    }
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return clean(iso);
    }
  }

  function fmtMoney(n) {
    if (n == null || n === "") return "—";
    var x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return "£" + x.toFixed(2);
  }

  function deliveryLabel(v) {
    var k = clean(v).toLowerCase();
    if (k === "online") return "Online";
    if (k === "face_to_face") return "Face-to-face";
    if (k === "blended") return "Blended";
    return clean(v) || "—";
  }

  function statusLabel(st) {
    var k = clean(st).toLowerCase();
    if (k === "approved") return "Approved";
    if (k === "declined") return "Declined";
    if (k === "approved_conditional") return "Approved with conditions";
    return "Pending review";
  }

  function statusPill(st) {
    var k = clean(st).toLowerCase();
    var cls = "hr-pill hr-pill--off";
    if (k === "approved") cls = "hr-pill hr-pill--on";
    else if (k === "declined") cls = "hr-pill hr-pill--off";
    else if (k === "approved_conditional") cls = "hr-pill hr-pill--warn";
    else cls = "hr-pill hr-pill--pending";
    return '<span class="' + cls + '">' + esc(statusLabel(st)) + "</span>";
  }

  function injectStylesOnce() {
    if (document.getElementById("adminLdFundingReviewStyle")) return;
    var css = [
      ".hr-pill--pending{background:#fff4e2;color:#9a6700}",
      ".hr-pill--warn{background:#e8f0ff;color:#1e40af}",
      ".ldf-kv{display:grid;gap:10px;margin:0 0 14px}",
      ".ldf-kv-row{display:grid;grid-template-columns:minmax(120px,34%) 1fr;gap:8px 12px;font-size:14px;min-width:0}",
      ".ldf-kv-row dt{margin:0;font-weight:700;color:#334155;overflow-wrap:break-word}",
      ".ldf-kv-row dd{margin:0;color:#0f172a;overflow-wrap:break-word;min-width:0}",
      ".ldf-section{margin:0 0 16px;padding:0 0 14px;border-bottom:1px solid #eef2f7}",
      ".ldf-section:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}",
      ".ldf-section h4{margin:0 0 8px;font-size:14px;color:#0f172a}",
      ".ldf-prose{margin:0;font-size:14px;line-height:1.5;color:#334155;white-space:pre-wrap;overflow-wrap:break-word}",
      ".ldf-form{display:grid;gap:12px}",
      ".ldf-field{display:flex;flex-direction:column;gap:6px;min-width:0}",
      ".ldf-field label{font-size:13px;font-weight:700;color:#334155}",
      ".ldf-field input,.ldf-field select,.ldf-field textarea{font:inherit;font-size:14px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#0f172a;min-width:0;width:100%}",
      ".ldf-field textarea{min-height:72px;resize:vertical}",
      ".ldf-msg{font-size:13px;margin:8px 0 0;overflow-wrap:break-word}",
      ".ldf-msg.is-err{color:#b91c1c}",
      ".ldf-msg.is-ok{color:#1f7a4d}",
      ".ldf-letter{margin-top:4px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}",
      ".ldf-letter pre{margin:0;font-family:inherit;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:break-word;color:#334155;max-height:220px;overflow:auto}",
      ".ldf-letter-editor{width:100%;min-height:240px;max-height:420px;font:inherit;font-size:13px;line-height:1.5;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;resize:vertical;box-sizing:border-box;min-width:0}",
      ".ldf-letter-editor:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}",
      ".ldf-letter-hint{margin:0 0 8px;font-size:12px;color:#64748b;overflow-wrap:break-word}",
      ".visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
      ".ldf-letter-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
      ".ldf-letter-actions .btn{min-width:0}",
      ".ldf-hint{margin:0;font-size:13px;color:#64748b;overflow-wrap:break-word}",
      ".ldf-field.is-hidden{display:none}",
      ".ldf-section-block.is-hidden{display:none}",
      ".ldf-fieldset.is-hidden{display:none}",
      ".ldf-checklist{border:0;margin:0;padding:0;display:grid;gap:8px}",
      ".ldf-checklist legend{font-size:13px;font-weight:700;color:#334155;padding:0;margin:0 0 4px}",
      ".ldf-check{display:flex;gap:8px;align-items:flex-start;font-size:14px;min-width:0;cursor:pointer}",
      ".ldf-check input{margin-top:3px;flex:0 0 auto}",
      ".ldf-check span{overflow-wrap:break-word;min-width:0;color:#0f172a;line-height:1.45}",
      "@media(max-width:640px){.ldf-kv-row{grid-template-columns:1fr}}",
    ].join("");
    var el = document.createElement("style");
    el.id = "adminLdFundingReviewStyle";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function loadApplications(client) {
    if (!client) return Promise.resolve([]);
    return client
      .from(TABLE)
      .select(SELECT_COLS)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  function renderCard(apps, filter) {
    injectStylesOnce();
    var list = apps || [];
    var f = clean(filter).toLowerCase() || "pending";
    var pending = 0;
    list.forEach(function (a) {
      if (clean(a.status).toLowerCase() === "pending") pending++;
    });
    var shown = list.filter(function (a) {
      var st = clean(a.status).toLowerCase();
      if (f === "all") return true;
      if (f === "decided") return st !== "pending";
      return st === "pending";
    });
    var html =
      '<div class="hr-card" id="hrLdFundingCard"><div class="hr-card-h"><h3>' +
      ico("award", 17) +
      "L&amp;D funding applications</h3>" +
      '<div class="hr-card-actions"><div class="hr-seg" role="group" aria-label="Application filter">' +
      '<button type="button" data-ldf-filter="pending" aria-pressed="' +
      (f === "pending") +
      '">Pending (' +
      pending +
      ")</button>" +
      '<button type="button" data-ldf-filter="decided" aria-pressed="' +
      (f === "decided") +
      '">Decided</button>' +
      '<button type="button" data-ldf-filter="all" aria-pressed="' +
      (f === "all") +
      '">All (' +
      list.length +
      ")</button></div></div></div>";
    html +=
      '<div class="hr-tbl-wrap"><table class="hr-tbl hr-tbl--center"><thead><tr>' +
      "<th>Employee</th><th>Course</th><th>Applied</th><th>Cost</th><th>Status</th><th></th>" +
      "</tr></thead><tbody>";
    if (!shown.length) {
      html += '<tr><td colspan="6" class="hr-empty">No applications in this filter.</td></tr>';
    } else {
      shown.forEach(function (a) {
        html +=
          '<tr data-ldf-row="' +
          esc(String(a.id || "")) +
          '"><td class="hr-name">' +
          esc(a.employee_name || "—") +
          "</td><td>" +
          esc(a.course_title || "—") +
          '<div class="muted" style="font-size:12px;margin-top:2px;overflow-wrap:break-word">' +
          esc(a.training_provider || "") +
          "</div></td><td>" +
          esc(fmtDate(a.application_date || a.created_at)) +
          "</td><td>" +
          esc(fmtMoney(a.total_course_cost_gbp)) +
          "</td><td>" +
          statusPill(a.status) +
          '</td><td><button type="button" class="btn btn--sm" data-ldf-review="' +
          esc(String(a.id || "")) +
          '">Review</button></td></tr>';
      });
    }
    html += "</tbody></table></div></div>";
    return html;
  }

  function kvRow(label, value) {
    return (
      '<div class="ldf-kv-row"><dt>' +
      esc(label) +
      '</dt><dd class="ldf-prose">' +
      esc(value || "—") +
      "</dd></div>"
    );
  }

  function boolLabel(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    return "—";
  }

  function applicationDetailBody(app) {
    var a = app || {};
    var html = "";
    html += '<div class="ldf-section"><h4>Employee details</h4><dl class="ldf-kv">';
    html += kvRow("Name", a.employee_name);
    html += kvRow("Job title", a.job_title);
    html += kvRow("Service / department", a.service_department);
    html += kvRow("Application date", fmtDate(a.application_date));
    html += kvRow("Submitted", fmtDateTime(a.created_at));
    html += "</dl></div>";

    html += '<div class="ldf-section"><h4>Course details</h4><dl class="ldf-kv">';
    html += kvRow("Course / qualification", a.course_title);
    html += kvRow("Training provider", a.training_provider);
    html += kvRow("Start date", fmtDate(a.course_start_date));
    html += kvRow("End date", fmtDate(a.course_end_date));
    html += kvRow("Delivery method", deliveryLabel(a.delivery_method));
    html += kvRow("Total course cost", fmtMoney(a.total_course_cost_gbp));
    html += "</dl></div>";

    html += '<div class="ldf-section"><h4>Learning proposal</h4><dl class="ldf-kv">';
    html += kvRow("Why this learning?", a.why_learning);
    html += kvRow("Role improvement", a.role_improvement);
    html += kvRow("Benefit to participants", a.participants_benefit);
    html += kvRow("Apply / share plan", a.apply_share_plan);
    html += "</dl></div>";

    html += '<div class="ldf-section"><h4>Funding request</h4><dl class="ldf-kv">';
    html += kvRow("Applying via scheme", boolLabel(a.applying_for_scheme));
    html += kvRow("Can pay upfront", boolLabel(a.can_pay_upfront));
    html += kvRow("Exceptional funding requested", boolLabel(a.requests_exceptional_funding));
    if (a.requests_exceptional_funding) {
      html += kvRow("Exceptional funding note", a.exceptional_funding_note);
    }
    html += "</dl></div>";

    html +=
      '<div class="ldf-section"><h4>Director decision</h4>' +
      '<p class="muted" style="margin:0 0 10px;font-size:13px">Save records the decision. Then edit the letter and tap <strong>Send to employee</strong> — PDF + portal reminder, no email.</p>' +
      '<form class="ldf-form" id="ldfReviewForm">' +
      buildDecisionStatusSelect(a) +
      buildDeclineReasonFields(a) +
      '<div class="ldf-section-block' +
      (decisionStatusValue(a) === "declined" ? " is-hidden" : "") +
      '" id="ldfApprovalWrap">' +
      buildFundingPctSelect(a) +
      buildReimbScheduleFields(a) +
      '<div class="ldf-field"><label for="ldfExceptionalArr">Exceptional funding arrangement</label>' +
      '<textarea id="ldfExceptionalArr" placeholder="If applicable — separate agreement note">' +
      esc(a.exceptional_funding_arrangement || "") +
      "</textarea></div>" +
      '<div class="ldf-field"><label for="ldfConditions">Additional conditions</label>' +
      '<textarea id="ldfConditions" placeholder="Any conditions for approval">' +
      esc(a.additional_conditions || "") +
      "</textarea></div></div>" +
      '<div class="ldf-field"><label for="ldfReviewNotes">Internal notes (HR only)</label>' +
      '<textarea id="ldfReviewNotes" placeholder="Not sent to the employee">' +
      esc(a.review_notes || "") +
      "</textarea></div>" +
      '<p class="ldf-msg" id="ldfReviewMsg" role="status" aria-live="polite"></p>' +
      "</form></div>";

    html += letterSectionHtml(a);

    if (a.reviewed_at) {
      html +=
        '<p class="muted" style="margin:12px 0 0;font-size:12px">Last reviewed: ' +
        esc(fmtDateTime(a.reviewed_at)) +
        "</p>";
    }
    return html;
  }

  function letterLooksWrongForStatus(text, status) {
    var body = String(text || "");
    var st = clean(status).toLowerCase();
    if (!body) return true;
    if (st === "declined") {
      return (
        /pleased to confirm (conditional )?approval/i.test(body) ||
        /Approved funding amount:/i.test(body) ||
        /Reimbursement schedule:/i.test(body)
      );
    }
    if (st === "approved" || st === "approved_conditional") {
      return /unable to approve funding/i.test(body);
    }
    return false;
  }

  function initialLetterText(app) {
    var saved = clean(app && app.decision_letter_text);
    var L = lettersApi();
    if (saved && !letterLooksWrongForStatus(saved, app && app.status)) return saved;
    return L ? L.buildEmailBody(app) : "";
  }

  function letterEditorText(screen) {
    var el = screen.querySelector("#ldfLetterEditor");
    return el ? String(el.value || "") : "";
  }

  function generatedLetterText(screen, app) {
    var L = lettersApi();
    if (!L) return "";
    return L.buildEmailBody(readFormApp(screen, app));
  }

  function persistLetterText(client, app, text, onDone) {
    if (!client || !app || !app.id) {
      if (typeof onDone === "function") onDone(null);
      return;
    }
    var body = clean(text);
    client
      .from(TABLE)
      .update({ decision_letter_text: body || null })
      .eq("id", app.id)
      .select(SELECT_COLS)
      .maybeSingle()
      .then(function (res) {
        if (!res.error && res.data) Object.assign(app, res.data);
        if (typeof onDone === "function") onDone(res.error || null);
      })
      .catch(function (err) {
        if (typeof onDone === "function") onDone(err);
      });
  }

  function announcementForLetter(app, docTitle) {
    var L = lettersApi();
    var live = app || {};
    var st = clean(live.status).toLowerCase();
    var course = clean(live.course_title) || "your course application";
    var bit =
      st === "approved"
        ? "approved"
        : st === "declined"
          ? "declined"
          : "decided";
    var title = "L&D funding application " + bit;
    var body =
      "Your decision letter for " +
      course +
      " is in My Documents → Training" +
      (docTitle ? " (" + docTitle + ")." : ".") +
      "\n\nOpen Quick menu → Training documents, or My Documents and choose Training.\n\nNo separate email — read and keep the PDF from your portal.";
    return { title: title, body: body };
  }

  function authUserId() {
    try {
      return (global.__PORTAL_SUPABASE__ || {}).session.user.id || null;
    } catch (_) {
      return null;
    }
  }

  function insertEmployeeAnnouncement(client, staffId, ann) {
    var uid = authUserId();
    if (!uid) return Promise.reject(new Error("Not signed in."));
    return client
      .from("portal_staff_announcements")
      .insert([
        {
          title: ann.title,
          body: ann.body,
          message_type: "reminder",
          reminder_category: "training",
          priority: "high",
          audience_scope: "all_staff",
          delivery_scope: "single_user",
          target_user_id: staffId,
          target_staff_role: null,
          created_by: uid,
        },
      ])
      .select("id")
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  function letterSectionHtml(app) {
    var L = lettersApi();
    if (!L || !L.isDecided(app)) {
      return (
        '<div class="ldf-section" id="ldfLetterSection" hidden aria-hidden="true"></div>'
      );
    }
    var letterBody = initialLetterText(app);
    var savedNote = "";
    if (app.letter_generated_at) {
      savedNote =
        '<p class="muted" style="margin:0 0 8px;font-size:12px">Sent to employee: ' +
        esc(fmtDateTime(app.letter_generated_at)) +
        " — PDF in My Documents and portal reminder.</p>";
    }
    return (
      '<div class="ldf-section" id="ldfLetterSection">' +
      "<h4>Decision letter</h4>" +
      savedNote +
      '<p class="ldf-letter-hint">Edit the letter if needed, then tap <strong>Send to employee</strong>. This saves the PDF to their My Documents → Training and creates a portal reminder — no email.</p>' +
      '<div class="ldf-letter">' +
      '<label for="ldfLetterEditor" class="visually-hidden">Decision letter text</label>' +
      '<textarea id="ldfLetterEditor" class="ldf-letter-editor" spellcheck="true">' +
      esc(letterBody) +
      '</textarea><div class="ldf-letter-actions">' +
      '<button type="button" class="btn btn--sm" id="ldfRegenerateLetter">Regenerate from form</button>' +
      '<button type="button" class="btn btn--sm btn--pri" id="ldfSendToEmployee">Send to employee</button>' +
      "</div>" +
      '<p class="ldf-msg" id="ldfLetterMsg" role="status" aria-live="polite"></p></div></div>'
    );
  }

  function readFormApp(screen, baseApp) {
    var a = Object.assign({}, baseApp || {});
    var fields = readDecisionFields(screen, a);
    if (fields.error) {
      a.status = clean((screen.querySelector("#ldfStatus") || {}).value) || a.status;
      // Still pull decline reasons for live letter drafts even if Save would fail.
      if (clean(a.status).toLowerCase() === "declined") {
        var decline = declineReasonsFromForm(screen);
        a.decline_reason_codes = decline.codes.length ? decline.codes : null;
        a.decline_reason_other = decline.other;
        a.funding_amount_gbp = null;
        a.reimbursement_schedule = null;
        a.exceptional_funding_arrangement = null;
        a.additional_conditions = null;
      }
      return a;
    }
    a.status = fields.status;
    a.funding_amount_gbp = fields.funding_amount_gbp;
    a.reimbursement_schedule = fields.reimbursement_schedule;
    a.exceptional_funding_arrangement = fields.exceptional_funding_arrangement;
    a.additional_conditions = fields.additional_conditions;
    a.decline_reason_codes = fields.decline_reason_codes;
    a.decline_reason_other = fields.decline_reason_other;
    return a;
  }

  function refreshLetterSection(screen, app, client, onLetterSaved) {
    var section = screen.querySelector("#ldfLetterSection");
    if (!section) return;
    var L = lettersApi();
    if (!L || !L.isDecided(app)) {
      section.hidden = true;
      section.setAttribute("aria-hidden", "true");
      section.innerHTML = "";
      return;
    }
    var tmp = global.document.createElement("div");
    tmp.innerHTML = letterSectionHtml(app);
    var fresh = tmp.firstElementChild;
    if (!fresh) return;
    section.replaceWith(fresh);
    bindLetterActions(screen, app, client, onLetterSaved);
  }

  function bindLetterActions(screen, app, client, onLetterSaved) {
    var L = lettersApi();
    if (!L || !L.isDecided(app)) return;

    function currentApp() {
      return readFormApp(screen, app);
    }

    function letterText() {
      return letterEditorText(screen);
    }

    function setLetterMsg(text, kind) {
      var msg = screen.querySelector("#ldfLetterMsg");
      if (!msg) return;
      msg.textContent = text || "";
      msg.className = "ldf-msg" + (kind === "err" ? " is-err" : kind === "ok" ? " is-ok" : "");
    }

    var regenBtn = screen.querySelector("#ldfRegenerateLetter");
    if (regenBtn) {
      regenBtn.addEventListener("click", function () {
        var editor = screen.querySelector("#ldfLetterEditor");
        if (!editor) return;
        editor.value = generatedLetterText(screen, app);
        setLetterMsg("Draft regenerated from the form.", "ok");
      });
    }

    var sendBtn = screen.querySelector("#ldfSendToEmployee");
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        if (!client) {
          setLetterMsg("Not connected.", "err");
          return;
        }
        var text = letterText();
        if (!clean(text)) {
          setLetterMsg("Letter is empty.", "err");
          return;
        }
        var live = currentApp();
        var staffId = clean(live.submitted_by_user_id);
        if (!staffId) {
          setLetterMsg("Applicant has no portal account linked.", "err");
          return;
        }
        sendBtn.disabled = true;
        setLetterMsg("Saving PDF and sending portal reminder…", "");
        var docTitle = L.documentTitle(live);
        var ann = announcementForLetter(live, docTitle);
        L.buildLetterPdfBlobFromText(text)
          .then(function (blob) {
            var filename = L.pdfFilename(live);
            var storagePath = staffId + "/training/" + filename;
            return client.storage
              .from("documents")
              .upload(storagePath, blob, { contentType: "application/pdf", upsert: false })
              .then(function (up) {
                if (up.error) throw up.error;
                var relatedDate = clean(live.reviewed_at || live.application_date).slice(0, 10) || null;
                return client
                  .from("documents")
                  .insert([
                    {
                      user_id: staffId,
                      document_type: "ld_funding_letter",
                      category: "training",
                      title: docTitle,
                      related_date: relatedDate,
                      file_url: storagePath,
                      source_page: "ld-funding",
                    },
                  ])
                  .select("id")
                  .single();
              })
              .then(function (ins) {
                if (ins.error) throw ins.error;
                return insertEmployeeAnnouncement(client, staffId, ann).then(function () {
                  return ins;
                });
              })
              .then(function (ins) {
                var docId = ins.data && ins.data.id;
                var now = new Date().toISOString();
                return client
                  .from(TABLE)
                  .update({
                    letter_document_id: docId,
                    letter_generated_at: now,
                    decision_letter_text: clean(text) || null,
                  })
                  .eq("id", live.id)
                  .select(SELECT_COLS)
                  .maybeSingle()
                  .then(function (res) {
                    if (res.error) throw res.error;
                    return res.data || live;
                  });
              });
          })
          .then(function (updated) {
            Object.assign(app, updated || {});
            setLetterMsg(
              "PDF saved to My Documents → Training and portal reminder sent.",
              "ok"
            );
            deps.toast("L&D decision sent to employee.");
            refreshLetterSection(screen, app, client, onLetterSaved);
            if (typeof onLetterSaved === "function") onLetterSaved(app);
          })
          .catch(function (err) {
            setLetterMsg((err && err.message) || "Could not send to employee.", "err");
          })
          .finally(function () {
            sendBtn.disabled = false;
          });
      });
    }
  }

  function openReview(app, client, onSaved) {
    if (typeof deps.openScreen !== "function") return;
    injectStylesOnce();
    var screen = deps.openScreen({
      headIcon: ico("award", 22),
      title: clean(app.employee_name) || "Application",
      sub:
        esc(app.course_title || "Course") +
        ' · <a href="policies_portal.html?policy=POL-049" target="_blank" rel="noopener">POL-049 scheme</a>',
      body: applicationDetailBody(app),
      foot:
        '<button type="button" class="btn btn--ghost" id="hrScreenClose">Close</button>' +
        '<button type="button" class="btn btn--pri" id="ldfSaveReview">Save decision</button>',
    });

    bindLetterActions(screen, app, client, onSaved);
    bindDecisionFormControls(screen, app);

    var msg = screen.querySelector("#ldfReviewMsg");
    var saveBtn = screen.querySelector("#ldfSaveReview");

    function setMsg(text, kind) {
      if (!msg) return;
      msg.textContent = text || "";
      msg.className = "ldf-msg" + (kind === "err" ? " is-err" : kind === "ok" ? " is-ok" : "");
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (!client || !app || !app.id) {
          setMsg("Not connected.", "err");
          return;
        }
        var fields = readDecisionFields(screen, app);
        if (fields.error) {
          setMsg(fields.error, "err");
          return;
        }
        var payload = {
          status: fields.status,
          funding_amount_gbp: fields.funding_amount_gbp,
          reimbursement_schedule: fields.reimbursement_schedule,
          exceptional_funding_arrangement: fields.exceptional_funding_arrangement,
          additional_conditions: fields.additional_conditions,
          decline_reason_codes: fields.decline_reason_codes,
          decline_reason_other: fields.decline_reason_other,
          review_notes: fields.review_notes,
          reviewed_at: new Date().toISOString(),
        };
        var liveForLetter = Object.assign({}, app, fields);
        liveForLetter.decision_letter_text = null;
        var generatedLetter = lettersApi()
          ? lettersApi().buildEmailBody(liveForLetter)
          : "";
        var editedLetter = clean(letterEditorText(screen));
        if (
          editedLetter &&
          !letterLooksWrongForStatus(editedLetter, fields.status)
        ) {
          payload.decision_letter_text = editedLetter;
        } else {
          payload.decision_letter_text = generatedLetter || editedLetter || null;
        }
        var uid = null;
        try {
          uid = (global.__PORTAL_SUPABASE__ || {}).session.user.id;
        } catch (_) {}
        if (uid) payload.reviewed_by_user_id = uid;

        saveBtn.disabled = true;
        setMsg("Saving…", "");
        client
          .from(TABLE)
          .update(payload)
          .eq("id", app.id)
          .select(SELECT_COLS)
          .maybeSingle()
          .then(function (res) {
            saveBtn.disabled = false;
            if (res.error) {
              setMsg(res.error.message || "Could not save.", "err");
              return;
            }
            var saved = res.data || app;
            Object.assign(app, saved);
            deps.toast("L&D application updated.");
            setMsg("Saved.", "ok");
            refreshLetterSection(screen, app, client, onSaved);
            if (typeof onSaved === "function") onSaved(saved);
          })
          .catch(function (err) {
            saveBtn.disabled = false;
            setMsg((err && err.message) || "Could not save.", "err");
          });
      });
    }
  }

  function bindCard(root, apps, opts) {
    opts = opts || {};
    if (!root) return;
    var client = opts.client;
    var onFilterChange = opts.onFilterChange;
    var onSaved = opts.onSaved;

    root.querySelectorAll("[data-ldf-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (typeof onFilterChange === "function") onFilterChange(btn.getAttribute("data-ldf-filter"));
      });
    });
    root.querySelectorAll("[data-ldf-review]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-ldf-review");
        var app = (apps || []).filter(function (a) {
          return String(a.id) === String(id);
        })[0];
        if (app) openReview(app, client, onSaved);
      });
    });
  }

  function configure(opts) {
    opts = opts || {};
    if (typeof opts.esc === "function") deps.esc = opts.esc;
    if (typeof opts.toast === "function") deps.toast = opts.toast;
    if (typeof opts.openScreen === "function") deps.openScreen = opts.openScreen;
    if (typeof opts.closeScreen === "function") deps.closeScreen = opts.closeScreen;
    if (typeof opts.icon === "function") deps.icon = opts.icon;
  }

  global.AdminLDFundingReview = {
    configure: configure,
    loadApplications: loadApplications,
    renderCard: renderCard,
    bindCard: bindCard,
    openReview: openReview,
  };
})(typeof window !== "undefined" ? window : globalThis);
