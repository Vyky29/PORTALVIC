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

  function ageFromDobIso(iso) {
    if (!iso) return null;
    try {
      var s = String(iso).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      var p = s.split("-").map(Number);
      var dob = new Date(p[0], p[1] - 1, p[2]);
      var now = new Date();
      var age = now.getFullYear() - dob.getFullYear();
      var m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
      if (age < 0) return null;
      return age;
    } catch (_e) {
      return null;
    }
  }

  function participantIdentityMetaHtml(p) {
    p = p || {};
    var dobIso = p.dob_iso || "";
    var dobText = p.dob_display || (dobIso ? formatDate(dobIso) : "");
    var age = ageFromDobIso(dobIso);
    var html = "";
    if (dobText) {
      html +=
        '<p class="pp-muted pp-pax-meta">Date of birth: ' + esc(dobText) + "</p>";
    }
    if (age != null) {
      html += '<p class="pp-muted pp-pax-meta">Age: ' + esc(String(age)) + "</p>";
    }
    return html;
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

  function fieldsHaveContent(fields) {
    return (fields || []).some(function (f) {
      return String((f && f.value) || "").trim().length > 0;
    });
  }

  function defaultEmptyGeneralFields() {
    return [
      { num: "1", label: "Medical / allergies", value: "" },
      { num: "2", label: "Communication", value: "" },
      { num: "3", label: "Likes / motivators", value: "" },
      { num: "4", label: "Triggers / support strategies", value: "" },
    ];
  }

  function resolveGeneralInfoBlob(data) {
    var g = (data && data.general) || {};
    if (g.general_info_sheet) return String(g.general_info_sheet).trim();
    var p = (data && data.participant) || {};
    return lookupClientsInfoSeed(p.display_name, p.first_name, p.last_name) || "";
  }

  function parseClientsInfoNumberedSections(blob) {
    var text = String(blob || "")
      .replace(/\r\n|\r/g, "\n")
      .trim();
    if (!text) return {};
    var re = /(?:^|\s)(\d{1,2})\.\s+/g;
    var matches = [];
    var m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ num: parseInt(m[1], 10), after: m.index + m[0].length, start: m.index });
    }
    var strips = {
      1: /^Age:\s*/i,
      2: /^Medical:\s*/i,
      3: /^Likes\/Motivators:\s*/i,
      4: /^Dislikes\/Avoids:\s*/i,
      5: /^Known Triggers:\s*/i,
      6: /^Regulation Strategies:\s*/i,
      7: /^Level of Support:\s*/i,
      8: /^Communication:\s*/i,
      9: /^Preferred Communication:\s*/i,
      10: /^Mobility:\s*/i,
      11: /^Personal Care:\s*/i,
      12: /^Task Engagement:\s*/i,
      13: /^Transitions\/Flexibility:\s*/i,
      14: /^Safety:\s*/i,
      15: /^Other Notes:\s*/i,
    };
    var out = {};
    for (var i = 0; i < matches.length; i++) {
      var num = matches[i].num;
      var chunkStart = matches[i].after;
      var chunkEnd = i + 1 < matches.length ? matches[i + 1].start : text.length;
      var chunk = text.slice(chunkStart, chunkEnd).trim().replace(/\s+/g, " ");
      var rx = strips[num];
      if (rx) chunk = chunk.replace(rx, "").trim();
      if (num >= 1 && num <= 15 && chunk) out[num] = chunk;
    }
    return out;
  }

  function profileValuesNonEmpty(arr) {
    return (arr || [])
      .map(function (v) {
        return String(v == null ? "" : v).trim();
      })
      .filter(function (v) {
        return v && v !== "—";
      });
  }

  function splitMedicalSection(raw) {
    var t = String(raw || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!t) return { conditions: "", medication: "" };
    var medication = "";
    var conditions = t;
    if (/\bno regular medication\b/i.test(t)) {
      medication = "No regular medication";
      conditions = t.replace(/\bno regular medication\b\.?\s*/gi, " ").replace(/\s+/g, " ").trim();
    } else {
      var medMatch = t.match(
        /(?:regular medication|medication)[:\s]+([^.]+(?:\.|$))/i,
      );
      if (medMatch) {
        medication = medMatch[1].trim().replace(/\.$/, "");
        conditions = t.replace(medMatch[0], " ").replace(/\s+/g, " ").trim();
      }
    }
    conditions = conditions.replace(/^[\s.,]+|[\s.,]+$/g, "");
    if (!conditions) conditions = t;
    return { conditions: conditions, medication: medication };
  }

  function buildParentProfileCategories(sec) {
    sec = sec || {};
    var categories = [];
    var med = splitMedicalSection(sec[2]);
    var medicalValues = profileValuesNonEmpty([med.conditions, med.medication]);
    if (medicalValues.length) {
      categories.push({ title: "Medical needs", values: medicalValues });
    }
    var commValues = profileValuesNonEmpty([sec[8]]);
    if (commValues.length) {
      categories.push({
        title: "Communication & Interaction Profile",
        values: commValues,
      });
    }
    var behValues = profileValuesNonEmpty([sec[5]]);
    if (behValues.length) {
      categories.push({
        title: "Behaviour Profile & Support Preferences",
        values: behValues,
      });
    }
    var indValues = profileValuesNonEmpty([sec[10], sec[11], sec[12]]);
    if (indValues.length) {
      categories.push({ title: "Independence", values: indValues });
    }
    var dailyValues = profileValuesNonEmpty([sec[12], sec[13]]);
    if (dailyValues.length) {
      categories.push({ title: "Daily Participation", values: dailyValues });
    }
    return categories;
  }

  function fieldValueByLabel(fields, labels) {
    fields = fields || [];
    labels = labels || [];
    for (var i = 0; i < fields.length; i++) {
      var lab = String((fields[i] && fields[i].label) || "")
        .trim()
        .toLowerCase();
      if (!lab) continue;
      for (var j = 0; j < labels.length; j++) {
        if (lab === String(labels[j]).toLowerCase()) {
          return String((fields[i] && fields[i].value) || "").trim();
        }
      }
    }
    return "";
  }

  function buildParentProfileCategoriesFromFields(fields) {
    fields = fields || [];
    var categories = [];
    var medical = fieldValueByLabel(fields, [
      "Medical / allergies",
      "Medical",
    ]);
    if (medical) {
      var medParts = splitMedicalSection(medical);
      var medVals = profileValuesNonEmpty([medParts.conditions, medParts.medication]);
      if (medVals.length) {
        categories.push({ title: "Medical needs", values: medVals });
      }
    }
    var comm = fieldValueByLabel(fields, ["Communication"]);
    if (comm) {
      categories.push({
        title: "Communication & Interaction Profile",
        values: [comm],
      });
    }
    var triggers = fieldValueByLabel(fields, [
      "Triggers / support strategies",
      "Known Triggers",
    ]);
    if (triggers) {
      categories.push({
        title: "Behaviour Profile & Support Preferences",
        values: [triggers],
      });
    }
    return categories;
  }

  function profileCategoryIconKey(title) {
    var t = String(title || "").toLowerCase();
    if (t.indexOf("medical") >= 0) return "medical";
    if (t.indexOf("communication") >= 0) return "communication";
    if (t.indexOf("behaviour") >= 0 || t.indexOf("behavior") >= 0) return "behaviour";
    if (t.indexOf("independence") >= 0) return "independence";
    if (t.indexOf("daily") >= 0 || t.indexOf("participation") >= 0) return "participation";
    return "default";
  }

  function profileCategoryIconSvg(key) {
    var base =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">';
    switch (key) {
      case "medical":
        return base + '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';
      case "communication":
        return (
          base +
          '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
          '<path d="M8 10h.01M12 10h.01M16 10h.01"/></svg>'
        );
      case "behaviour":
        return (
          base +
          '<circle cx="12" cy="12" r="10"/>' +
          '<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>'
        );
      case "independence":
        return (
          base +
          '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
          '<circle cx="12" cy="7" r="4"/></svg>'
        );
      case "participation":
        return (
          base +
          '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
          '<line x1="16" y1="2" x2="16" y2="6"/>' +
          '<line x1="8" y1="2" x2="8" y2="6"/>' +
          '<line x1="3" y1="10" x2="21" y2="10"/>' +
          '<path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>'
        );
      default:
        return (
          base +
          '<circle cx="12" cy="12" r="10"/>' +
          '<line x1="12" y1="16" x2="12" y2="12"/>' +
          '<line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        );
    }
  }

  function generalProfileCategoryHtml(cat) {
    var iconKey = profileCategoryIconKey(cat.title);
    return (
      '<section class="pp-gen-profile__cat" role="listitem">' +
      '<h5 class="pp-gen-profile__cat-title">' +
      '<span class="pp-gen-profile__cat-ico pp-gen-profile__cat-ico--' +
      iconKey +
      '" aria-hidden="true">' +
      profileCategoryIconSvg(iconKey) +
      '</span><span class="pp-gen-profile__cat-txt">' +
      esc(cat.title) +
      "</span></h5>" +
      cat.values
        .map(function (val) {
          return '<p class="pp-gen-profile__value">' + esc(val) + "</p>";
        })
        .join("") +
      "</section>"
    );
  }

  function generalProfileReadHtml(data) {
    data = data || {};
    var blob = resolveGeneralInfoBlob(data);
    var sec = parseClientsInfoNumberedSections(blob);
    var categories = buildParentProfileCategories(sec);
    if (!categories.length) {
      categories = buildParentProfileCategoriesFromFields(
        (data.general && data.general.fields) || [],
      );
    }
    if (!categories.length) {
      return (
        '<p class="pp-muted">No general information on file yet. Tap Edit info to add details your instructors should know.</p>'
      );
    }
    var splitAt = Math.ceil(categories.length / 2);
    var left = categories.slice(0, splitAt);
    var right = categories.slice(splitAt);
    return (
      '<div class="pp-gen-profile" role="list">' +
      '<div class="pp-gen-profile__col">' +
      left.map(generalProfileCategoryHtml).join("") +
      "</div>" +
      (right.length
        ? '<div class="pp-gen-profile__col">' +
          right.map(generalProfileCategoryHtml).join("") +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function generalReadHtml(fields, data) {
    if (data) return generalProfileReadHtml(data);
    if (!fields.length) {
      return '<p class="pp-muted">No general information on file yet. Tap Edit to add details your instructors should know.</p>';
    }
    var filtered = fields.filter(function (f) {
      var lab = String((f && f.label) || "")
        .trim()
        .toLowerCase();
      return lab !== "emergency contact";
    });
    return (
      '<div class="pp-gen-list" role="list">' +
      filtered
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

  function ensureGeneralFields(data, opts) {
    opts = opts || {};
    var g = data.general || {};
    var fields = Array.isArray(g.fields) ? g.fields.slice() : [];
    if (!fields.length && g.general_info_sheet) {
      fields = parseGeneralInfoSheet(g.general_info_sheet);
    }
    if (!fields.length && !opts.skipClientSeed) {
      var p = data.participant || {};
      var seed = lookupClientsInfoSeed(p.display_name, p.first_name, p.last_name);
      if (seed) {
        fields = parseGeneralInfoSheet(seed);
        g.general_info_sheet = seed;
      }
    }
    if (!fields.length && opts.allowPlaceholders) {
      fields = defaultEmptyGeneralFields();
    }
    g.fields = fields;
    data.general = g;
    return fields;
  }

  function ensureGeneralFieldsAsync(data) {
    var g = data.general || {};
    var fields = Array.isArray(g.fields) ? g.fields.slice() : [];
    if (g.general_info_sheet && !fields.length) {
      fields = parseGeneralInfoSheet(g.general_info_sheet);
      g.fields = fields;
      data.general = g;
    }
    if (fieldsHaveContent(fields)) {
      return Promise.resolve(ensureGeneralFields(data, { allowPlaceholders: true }));
    }
    if (fields.length && !fieldsHaveContent(fields) && !g.general_info_sheet) {
      g.fields = [];
      data.general = g;
    }
    return ensureClientsInfoEmbedLoaded().then(function () {
      return ensureGeneralFields(data, { allowPlaceholders: true });
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

  function hubHeroHtml(data) {
    var p = data.participant || {};
    return (
      '<header class="pp-hub-hero">' +
      '<div class="pp-hub-hero__id">' +
      participantPhotoHtml(p) +
      '<h3 class="pp-hub-hero__name">' +
      esc(p.display_name || "Participant") +
      "</h3>" +
      participantIdentityMetaHtml(p) +
      "</div>" +
      '<div class="pp-hub-hero__info">' +
      '<div class="pp-hub-hero__info-head">' +
      '<h4 class="pp-hub-hero__info-title"><svg class="pp-hub-hero__info-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg><span>General information</span></h4>' +
      '<button type="button" class="pp-btn pp-btn--ghost pp-hub-edit-btn" data-pp-open-edit="general">Edit info</button>' +
      "</div>" +
      '<div class="pp-hub-hero__info-fields">' +
      generalProfileReadHtml(data) +
      "</div></div></header>"
    );
  }

  function servicesCardHtml(data) {
    var g = (data && data.general) || {};
    var detail = Array.isArray(g.services_detail) ? g.services_detail : [];
    var count = Number(g.services_count || detail.length || 0);
    // No roster-review snapshot for this child yet — don't show an empty/confusing card.
    if (!count && !detail.length) return "";
    var svcIco =
      '<svg class="pp-services__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    var items = detail.length
      ? detail
          .map(function (s) {
            var when = [s.day, s.time].filter(Boolean).join(" · ");
            return (
              '<div class="pp-services__item">' +
              '<span class="pp-services__name">' +
              esc(s.label || "Service") +
              "</span>" +
              (when ? '<span class="pp-services__when">' + esc(when) + "</span>" : "") +
              "</div>"
            );
          })
          .join("")
      : '<p class="pp-services__empty">Services are listed once the term roster is confirmed.</p>';
    return (
      '<section class="pp-services" aria-label="Booked services">' +
      '<div class="pp-services__head">' +
      svcIco +
      '<h4 class="pp-services__title">Booked services</h4>' +
      '<span class="pp-services__count">' +
      count +
      (count === 1 ? " service" : " services") +
      "</span></div>" +
      '<div class="pp-services__list">' +
      items +
      "</div></section>"
    );
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
      participantIdentityMetaHtml(p) +
      '<div class="pp-chip-row">' +
      statusChips(p) +
      "</div></div></header>"
    );
  }

  function bookingSummary(data) {
    var r = data.reenrolment || {};
    return {
      submitted: !!r.submitted,
      submitted_at: r.submitted_at || null,
      hint: String(r.summary_hint || "").trim() || "Not submitted yet",
      items: Array.isArray(r.items) ? r.items : [],
    };
  }

  function infoBtnHtml(view, caption, iconSvg, opts) {
    opts = opts || {};
    var disabled = !!opts.disabled;
    var subtitle = opts.subtitle ? String(opts.subtitle).trim() : "";
    var extraClass = opts.extraClass || "";
    var unreadBadge = opts.unreadBadge || "";
    return (
      '<button type="button" class="pp-pax-info-btn' +
      extraClass +
      (disabled ? " pp-pax-info-btn--disabled" : "") +
      '" data-pp-open="' +
      esc(view) +
      '"' +
      (disabled ? ' disabled aria-disabled="true"' : "") +
      ' aria-label="' +
      esc(caption + (subtitle ? " — " + subtitle : "")) +
      '">' +
      '<span class="pp-pax-info-btn-stack">' +
      (unreadBadge
        ? '<span class="pp-pax-info-icon-wrap">' + iconSvg + unreadBadge + "</span>"
        : iconSvg) +
      '<span class="pp-pax-info-caption">' +
      esc(caption) +
      "</span>" +
      (subtitle ? '<span class="pp-pax-info-subcaption">' + esc(subtitle) + "</span>" : "") +
      "</span></button>"
    );
  }

  function infoButtonsHtml(data, opts) {
    var msgUnread =
      opts && typeof opts.unreadMessagesTotal === "function" ? opts.unreadMessagesTotal() : 0;
    var msgBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && msgUnread > 0
        ? opts.unreadBadgeHtml(msgUnread, "Unread messages")
        : "";
    var booking = bookingSummary(data);
    var swimAvailable = !!data.swim_term_review_available;
    var msgIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var teamCaption = firstNameOf(data) + "'s Team";
    return (
      '<div class="pp-pax-info-buttons">' +
      '<div class="pp-pax-info-row pp-pax-info-row--parents">' +
      infoBtnHtml("messages", "Messages", msgIcon, {
        extraClass:
          " pp-pax-info-btn--messages" +
          (msgUnread > 0 ? " pp-pax-info-btn--has-unread" : ""),
        unreadBadge: msgBadge,
      }) +
      infoBtnHtml(
        "booking",
        "Booking 2026/27",
        '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
        { subtitle: booking.hint },
      ) +
      "</div>" +
      '<div class="pp-pax-info-row pp-pax-info-row--sessions">' +
      infoBtnHtml(
        "team",
        teamCaption,
        '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        { extraClass: " pp-pax-info-btn--accent pp-pax-info-btn--team" },
      ) +
      infoBtnHtml(
        "sessions",
        "Sessions Overview",
        '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
        { extraClass: " pp-pax-info-btn--accent" },
      ) +
      infoBtnHtml(
        "achievements",
        "Achievement photos",
        '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-5 5"/></svg>',
        { extraClass: " pp-pax-info-btn--accent" },
      ) +
      infoBtnHtml(
        "swim",
        "Swimming term review",
        '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/><path d="M2 16c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/></svg>',
        {
          disabled: !swimAvailable,
          subtitle: swimAvailable ? "" : "Not available yet",
          extraClass: " pp-pax-info-btn--accent",
        },
      ) +
      "</div></div>"
    );
  }

  function generalEditHtml(fields) {
    fields = (fields || []).filter(function (f) {
      var lab = String((f && f.label) || "")
        .trim()
        .toLowerCase();
      return lab !== "emergency contact";
    });
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
    var pName =
      (data.participant && data.participant.display_name) || "Participant";
    return (
      '<div class="pp-pax-shell" data-pp-view="' +
      esc(viewName) +
      '">' +
      '<div class="pp-pax-sticky-hero">' +
      '<button type="button" class="pp-btn pp-btn--ghost pp-pax-back" data-pp-back="hub" aria-label="Back to hub for ' +
      esc(pName) +
      '">← ' +
      esc(pName) +
      "&apos;s Hub</button>" +
      heroHtml(data) +
      "</div>" +
      '<div class="pp-pax-subview-body">' +
      innerHtml +
      "</div></div>"
    );
  }

  function renderHub(host, data, opts) {
    ensureGeneralFields(data, { allowPlaceholders: true });
    setParticipantPageTitle(
      ((data && data.participant && data.participant.display_name) ||
        "Participant") + "\u2019s Hub",
    );
    host.innerHTML =
      '<div class="pp-pax-shell" data-pp-view="hub">' +
      hubHeroHtml(data) +
      servicesCardHtml(data) +
      infoButtonsHtml(data, opts) +
      '<p class="pp-muted pp-pax-hub-note">Parent sections above · sessions and reviews below — same layout instructors use when they tap your child&apos;s name.</p>' +
      "</div>";
    bindHub(host, data, opts);
    void ensureGeneralFieldsAsync(data).then(function () {
      var fieldsHost = host.querySelector(".pp-hub-hero__info-fields");
      if (fieldsHost) {
        fieldsHost.innerHTML = generalProfileReadHtml(data);
      }
    });
  }

  function renderGeneral(host, data, opts) {
    var editHref = registrationEditUrl(data, opts, "general");
    host.innerHTML = subviewShell(
      data,
      "general",
      '<h3 class="pp-pax-subview-title">General Information</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Updates here are shared with instructors and admin.</p>' +
        '<div class="pp-card pp-gen-card">' +
        generalProfileReadHtml(data) +
        "</div>" +
        '<a class="pp-btn pp-btn--primary" id="ppGenEditBtn" href="' +
        esc(editHref) +
        '">Edit information</a>',
    );
    bindGeneral(host, data, opts);
  }

  function renderSessions(host, data, opts) {
    host.innerHTML = subviewShell(
      data,
      "sessions",
      '<h3 class="pp-pax-subview-title">Sessions Overview</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Attendance, engagement, emotions and independence across the term.</p>' +
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
        attendance_summary: data.attendance_summary || null,
        term_label: data.term_label || (data.general && data.general.term_label) || "",
        hideAchievements: true,
      });
    }
  }

  var AQUATIC_NO_PHOTOS_NOTE =
    "If your child attends Aquatic Activity at Acton or Northolt, due to the Centre rules we cannot take photos during sessions.";

  function renderAchievements(host, data, opts) {
    var achievements = Array.isArray(data.achievements) ? data.achievements : [];
    var aquaticOnly = !!(data.general && data.general.aquatic_only_no_photos);
    var gallery = "";
    if (achievements.length) {
      gallery =
        global.PortalClientSessionsOverview &&
        typeof global.PortalClientSessionsOverview.achievementsGalleryHtml === "function"
          ? global.PortalClientSessionsOverview.achievementsGalleryHtml(achievements, { parentDownloads: true })
          : "";
    } else if (aquaticOnly) {
      gallery =
        '<div class="pp-ach-aquatic-note" role="note">' +
        '<p class="pp-ach-aquatic-note__title">No achievement photos</p>' +
        '<p class="pp-muted pp-ach-aquatic-note__body">' +
        esc(AQUATIC_NO_PHOTOS_NOTE) +
        "</p></div>";
    } else {
      gallery =
        global.PortalClientSessionsOverview &&
        typeof global.PortalClientSessionsOverview.achievementsGalleryHtml === "function"
          ? global.PortalClientSessionsOverview.achievementsGalleryHtml(achievements, { parentDownloads: true })
          : '<p class="pp-muted">No session photos for this participant yet.</p>';
    }
    var subNote = aquaticOnly && !achievements.length
      ? "Achievement photos are not available for Aquatic Activity at Acton or Northolt."
      : "Photos from sessions — tap to view full size, or use Download to save to your device.";
    host.innerHTML = subviewShell(
      data,
      "achievements",
      '<h3 class="pp-pax-subview-title">Achievement photos</h3>' +
        '<p class="pp-muted pp-pax-subview-note">' +
        esc(subNote) +
        "</p>" +
        '<div class="pp-ach-view">' +
        gallery +
        "</div>",
    );
    bindBack(host, data, opts);
    bindAchievementDownloads(host, data, opts);
  }

  function bindAchievementDownloads(host, data, opts) {
    if (!opts || typeof opts.downloadAchievement !== "function") return;
    host.querySelectorAll("[data-pp-ach-download]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var photoId = btn.getAttribute("data-pp-ach-download") || "";
        if (!photoId) return;
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        var prevLabel = btn.textContent;
        btn.textContent = "Saving…";
        void opts
          .downloadAchievement(photoId)
          .then(function (res) {
            if (!res || !res.download_url) throw new Error("download_failed");
            var link = document.createElement("a");
            link.href = res.download_url;
            link.download = res.filename || "achievement.jpg";
            link.rel = "noopener";
            document.body.appendChild(link);
            link.click();
            link.remove();
            (data.achievements || []).forEach(function (a) {
              if (String(a.id) === photoId) {
                a.status = "downloaded";
                if (res.downloaded_at) a.downloaded_at = res.downloaded_at;
              }
            });
            btn.textContent = "Saved";
            btn.classList.add("pp-ach-dl-btn--saved");
            btn.setAttribute("aria-label", "Already saved on your device");
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = prevLabel || "Download";
            if (typeof opts.onSectionError === "function") opts.onSectionError("achievements");
          })
          .finally(function () {
            btn.removeAttribute("aria-busy");
          });
      });
    });
  }

  function registrationEditUrl(data, opts, returnView) {
    var p = (data && data.participant) || {};
    var contactId = p.contact_id || (opts && opts.contactId) || "";
    var returnPath =
      "/parent/app?contact_id=" + encodeURIComponent(String(contactId));
    if (returnView) {
      returnPath += "&view=" + encodeURIComponent(String(returnView));
    }
    return (
      "/parent/registration?from=portal&contact_id=" +
      encodeURIComponent(String(contactId)) +
      "&return=" +
      encodeURIComponent(returnPath)
    );
  }

  function navigateToRegistrationEdit(data, opts, returnView) {
    global.location.href = registrationEditUrl(data, opts, returnView);
  }

  function renderBooking(host, data, opts) {
    var booking = bookingSummary(data);
    var p = data.participant || {};
    var contactId = p.contact_id || (opts && opts.contactId) || "";
    var reenrolHref =
      "/parent/re-enrolment?from=portal&contact_id=" + encodeURIComponent(String(contactId));
    var body;
    if (!booking.submitted || !booking.items.length) {
      body =
        '<p class="pp-muted">You have not submitted re-enrolment choices for 2026/27 yet.</p>' +
        '<p class="pp-muted">Open the booking form to confirm weekly activities, Day Centre (if applicable), and funding for next year.</p>' +
        '<a class="pp-btn pp-btn--primary" href="' +
        esc(reenrolHref) +
        '">Open re-enrolment form</a>';
    } else {
      body =
        '<p class="pp-muted">Submitted ' +
        esc(formatDate(booking.submitted_at)) +
        ". The office will review your choices.</p>" +
        '<ul class="pp-booking-list">' +
        booking.items
          .map(function (item) {
            return (
              '<li class="pp-booking-item">' +
              '<div class="pp-booking-item__label">' +
              esc(item.label || "Activity") +
              "</div>" +
              '<div class="pp-booking-item__choice">' +
              esc(item.choice || "—") +
              "</div></li>"
            );
          })
          .join("") +
        "</ul>" +
        '<a class="pp-btn pp-btn--ghost" href="' +
        esc(reenrolHref) +
        '">Update booking choices</a>';
    }
    host.innerHTML = subviewShell(
      data,
      "booking",
      '<h3 class="pp-pax-subview-title">Booking 2026/27</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Your selections for the next academic year.</p>' +
        '<div class="pp-card pp-booking-card">' +
        body +
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

  function firstNameOf(data) {
    var p = (data && data.participant) || {};
    var n = String(p.display_name || p.first_name || "Participant").trim();
    return n.split(/\s+/)[0] || n;
  }

  function teamMembers(data) {
    if (typeof global.PortalParentTeam !== "undefined" && typeof global.PortalParentTeam.resolveTeam === "function") {
      return global.PortalParentTeam.resolveTeam(data);
    }
    if (data && Array.isArray(data.team) && data.team.length) return data.team;
    return [];
  }

  function teamInitials(name) {
    var parts = String(name || "").trim().split(/\s+/);
    var a = (parts[0] || "")[0] || "";
    var b = (parts[1] || "")[0] || "";
    return (a + b).toUpperCase() || "?";
  }

  function teamMemberPhotoHtml(m) {
    var name = (m && m.name) || "Staff";
    var url = (m && (m.avatar_url || m.photo_url)) || "";
    if (url) {
      return (
        '<div class="pp-team-photo pp-team-photo--img"><img src="' +
        esc(url) +
        '" alt="" width="72" height="72" loading="lazy" decoding="async" draggable="false" onerror="this.remove();this.parentElement.classList.remove(\'pp-team-photo--img\');" /><span class="pp-team-photo__init" aria-hidden="true">' +
        esc(teamInitials(name)) +
        "</span></div>"
      );
    }
    return (
      '<div class="pp-team-photo pp-team-photo--init" aria-hidden="true">' +
      esc(teamInitials(name)) +
      "</div>"
    );
  }

  function teamMemberCardHtml(m) {
    m = m || {};
    var speaks = Array.isArray(m.speaks) ? m.speaks : [];
    var speaksHtml = speaks.length
      ? '<div class="pp-team-card__speaks"><span class="pp-team-card__speaks-label">Speaks</span><span class="pp-team-chips">' +
        speaks
          .map(function (l) {
            return '<span class="pp-team-chip">' + esc(l) + "</span>";
          })
          .join("") +
        "</span></div>"
      : "";
    var natHtml = m.nationality
      ? '<p class="pp-team-card__nat">' +
        (m.flag ? '<span class="pp-team-flag" aria-hidden="true">' + esc(m.flag) + "</span>" : "") +
        esc(m.nationality) +
        "</p>"
      : "";
    return (
      '<article class="pp-team-card">' +
      teamMemberPhotoHtml(m) +
      '<div class="pp-team-card__body">' +
      '<h4 class="pp-team-card__name">' +
      esc(m.name || "Team member") +
      "</h4>" +
      natHtml +
      speaksHtml +
      (m.bio ? '<p class="pp-team-card__bio">' + esc(m.bio) + "</p>" : "") +
      "</div></article>"
    );
  }

  function setParticipantPageTitle(text) {
    var doc = global.document;
    var el = doc && doc.getElementById("ppParticipantTitle");
    if (el) el.textContent = text;
  }

  function renderTeam(host, data, opts) {
    var p = (data && data.participant) || {};
    var pName = p.display_name || "Participant";
    var members = teamMembers(data);
    var colClass =
      members.length >= 4
        ? " pp-team-grid--2"
        : members.length >= 3
          ? " pp-team-grid--3"
          : members.length === 2
            ? " pp-team-grid--2"
            : " pp-team-grid--1";
    var sinceLabel =
      typeof global.PortalParentTeam !== "undefined" && global.PortalParentTeam.TEAM_FEEDBACK_SINCE
        ? global.PortalParentTeam.TEAM_FEEDBACK_SINCE
        : "2026-06-01";
    var bodyHtml = members.length
      ? '<div class="pp-team-grid' + colClass + '">' + members.map(teamMemberCardHtml).join("") + "</div>"
      : '<p class="pp-muted">No instructors on file yet for sessions since ' +
        esc(sinceLabel.slice(0, 10).split("-").reverse().join("/")) +
        ".</p>";
    host.innerHTML =
      '<div class="pp-pax-shell" data-pp-view="team">' +
      '<div class="pp-pax-sticky-hero pp-team-backbar">' +
      '<button type="button" class="pp-btn pp-btn--ghost pp-pax-back" data-pp-back="hub" aria-label="Back to hub for ' +
      esc(pName) +
      '">← ' +
      esc(pName) +
      "&apos;s Hub</button>" +
      "</div>" +
      '<div class="pp-pax-subview-body">' +
      '<p class="pp-muted pp-team-intro">Instructors who have submitted session feedback since 1 June 2026.</p>' +
      bodyHtml +
      "</div></div>";
    setParticipantPageTitle(pName + "\u2019s Team");
    bindBack(host, data, opts);
  }

  function formatMessageWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function messageKindLabel(m) {
    if (m.direction === "in") {
      return m.source === "parent_app" ? "You (app)" : "You (WhatsApp)";
    }
    var k = String(m.kind || "").trim();
    if (k === "custom" || k === "reply") return "Club message";
    if (k === "instructor_change" || k === "instructor_reassign") return "Instructor update";
    if (!k) return "Club message";
    return k.replace(/_/g, " ");
  }

  function messageDeliveryChannel(m) {
    if (!m) return "other";
    if (m.direction === "in") {
      return m.source === "parent_app" ? "app_in" : "whatsapp_in";
    }
    if (
      m.whatsapp_status === "sent" ||
      m.whatsapp_status === "sent_sms" ||
      m.source === "whatsapp"
    ) {
      return "whatsapp";
    }
    if (m.email_status === "sent" || m.source === "email") {
      return "email";
    }
    return "other";
  }

  function messageChannelLabel(channel) {
    if (channel === "whatsapp" || channel === "whatsapp_in") return "WhatsApp";
    if (channel === "email") return "Email";
    if (channel === "app_in") return "Parent app";
    return "Club";
  }

  function messageBubbleClass(m) {
    var ch = messageDeliveryChannel(m);
    if (ch === "whatsapp" || ch === "whatsapp_in") return "pp-pax-msg--wa";
    if (ch === "email") return "pp-pax-msg--email";
    if (ch === "app_in") return "pp-pax-msg--app-in";
    return m.direction === "in" ? "pp-pax-msg--app-in" : "pp-pax-msg--other";
  }

  function messagesThreadHtml(messages, waBiz) {
    if (!messages || !messages.length) {
      return '<p class="pp-muted pp-pax-msgs-empty">No messages yet. Club updates by WhatsApp and email appear here when we send them. Green = WhatsApp, blue = email.</p>';
    }
    return (
      '<div class="pp-pax-msgs-thread" role="log" aria-live="polite">' +
      messages
        .map(function (m) {
          var isOut = m.direction === "out";
          var channel = messageDeliveryChannel(m);
          var preview = String(m.body_text || m.subject || "").trim();
          if (preview.length > 1200) preview = preview.slice(0, 1197) + "…";
          var channelTag =
            channel === "whatsapp" || channel === "email"
              ? '<span class="pp-pax-msg__channel pp-pax-msg__channel--' +
                (channel === "email" ? "email" : "wa") +
                '">' +
                esc(messageChannelLabel(channel)) +
                "</span>"
              : "";
          var unreadMark = m.is_unread
            ? '<span class="pp-pax-msg__unread-dot" aria-hidden="true"></span>'
            : "";
          return (
            '<article class="pp-pax-msg' +
            (isOut ? " pp-pax-msg--out" : " pp-pax-msg--in") +
            " " +
            messageBubbleClass(m) +
            (m.is_unread ? " pp-pax-msg--unread" : "") +
            '">' +
            '<div class="pp-pax-msg__head">' +
            '<span class="pp-pax-msg__who">' +
            unreadMark +
            esc(isOut ? "CLUBSENSATIONAL" : m.sender_name || "You") +
            "</span>" +
            '<span class="pp-pax-msg__when pp-muted">' +
            esc(formatMessageWhen(m.created_at)) +
            "</span></div>" +
            (preview ? '<p class="pp-pax-msg__body">' + esc(preview) + "</p>" : "") +
            '<p class="pp-pax-msg__meta pp-muted">' +
            channelTag +
            esc(messageKindLabel(m)) +
            (m.venue ? " · " + esc(m.venue) : "") +
            "</p></article>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function messagesComposeHtml(waBiz) {
    var waNote = "";
    if (waBiz && waBiz.wa_me_url) {
      waNote =
        '<p class="pp-pax-msgs-wa-note">Prefer WhatsApp? <a href="' +
        esc(waBiz.wa_me_url) +
        '" target="_blank" rel="noopener noreferrer">Open our business chat</a>' +
        (waBiz.display ? " (" + esc(waBiz.display) + ")" : "") +
        ". Replies there appear here too.</p>";
    } else {
      waNote =
        '<p class="pp-pax-msgs-wa-note pp-muted">You can also message us on WhatsApp using the club number — those messages sync with this thread.</p>';
    }
    return (
      waNote +
      '<form class="pp-pax-msgs-compose" id="ppMsgsForm">' +
      '<label class="pp-field" for="ppMsgsInput"><span class="pp-muted">Write to the office</span></label>' +
      '<textarea id="ppMsgsInput" name="message" rows="3" maxlength="2000" required placeholder="Type your message…"></textarea>' +
      '<button type="submit" class="pp-btn pp-btn--primary" id="ppMsgsSendBtn">Send message</button>' +
      "</form>" +
      '<p id="ppMsgsNotice" class="pp-notice pp-notice--info" hidden role="status"></p>'
    );
  }

  function messageMatchesChannelFilter(m, filter) {
    if (!filter || filter === "all") return true;
    var ch = messageDeliveryChannel(m);
    if (filter === "email") return ch === "email";
    // WhatsApp tab shows the two-way chat: everything that is not a pure email.
    return ch !== "email";
  }

  function messagesFilterBarHtml(active) {
    function btn(key, label) {
      var on = active === key;
      return (
        '<button type="button" class="pp-msgs-filter-btn' +
        (on ? " is-active" : "") +
        '" data-pp-msgs-filter="' +
        key +
        '" aria-pressed="' +
        (on ? "true" : "false") +
        '">' +
        esc(label) +
        "</button>"
      );
    }
    return (
      '<div class="pp-msgs-filter" role="group" aria-label="Filter messages by channel">' +
      btn("whatsapp", "WhatsApp") +
      btn("email", "Email") +
      "</div>"
    );
  }

  function renderMessages(host, data, opts) {
    var state = { messages: [], waBiz: null, filter: "whatsapp" };
    var body =
      '<h3 class="pp-pax-subview-title">Messages</h3>' +
      '<p class="pp-muted pp-pax-subview-note">Club updates by WhatsApp and email. Use the buttons to see each channel on its own.</p>' +
      messagesFilterBarHtml(state.filter) +
      '<div id="ppMsgsThreadHost"><p class="pp-muted">Loading messages…</p></div>' +
      messagesComposeHtml(null);
    host.innerHTML = subviewShell(data, "messages", body);
    bindBack(host, data, opts);

    function renderThread(keepScroll) {
      var threadHost = host.querySelector("#ppMsgsThreadHost");
      if (!threadHost) return;
      var filtered = state.messages.filter(function (m) {
        return messageMatchesChannelFilter(m, state.filter);
      });
      threadHost.innerHTML = messagesThreadHtml(filtered, state.waBiz);
      if (keepScroll !== false) threadHost.scrollTop = threadHost.scrollHeight;
    }

    function updateWaNote() {
      var waNote = host.querySelector(".pp-pax-msgs-wa-note");
      if (waNote && state.waBiz && state.waBiz.wa_me_url) {
        var b = state.waBiz;
        waNote.innerHTML =
          'Prefer WhatsApp? <a href="' +
          esc(b.wa_me_url) +
          '" target="_blank" rel="noopener noreferrer">Open our business chat</a>' +
          (b.display ? " (" + esc(b.display) + ")" : "") +
          ". Replies there appear here too.";
      }
    }

    host.querySelectorAll("[data-pp-msgs-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-pp-msgs-filter") || "whatsapp";
        if (next === state.filter) return;
        state.filter = next;
        host.querySelectorAll("[data-pp-msgs-filter]").forEach(function (b) {
          var on = b.getAttribute("data-pp-msgs-filter") === state.filter;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        renderThread();
      });
    });

    bindMessages(host, data, opts, state, renderThread);

    if (typeof opts.loadMessages === "function") {
      void opts
        .loadMessages({ markRead: true })
        .then(function (payload) {
          state.messages = (payload && payload.messages) || [];
          state.waBiz = (payload && payload.whatsapp_business) || null;
          renderThread();
          updateWaNote();
        })
        .catch(function () {
          var threadHost = host.querySelector("#ppMsgsThreadHost");
          if (threadHost) {
            threadHost.innerHTML =
              '<p class="pp-muted">Could not load messages — try Refresh or go back and open again.</p>';
          }
        });
    }
  }

  function bindMessages(host, data, opts, state, renderThread) {
    var form = host.querySelector("#ppMsgsForm");
    if (!form || typeof opts.sendMessage !== "function") return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = host.querySelector("#ppMsgsInput");
      var notice = host.querySelector("#ppMsgsNotice");
      var sendBtn = host.querySelector("#ppMsgsSendBtn");
      var text = input ? String(input.value || "").trim() : "";
      if (!text) return;
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.setAttribute("aria-busy", "true");
      }
      if (notice) notice.hidden = true;
      void opts
        .sendMessage(text)
        .then(function (payload) {
          if (input) input.value = "";
          if (notice) {
            notice.hidden = false;
            notice.className = "pp-notice pp-notice--info";
            notice.textContent = "Message sent — the office will reply here or on WhatsApp.";
          }
          return typeof opts.loadMessages === "function"
            ? opts.loadMessages({ markRead: false })
            : payload;
        })
        .then(function (payload) {
          if (!payload || !payload.messages) return;
          if (state) {
            state.messages = payload.messages;
            if (payload.whatsapp_business) state.waBiz = payload.whatsapp_business;
          }
          if (typeof renderThread === "function") {
            renderThread();
            return;
          }
          var threadHost = host.querySelector("#ppMsgsThreadHost");
          if (!threadHost) return;
          threadHost.innerHTML = messagesThreadHtml(
            payload.messages,
            payload.whatsapp_business || null,
          );
          threadHost.scrollTop = threadHost.scrollHeight;
        })
        .catch(function () {
          if (notice) {
            notice.hidden = false;
            notice.className = "pp-notice pp-notice--error";
            notice.textContent = "Could not send — check your connection and try again.";
          }
        })
        .finally(function () {
          if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.removeAttribute("aria-busy");
          }
        });
    });
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
    else if (view === "team") renderTeam(host, data, opts);
    else if (view === "booking") renderBooking(host, data, opts);
    else if (view === "messages") renderMessages(host, data, opts);
  }

  function bindHub(host, data, opts) {
    var sectionByView = {
      sessions: "sessions",
      achievements: "achievements",
      swim: "swim",
    };
    host.querySelectorAll("[data-pp-open-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.getAttribute("data-pp-open-edit") !== "general") return;
        navigateToRegistrationEdit(data, opts);
      });
    });
    host.querySelectorAll("[data-pp-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
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

  function bindGeneral(host, data, opts) {
    bindBack(host, data, opts);
  }

  function render(hostEl, data, opts) {
    if (!hostEl || !data) return;
    opts = opts || {};
    renderHub(hostEl, data, opts);
  }

  global.ParentPortalParticipant = { render: render, openView: openSubview };
})(typeof window !== "undefined" ? window : globalThis);
