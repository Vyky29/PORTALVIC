/**
 * Parent portal — participant detail card (General info · Sessions · Swimming term review).
 */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      var s = String(iso).slice(0, 10);
      var p = s.split("-").map(Number);
      var d = new Date(p[0], p[1] - 1, p[2]);
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (_e) {
      return String(iso);
    }
  }

  function participantPhotoHtml(p) {
    p = p || {};
    var name = p.display_name || "Participant";
    var url = String(p.avatar_url || "").trim();
    var initials =
      typeof global.portalParticipantInitials === "function"
        ? global.portalParticipantInitials(name)
        : name.slice(0, 2).toUpperCase();
    var gCls =
      typeof global.portalParticipantGenderClass === "function"
        ? global.portalParticipantGenderClass(name, "pp-pax-photo--")
        : "";
    if (url) {
      return (
        '<div class="pp-pax-photo pp-pax-photo--img' +
        gCls +
        '"><img src="' +
        esc(url) +
        '" alt="" width="64" height="64" loading="lazy" decoding="async" draggable="false" onerror="this.remove();this.parentElement.classList.remove(\'pp-pax-photo--img\');" /><span class="pp-pax-photo__init" aria-hidden="true">' +
        esc(initials) +
        "</span></div>"
      );
    }
    return (
      '<div class="pp-pax-photo pp-pax-photo--init' +
      gCls +
      '" aria-hidden="true">' +
      esc(initials) +
      "</div>"
    );
  }

  function statusChips(p) {
    var chips = [];
    if (p.in_class) chips.push('<span class="pp-chip pp-chip--ok">In class</span>');
    if (p.on_waiting_list) chips.push('<span class="pp-chip pp-chip--wait">Waiting list</span>');
    return chips.join("");
  }

  function generalPanelHtml(data) {
    var p = data.participant || {};
    var g = data.general || {};
    var services = Array.isArray(g.services) ? g.services : [];
    var loc = [p.city, p.postcode].filter(function (x) {
      x = String(x || "").trim();
      return x && x !== "—";
    });
    return (
      '<section class="pp-pax-panel" data-pp-panel="general">' +
      '<div class="pp-pax-info-grid">' +
      '<div class="pp-pax-info-row"><span class="pp-pax-info-k">Name</span><span class="pp-pax-info-v">' +
      esc(p.display_name || "—") +
      "</span></div>" +
      '<div class="pp-pax-info-row"><span class="pp-pax-info-k">Date of birth</span><span class="pp-pax-info-v">' +
      esc(p.dob_display || formatDate(p.dob_iso) || "—") +
      "</span></div>" +
      (loc.length
        ? '<div class="pp-pax-info-row"><span class="pp-pax-info-k">Area</span><span class="pp-pax-info-v">' +
          esc(loc.join(", ")) +
          "</span></div>"
        : "") +
      '<div class="pp-pax-info-row"><span class="pp-pax-info-k">Term</span><span class="pp-pax-info-v">' +
      esc(g.term_label || data.term_label || "—") +
      "</span></div>" +
      "</div>" +
      '<h4 class="pp-pax-subtitle">Programmes</h4>' +
      (services.length
        ? '<ul class="pp-pax-service-list">' +
          services
            .map(function (s) {
              return "<li>" + esc(s) + "</li>";
            })
            .join("") +
          "</ul>"
        : '<p class="pp-muted">Programme details will appear once sessions are recorded.</p>') +
      "</section>"
    );
  }

  function sessionsPanelHtml(data) {
    return (
      '<section class="pp-pax-panel" data-pp-panel="sessions" hidden>' +
      '<div id="ppPaxSessionsHost"></div>' +
      "</section>"
    );
  }

  function swimPanelHtml(data) {
    var g = data.general || {};
    if (!g.has_aquatics) return "";
    var reviews = Array.isArray(data.swim_term_reviews) ? data.swim_term_reviews : [];
    var body;
    if (!reviews.length) {
      body =
        '<p class="pp-muted">Your swimming term review will appear here once your instructor has completed it and the club has published it for families.</p>';
    } else {
      body =
        '<ul class="pp-pax-swim-list">' +
        reviews
          .map(function (r) {
            var when = formatDate(r.related_date || r.ready_at);
            return (
              '<li class="pp-pax-swim-item">' +
              '<div class="pp-pax-swim-copy">' +
              '<strong class="pp-pax-swim-title">' +
              esc(r.title || "Swimming term review") +
              "</strong>" +
              '<span class="pp-muted pp-pax-swim-when">' +
              esc(when) +
              "</span></div>" +
              '<a class="pp-btn pp-btn--primary pp-pax-swim-dl" href="' +
              esc(r.download_url || "#") +
              '" target="_blank" rel="noopener noreferrer">View PDF</a></li>"
            );
          })
          .join("") +
        "</ul>";
    }
    return (
      '<section class="pp-pax-panel" data-pp-panel="swim" hidden>' +
      '<p class="pp-muted pp-pax-swim-intro">Term review from your swimming instructor — progress, stage, and next steps.</p>' +
      body +
      "</section>"
    );
  }

  function bindTabs(root, defaultTab) {
    if (!root) return;
    var tabs = root.querySelectorAll("[data-pp-tab]");
    var panels = root.querySelectorAll("[data-pp-panel]");
    function activate(id) {
      tabs.forEach(function (btn) {
        var on = btn.getAttribute("data-pp-tab") === id;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      panels.forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-pp-panel") !== id;
      });
    }
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activate(btn.getAttribute("data-pp-tab") || "general");
      });
    });
    activate(defaultTab || "sessions");
  }

  function render(hostEl, data, opts) {
    if (!hostEl || !data) return;
    opts = opts || {};
    var p = data.participant || {};
    var g = data.general || {};
    var hasAquatics = !!g.has_aquatics;
    var defaultTab = opts.defaultTab || "sessions";

    hostEl.innerHTML =
      '<div class="pp-pax-shell">' +
      '<header class="pp-pax-hero">' +
      participantPhotoHtml(p) +
      '<div class="pp-pax-hero-copy">' +
      '<h3 class="pp-pax-name">' +
      esc(p.display_name || "Participant") +
      "</h3>" +
      (p.dob_display || p.dob_iso
        ? '<p class="pp-muted pp-pax-dob">DOB ' + esc(p.dob_display || formatDate(p.dob_iso)) + "</p>"
        : "") +
      '<div class="pp-chip-row">' +
      statusChips(p) +
      "</div></div></header>" +
      '<nav class="pp-pax-tabs" role="tablist" aria-label="Participant sections">' +
      '<button type="button" class="pp-pax-tab" role="tab" data-pp-tab="general" aria-selected="false">General info</button>' +
      '<button type="button" class="pp-pax-tab" role="tab" data-pp-tab="sessions" aria-selected="false">Sessions overview</button>' +
      (hasAquatics
        ? '<button type="button" class="pp-pax-tab" role="tab" data-pp-tab="swim" aria-selected="false">Swimming term review</button>'
        : "") +
      "</nav>" +
      generalPanelHtml(data) +
      sessionsPanelHtml(data) +
      swimPanelHtml(data) +
      "</div>";

    bindTabs(hostEl, defaultTab);

    var sessionsHost = hostEl.querySelector("#ppPaxSessionsHost");
    if (
      sessionsHost &&
      global.PortalClientSessionsOverview &&
      typeof global.PortalClientSessionsOverview.renderParent === "function"
    ) {
      global.PortalClientSessionsOverview.renderParent(sessionsHost, {
        sessions: data.sessions || [],
        achievements: data.achievements || [],
        term_label: data.term_label || g.term_label || "",
      });
    } else if (sessionsHost) {
      sessionsHost.innerHTML = '<p class="pp-muted">Sessions overview is unavailable.</p>';
    }
  }

  global.ParentPortalParticipant = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
