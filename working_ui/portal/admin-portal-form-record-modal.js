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

  function leadReportActivity(r) {
    return clean(r.brief_description || r.activity || r.other_information);
  }

  function leadReportBriefBody(r) {
    return clean(r.brief_description || r.summary_text);
  }

  function leadTitle(r) {
    var who = clean(r.submitted_by_name) || "Lead report";
    var when = formatDateOnly(r.session_date);
    return who + (when !== "—" ? " · " + when : "");
  }

  function leadFields(r) {
    var out = [];
    out.push(qaRow("Submitted by", r.submitted_by_name));
    out.push(qaRow("Session date", formatDateOnly(r.session_date)));
    out.push(qaRow("Session time", r.session_time || "—"));
    out.push(qaRow("Service", r.service));
    if (r.is_bespoke_programme) out.push(qaRow("Programme", "Bespoke Programme"));
    if (clean(r.client_name)) out.push(qaRow("Participant / client", r.client_name));
    out.push(qaRow("Engagement", r.engagement));
    out.push(qaRow("Incidents reported", r.incidents));
    var activity = leadReportActivity(r);
    if (activity) out.push(qaRow("Activity / brief", activity, true));
    if (clean(r.other_information)) out.push(qaRow("Other information", r.other_information, true));
    var brief = leadReportBriefBody(r);
    if (brief && brief !== activity) out.push(qaRow("Session summary", brief, true));
    else if (clean(r.summary_text) && clean(r.summary_text) !== brief) {
      out.push(qaRow("Full report", r.summary_text, true));
    }
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
    return (
      qaRow("Submitted by", r.submitted_by_name) +
      qaRow("Session date", formatDateOnly(r.session_date)) +
      qaRow("Time", r.incident_time) +
      qaRow("Participant", r.client_name) +
      qaRow("Service", r.service) +
      qaRow("Category", r.incident_category) +
      qaRow("What happened", r.statement_during, true) +
      qaRow("Outcome / injuries", r.injuries_sustained || r.outcome, true) +
      qaRow("Recorded", formatWhen(r.created_at))
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
    return (
      qaRow("Participant", r.client_name) +
      qaRow("Session date", formatDateOnly(r.session_date)) +
      qaRow("Service", r.service) +
      qaRow("Instructor", r.completed_by_name) +
      qaRow("Attendance", r.attendance) +
      qaRow("Engagement", r.engagement || r.engagement_rating) +
      qaRow("Emotions / regulation", r.client_emotions) +
      qaRow("Independence", r.independence || r.independence_level) +
      qaRow("Positive feedback", r.positive_feedback, true) +
      qaRow("Relevant information", r.relevant_information, true) +
      qaRow("Incidents", r.incidents, true) +
      qaRow("Recorded", formatWhen(r.created_at))
    );
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
      '<footer class="pfrm-modal__foot">' +
      '<button type="button" class="pfrm-modal__btn" data-pfrm-close>Close</button>' +
      "</footer></div>"
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

  function bindModalEvents() {
    if (!backdropEl) return;
    backdropEl.addEventListener("click", function (ev) {
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
    bindModalEvents();
    var closeBtn = backdropEl.querySelector(".pfrm-modal__close");
    if (closeBtn) closeBtn.focus();
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
    var inj = clean(r.injuries_sustained || r.outcome) || "—";
    var sub = clean(r.client_name) || "—";
    return (
      '<tr class="portal-forms-data-row" data-portal-forms-kind="incident" data-portal-forms-idx="' +
      i +
      '" title="Double-click to view full report">' +
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
      '<td class="ash-td-center cell-wrap">' +
      escLocal(inj.slice(0, 80)) +
      "</td></tr>"
    );
  }

  global.PortalFormRecordModal = {
    open: open,
    openWithRow: openWithRow,
    close: closeModal,
    leadReportActivity: leadReportActivity,
    leadReportBriefBody: leadReportBriefBody,
    incidentTableRowHtml: incidentTableRowHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
