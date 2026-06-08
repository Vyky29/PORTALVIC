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

  function todayIsoDate() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function roleLabelFromProfile(profile) {
    var role = String((profile && profile.app_role) || "").toLowerCase();
    if (role === "ceo") return "CEO";
    if (role === "admin") return "Administrator";
    return "";
  }

  function withSignOffDefaults(record, opts) {
    opts = opts || {};
    record = Object.assign(emptyRecord(), record || {});
    if (!record.sign_off_date) record.sign_off_date = todayIsoDate();
    if (!record.conducted_by_name && opts.adminProfile) {
      record.conducted_by_name = String(
        (opts.adminProfile.full_name || opts.adminProfile.username) || ""
      ).trim();
    }
    if (!record.conducted_by_role && opts.adminProfile) {
      record.conducted_by_role = roleLabelFromProfile(opts.adminProfile);
    }
    return record;
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
      conducted_by_name: "",
      conducted_by_role: "",
      sign_off_date: "",
      sign_off_confirmed: false,
    };
  }

  function validateForComplete(record) {
    record = record || emptyRecord();
    if (!record.outcome) {
      return {
        ok: false,
        message: "Please select an outcome before marking the 1-to-1 complete.",
        field: "wbOutcome",
      };
    }
    if (!record.conducted_by_name) {
      return {
        ok: false,
        message: "Please enter who led this 1-to-1.",
        field: "wbConductedBy",
      };
    }
    if (!record.sign_off_confirmed) {
      return {
        ok: false,
        message: "Please confirm the record is accurate before completing.",
        field: "wbSignOffConfirm",
      };
    }
    return { ok: true };
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

  function conversationDisplayText(record) {
    record = record || emptyRecord();
    if (record.manager_notes) return record.manager_notes;
    var parts = [];
    if (record.main_concern) parts.push(record.main_concern);
    if (record.impact) parts.push("Impact: " + record.impact);
    if (record.support_requested) parts.push("Support requested: " + record.support_requested);
    return parts.join("\n\n");
  }

  function buildFlaggedHtml(checkin, wb) {
    var flagged = wb && wb.flaggedDomainsList ? wb.flaggedDomainsList(checkin) : [];
    if (!flagged.length) {
      return checkin.general_note
        ? ""
        : '<p class="portal-wb-flagged-area portal-wb-flagged-area--quiet">No specific areas flagged.</p>';
    }
    return flagged
      .map(function (f) {
        var chips =
          f.stressors && f.stressors.length
            ? '<div class="portal-wb-stressor-chips">' +
              f.stressors
                .map(function (s) {
                  return '<span class="portal-wb-stressor-chip">' + esc(s) + "</span>";
                })
                .join("") +
              "</div>"
            : "";
        var note = "";
        var entry = (checkin.domains || {})[f.key];
        if (entry && entry.note) {
          note = '<p class="portal-wb-staff-quote">' + esc(entry.note) + "</p>";
        }
        return (
          '<div class="portal-wb-flagged-area">' +
          "<h3>" +
          esc(f.label) +
          "</h3>" +
          chips +
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
      "<h2>Staff check-in</h2>" +
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

  function renderDecisions(host, record) {
    record = record || emptyRecord();
    var actionsHtml = QUICK_ACTIONS.map(function (a) {
      var on = (record.quick_actions || []).indexOf(a.id) >= 0;
      return (
        '<button type="button" class="portal-wb-action-pill' +
        (on ? " is-active" : "") +
        '" data-wb-action="' +
        a.id +
        '">' +
        esc(a.label) +
        "</button>"
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
      '<section class="portal-wb-simple__section portal-wb-decisions" id="portalWbDecisions">' +
      "<h2>Record outcome</h2>" +
      '<p class="portal-wb-section-lead">How serious is this, and what happens next?</p>' +
      '<div class="portal-wb-decisions__row">' +
      '<div class="field"><span class="portal-wb-field-label">Concern level</span><div class="portal-wb-concern-levels portal-wb-concern-levels--compact" id="wbConcernLevels">' +
      concernHtml +
      "</div></div>" +
      '<div class="field portal-wb-decisions__outcome"><label for="wbOutcome">Outcome</label><select id="wbOutcome"><option value="">Select outcome</option>' +
      outcomeHtml +
      "</select></div>" +
      "</div>" +
      '<div class="field"><span class="portal-wb-field-label">Actions agreed</span><div class="portal-wb-action-pills" id="wbQuickActions">' +
      actionsHtml +
      "</div></div>" +
      '<div class="field" id="wbQuickActionsOtherWrap" hidden><label for="wbQuickActionsOther">Other action</label><input type="text" id="wbQuickActionsOther" value="' +
      esc(record.quick_actions_other) +
      '" placeholder="Describe other action" /></div>' +
      '<div class="field portal-wb-decisions__review"><label for="wbReviewDate">Follow-up review date</label><input type="date" id="wbReviewDate" value="' +
      esc(record.review_date) +
      '" /></div>' +
      '<div id="wbEscalationFields" class="portal-wb-escalation" hidden>' +
      '<div class="field"><label for="wbEscalationNotes">Escalation notes</label><textarea id="wbEscalationNotes" rows="2">' +
      esc(record.escalation_notes) +
      "</textarea></div>" +
      '<div class="portal-wb-decisions__row">' +
      '<div class="field"><label for="wbEscalatedTo">Escalated to</label><input type="text" id="wbEscalatedTo" value="' +
      esc(record.escalated_to) +
      '" /></div>' +
      '<div class="field"><label for="wbEscalationDate">Escalation date</label><input type="date" id="wbEscalationDate" value="' +
      esc(record.escalation_date) +
      '" /></div></div></div></section>";

    wireDecisionsInteractions(host);
  }

  function renderClosing(host, record) {
    record = record || emptyRecord();
    host.innerHTML =
      '<section class="portal-wb-simple__section portal-wb-conversation" id="portalWbConversation">' +
      "<h2>Conversation notes</h2>" +
      '<p class="portal-wb-section-lead">Optional — a short record of what you discussed.</p>' +
      '<div class="field"><label for="wbConversationNotes">What was discussed</label><textarea id="wbConversationNotes" rows="4" placeholder="Key points from the conversation…">' +
      esc(conversationDisplayText(record)) +
      "</textarea></div>" +
      '<div class="field"><label for="wbAgreedActions">Agreed actions &amp; follow-up</label><textarea id="wbAgreedActions" rows="3" placeholder="Who does what, and by when…">' +
      esc(record.agreed_actions) +
      "</textarea></div>" +
      "</section>" +
      '<section class="portal-wb-simple__section portal-wb-signoff" id="portalWbSignOff">' +
      "<h2>Sign off</h2>" +
      '<div class="portal-wb-signoff__grid">' +
      '<div class="field"><label for="wbConductedBy">Led by</label><input type="text" id="wbConductedBy" autocomplete="name" value="' +
      esc(record.conducted_by_name) +
      '" placeholder="Your name" /></div>' +
      '<div class="field"><label for="wbConductedRole">Role</label><input type="text" id="wbConductedRole" autocomplete="organization-title" value="' +
      esc(record.conducted_by_role) +
      '" placeholder="e.g. Ops Admin" /></div>' +
      '<div class="field"><label for="wbSignOffDate">Date</label><input type="date" id="wbSignOffDate" value="' +
      esc(record.sign_off_date) +
      '" /></div>' +
      "</div>" +
      '<label class="portal-wb-signoff__confirm">' +
      '<input type="checkbox" id="wbSignOffConfirm"' +
      (record.sign_off_confirmed ? " checked" : "") +
      " />" +
      "<span>I confirm this 1-to-1 took place and the record is accurate.</span>" +
      "</label>" +
      "</section>";

    wireClosingInteractions(host);
  }

  function wireDecisionsInteractions(host) {
    host.querySelectorAll("[data-wb-concern]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        host.querySelectorAll("[data-wb-concern]").forEach(function (b) {
          b.classList.remove("is-active");
        });
        btn.classList.add("is-active");
      });
    });

    host.querySelectorAll("[data-wb-action]").forEach(function (pill) {
      pill.addEventListener("click", function () {
        pill.classList.toggle("is-active");
        if (pill.getAttribute("data-wb-action") === "other") syncOtherAction(host);
      });
    });

    function syncOtherAction(scope) {
      var otherWrap = scope.querySelector("#wbQuickActionsOtherWrap");
      var otherPill = scope.querySelector('[data-wb-action="other"]');
      if (!otherWrap || !otherPill) return;
      otherWrap.hidden = !otherPill.classList.contains("is-active");
    }
    syncOtherAction(host);

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

  function wireClosingInteractions() {}

  function collectRecord(root) {
    var record = emptyRecord();
    var el = function (id) {
      return root.querySelector("#" + id);
    };
    record.manager_notes = el("wbConversationNotes") ? el("wbConversationNotes").value.trim() : "";
    record.agreed_actions = el("wbAgreedActions") ? el("wbAgreedActions").value.trim() : "";
    record.review_date = el("wbReviewDate") ? el("wbReviewDate").value : "";
    record.quick_actions = [];
    root.querySelectorAll("[data-wb-action].is-active").forEach(function (pill) {
      record.quick_actions.push(pill.getAttribute("data-wb-action"));
    });
    record.quick_actions_other = el("wbQuickActionsOther") ? el("wbQuickActionsOther").value.trim() : "";
    var activeConcern = root.querySelector("[data-wb-concern].is-active");
    record.concern_level = activeConcern ? activeConcern.getAttribute("data-wb-concern") : "";
    record.outcome = el("wbOutcome") ? el("wbOutcome").value : "";
    record.escalation_notes = el("wbEscalationNotes") ? el("wbEscalationNotes").value.trim() : "";
    record.escalated_to = el("wbEscalatedTo") ? el("wbEscalatedTo").value.trim() : "";
    record.escalation_date = el("wbEscalationDate") ? el("wbEscalationDate").value : "";
    record.conducted_by_name = el("wbConductedBy") ? el("wbConductedBy").value.trim() : "";
    record.conducted_by_role = el("wbConductedRole") ? el("wbConductedRole").value.trim() : "";
    record.sign_off_date = el("wbSignOffDate") ? el("wbSignOffDate").value : "";
    record.sign_off_confirmed = !!(el("wbSignOffConfirm") && el("wbSignOffConfirm").checked);
    return record;
  }

  function renderReviewForm(decisionsHost, closingHost, record) {
    renderDecisions(decisionsHost, record);
    renderClosing(closingHost, record);
  }

  function mountClosingHost(form) {
    var existing = document.getElementById("portalWbClosingHost");
    if (existing) return existing;
    var closingHost = document.createElement("div");
    closingHost.id = "portalWbClosingHost";
    closingHost.className = "portal-wb-simple portal-wb-closing";
    var wrap = document.getElementById("portalWbAdvancedWrap");
    if (wrap) wrap.insertAdjacentElement("afterend", closingHost);
    else form.appendChild(closingHost);
    return closingHost;
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
      "Optional detail per stressor from the check-in. Tap 1–5 for seriousness and likelihood, then note agreed actions.";
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
    var decisionsHost = document.createElement("div");
    decisionsHost.id = "portalWbDecisionsHost";
    root.innerHTML = "";
    root.appendChild(summaryHost);
    root.appendChild(decisionsHost);

    var record = withSignOffDefaults((opts.draft && opts.draft.simple) || emptyRecord(), {
      adminProfile: opts.adminProfile,
    });

    renderSummary(summaryHost, checkin, wb);
    wrapAdvancedSections(form);
    var closingHost = mountClosingHost(form);
    renderReviewForm(decisionsHost, closingHost, record);

    return {
      root: root,
      form: form,
      collect: function () {
        return collectRecord(form);
      },
      apply: function (nextRecord) {
        renderReviewForm(
          decisionsHost,
          closingHost,
          withSignOffDefaults(nextRecord || emptyRecord(), { adminProfile: opts.adminProfile })
        );
      },
    };
  }

  function markAdminReady() {
    if (typeof document === "undefined") return;
    document.documentElement.classList.remove("portal-wb-admin-booting");
    document.documentElement.classList.add("portal-wb-admin-ready");
    if (document.body) document.body.classList.add("portal-wb-admin-ready");
  }

  global.portalWellbeingReviewSimple = {
    emptyRecord: emptyRecord,
    parseDraft: parseDraft,
    validateForComplete: validateForComplete,
    markAdminReady: markAdminReady,
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
