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
    "letter_document_id, letter_generated_at";

  function lettersApi() {
    return global.PortalLDFundingLetters || null;
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
      ".ldf-letter-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
      ".ldf-letter-actions .btn{min-width:0}",
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
      '<p class="muted" style="margin:0 0 10px;font-size:13px">Save updates the application status. Letter tools appear once a decision is recorded.</p>' +
      '<form class="ldf-form" id="ldfReviewForm">' +
      '<div class="ldf-field"><label for="ldfStatus">Decision</label>' +
      '<select id="ldfStatus" name="status" required>' +
      '<option value="pending"' +
      (clean(a.status) === "pending" ? " selected" : "") +
      ">Pending review</option>" +
      '<option value="approved"' +
      (clean(a.status) === "approved" ? " selected" : "") +
      ">Approved</option>" +
      '<option value="approved_conditional"' +
      (clean(a.status) === "approved_conditional" ? " selected" : "") +
      ">Approved with conditions</option>" +
      '<option value="declined"' +
      (clean(a.status) === "declined" ? " selected" : "") +
      ">Declined</option></select></div>" +
      '<div class="ldf-field"><label for="ldfFundingAmount">Approved funding amount (£)</label>' +
      '<input type="number" id="ldfFundingAmount" min="0" step="0.01" inputmode="decimal" value="' +
      esc(a.funding_amount_gbp != null ? String(a.funding_amount_gbp) : "") +
      '" placeholder="e.g. 450.00" /></div>' +
      '<div class="ldf-field"><label for="ldfReimbSchedule">Reimbursement schedule</label>' +
      '<textarea id="ldfReimbSchedule" placeholder="e.g. 50% after 6 months, 50% after 12 months">' +
      esc(a.reimbursement_schedule || "") +
      "</textarea></div>" +
      '<div class="ldf-field"><label for="ldfExceptionalArr">Exceptional funding arrangement</label>' +
      '<textarea id="ldfExceptionalArr" placeholder="If applicable — separate agreement note">' +
      esc(a.exceptional_funding_arrangement || "") +
      "</textarea></div>" +
      '<div class="ldf-field"><label for="ldfConditions">Additional conditions</label>' +
      '<textarea id="ldfConditions" placeholder="Any conditions for approval">' +
      esc(a.additional_conditions || "") +
      "</textarea></div>" +
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

  function letterSectionHtml(app) {
    var L = lettersApi();
    if (!L || !L.isDecided(app)) {
      return (
        '<div class="ldf-section" id="ldfLetterSection" hidden aria-hidden="true"></div>'
      );
    }
    var preview = L.buildEmailBody(app);
    var savedNote = "";
    if (app.letter_generated_at) {
      savedNote =
        '<p class="muted" style="margin:0 0 8px;font-size:12px">Saved to My Documents: ' +
        esc(fmtDateTime(app.letter_generated_at)) +
        "</p>";
    }
    return (
      '<div class="ldf-section" id="ldfLetterSection">' +
      "<h4>Decision letter</h4>" +
      savedNote +
      '<div class="ldf-letter"><pre id="ldfLetterPreview">' +
      esc(preview) +
      '</pre><div class="ldf-letter-actions">' +
      '<button type="button" class="btn btn--sm" id="ldfCopyEmail">Copy email</button>' +
      '<button type="button" class="btn btn--sm" id="ldfPrintLetter">Print</button>' +
      '<button type="button" class="btn btn--sm" id="ldfDownloadPdf">Download PDF</button>' +
      '<button type="button" class="btn btn--sm btn--pri" id="ldfSaveToDocs">Save to My Documents</button>' +
      "</div>" +
      '<p class="ldf-msg" id="ldfLetterMsg" role="status" aria-live="polite"></p></div></div>'
    );
  }

  function readFormApp(screen, baseApp) {
    var a = Object.assign({}, baseApp || {});
    var statusEl = screen.querySelector("#ldfStatus");
    a.status = statusEl ? clean(statusEl.value) : a.status;
    var amountRaw = clean((screen.querySelector("#ldfFundingAmount") || {}).value);
    a.funding_amount_gbp = null;
    if (amountRaw) {
      var n = Number(amountRaw);
      if (Number.isFinite(n) && n >= 0) a.funding_amount_gbp = Math.round(n * 100) / 100;
    }
    a.reimbursement_schedule =
      clean((screen.querySelector("#ldfReimbSchedule") || {}).value) || null;
    a.exceptional_funding_arrangement =
      clean((screen.querySelector("#ldfExceptionalArr") || {}).value) || null;
    a.additional_conditions = clean((screen.querySelector("#ldfConditions") || {}).value) || null;
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

    function setLetterMsg(text, kind) {
      var msg = screen.querySelector("#ldfLetterMsg");
      if (!msg) return;
      msg.textContent = text || "";
      msg.className = "ldf-msg" + (kind === "err" ? " is-err" : kind === "ok" ? " is-ok" : "");
    }

    function refreshPreview() {
      var pre = screen.querySelector("#ldfLetterPreview");
      if (pre) pre.textContent = L.buildEmailBody(currentApp());
    }

    ["#ldfStatus", "#ldfFundingAmount", "#ldfReimbSchedule", "#ldfExceptionalArr", "#ldfConditions"].forEach(
      function (sel) {
        var el = screen.querySelector(sel);
        if (el) el.addEventListener("input", refreshPreview);
        if (el && el.tagName === "SELECT") el.addEventListener("change", refreshPreview);
      }
    );

    var copyBtn = screen.querySelector("#ldfCopyEmail");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        setLetterMsg("Copying…", "");
        L.copyText(L.buildEmailBody(currentApp()))
          .then(function () {
            setLetterMsg("Email copied to clipboard.", "ok");
            deps.toast("L&D letter copied.");
          })
          .catch(function (err) {
            setLetterMsg((err && err.message) || "Could not copy.", "err");
          });
      });
    }

    var printBtn = screen.querySelector("#ldfPrintLetter");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        try {
          L.printLetter(currentApp());
          setLetterMsg("Print dialog opened.", "ok");
        } catch (err) {
          setLetterMsg((err && err.message) || "Could not print.", "err");
        }
      });
    }

    var pdfBtn = screen.querySelector("#ldfDownloadPdf");
    if (pdfBtn) {
      pdfBtn.addEventListener("click", function () {
        pdfBtn.disabled = true;
        setLetterMsg("Building PDF…", "");
        L.buildLetterPdfBlob(currentApp())
          .then(function (blob) {
            L.downloadPdfBlob(blob, L.pdfFilename(currentApp()));
            setLetterMsg("PDF downloaded.", "ok");
          })
          .catch(function (err) {
            setLetterMsg((err && err.message) || "PDF failed.", "err");
          })
          .finally(function () {
            pdfBtn.disabled = false;
          });
      });
    }

    var saveBtn = screen.querySelector("#ldfSaveToDocs");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        if (!client) {
          setLetterMsg("Not connected.", "err");
          return;
        }
        var live = currentApp();
        var staffId = clean(live.submitted_by_user_id);
        if (!staffId) {
          setLetterMsg("Applicant has no portal account linked.", "err");
          return;
        }
        saveBtn.disabled = true;
        setLetterMsg("Saving to My Documents…", "");
        L.buildLetterPdfBlob(live)
          .then(function (blob) {
            var title = L.documentTitle(live);
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
                      title: title,
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
                var docId = ins.data && ins.data.id;
                var now = new Date().toISOString();
                return client
                  .from(TABLE)
                  .update({ letter_document_id: docId, letter_generated_at: now })
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
              "Saved to employee My Documents → Training.",
              "ok"
            );
            deps.toast("L&D letter saved to My Documents.");
            refreshLetterSection(screen, app, client, onSaved);
            if (typeof onLetterSaved === "function") onLetterSaved(app);
          })
          .catch(function (err) {
            setLetterMsg((err && err.message) || "Could not save document.", "err");
          })
          .finally(function () {
            saveBtn.disabled = false;
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
        (lettersApi() && lettersApi().isDecided(app)
          ? '<button type="button" class="btn" id="ldfCopyEmailFoot">Copy email</button>'
          : "") +
        '<button type="button" class="btn btn--pri" id="ldfSaveReview">Save decision</button>',
    });

    bindLetterActions(screen, app, client, onSaved);

    var msg = screen.querySelector("#ldfReviewMsg");
    var saveBtn = screen.querySelector("#ldfSaveReview");

    var copyFoot = screen.querySelector("#ldfCopyEmailFoot");
    if (copyFoot && lettersApi()) {
      copyFoot.addEventListener("click", function () {
        lettersApi()
          .copyText(lettersApi().buildEmailBody(readFormApp(screen, app)))
          .then(function () {
            deps.toast("L&D letter copied.");
          })
          .catch(function (err) {
            if (msg) {
              msg.textContent = (err && err.message) || "Could not copy.";
              msg.className = "ldf-msg is-err";
            }
          });
      });
    }

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
        var statusEl = screen.querySelector("#ldfStatus");
        var status = statusEl ? clean(statusEl.value) : "pending";
        var amountRaw = clean(screen.querySelector("#ldfFundingAmount").value);
        var fundingAmount = null;
        if (amountRaw) {
          var n = Number(amountRaw);
          if (!Number.isFinite(n) || n < 0) {
            setMsg("Enter a valid funding amount or leave blank.", "err");
            return;
          }
          fundingAmount = Math.round(n * 100) / 100;
        }
        var payload = {
          status: status,
          funding_amount_gbp: fundingAmount,
          reimbursement_schedule: clean(screen.querySelector("#ldfReimbSchedule").value) || null,
          exceptional_funding_arrangement: clean(screen.querySelector("#ldfExceptionalArr").value) || null,
          additional_conditions: clean(screen.querySelector("#ldfConditions").value) || null,
          review_notes: clean(screen.querySelector("#ldfReviewNotes").value) || null,
          reviewed_at: new Date().toISOString(),
        };
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
            var foot = screen.closest(".hr-screen") || screen.parentElement;
            if (foot && lettersApi() && lettersApi().isDecided(saved)) {
              var copyExists = screen.querySelector("#ldfCopyEmailFoot");
              if (!copyExists) {
                var saveReviewBtn = screen.querySelector("#ldfSaveReview");
                if (saveReviewBtn && saveReviewBtn.parentElement) {
                  var b = global.document.createElement("button");
                  b.type = "button";
                  b.className = "btn";
                  b.id = "ldfCopyEmailFoot";
                  b.textContent = "Copy email";
                  saveReviewBtn.parentElement.insertBefore(b, saveReviewBtn);
                  b.addEventListener("click", function () {
                    lettersApi()
                      .copyText(lettersApi().buildEmailBody(readFormApp(screen, app)))
                      .then(function () {
                        deps.toast("L&D letter copied.");
                      });
                  });
                }
              }
            }
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
