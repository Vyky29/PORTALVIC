/**
 * Simplified 1-to-1 wellbeing conversation record (admin mode).
 */
(function (global) {
  "use strict";

  var QUICK_ACTIONS = [
    { id: "follow_up_meeting", label: "Follow up meeting" },
    { id: "additional_supervision", label: "Additional supervision" },
    { id: "adjust_workload", label: "Adjust workload" },
    { id: "clarify_responsibilities", label: "Clarify responsibilities" },
    { id: "additional_training", label: "Additional training" },
    { id: "welfare_check", label: "Welfare check" },
    { id: "other", label: "Other" },
  ];

  var CONCERN_LEVELS = [
    { id: "low", title: "Low", sub: "Minor concern. Monitor if needed." },
    { id: "moderate", title: "Moderate", sub: "Action plan required." },
    { id: "high", title: "High", sub: "Immediate support required." },
  ];

  var OUTCOMES = [
    { id: "resolved", label: "Resolved" },
    { id: "monitoring", label: "Monitoring" },
    { id: "ongoing_support", label: "Ongoing support required" },
    { id: "escalated", label: "Escalated" },
  ];

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function emptyRecord() {
    return {
      main_concern: "",
      impact: "",
      support_requested: "",
      manager_notes: "",
      agreed_actions: "",
      review_date: "",
      quick_actions: [],
      quick_actions_other: "",
      concern_level: "",
      outcome: "",
      escalation_notes: "",
      escalated_to: "",
      escalation_date: "",
    };
  }

  function parseDraft(draftJson) {
    if (!draftJson) return { version: 2, simple: emptyRecord(), legacy_values: null };
    if (Array.isArray(draftJson)) {
      return { version: 1, simple: emptyRecord(), legacy_values: draftJson };
    }
    if (typeof draftJson === "object") {
      return {
        version: draftJson.version || 2,
        simple: Object.assign(emptyRecord(), draftJson.simple || {}),
        legacy_values: draftJson.legacy_values || null,
      };
    }
    return { version: 2, simple: emptyRecord(), legacy_values: null };
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return String(iso);
    }
  }

  function buildFlaggedHtml(checkin, wb) {
    var flagged = wb && wb.flaggedDomainsList ? wb.flaggedDomainsList(checkin) : [];
    if (!flagged.length) {
      return '<p class="portal-wb-flagged-area">No specific areas were flagged. See the general note if provided.</p>';
    }
    return flagged
      .map(function (f) {
        var stressorList =
          f.stressors && f.stressors.length
            ? "<ul>" + f.stressors.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>"
            : "";
        var note = "";
        var entry = (checkin.domains || {})[f.key];
        if (entry && entry.note) {
          note = '<p><strong>Staff comments:</strong> ' + esc(entry.note) + "</p>";
        }
        return (
          '<div class="portal-wb-flagged-area">' +
          "<h3>" +
          esc(f.label) +
          "</h3>" +
          (stressorList ? "<p><strong>Selected stressors:</strong></p>" + stressorList : "") +
          note +
          "</div>"
        );
      })
      .join("");
  }

  function renderSummary(host, checkin, wb) {
    var areas = wb && wb.flaggedDomainsList ? wb.flaggedDomainsList(checkin) : [];
    var areasText = areas.map(function (a) { return a.label; }).join(", ") || "—";
    host.innerHTML =
      '<section class="portal-wb-simple__section" id="portalWbStaffSummary">' +
      "<h2>Staff Concern Summary</h2>" +
      '<dl class="portal-wb-simple__meta">' +
      "<div><dt>Staff member</dt><dd>" +
      esc(checkin.staff_name) +
      "</dd></div>" +
      "<div><dt>Check-in date</dt><dd>" +
      esc(formatDate(checkin.created_at)) +
      "</dd></div>" +
      "<div><dt>Support requested</dt><dd>Yes</dd></div>" +
      "<div><dt>Areas flagged</dt><dd>" +
      esc(areasText) +
      "</dd></div>" +
      "</dl>" +
      buildFlaggedHtml(checkin, wb) +
      (checkin.general_note
        ? '<div class="portal-wb-flagged-area"><h3>General message</h3><p>' + esc(checkin.general_note) + "</p></div>"
        : "") +
      "</section>";
  }

  function renderForm(host, record) {
    record = record || emptyRecord();
    var actionsHtml = QUICK_ACTIONS.map(function (a) {
      var on = (record.quick_actions || []).indexOf(a.id) >= 0;
      return (
        '<label><input type="checkbox" data-wb-action="' +
        a.id +
        '"' +
        (on ? " checked" : "") +
        " /> " +
        esc(a.label) +
        "</label>"
      );
    }).join("");

    var concernHtml = CONCERN_LEVELS.map(function (c) {
      var active = record.concern_level === c.id;
      return (
        '<button type="button" class="portal-wb-concern-level' +
        (active ? " is-active" : "") +
        '" data-wb-concern="' +
        c.id +
        '"><strong>' +
        esc(c.title) +
        "</strong><span>" +
        esc(c.sub) +
        "</span></button>"
      );
    }).join("");

    var outcomeHtml = OUTCOMES.map(function (o) {
      return (
        '<option value="' +
        o.id +
        '"' +
        (record.outcome === o.id ? " selected" : "") +
        ">" +
        esc(o.label) +
        "</option>"
      );
    }).join("");

    host.innerHTML =
      '<section class="portal-wb-simple__section" id="portalWbConversation">' +
      "<h2>Wellbeing Conversation Notes</h2>" +
      '<div class="field"><label for="wbMainConcern">Main concern discussed</label><textarea id="wbMainConcern" rows="3">' +
      esc(record.main_concern) +
      "</textarea></div>" +
      '<div class="field"><label for="wbImpact">Impact on work or wellbeing</label><textarea id="wbImpact" rows="3">' +
      esc(record.impact) +
      "</textarea></div>" +
      '<div class="field"><label for="wbSupportRequested">Support requested by staff</label><textarea id="wbSupportRequested" rows="3">' +
      esc(record.support_requested) +
      "</textarea></div>" +
      '<div class="field"><label for="wbManagerNotes">Manager notes</label><textarea id="wbManagerNotes" rows="4">' +
      esc(record.manager_notes) +
      "</textarea></div>" +
      '<div class="field"><label for="wbAgreedActions">Agreed actions</label><textarea id="wbAgreedActions" rows="4">' +
      esc(record.agreed_actions) +
      "</textarea></div>" +
      '<div class="field"><label for="wbReviewDate">Review date</label><input type="date" id="wbReviewDate" value="' +
      esc(record.review_date) +
      '" /></div>' +
      '<div class="field"><span class="portal-wb-field-label">Quick actions</span><div class="portal-wb-simple__actions-grid" id="wbQuickActions">' +
      actionsHtml +
      "</div></div>" +
      '<div class="field" id="wbQuickActionsOtherWrap" hidden><label for="wbQuickActionsOther">Other (please specify)</label><textarea id="wbQuickActionsOther" rows="2">' +
      esc(record.quick_actions_other) +
      "</textarea></div>" +
      "</section>" +
      '<section class="portal-wb-simple__section" id="portalWbConcernLevel">' +
      "<h2>Overall concern level</h2>" +
      '<div class="portal-wb-concern-levels" id="wbConcernLevels">' +
      concernHtml +
      "</div></section>" +
      '<section class="portal-wb-simple__section" id="portalWbOutcome">' +
      "<h2>Outcome</h2>" +
      '<div class="field"><label for="wbOutcome">Outcome</label><select id="wbOutcome"><option value="">Select outcome</option>' +
      outcomeHtml +
      "</select></div>" +
      '<div id="wbEscalationFields" hidden>' +
      '<div class="field"><label for="wbEscalationNotes">Escalation notes</label><textarea id="wbEscalationNotes" rows="3">' +
      esc(record.escalation_notes) +
      "</textarea></div>" +
      '<div class="field"><label for="wbEscalatedTo">Escalated to</label><input type="text" id="wbEscalatedTo" value="' +
      esc(record.escalated_to) +
      '" /></div>' +
      '<div class="field"><label for="wbEscalationDate">Escalation date</label><input type="date" id="wbEscalationDate" value="' +
      esc(record.escalation_date) +
      '" /></div></div></section>";

    wireFormInteractions(host, record);
  }

  function wireFormInteractions(host, record) {
    host.querySelectorAll("[data-wb-concern]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        host.querySelectorAll("[data-wb-concern]").forEach(function (b) {
          b.classList.remove("is-active");
        });
        btn.classList.add("is-active");
      });
    });

    var otherWrap = host.querySelector("#wbQuickActionsOtherWrap");
    var otherBox = host.querySelector('[data-wb-action="other"]');
    function syncOther() {
      if (!otherWrap || !otherBox) return;
      otherWrap.hidden = !otherBox.checked;
    }
    if (otherBox) {
      otherBox.addEventListener("change", syncOther);
      syncOther();
    }

    var outcomeSel = host.querySelector("#wbOutcome");
    var escFields = host.querySelector("#wbEscalationFields");
    function syncEscalation() {
      if (!outcomeSel || !escFields) return;
      escFields.hidden = outcomeSel.value !== "escalated";
    }
    if (outcomeSel) {
      outcomeSel.addEventListener("change", syncEscalation);
      syncEscalation();
    }
  }

  function collectRecord(root) {
    var record = emptyRecord();
    var el = function (id) {
      return root.querySelector("#" + id);
    };
    record.main_concern = el("wbMainConcern") ? el("wbMainConcern").value.trim() : "";
    record.impact = el("wbImpact") ? el("wbImpact").value.trim() : "";
    record.support_requested = el("wbSupportRequested") ? el("wbSupportRequested").value.trim() : "";
    record.manager_notes = el("wbManagerNotes") ? el("wbManagerNotes").value.trim() : "";
    record.agreed_actions = el("wbAgreedActions") ? el("wbAgreedActions").value.trim() : "";
    record.review_date = el("wbReviewDate") ? el("wbReviewDate").value : "";
    record.quick_actions = [];
    root.querySelectorAll("[data-wb-action]").forEach(function (cb) {
      if (cb.checked) record.quick_actions.push(cb.getAttribute("data-wb-action"));
    });
    record.quick_actions_other = el("wbQuickActionsOther") ? el("wbQuickActionsOther").value.trim() : "";
    var activeConcern = root.querySelector("[data-wb-concern].is-active");
    record.concern_level = activeConcern ? activeConcern.getAttribute("data-wb-concern") : "";
    record.outcome = el("wbOutcome") ? el("wbOutcome").value : "";
    record.escalation_notes = el("wbEscalationNotes") ? el("wbEscalationNotes").value.trim() : "";
    record.escalated_to = el("wbEscalatedTo") ? el("wbEscalatedTo").value.trim() : "";
    record.escalation_date = el("wbEscalationDate") ? el("wbEscalationDate").value : "";
    return record;
  }

  function applyRecord(root, record) {
    renderForm(root.querySelector("#portalWbConversationHost") || root, record);
  }

  function wrapAdvancedSections(form) {
    if (!form || form.dataset.wbAdvancedWrapped === "1") return;
    form.dataset.wbAdvancedWrapped = "1";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "portalWbToggleAdvanced";
    toggle.className = "portal-wb-advanced-toggle no-print";
    toggle.textContent = "Advanced Stress Risk Assessment";
    toggle.setAttribute("aria-expanded", "false");

    var wrap = document.createElement("div");
    wrap.id = "portalWbAdvancedWrap";
    wrap.className = "portal-wb-advanced-wrap";
    wrap.hidden = true;

    var intro = document.createElement("p");
    intro.className = "portal-wb-advanced-intro no-print";
    intro.textContent =
      "One card per stressor from the staff check-in. Discuss each point together, rate how serious and how likely it is, then note agreed actions.";
    wrap.appendChild(intro);

    var move = [];
    Array.prototype.forEach.call(form.children, function (child) {
      if (child.classList && child.classList.contains("header")) return;
      if (child.id === "portalWbSimpleRoot") return;
      move.push(child);
    });
    move.forEach(function (node) {
      wrap.appendChild(node);
    });

    var simpleRoot = document.getElementById("portalWbSimpleRoot");
    if (simpleRoot) {
      simpleRoot.insertAdjacentElement("afterend", toggle);
      toggle.insertAdjacentElement("afterend", wrap);
    } else {
      form.appendChild(toggle);
      form.appendChild(wrap);
    }

    toggle.addEventListener("click", function () {
      var open = wrap.hidden;
      wrap.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open
        ? "Hide Advanced Stress Risk Assessment"
        : "Advanced Stress Risk Assessment";
    });
  }

  function mountAdminSimpleReview(opts) {
    opts = opts || {};
    var form = document.getElementById("sra-form");
    var checkin = opts.checkin;
    var wb = opts.wb || global.portalWellbeingCheckin;
    if (!form || !checkin || !wb) return null;

    var root = document.getElementById("portalWbSimpleRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "portalWbSimpleRoot";
      root.className = "portal-wb-simple";
      var header = form.querySelector(".header");
      if (header) header.insertAdjacentElement("afterend", root);
      else form.prepend(root);
    }

    var summaryHost = document.createElement("div");
    var formHost = document.createElement("div");
    formHost.id = "portalWbConversationHost";
    root.innerHTML = "";
    root.appendChild(summaryHost);
    root.appendChild(formHost);

    renderSummary(summaryHost, checkin, wb);
    renderForm(formHost, (opts.draft && opts.draft.simple) || emptyRecord());
    wrapAdvancedSections(form);

    var sub = document.getElementById("sraHeroSubtitle");
    if (sub) sub.textContent = "Wellbeing conversation record";

    return {
      root: root,
      collect: function () {
        return collectRecord(root);
      },
      apply: function (record) {
        renderForm(formHost, record || emptyRecord());
      },
    };
  }

  global.portalWellbeingReviewSimple = {
    emptyRecord: emptyRecord,
    parseDraft: parseDraft,
    mountAdminSimpleReview: mountAdminSimpleReview,
    statusLabel: function (status) {
      var map = {
        all_clear: "All good",
        needs_1to1: "Awaiting 1 to 1",
        awaiting_1to1: "Awaiting 1 to 1",
        in_progress: "In progress",
        completed: "Completed",
        monitoring: "Monitoring",
      };
      return map[String(status || "").toLowerCase()] || String(status || "").replace(/_/g, " ");
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
