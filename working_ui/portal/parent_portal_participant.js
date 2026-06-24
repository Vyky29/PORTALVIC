/**
 * Parent portal — participant hub (staff-style General Info + Sessions Overview buttons).
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

  function normName(v) {
    return String(v || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseGeneralInfoSheet(raw) {
    var t = String(raw || "").trim();
    if (!t) return [];
    var chunks = [];
    if (/\n\s*\d+\.\s+/.test(t)) {
      chunks = t.split(/\n(?=\s*\d+\.\s+)/).map(function (s) {
        return s.trim();
      }).filter(Boolean);
    }
    if (chunks.length < 2) {
      chunks = t.split(/\s(?=\d+\.\s+)/).map(function (s) {
        return s.trim();
      }).filter(Boolean);
    }
    var rowRe = /^(\d+)\.\s*([^:]+):\s*(.*)$/s;
    var out = [];
    chunks.forEach(function (chunk) {
      var m = chunk.match(rowRe);
      if (!m) return;
      out.push({ num: m[1], label: m[2].trim(), value: m[3].trim() });
    });
    return out;
  }

  function rebuildGeneralInfoSheet(fields) {
    return (fields || [])
      .filter(function (f) {
        return f && String(f.label || "").trim();
      })
      .map(function (f, i) {
        var num = String(f.num || i + 1).trim();
        return num + ". " + String(f.label).trim() + ": " + String(f.value == null ? "" : f.value).trim();
      })
      .join("\n");
  }

  var clientsInfoEmbedPromise = null;

  function ensureClientsInfoEmbedLoaded() {
    if (global.PORTAL_CLIENTS_INFO_ROWS) return Promise.resolve();
    if (clientsInfoEmbedPromise) return clientsInfoEmbedPromise;
    clientsInfoEmbedPromise = new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "/portal/clients_info_embed.js?v=20260608-anas-ismail";
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        resolve();
      };
      document.head.appendChild(s);
    });
    return clientsInfoEmbedPromise;
  }

  function lookupClientsInfoSeed(displayName, firstName, lastName) {
    if (global.PortalParticipantIdentity && typeof global.PortalParticipantIdentity.lookupClientsInfoSheet === "function") {
      var hit = global.PortalParticipantIdentity.lookupClientsInfoSheet(displayName, firstName, lastName);
      if (hit) return hit;
    }
    try {
      var rows = global.PORTAL_CLIENTS_INFO_ROWS;
      if (!Array.isArray(rows)) return "";
      var want = normName(displayName);
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r) continue;
        if (normName(r.client_name) === want) return String(r.client_info || "").trim();
      }
    } catch (_e) {}
    return "";
  }

  function ensureGeneralFields(data) {
    var g = data.general || {};
    var fields = Array.isArray(g.fields) ? g.fields.slice() : [];
    if (!fields.length && g.general_info_sheet) {
      fields = parseGeneralInfoSheet(g.general_info_sheet);
    }
    if (!fields.length) {
      var p = data.participant || {};
      var seed = lookupClientsInfoSeed(p.display_name, p.first_name, p.last_name);
      if (seed) {
        fields = parseGeneralInfoSheet(seed);
        g.general_info_sheet = seed;
      }
    }
    if (!fields.length) {
      fields = [
        { num: "1", label: "Medical / allergies", value: "" },
        { num: "2", label: "Communication", value: "" },
        { num: "3", label: "Likes / motivators", value: "" },
        { num: "4", label: "Triggers / support strategies", value: "" },
        { num: "5", label: "Emergency contact", value: "" },
      ];
    }
    g.fields = fields;
    data.general = g;
    return fields;
  }

  function ensureGeneralFieldsAsync(data) {
    var g = data.general || {};
    var fields = Array.isArray(g.fields) ? g.fields.slice() : [];
    if (fields.length || g.general_info_sheet) {
      return Promise.resolve(ensureGeneralFields(data));
    }
    return ensureClientsInfoEmbedLoaded().then(function () {
      return ensureGeneralFields(data);
    });
  }

  function participantPhotoHtml(p) {
    p = p || {};
    var name = p.display_name || "Participant";
    var contactId = p.contact_id || "";
    if (p.avatar_url && typeof global.portalRegisterParticipantStorageAvatar === "function") {
      global.portalRegisterParticipantStorageAvatar(contactId, name, p.avatar_url);
    }
    var candidates =
      typeof global.portalParticipantPhotoPathCandidates === "function"
        ? global.portalParticipantPhotoPathCandidates(name, p.avatar_url || "", contactId)
        : [];
    if (!candidates.length && typeof global.portalParticipantPhotoUrl === "function") {
      var one = global.portalParticipantPhotoUrl(name, p.avatar_url || "", contactId);
      if (one) candidates = [one];
    }
    var url = candidates.length ? candidates[0] : "";
    var fallbacks = candidates.slice(1).join("|");
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
        '" alt="" width="64" height="64" loading="eager" decoding="async" draggable="false"' +
        (fallbacks ? ' data-photo-fallbacks="' + esc(fallbacks) + '"' : "") +
        ' onerror="if(window.portalParticipantPhotoTryFallback){window.portalParticipantPhotoTryFallback(this);}else{this.remove();this.parentElement.classList.remove(\'pp-pax-photo--img\');}" /><span class="pp-pax-photo__init" aria-hidden="true">' +
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

  function heroHtml(data) {
    var p = data.participant || {};
    return (
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
      "</div></div></header>"
    );
  }

  function infoButtonsHtml(data) {
    var g = data.general || {};
    var hasAquatics = !!g.has_aquatics;
    return (
      '<div class="pp-pax-info-buttons">' +
      '<div class="pp-pax-info-row">' +
      '<button type="button" class="pp-pax-info-btn" data-pp-open="general" aria-label="General Information">' +
      '<span class="pp-pax-info-btn-stack">' +
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg>' +
      '<span class="pp-pax-info-caption">General Information</span></span></button></div>' +
      '<div class="pp-pax-info-row">' +
      '<button type="button" class="pp-pax-info-btn" data-pp-open="sessions" aria-label="Sessions Overview">' +
      '<span class="pp-pax-info-btn-stack">' +
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>' +
      '<span class="pp-pax-info-caption">Sessions Overview</span></span></button></div>' +
      '<div class="pp-pax-info-row">' +
      '<button type="button" class="pp-pax-info-btn" data-pp-open="achievements" aria-label="Achievement photos">' +
      '<span class="pp-pax-info-btn-stack">' +
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-5 5"/></svg>' +
      '<span class="pp-pax-info-caption">Achievement photos</span></span></button></div>' +
      (hasAquatics
        ? '<div class="pp-pax-info-row">' +
          '<button type="button" class="pp-pax-info-btn" data-pp-open="swim" aria-label="Swimming term review">' +
          '<span class="pp-pax-info-btn-stack">' +
          '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/><path d="M2 16c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/></svg>' +
          '<span class="pp-pax-info-caption">Swimming term review</span></span></button></div>'
        : "") +
      "</div>"
    );
  }

  function generalReadHtml(fields) {
    if (!fields.length) {
      return '<p class="pp-muted">No general information on file yet. Tap Edit to add details your instructors should know.</p>';
    }
    return (
      '<div class="pp-gen-list" role="list">' +
      fields
        .map(function (f) {
          return (
            '<div class="pp-gen-row" role="listitem">' +
            '<div class="pp-gen-row__label">' +
            esc(f.label) +
            "</div>" +
            '<div class="pp-gen-row__value">' +
            esc(f.value || "—") +
            "</div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function generalEditHtml(fields) {
    return (
      '<form class="pp-gen-form" id="ppGenForm">' +
      fields
        .map(function (f, idx) {
          return (
            '<div class="pp-field pp-gen-field">' +
            '<label for="ppGenField' +
            idx +
            '">' +
            esc(f.label) +
            "</label>" +
            '<textarea id="ppGenField' +
            idx +
            '" name="field_' +
            idx +
            '" rows="3" data-gen-label="' +
            esc(f.label) +
            '" data-gen-num="' +
            esc(f.num || String(idx + 1)) +
            '">' +
            esc(f.value || "") +
            "</textarea></div>"
          );
        })
        .join("") +
      '<button type="submit" class="pp-btn pp-btn--primary" id="ppGenSaveBtn">Save changes</button>' +
      '<button type="button" class="pp-btn pp-btn--ghost" id="ppGenCancelBtn">Cancel</button></form>'
    );
  }

  function subviewShell(data, viewName, innerHtml) {
    return (
      '<div class="pp-pax-shell" data-pp-view="' +
      esc(viewName) +
      '">' +
      '<div class="pp-pax-sticky-hero">' +
      '<button type="button" class="pp-btn pp-btn--ghost pp-pax-back" data-pp-back="hub">← Back</button>' +
      heroHtml(data) +
      "</div>" +
      '<div class="pp-pax-subview-body">' +
      innerHtml +
      "</div></div>"
    );
  }

  function renderHub(host, data, opts) {
    ensureGeneralFields(data);
    host.innerHTML =
      '<div class="pp-pax-shell" data-pp-view="hub">' +
      heroHtml(data) +
      infoButtonsHtml(data) +
      '<p class="pp-muted pp-pax-hub-note">Choose a section — same layout instructors use when they tap your child&apos;s name.</p>' +
      "</div>";
    bindHub(host, data, opts);
  }

  function renderGeneral(host, data, opts) {
    ensureGeneralFields(data);
    var fields = data.general.fields || [];
    var editing = !!(opts && opts.editing);
    host.innerHTML = subviewShell(
      data,
      "general",
      '<h3 class="pp-pax-subview-title">General Information</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Updates here are shared with instructors and admin.</p>' +
        '<div id="ppGenNotice" class="pp-notice pp-notice--info" hidden role="status"></div>' +
        '<div class="pp-card pp-gen-card">' +
        (editing ? generalEditHtml(fields) : generalReadHtml(fields)) +
        "</div>" +
        (editing
          ? ""
          : '<button type="button" class="pp-btn pp-btn--primary" id="ppGenEditBtn">Edit information</button>'),
    );
    bindGeneral(host, data, opts, editing);
  }

  function renderSessions(host, data, opts) {
    host.innerHTML = subviewShell(
      data,
      "sessions",
      '<h3 class="pp-pax-subview-title">Sessions Overview</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Engagement, emotions, independence and session summaries checked for families.</p>' +
        '<div id="ppPaxSessionsHost"><p class="pcso-loading" role="status">Loading sessions…</p></div>',
    );
    bindBack(host, data, opts);
    var sessionsHost = host.querySelector("#ppPaxSessionsHost");
    if (
      sessionsHost &&
      global.PortalClientSessionsOverview &&
      typeof global.PortalClientSessionsOverview.renderParent === "function"
    ) {
      global.PortalClientSessionsOverview.renderParent(sessionsHost, {
        sessions: data.sessions || [],
        term_label: data.term_label || (data.general && data.general.term_label) || "",
        hideAchievements: true,
      });
    }
  }

  function renderAchievements(host, data, opts) {
    var achievements = Array.isArray(data.achievements) ? data.achievements : [];
    var gallery =
      global.PortalClientSessionsOverview &&
      typeof global.PortalClientSessionsOverview.achievementsGalleryHtml === "function"
        ? global.PortalClientSessionsOverview.achievementsGalleryHtml(achievements)
        : '<p class="pp-muted">No session photos for this participant yet. Photos appear here after instructors capture them during sessions.</p>';
    host.innerHTML = subviewShell(
      data,
      "achievements",
      '<h3 class="pp-pax-subview-title">Achievement photos</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Photos from sessions — tap any image to view full size.</p>' +
        '<div class="pp-ach-view">' +
        gallery +
        "</div>",
    );
    bindBack(host, data, opts);
  }

  function renderSwim(host, data, opts) {
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
            return (
              '<li class="pp-pax-swim-item">' +
              '<div class="pp-pax-swim-copy"><strong class="pp-pax-swim-title">' +
              esc(r.title || "Swimming term review") +
              '</strong><span class="pp-muted pp-pax-swim-when">' +
              esc(formatDate(r.related_date || r.ready_at)) +
              '</span></div><a class="pp-btn pp-btn--primary pp-pax-swim-dl" href="' +
              esc(r.download_url || "#") +
              '" target="_blank" rel="noopener noreferrer">View PDF</a></li>'
            );
          })
          .join("") +
        "</ul>";
    }
    host.innerHTML = subviewShell(data, "swim", '<h3 class="pp-pax-subview-title">Swimming term review</h3>' + body);
    bindBack(host, data, opts);
  }

  function bindBack(host, data, opts) {
    host.querySelectorAll("[data-pp-back]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        renderHub(host, data, opts);
      });
    });
  }

  function openSubview(host, data, opts, view) {
    if (view === "general") {
      void ensureGeneralFieldsAsync(data).then(function () {
        renderGeneral(host, data, opts);
      });
    } else if (view === "sessions") renderSessions(host, data, opts);
    else if (view === "achievements") renderAchievements(host, data, opts);
    else if (view === "swim") renderSwim(host, data, opts);
  }

  function bindHub(host, data, opts) {
    var sectionByView = {
      sessions: "sessions",
      achievements: "achievements",
      swim: "swim",
    };
    host.querySelectorAll("[data-pp-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var view = btn.getAttribute("data-pp-open");
        var section = sectionByView[view];
        if (
          section &&
          opts &&
          typeof opts.loadSection === "function" &&
          typeof opts.isSectionLoaded === "function" &&
          !opts.isSectionLoaded(section)
        ) {
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
          void opts
            .loadSection(section)
            .then(function () {
              openSubview(host, data, opts, view);
            })
            .catch(function () {
              if (typeof opts.onSectionError === "function") opts.onSectionError(section);
            })
            .finally(function () {
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
            });
          return;
        }
        openSubview(host, data, opts, view);
      });
    });
  }

  function bindGeneral(host, data, opts, editing) {
    bindBack(host, data, opts);
    var notice = host.querySelector("#ppGenNotice");
    var editBtn = host.querySelector("#ppGenEditBtn");
    if (editBtn) {
      editBtn.addEventListener("click", function () {
        renderGeneral(host, data, Object.assign({}, opts, { editing: true }));
      });
    }
    var cancelBtn = host.querySelector("#ppGenCancelBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        renderGeneral(host, data, Object.assign({}, opts, { editing: false }));
      });
    }
    var form = host.querySelector("#ppGenForm");
    if (form && typeof opts.saveGeneralInfo === "function") {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fields = [];
        form.querySelectorAll("textarea[data-gen-label]").forEach(function (ta) {
          fields.push({
            num: ta.getAttribute("data-gen-num") || "",
            label: ta.getAttribute("data-gen-label") || "",
            value: ta.value,
          });
        });
        var saveBtn = host.querySelector("#ppGenSaveBtn");
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.setAttribute("aria-busy", "true");
        }
        void opts
          .saveGeneralInfo(fields)
          .then(function (updated) {
            if (updated && updated.general) {
              data.general = updated.general;
            } else {
              data.general.fields = fields;
              data.general.general_info_sheet = rebuildGeneralInfoSheet(fields);
            }
            if (notice) {
              notice.hidden = false;
              notice.className = "pp-notice pp-notice--info";
              notice.textContent = "Your updates were saved. Instructors will see the new information.";
            }
            renderGeneral(host, data, Object.assign({}, opts, { editing: false }));
          })
          .catch(function () {
            if (notice) {
              notice.hidden = false;
              notice.className = "pp-notice pp-notice--error";
              notice.textContent = "Could not save — please try again.";
            }
          })
          .finally(function () {
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.removeAttribute("aria-busy");
            }
          });
      });
    }
  }

  function render(hostEl, data, opts) {
    if (!hostEl || !data) return;
    opts = opts || {};
    renderHub(hostEl, data, opts);
  }

  global.ParentPortalParticipant = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
