/**
 * Admin / lead overview — read-only Q&A modal for lead reports, venue reviews,
 * incidents, cancellations, and session feedback rows.
 */
(function (global) {
  "use strict";

  var backdropEl = null;

  function clean(v) {
    return String(v == null ? "" : v)
      .replace(/\s+/g, " ")
      .trim();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateOnly(v) {
    var s = clean(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return clean(v) || "—";
    var p = s.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function formatWhen(v) {
    var s = clean(v);
    if (!s) return "—";
    try {
      var d = new Date(s);
      if (Number.isFinite(d.getTime())) {
        return d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (_) {}
    return s;
  }

  function getPayload() {
    if (global.PortalDayOps && typeof global.PortalDayOps.getPayload === "function") {
      return global.PortalDayOps.getPayload() || {};
    }
    return {};
  }

  function getArrayForKind(kind) {
    var p = getPayload();
    if (kind === "lead") return p.lead_session_reports || [];
    if (kind === "venue") return p.venue_reviews || [];
    if (kind === "incident") return p.incident_reports || [];
    if (kind === "cancellation") return p.cancellation_reports || [];
    if (kind === "feedback") return p.session_feedback || [];
    return [];
  }

  function qaRow(label, value, multiline) {
    var v = clean(value);
    if (!v) v = "—";
    var valCls = multiline ? " pfrm-qa__value--block" : "";
    var safe = multiline ? esc(v).replace(/\n/g, "<br>") : esc(v);
    return (
      '<div class="pfrm-qa__row">' +
      '<div class="pfrm-qa__label">' +
      esc(label) +
      "</div>" +
      '<div class="pfrm-qa__value' +
      valCls +
      '">' +
      safe +
      "</div></div>"
    );
  }

  function leadReportKind(r) {
    if (r && r.is_bespoke_programme) return "bespoke";
    var svc = clean(r && r.service).toLowerCase();
    if (svc.indexOf("day centre") !== -1) return "dayCentre";
    if (svc.indexOf("multi-activity") !== -1) return "multiActivity";
    return "group";
  }

  function parseLeadSummaryLine(summary, label) {
    var text = String(summary || "");
    var escLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("^" + escLabel + ":\\s*(.+)$", "im");
    var m = text.match(re);
    return m ? clean(m[1]) : "";
  }

  function leadReportDetailsCell(r) {
    var kind = leadReportKind(r);
    if (kind === "bespoke") {
      var parts = [];
      var eng = clean(r.engagement);
      if (eng) parts.push("Engagement: " + eng);
      var emo = parseLeadSummaryLine(r.summary_text, "Emotions");
      if (emo) parts.push("Emotions: " + emo);
      var indep = parseLeadSummaryLine(r.summary_text, "Independence");
      if (indep) parts.push("Independence: " + indep);
      var inc = clean(r.incidents);
      if (inc) parts.push("Incidents: " + inc);
      return parts.join(" · ") || "—";
    }
    if (kind === "multiActivity" || kind === "group") {
      var gParts = [];
      var act = parseLeadSummaryLine(r.summary_text, "Activity");
      if (act) gParts.push("Activity: " + act);
      var gEng = clean(r.engagement);
      if (gEng) gParts.push("Engagement: " + gEng);
      var gInc = clean(r.incidents);
      if (gInc) gParts.push("Incidents: " + gInc);
      return gParts.join(" · ") || "—";
    }
    if (kind === "dayCentre") {
      var dcParts = [];
      var names = clean(r.client_name);
      if (names) dcParts.push("Participants: " + names);
      var dcEng = clean(r.engagement);
      if (dcEng) dcParts.push("Engagement: " + dcEng);
      var dcInc = clean(r.incidents);
      if (dcInc) dcParts.push("Incidents: " + dcInc);
      return dcParts.join(" · ") || "—";
    }
    return clean(r.engagement) || "—";
  }

  function leadReportSummaryCell(r) {
    var kind = leadReportKind(r);
    if (kind === "bespoke") {
      var pos = clean(r.brief_description);
      var rel = clean(r.other_information);
      var out = [];
      if (pos) out.push("Positive: " + pos);
      if (rel) out.push("Relevant: " + rel);
      return out.join("\n\n") || "—";
    }
    var brief = clean(r.brief_description);
    var extra = clean(r.other_information);
    if (brief && extra) return brief + "\n\nOther: " + extra;
    return brief || extra || "—";
  }

  function leadReportActivity(r) {
    return leadReportDetailsCell(r);
  }

  function leadReportBriefBody(r) {
    return leadReportSummaryCell(r);
  }

  function leadTitle(r) {
    var who = clean(r.submitted_by_name) || "Lead report";
    var when = formatDateOnly(r.session_date);
    return who + (when !== "—" ? " · " + when : "");
  }

  function leadFields(r) {
    var kind = leadReportKind(r);
    var out = [];
    out.push(qaRow("Submitted by", r.submitted_by_name));
    out.push(qaRow("Session date", formatDateOnly(r.session_date)));
    out.push(qaRow("Session time", r.session_time || "—"));
    out.push(qaRow("Service", r.service));
    var venue = parseLeadSummaryLine(r.summary_text, "Venue");
    if (venue) out.push(qaRow("Venue", venue));
    if (kind === "bespoke") {
      if (clean(r.client_name)) out.push(qaRow("Participant", r.client_name));
      out.push(qaRow("Engagement", r.engagement));
      var emo = parseLeadSummaryLine(r.summary_text, "Emotions");
      if (emo) out.push(qaRow("Emotions / regulation", emo, true));
      var indep = parseLeadSummaryLine(r.summary_text, "Independence");
      if (indep) out.push(qaRow("Independence", indep));
      out.push(qaRow("Positive feedback", r.brief_description, true));
      if (clean(r.other_information)) {
        out.push(qaRow("Relevant information", r.other_information, true));
      }
    } else if (kind === "dayCentre") {
      if (clean(r.client_name)) out.push(qaRow("Participants", r.client_name, true));
      out.push(qaRow("Overall group engagement", r.engagement));
      out.push(qaRow("Session summary", r.brief_description, true));
      if (clean(r.other_information)) {
        out.push(qaRow("Other (optional)", r.other_information, true));
      }
    } else if (kind === "multiActivity") {
      out.push(qaRow("Overall group engagement", r.engagement));
      var maAct = parseLeadSummaryLine(r.summary_text, "Activity");
      if (maAct) out.push(qaRow("Activity title", maAct));
      out.push(qaRow("How did the session go?", r.brief_description, true));
      if (clean(r.other_information)) {
        out.push(qaRow("Anything else for the team", r.other_information, true));
      }
    } else {
      out.push(qaRow("Overall group engagement", r.engagement));
      var act = parseLeadSummaryLine(r.summary_text, "Activity");
      if (act) out.push(qaRow("Activity delivered", act));
      out.push(qaRow("Session summary", r.brief_description, true));
      if (clean(r.other_information)) {
        out.push(qaRow("Other (optional)", r.other_information, true));
      }
    }
    out.push(qaRow("Incidents reported", r.incidents));
    out.push(qaRow("Recorded", formatWhen(r.created_at)));
    return out.join("");
  }

  function venueFields(r) {
    return (
      qaRow("Venue", r.venue) +
      qaRow("Review date", formatDateOnly(r.review_date)) +
      qaRow("Time", r.review_time) +
      qaRow("Opening / closing", r.opening_closing) +
      qaRow("Issues to report", r.has_issues ? "Yes" : "No") +
      qaRow("Issue details", r.issues_reported || "—", true) +
      qaRow("Submitted by", r.submitted_by_name) +
      qaRow("Recorded", formatWhen(r.created_at))
    );
  }

  function incidentFields(r) {
    var out =
      qaRow("Submitted by", r.submitted_by_name) +
      qaRow("Session date", formatDateOnly(r.session_date)) +
      qaRow("Session time", r.session_time) +
      qaRow("Incident time", r.incident_time) +
      qaRow("Participant", r.client_name) +
      qaRow("Service", r.service) +
      qaRow("Location", r.location) +
      qaRow("Category", r.incident_category);
    if (clean(r.staff_involved)) out += qaRow("Staff involved", r.staff_involved, true);
    if (clean(r.witness)) out += qaRow("Witness", r.witness, true);
    if (clean(r.statement_before)) out += qaRow("Before session", r.statement_before, true);
    out += qaRow("During session", r.statement_during, true);
    if (clean(r.statement_after)) out += qaRow("After session", r.statement_after, true);
    if (clean(r.injuries_client)) out += qaRow("Client injuries", r.injuries_client, true);
    if (clean(r.injuries_staff)) out += qaRow("Staff injuries", r.injuries_staff, true);
    if (clean(r.injuries_sustained || r.outcome)) {
      out += qaRow("Outcome / injuries (legacy)", r.injuries_sustained || r.outcome, true);
    }
    out += qaRow("Recorded", formatWhen(r.created_at));
    return out;
  }

  function incidentPlainText(r) {
    var lines = [
      "Incident report",
      "Submitted by: " + clean(r.submitted_by_name),
      "Session date: " + formatDateOnly(r.session_date),
      "Participant: " + clean(r.client_name),
      "Category: " + clean(r.incident_category),
      "Service: " + clean(r.service),
    ];
    if (clean(r.statement_before)) lines.push("Before: " + clean(r.statement_before));
    if (clean(r.statement_during)) lines.push("During: " + clean(r.statement_during));
    if (clean(r.statement_after)) lines.push("After: " + clean(r.statement_after));
    if (clean(r.injuries_client)) lines.push("Client injuries: " + clean(r.injuries_client));
    if (clean(r.injuries_staff)) lines.push("Staff injuries: " + clean(r.injuries_staff));
    return lines.join("\n");
  }

  function modalFootHtml(kind) {
    if (kind === "incident") {
      return (
        '<footer class="pfrm-modal__foot pfrm-modal__foot--actions">' +
        '<button type="button" class="pfrm-modal__btn pfrm-modal__btn--pri" data-pfrm-action="notify-parent">Notify parent</button>' +
        '<button type="button" class="pfrm-modal__btn" data-pfrm-action="goto-day">Go to session day</button>' +
        '<button type="button" class="pfrm-modal__btn" data-pfrm-action="copy">Copy report</button>' +
        '<button type="button" class="pfrm-modal__btn" data-pfrm-close>Close</button>' +
        "</footer>"
      );
    }
    if (kind === "cancellation") {
      return (
        '<footer class="pfrm-modal__foot pfrm-modal__foot--actions">' +
        '<button type="button" class="pfrm-modal__btn pfrm-modal__btn--pri" data-pfrm-action="goto-day">Go to session day</button>' +
        '<button type="button" class="pfrm-modal__btn" data-pfrm-action="copy">Copy report</button>' +
        '<button type="button" class="pfrm-modal__btn" data-pfrm-close>Close</button>' +
        "</footer>"
      );
    }
    return (
      '<footer class="pfrm-modal__foot">' +
      '<button type="button" class="pfrm-modal__btn" data-pfrm-close>Close</button>' +
      "</footer>"
    );
  }

  function portalFormsViewCellHtml(kind, idx) {
    return (
      '<td class="ash-td-center col-portal-view">' +
      '<button type="button" class="pfrm-view-btn" data-pfrm-view="' +
      esc(kind) +
      '" data-portal-forms-idx="' +
      esc(String(idx)) +
      '" aria-label="View full report">View</button>' +
      "</td>"
    );
  }

  function cancellationFields(r) {
    return (
      qaRow("Submitted by", r.submitted_by_name) +
      qaRow("Session date", formatDateOnly(r.session_date)) +
      qaRow("Participant", r.client_name) +
      qaRow("Service", r.service) +
      qaRow("Reason", r.reason || r.cancellation_reason, true) +
      qaRow("Notes", r.notes || r.additional_notes, true) +
      qaRow("Recorded", formatWhen(r.created_at))
    );
  }

  function feedbackFields(r) {
    var out =
      qaRow("Participant", r.client_name) +
      qaRow("Session date", formatDateOnly(r.session_date)) +
      qaRow("Service", r.service) +
      qaRow("Instructor", r.completed_by_name) +
      qaRow("Attendance", r.attendance) +
      qaRow("Engagement", r.engagement || r.engagement_rating) +
      qaRow("Emotions / regulation", r.client_emotions) +
      qaRow("Independence", r.independence || r.independence_level);
    if (clean(r.session_narrative)) {
      out += qaRow("Session narrative (staff)", r.session_narrative, true);
    }
    out +=
      qaRow("Positive feedback", r.positive_feedback, true) +
      qaRow("Relevant information", r.relevant_information, true) +
      qaRow("Incidents", r.incidents, true) +
      qaRow("Recorded", formatWhen(r.created_at));
    return out;
  }

  function buildModalHtml(kind, row) {
    var title = "Report";
    var subtitle = "";
    var body = "";
    if (kind === "lead") {
      title = "Lead session report";
      subtitle = leadTitle(row);
      body = leadFields(row);
    } else if (kind === "venue") {
      title = "Venue review";
      subtitle = clean(row.venue) || "Venue";
      body = venueFields(row);
    } else if (kind === "incident") {
      title = "Incident report";
      subtitle = clean(row.client_name) || clean(row.incident_category) || "Incident";
      body = incidentFields(row);
    } else if (kind === "cancellation") {
      title = "Cancellation report";
      subtitle = clean(row.client_name) || "Cancellation";
      body = cancellationFields(row);
    } else if (kind === "feedback") {
      title = "Session feedback";
      subtitle =
        clean(row.client_name) +
        (row.session_date ? " · " + formatDateOnly(row.session_date) : "");
      body = feedbackFields(row);
    } else {
      body = qaRow("Details", JSON.stringify(row, null, 2), true);
    }
    return (
      '<div class="pfrm-modal" role="dialog" aria-modal="true" aria-labelledby="pfrmModalTitle">' +
      '<header class="pfrm-modal__head">' +
      '<h2 id="pfrmModalTitle" class="pfrm-modal__title">' +
      esc(title) +
      "</h2>" +
      (subtitle ? '<p class="pfrm-modal__sub">' + esc(subtitle) + "</p>" : "") +
      '<button type="button" class="pfrm-modal__close" data-pfrm-close aria-label="Close">×</button>' +
      "</header>" +
      '<div class="pfrm-modal__body pfrm-qa">' +
      body +
      "</div>" +
      modalFootHtml(kind) +
      "</div>"
    );
  }

  function closeModal() {
    if (!backdropEl) return;
    try {
      backdropEl.remove();
    } catch (_) {}
    backdropEl = null;
    try {
      document.body.classList.remove("pfrm-modal-open");
    } catch (_2) {}
  }

  function runModalAction(action, kind, row) {
    action = String(action || "").trim();
    if (!row) return;
    if (action === "copy") {
      var text =
        kind === "incident"
          ? incidentPlainText(row)
          : kind === "cancellation"
            ? [
                "Cancellation report",
                "Submitted by: " + clean(row.submitted_by_name || row.instructor_name),
                "Participant: " + clean(row.client_name),
                "Session date: " + formatDateOnly(row.session_date),
                "Reason: " + clean(row.reason_category || row.reason),
                "Notes: " + clean(row.notes || row.additional_notes),
              ].join("\n")
            : JSON.stringify(row, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {
          window.prompt("Copy report:", text);
        });
      } else {
        window.prompt("Copy report:", text);
      }
      return;
    }
    if (action === "notify-parent") {
      if (kind !== "incident") return;
      var notify = global.PortalIncidentParentNotify;
      if (!notify || typeof notify.openNotifyFlow !== "function") {
        window.alert("Notify parent module not loaded — refresh the page.");
        return;
      }
      var btn =
        backdropEl && backdropEl.querySelector
          ? backdropEl.querySelector('[data-pfrm-action="notify-parent"]')
          : null;
      void notify.openNotifyFlow(row, btn);
      return;
    }
    if (action === "goto-day") {
      var iso = clean(row.session_date).slice(0, 10);
      closeModal();
      var ops = global.PortalDayOps;
      var hub = ops && typeof ops.getTrackingHub === "function" ? ops.getTrackingHub() : null;
      if (hub && iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && typeof hub.goToCalendarDay === "function") {
        hub.goToCalendarDay(iso);
      }
    }
  }

  function bindModalEvents(kind, row) {
    if (!backdropEl) return;
    backdropEl.__pfrmKind = kind;
    backdropEl.__pfrmRow = row;
    backdropEl.addEventListener("click", function (ev) {
      var actionBtn = ev.target && ev.target.closest ? ev.target.closest("[data-pfrm-action]") : null;
      if (actionBtn) {
        ev.preventDefault();
        runModalAction(actionBtn.getAttribute("data-pfrm-action"), kind, row);
        return;
      }
      if (ev.target === backdropEl || ev.target.closest("[data-pfrm-close]")) {
        ev.preventDefault();
        closeModal();
      }
    });
    if (!global.__PFRM_KEY_BOUND__) {
      global.__PFRM_KEY_BOUND__ = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && backdropEl) closeModal();
      });
    }
  }

  function openWithRow(kind, row) {
    if (!row) return;
    closeModal();
    backdropEl = document.createElement("div");
    backdropEl.className = "pfrm-modal-backdrop";
    backdropEl.innerHTML = buildModalHtml(kind, row);
    document.body.appendChild(backdropEl);
    document.body.classList.add("pfrm-modal-open");
    bindModalEvents(kind, row);
    var closeBtn = backdropEl.querySelector(".pfrm-modal__close");
    if (closeBtn) closeBtn.focus();
    if (kind === "feedback" && !clean(row.session_narrative)) {
      injectRecoveredNarrativeAudit(row);
    }
  }

  function injectRecoveredNarrativeAudit(row) {
    if (typeof global.portalSessionFeedbackNarrativeAuditConfigureOnce === "function") {
      global.portalSessionFeedbackNarrativeAuditConfigureOnce();
    }
    var audit = global.PortalSessionFeedbackNarrativeAudit;
    if (!audit || typeof audit.fetchLatestForFeedbackRow !== "function") return;
    void audit.fetchLatestForFeedbackRow(row).then(function (res) {
      if (!res || !res.ok || !res.row || !backdropEl) return;
      var narrative = clean(res.row.narrative_en);
      if (!narrative) return;
      var body = backdropEl.querySelector(".pfrm-modal__body");
      if (!body || body.querySelector("[data-pfrm-audit-narrative]")) return;
      var src = clean(res.row.source) || "audit";
      var when = formatWhen(res.row.created_at);
      var staff = clean(res.row.staff_display_name);
      var note =
        "Recovered from narrative audit (" +
        esc(src.replace(/_/g, " ")) +
        (when !== "—" ? " · " + esc(when) : "") +
        (staff ? " · " + esc(staff) : "") +
        "). Not stored on the feedback row when submitted.";
      var html =
        '<div class="pfrm-qa__row" data-pfrm-audit-narrative style="margin-top:12px;padding:10px 12px;border:1px solid #93c5fd;border-radius:10px;background:#eff6ff">' +
        '<div class="pfrm-qa__label">Session narrative (audit recovery)</div>' +
        '<p class="muted" style="margin:0 0 8px;font-size:12px;overflow-wrap:break-word">' +
        note +
        "</p>" +
        '<div class="pfrm-qa__value pfrm-qa__value--block">' +
        esc(narrative).replace(/\n/g, "<br>") +
        "</div></div>";
      var posRow = body.querySelector(".pfrm-qa__row .pfrm-qa__label");
      var insertBefore = null;
      var labels = body.querySelectorAll(".pfrm-qa__label");
      for (var i = 0; i < labels.length; i++) {
        if (clean(labels[i].textContent) === "Positive feedback") {
          insertBefore = labels[i].closest(".pfrm-qa__row");
          break;
        }
      }
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      var block = wrap.firstElementChild;
      if (insertBefore && insertBefore.parentNode) {
        insertBefore.parentNode.insertBefore(block, insertBefore);
      } else {
        body.appendChild(block);
      }
    });
  }

  function open(kind, idx) {
    kind = String(kind || "").trim();
    var i = Number(idx);
    if (!Number.isFinite(i) || i < 0) return;
    var arr = getArrayForKind(kind);
    if (!arr[i]) return;
    openWithRow(kind, arr[i]);
  }

  function incidentTableRowHtml(r, i, escFn, formatFbDate) {
    var escLocal = escFn || esc;
    var fmt = formatFbDate || formatDateOnly;
    var cat = clean(r.incident_category);
    var sessLine = [r.session_date, r.incident_time].filter(Boolean).join(" – ");
    var svc = clean(r.service) || "—";
    var sub = clean(r.client_name) || "—";
    return (
      '<tr class="portal-forms-data-row" data-portal-forms-kind="incident" data-portal-forms-idx="' +
      i +
      '" title="Double-click or View to open full report">' +
      '<td class="ash-td-center col-date">' +
      escLocal(fmt(r.created_at)) +
      "</td>" +
      '<td class="ash-td-center"><div class="portal-forms-cell-main">' +
      escLocal(clean(r.submitted_by_name) || "—") +
      '</div><div class="portal-forms-cell-sub">' +
      escLocal(sub) +
      "</div></td>" +
      '<td class="ash-td-center cell-wrap">' +
      escLocal(cat || "—") +
      "</td>" +
      '<td class="ash-td-center cell-wrap">' +
      escLocal(sessLine || "—") +
      "</td>" +
      '<td class="ash-td-center cell-wrap">' +
      escLocal(svc) +
      "</td>" +
      '<td class="ash-td-center cell-wrap">' +
      escLocal(clean(r.statement_during).slice(0, 80) || "—") +
      "</td>" +
      portalFormsViewCellHtml("incident", i) +
      "</tr>"
    );
  }

  function openPortalFormsRecord(kind, idx, rowOverride) {
    kind = String(kind || "").trim();
    var modal = global.PortalFormRecordModal;
    if (!modal) return;
    if (rowOverride && typeof modal.openWithRow === "function") {
      modal.openWithRow(kind, rowOverride);
      return;
    }
    var i = Number(idx);
    if (!Number.isFinite(i) || i < 0) return;
    if (typeof modal.open === "function") modal.open(kind, i);
  }

  global.PortalFormRecordModal = {
    open: open,
    openWithRow: openWithRow,
    openPortalFormsRecord: openPortalFormsRecord,
    close: closeModal,
    leadReportActivity: leadReportActivity,
    leadReportBriefBody: leadReportBriefBody,
    incidentTableRowHtml: incidentTableRowHtml,
    portalFormsViewCellHtml: portalFormsViewCellHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
