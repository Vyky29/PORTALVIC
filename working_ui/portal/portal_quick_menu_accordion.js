/**
 * Quick menu — category accordions (footer Quick menu sheet).
 */
(function (global) {
  "use strict";

  var ACCORDION_LABELS = {
    portalQuickMenuNotificationsGroup: "Alerts & updates",
    portalQuickMenuGuideGroup: "Getting started",
    portalAnnualProfileQuickGroup: "Profile",
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

  function portalPrepareQuickMenuAccordionGroup(grp) {
    if (!grp || grp.classList.contains("menu-group--accordion-ready")) return;
    var label = portalQuickMenuAccordionLabel(grp);
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
    trigger.className = "menu-accordion-trigger";
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML =
      '<span class="menu-accordion-trigger__label">' +
      portalQuickMenuAccordionEscape(label) +
      '</span><span class="menu-accordion-trigger__chev" aria-hidden="true">›</span>';

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

  function portalUpdateQuickMenuAccordionLabel(groupId, label) {
    try {
      var grp = global.document && global.document.getElementById(groupId);
      if (!grp || !label) return;
      var span = grp.querySelector(".menu-accordion-trigger__label");
      if (span) span.textContent = String(label).trim();
    } catch (_) {}
  }

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
