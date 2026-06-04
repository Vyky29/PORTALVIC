/**
 * Quick menu — category accordions (footer Quick menu sheet).
 */
(function (global) {
  "use strict";

  var SKIP_GROUP_IDS = { portalQuickMenuNotificationsGroup: true };

  var ACCORDION_LABELS = {
    portalQuickMenuGuideGroup: "Getting started",
    portalAnnualProfileQuickGroup: "Profile",
  };

  var ACCORDION_BY_TITLE = {
    work: {
      theme: "work",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
      chips: ["Photos", "Venue", "Pickup"],
    },
    planning: {
      theme: "plan",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      chips: ["Session plan", "Term review"],
    },
    finance: {
      theme: "finance",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
      chips: ["Timesheets", "Expenses"],
    },
    "my documents": {
      theme: "docs",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      chips: ["Payslips", "Reports", "PDFs"],
    },
    training: {
      theme: "training",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
      chips: ["Induction", "Swimming", "Safeguarding"],
    },
    compliance: {
      theme: "compliance",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      chips: ["Policies", "Risk"],
    },
    settings: {
      theme: "settings",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      chips: ["Alerts", "Logout"],
    },
  };

  var ACCORDION_BY_ID = {
    portalQuickMenuGuideGroup: {
      theme: "start",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      chips: ["Guide", "Job", "Health"],
    },
    portalAnnualProfileQuickGroup: {
      theme: "profile",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      chips: ["Annual check-in"],
    },
  };

  function portalQuickMenuAccordionLabel(grp) {
    if (!grp) return "More";
    var id = String(grp.id || "").trim();
    if (id && ACCORDION_LABELS[id]) return ACCORDION_LABELS[id];
    var titleEl = grp.querySelector(":scope > .menu-group-title");
    if (titleEl) return String(titleEl.textContent || "").trim() || "More";
    return "More";
  }

  function portalQuickMenuAccordionEscape(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function portalQuickMenuAccordionMeta(grp, label) {
    var id = String((grp && grp.id) || "").trim();
    if (id && ACCORDION_BY_ID[id]) return ACCORDION_BY_ID[id];
    var key = String(label || "").trim().toLowerCase();
    if (ACCORDION_BY_TITLE[key]) return ACCORDION_BY_TITLE[key];
    return {
      theme: "settings",
      icon:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
      chips: [],
    };
  }

  function portalQuickMenuAccordionChipsHtml(chips) {
    if (!chips || !chips.length) return "";
    var out = '<span class="menu-accordion-trigger__chips">';
    for (var i = 0; i < chips.length; i++) {
      out +=
        '<span class="menu-accordion-chip">' +
        portalQuickMenuAccordionEscape(chips[i]) +
        "</span>";
    }
    out += "</span>";
    return out;
  }

  function portalQuickMenuAccordionTriggerHtml(label, meta) {
    meta = meta || {};
    return (
      '<span class="menu-accordion-trigger__icon" aria-hidden="true">' +
      (meta.icon || "") +
      '</span><span class="menu-accordion-trigger__body"><span class="menu-accordion-trigger__label">' +
      portalQuickMenuAccordionEscape(label) +
      "</span>" +
      portalQuickMenuAccordionChipsHtml(meta.chips) +
      '</span><span class="menu-accordion-trigger__chev" aria-hidden="true">›</span>'
    );
  }

  function portalApplyQuickMenuAccordionTrigger(trigger, label, meta) {
    if (!trigger) return;
    meta = meta || portalQuickMenuAccordionMeta(null, label);
    trigger.className =
      "menu-accordion-trigger menu-accordion-trigger--theme-" +
      String(meta.theme || "settings");
    trigger.innerHTML = portalQuickMenuAccordionTriggerHtml(label, meta);
  }

  function portalPrepareQuickMenuAccordionGroup(grp) {
    if (!grp || grp.classList.contains("menu-group--accordion-ready")) return;
    var id = String(grp.id || "").trim();
    if (id && SKIP_GROUP_IDS[id]) {
      grp.hidden = true;
      grp.setAttribute("aria-hidden", "true");
      return;
    }
    var label = portalQuickMenuAccordionLabel(grp);
    var meta = portalQuickMenuAccordionMeta(grp, label);
    var titleEl = grp.querySelector(":scope > .menu-group-title");
    var panel = document.createElement("div");
    panel.className = "menu-group-panel";
    panel.hidden = true;

    var kids = Array.prototype.slice.call(grp.children);
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (child === titleEl) {
        child.remove();
        continue;
      }
      if (child.classList && child.classList.contains("menu-accordion-trigger")) continue;
      panel.appendChild(child);
    }

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    portalApplyQuickMenuAccordionTrigger(trigger, label, meta);

    trigger.addEventListener("click", function () {
      var main = grp.parentElement;
      var open = !grp.classList.contains("menu-group--open");
      if (main) {
        var openGroups = main.querySelectorAll(":scope > .menu-group--accordion.menu-group--open");
        for (var g = 0; g < openGroups.length; g++) {
          var other = openGroups[g];
          if (other === grp) continue;
          other.classList.remove("menu-group--open");
          var op = other.querySelector(".menu-group-panel");
          var ot = other.querySelector(".menu-accordion-trigger");
          if (op) op.hidden = true;
          if (ot) ot.setAttribute("aria-expanded", "false");
        }
      }
      grp.classList.toggle("menu-group--open", open);
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    grp.insertBefore(trigger, grp.firstChild);
    grp.appendChild(panel);
    grp.classList.add("menu-group--accordion", "menu-group--accordion-ready");
  }

  function portalHideSkippedQuickMenuGroups(main) {
    try {
      if (!main) main = global.document && global.document.querySelector("#menuSheet .menu-sheet-main");
      if (!main) return;
      for (var id in SKIP_GROUP_IDS) {
        if (!SKIP_GROUP_IDS[id]) continue;
        var grp = global.document.getElementById(id);
        if (!grp) continue;
        grp.hidden = true;
        grp.setAttribute("aria-hidden", "true");
        grp.classList.remove("menu-group--open");
      }
    } catch (_) {}
  }

  function portalInitQuickMenuAccordion(root) {
    try {
      var main =
        (root && root.querySelector && root.querySelector(".menu-sheet-main")) ||
        (root && root.classList && root.classList.contains("menu-sheet-main") ? root : null) ||
        global.document.getElementById("menuSheet");
      if (main && main.classList && main.classList.contains("menu-sheet-main")) {
        /* already the main node */
      } else if (main) {
        main = main.querySelector(".menu-sheet-main");
      }
      if (!main) return;
      portalHideSkippedQuickMenuGroups(main);
      var groups = main.querySelectorAll(":scope > .menu-group");
      for (var i = 0; i < groups.length; i++) {
        portalPrepareQuickMenuAccordionGroup(groups[i]);
      }
    } catch (_) {}
  }

  function portalCollapseQuickMenuAccordions() {
    try {
      var main = global.document && global.document.querySelector("#menuSheet .menu-sheet-main");
      if (!main) return;
      var openGroups = main.querySelectorAll(":scope > .menu-group--accordion.menu-group--open");
      for (var i = 0; i < openGroups.length; i++) {
        var grp = openGroups[i];
        grp.classList.remove("menu-group--open");
        var panel = grp.querySelector(".menu-group-panel");
        var trigger = grp.querySelector(".menu-accordion-trigger");
        if (panel) panel.hidden = true;
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    } catch (_) {}
  }

  function portalRefreshQuickMenuAccordion(opts) {
    portalInitQuickMenuAccordion();
    if (!opts || opts.collapse !== false) portalCollapseQuickMenuAccordions();
  }

  function portalUpdateQuickMenuAccordionLabel(groupId, label, chips) {
    try {
      var grp = global.document && global.document.getElementById(groupId);
      if (!grp || !label) return;
      var trigger = grp.querySelector(".menu-accordion-trigger");
      if (!trigger) return;
      var meta = portalQuickMenuAccordionMeta(grp, label);
      if (Array.isArray(chips) && chips.length) {
        meta = { theme: meta.theme, icon: meta.icon, chips: chips };
      } else if (String(label).trim().toLowerCase() === "schedule changes") {
        meta = {
          theme: meta.theme,
          icon: meta.icon,
          chips: ["Roster change"],
        };
      }
      portalApplyQuickMenuAccordionTrigger(trigger, String(label).trim(), meta);
    } catch (_) {}
  }

  global.portalHideSkippedQuickMenuGroups = portalHideSkippedQuickMenuGroups;
  global.portalUpdateQuickMenuAccordionLabel = portalUpdateQuickMenuAccordionLabel;
  global.portalInitQuickMenuAccordion = portalInitQuickMenuAccordion;
  global.portalCollapseQuickMenuAccordions = portalCollapseQuickMenuAccordions;
  global.portalRefreshQuickMenuAccordion = portalRefreshQuickMenuAccordion;

  if (global.document) {
    function onReady() {
      portalInitQuickMenuAccordion();
    }
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
