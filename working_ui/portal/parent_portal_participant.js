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
        '<p class="pp-muted pp-pax-meta">D.O.B: ' + esc(dobText) + "</p>";
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

  function shortServiceChipLabel(rawLabel) {
    var s = String(rawLabel || "").trim();
    if (!s) return "";
    var dur = "";
    var m = s.match(/^(\d+)\s*'\s*(.+)$/);
    if (m) {
      var mins = parseInt(m[1], 10) || 0;
      if (mins > 90) {
        var h = Math.round((mins / 60) * 10) / 10;
        dur = h + "h ";
      } else if (mins) {
        dur = mins + "' ";
      }
      s = m[2];
    }
    if (/^bespoke\b/i.test(s)) return dur + "Bespoke";
    if (/multi[- ]?activity/i.test(s)) return dur + "Multi-Activity";
    if (/^aquatic\b/i.test(s)) return dur + "Aquatic";
    if (/climb/i.test(s)) return dur + "Climbing";
    if (/day\s*centre/i.test(s)) return dur + "Day centre";
    return (dur + s.replace(/\bProgramme\b/gi, "").replace(/\bActivity\b/gi, "").replace(/\s{2,}/g, " ").trim()).trim();
  }

  function serviceChipToneClass(label) {
    var s = String(label || "").toLowerCase();
    if (/aquatic|swim/.test(s)) return "aquatic";
    if (/climb/.test(s)) return "climb";
    if (/multi/.test(s)) return "multi";
    if (/bespoke/.test(s)) return "bespoke";
    if (/day\s*centre|daycentre/.test(s)) return "daycentre";
    return "other";
  }

  /** Same idea as admin Family messages enrolled chips — hover shows day / time. */
  function enrolledServiceChipsHtml(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    if (!detail.length) return "";
    return (
      '<div class="pp-svc-chips" aria-label="Booked services">' +
      detail
        .map(function (s) {
          var label = shortServiceChipLabel(s.label || "Service");
          var tip = [s.day, s.time].filter(Boolean).join(" / ");
          var tone = serviceChipToneClass(s.label || label);
          return (
            '<span class="pp-svc-chip pp-svc-chip--' +
            esc(tone) +
            '"' +
            (tip ? ' title="' + esc(tip) + '"' : "") +
            ">" +
            esc(label) +
            "</span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function hubSiblingsHtml(data, opts) {
    var siblings =
      opts && typeof opts.siblings === "function" ? opts.siblings() : opts && opts.siblings;
    if (!Array.isArray(siblings) || siblings.length < 2) return "";
    var currentId = String(
      (data && data.participant && data.participant.contact_id) ||
        (opts && opts.contactId) ||
        "",
    );
    return (
      '<nav class="pp-hub-siblings" aria-label="Switch child">' +
      siblings
        .map(function (ch) {
          var id = String((ch && ch.contact_id) || "");
          var name = String((ch && (ch.display_name || ch.first_name)) || "Child").trim();
          var first = name.split(/\s+/)[0] || name;
          var active = id && id === currentId;
          return (
            '<button type="button" class="pp-hub-sibling' +
            (active ? " is-active" : "") +
            '" data-pp-switch-child="' +
            esc(id) +
            '"' +
            (active ? ' aria-current="page"' : "") +
            ">" +
            esc(first) +
            "</button>"
          );
        })
        .join("") +
      "</nav>"
    );
  }

  function hubHeroHtml(data, opts) {
    var p = data.participant || {};
    var status = statusChips(p);
    return (
      hubSiblingsHtml(data, opts) +
      '<header class="pp-hub-hero">' +
      '<div class="pp-hub-hero__id">' +
      participantPhotoHtml(p) +
      '<h3 class="pp-hub-hero__name">' +
      esc(p.display_name || "Participant") +
      "</h3>" +
      participantIdentityMetaHtml(p) +
      enrolledServiceChipsHtml(data) +
      (status ? '<div class="pp-chip-row pp-hub-hero__status">' + status + "</div>" : "") +
      "</div>" +
      '<details class="pp-hub-profile">' +
      '<summary class="pp-hub-profile__summary">' +
      '<span class="pp-hub-profile__summary-main">' +
      '<svg class="pp-hub-hero__info-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg>' +
      '<span class="pp-hub-profile__summary-text">' +
      "<strong>General information</strong>" +
      '<span class="pp-muted">Medical, communication &amp; support notes</span>' +
      "</span></span>" +
      '<span class="pp-hub-profile__chev" aria-hidden="true"></span>' +
      "</summary>" +
      '<div class="pp-hub-profile__body">' +
      '<div class="pp-hub-hero__info-head">' +
      '<p class="pp-muted pp-hub-profile__hint">Shared with instructors and admin.</p>' +
      '<button type="button" class="pp-btn pp-btn--ghost pp-hub-edit-btn" data-pp-open-edit="general">Edit info</button>' +
      "</div>" +
      '<div class="pp-hub-hero__info-fields">' +
      generalProfileReadHtml(data) +
      "</div></div></details></header>"
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
      '<div class="pp-pax-name-row">' +
      '<h3 class="pp-pax-name">' +
      esc(p.display_name || "Participant") +
      "</h3>" +
      enrolledServiceChipsHtml(data) +
      "</div>" +
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
    var hasServices = !!(
      data &&
      data.general &&
      Array.isArray(data.general.services_detail) &&
      data.general.services_detail.length
    );
    var msgIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var absentIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.2-5 8-5s6.5 1.5 8 5"/><path d="M16 4l4 4M20 4l-4 4"/></svg>';
    var balanceIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M6 14h.01M10 14h4"/></svg>';
    var docsIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>';
    var invoiceIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2h16v20l-2-1.5L16 22l-2-1.5L12 22l-2-1.5L8 22l-2-1.5L4 22V2z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
    var teamCaption = firstNameOf(data) + "'s Team";
    var calIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/></svg>';
    var bookingIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>';
    return (
      '<div class="pp-pax-info-buttons">' +
      '<p class="pp-pax-info-section-label">This week</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--week">' +
      infoBtnHtml("messages", "Messages", msgIcon, {
        extraClass:
          " pp-pax-info-btn--messages" +
          (msgUnread > 0 ? " pp-pax-info-btn--has-unread" : ""),
        unreadBadge: msgBadge,
      }) +
      infoBtnHtml("absence", "Report absent", absentIcon, {
        extraClass: " pp-pax-info-btn--absence",
        subtitle: hasServices ? "Missed / note" : "No sessions yet",
        disabled: !hasServices,
      }) +
      infoBtnHtml("calendar", "My Calendar", calIcon, {
        extraClass: " pp-pax-info-btn--calendar",
        subtitle: "Term dates",
      }) +
      infoBtnHtml("team", teamCaption, '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', {
        extraClass: " pp-pax-info-btn--accent pp-pax-info-btn--team",
        subtitle: "Instructors",
      }) +
      "</div>" +
      '<p class="pp-pax-info-section-label">Paperwork</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--paper">' +
      infoBtnHtml("invoices", "Invoices", invoiceIcon, {
        extraClass: " pp-pax-info-btn--invoices",
        subtitle: "Statements & PDFs",
      }) +
      infoBtnHtml("documents", "Documents", docsIcon, {
        extraClass: " pp-pax-info-btn--documents",
        subtitle: "Registration forms",
      }) +
      infoBtnHtml("balance", "Credits & refunds", balanceIcon, {
        extraClass: " pp-pax-info-btn--balance",
        subtitle: "Family ledger",
      }) +
      infoBtnHtml("booking", "Booking 2026/27", bookingIcon, {
        subtitle: booking.hint,
      }) +
      "</div>" +
      '<p class="pp-pax-info-section-label">Progress</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--progress">' +
      infoBtnHtml(
        "sessions",
        "Sessions Overview",
        '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
        { extraClass: " pp-pax-info-btn--accent", subtitle: "By activity" },
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

  function navIconSvg(kind) {
    if (kind === "home") {
      return (
        '<svg class="pp-nav-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' +
        "</svg>"
      );
    }
    // hub / grid
    return (
      '<svg class="pp-nav-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' +
      "</svg>"
    );
  }

  function hubBackLabel(data) {
    var pName =
      (data && data.participant && data.participant.display_name) || "Participant";
    var first = firstNameOf(data) || pName.split(/\s+/)[0] || "Participant";
    return {
      full: pName,
      first: first,
      text: first + "'s Hub",
    };
  }

  function hubBackButtonHtml(data) {
    var hub = hubBackLabel(data);
    return (
      '<button type="button" class="pp-btn pp-btn--ghost pp-pax-back" data-pp-back="hub" aria-label="Back to ' +
      esc(hub.text) +
      '">' +
      navIconSvg("hub") +
      '<span>' +
      esc(hub.text) +
      "</span></button>"
    );
  }

  function subviewShell(data, viewName, innerHtml) {
    return (
      '<div class="pp-pax-shell" data-pp-view="' +
      esc(viewName) +
      '">' +
      '<div class="pp-pax-sticky-hero">' +
      hubBackButtonHtml(data) +
      heroHtml(data) +
      "</div>" +
      '<div class="pp-pax-subview-body">' +
      innerHtml +
      "</div></div>"
    );
  }

  function isoDateLocal(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function addDaysLocal(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function parseServiceStartMinutes(time) {
    var s = String(time || "").trim();
    var m = s.match(/(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i);
    if (!m) return 9999;
    var hh = parseInt(m[1], 10) || 0;
    var mm = parseInt(m[2] || "0", 10) || 0;
    var mer = String(m[3] || "").toLowerCase();
    if (mer === "pm" && hh < 12) hh += 12;
    if (mer === "am" && hh === 12) hh = 0;
    if (!mer && hh < 7) hh += 12;
    return hh * 60 + mm;
  }

  function isoInRange(iso, from, to) {
    if (!iso || !from || !to) return false;
    return iso >= from && iso <= to;
  }

  /** Current year sessions for hub chips: Spring/Summer 2026 from April through 17 Jul. */
  var CURRENT_YEAR_TERM_FROM = "2026-04-13";
  var CURRENT_YEAR_TERM_TO = "2026-07-17";
  var CURRENT_YEAR_TERM_BREAK_FROM = "2026-05-23";
  var CURRENT_YEAR_TERM_BREAK_TO = "2026-05-31";
  var CURRENT_YEAR_TERM_CLOSED = { "2026-05-04": true };

  /** Hub / Absent use 2026/27 closed dates only after the family has submitted Booking 2026/27. */
  function familyAcceptedNextYear(data) {
    var r = (data && data.reenrolment) || {};
    return !!r.submitted;
  }

  function isClubClosedIso(iso, data) {
    // Until Booking 2026/27 is submitted: current-year roster only, through 17 Jul 2026.
    if (!familyAcceptedNextYear(data)) {
      if (!iso || iso < CURRENT_YEAR_TERM_FROM || iso > CURRENT_YEAR_TERM_TO) return true;
      if (CURRENT_YEAR_TERM_CLOSED[iso]) return true;
      if (isoInRange(iso, CURRENT_YEAR_TERM_BREAK_FROM, CURRENT_YEAR_TERM_BREAK_TO)) return true;
      return false;
    }
    var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
    if (!cal) return false;
    if (cal.openFrom && iso < cal.openFrom) return true;
    if (cal.openTo && iso > cal.openTo) return true;
    var terms = Array.isArray(cal.terms) ? cal.terms : [];
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i] || {};
      if (t.christmasClosed && isoInRange(iso, t.christmasClosed.from, t.christmasClosed.to)) {
        return true;
      }
      if (t.easterClosed && isoInRange(iso, t.easterClosed.from, t.easterClosed.to)) {
        return true;
      }
    }
    var closures = Array.isArray(cal.weekendClosures) ? cal.weekendClosures : [];
    for (var j = 0; j < closures.length; j++) {
      if (isoInRange(iso, closures[j].from, closures[j].to)) return true;
    }
    return false;
  }

  function formatHubDateLabel(iso) {
    try {
      var p = String(iso || "").split("-");
      if (p.length !== 3) return iso;
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      return d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return String(iso || "");
    }
  }

  /** Next booked session from current roster services_detail (weekday pattern). */
  function findNextSessions(data, limit) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    if (!detail.length) return [];
    var byCol = Object.create(null);
    detail.forEach(function (s) {
      var col = dayNameToCalCol(s && s.day);
      if (col == null) return;
      if (!byCol[col]) byCol[col] = [];
      byCol[col].push(s);
    });
    Object.keys(byCol).forEach(function (k) {
      byCol[k].sort(function (a, b) {
        return parseServiceStartMinutes(a.time) - parseServiceStartMinutes(b.time);
      });
    });
    var today = new Date();
    var out = [];
    var max = Math.max(1, limit || 3);
    var horizon = familyAcceptedNextYear(data) ? 28 : 14;
    for (var offset = 0; offset < horizon && out.length < max; offset++) {
      var d = addDaysLocal(today, offset);
      var iso = isoDateLocal(d);
      // Stop scanning past current-year end (e.g. Rodin Sundays → only 12 Jul left before 17 Jul).
      if (!familyAcceptedNextYear(data) && iso > CURRENT_YEAR_TERM_TO) break;
      if (isClubClosedIso(iso, data)) continue;
      // JS: Sun=0 … Sat=6 → calendar Mon=0 … Sun=6
      var jsDow = d.getDay();
      var col = jsDow === 0 ? 6 : jsDow - 1;
      var slots = byCol[col];
      if (!slots || !slots.length) continue;
      slots.forEach(function (s) {
        if (out.length >= max) return;
        out.push({
          iso: iso,
          dayLabel: formatHubDateLabel(iso),
          label: shortServiceChipLabel(s.label || "Service") || s.label || "Service",
          rawLabel: s.label || "Service",
          day: s.day || "",
          time: s.time || "",
          isToday: offset === 0,
        });
      });
    }
    return out;
  }

  /** All session dates this term for the child's booked weekdays (unique calendar days). */
  function findTermSessionDates(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    if (!detail.length) return [];
    var cols = Object.create(null);
    detail.forEach(function (s) {
      var col = dayNameToCalCol(s && s.day);
      if (col != null) cols[col] = true;
    });
    if (!Object.keys(cols).length) return [];

    var fromIso = CURRENT_YEAR_TERM_FROM;
    var toIso = CURRENT_YEAR_TERM_TO;
    if (familyAcceptedNextYear(data)) {
      var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
      if (cal && cal.openFrom) fromIso = cal.openFrom;
      if (cal && cal.openTo) toIso = cal.openTo;
    }

    var todayIso = isoDateLocal(new Date());
    var nextList = findNextSessions(data, 1);
    var nextIso = nextList[0] ? nextList[0].iso : "";
    var startParts = fromIso.split("-");
    var cursor = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]));
    var out = [];
    var guard = 0;
    while (guard < 400) {
      guard++;
      var iso = isoDateLocal(cursor);
      if (iso > toIso) break;
      if (!isClubClosedIso(iso, data)) {
        var jsDow = cursor.getDay();
        var col = jsDow === 0 ? 6 : jsDow - 1;
        if (cols[col]) {
          out.push({
            iso: iso,
            shortLabel: formatTermChipLabel(iso),
            past: iso < todayIso,
            isToday: iso === todayIso,
            isNext: !!nextIso && iso === nextIso,
          });
        }
      }
      cursor = addDaysLocal(cursor, 1);
    }
    return out;
  }

  function formatTermChipLabel(iso) {
    try {
      var p = String(iso || "").split("-");
      if (p.length !== 3) return iso;
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    } catch (_e) {
      return String(iso || "");
    }
  }

  var CHIP_X_SVG =
    '<svg class="pp-hub-ops__date-chip__x" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3L3 9"/></svg>';
  var CHIP_CREDIT_SVG =
    '<svg class="pp-hub-ops__date-chip__mark" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/><path d="M7.2 4.4c-.3-.4-.8-.6-1.3-.6-.9 0-1.5.5-1.5 1.2 0 1.4 2.8.8 2.8 2.4 0 .7-.6 1.2-1.5 1.2-.5 0-1-.2-1.3-.6"/><path d="M6 3.2v.8M6 8v.8"/></svg>';

  function termChipToneMeta(d, statusByIso) {
    statusByIso = statusByIso || {};
    var st = statusByIso[d.iso] || "";
    if (st === "absent") {
      return {
        tone: "absent",
        title: "Absent — " + d.iso,
        icon: CHIP_X_SVG,
      };
    }
    if (st === "cancelled") {
      return {
        tone: "cancelled",
        title: "Club cancelled — credit / refund may apply — " + d.iso,
        icon: CHIP_CREDIT_SVG,
      };
    }
    if (d.isNext) {
      return { tone: "next", title: "Next session — " + d.iso, icon: "" };
    }
    if (d.past) {
      return { tone: "done", title: "Completed — " + d.iso, icon: "" };
    }
    return { tone: "upcoming", title: "Upcoming — " + d.iso, icon: "" };
  }

  function termSessionDateChipsHtml(data, statusByIso) {
    var dates = findTermSessionDates(data);
    if (!dates.length) return "";
    return (
      '<div class="pp-hub-ops__date-chips" role="list" aria-label="Session dates this term">' +
      dates
        .map(function (d) {
          var meta = termChipToneMeta(d, statusByIso);
          return (
            '<span class="pp-hub-ops__date-chip pp-hub-ops__date-chip--' +
            meta.tone +
            '" role="listitem" data-pp-term-iso="' +
            esc(d.iso) +
            '" title="' +
            esc(meta.title) +
            '">' +
            meta.icon +
            "<span>" +
            esc(d.shortLabel) +
            "</span></span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function applyTermDateChipStatuses(host, data, statusByIso) {
    if (!host) return;
    var wrap = host.querySelector(".pp-hub-ops__date-chips");
    if (!wrap) return;
    wrap.outerHTML = termSessionDateChipsHtml(data, statusByIso);
  }

  function mountTermDateChipStatuses(host, data, opts, messagesPromise) {
    if (!host) return;
    var statusByIso = Object.create(null);

    function mergeAndPaint() {
      if (!host.isConnected) return;
      applyTermDateChipStatuses(host, data, statusByIso);
    }

    function applyCancelledFromMessages(payload) {
      ((payload && payload.messages) || []).forEach(function (m) {
        if (!m || String(m.kind || "").toLowerCase() !== "session_cancelled") return;
        if (!messageMatchesParticipant(m, data)) return;
        var iso = String(m.session_date || "").slice(0, 10);
        if (!iso) return;
        // Absent (parent) wins over club cancel on the same day.
        if (statusByIso[iso] !== "absent") statusByIso[iso] = "cancelled";
      });
    }

    var tasks = [];
    if (typeof opts.listAbsences === "function") {
      tasks.push(
        opts.listAbsences().then(function (j) {
          ((j && j.reports) || []).forEach(function (r) {
            var iso = String((r && r.session_date) || "").slice(0, 10);
            if (!iso) return;
            // Any parent Absent report for that day marks the chip red.
            statusByIso[iso] = "absent";
          });
        }),
      );
    }
    if (messagesPromise && typeof messagesPromise.then === "function") {
      tasks.push(
        messagesPromise.then(function (payload) {
          applyCancelledFromMessages(payload);
        }),
      );
    } else if (typeof opts.loadMessages === "function") {
      tasks.push(
        opts.loadMessages({ markRead: false }).then(function (payload) {
          applyCancelledFromMessages(payload);
        }),
      );
    }
    if (typeof opts.listCredits === "function") {
      tasks.push(
        opts.listCredits().then(function (j) {
          ((j && j.entries) || []).forEach(function (e) {
            var iso = String((e && e.session_date) || "").slice(0, 10);
            if (!iso) return;
            var src = String((e && e.source) || "");
            if (src !== "club_cancellation") return;
            if (statusByIso[iso] === "absent") return;
            // Club-cancelled session with credit/refund on the ledger.
            statusByIso[iso] = "cancelled";
          });
        }),
      );
    }
    if (!tasks.length) return;
    void Promise.all(
      tasks.map(function (p) {
        return p.catch(function () {});
      }),
    ).then(mergeAndPaint);
  }

  function absenceStatusLabel(status) {
    var s = String(status || "").toLowerCase();
    if (s === "noted") return "Noted";
    if (s === "missed") return "Missed session";
    if (s === "pending_review") return "Proof with admin";
    if (s === "excused") return "Excused (validated)";
    if (s === "rejected") return "Proof not accepted";
    if (s === "expired") return "Proof window closed";
    return s || "—";
  }

  var ABSENCE_REASON_OPTIONS = [
    { code: "other_commitments", label: "Other commitments" },
    { code: "party", label: "Party" },
    { code: "holidays", label: "Holidays" },
    { code: "travel", label: "Travel" },
    { code: "birthday", label: "Birthday" },
    { code: "unwell", label: "Unwell" },
  ];

  function absenceReasonChipsHtml() {
    return (
      '<div class="pp-absence-reasons" role="group" aria-label="Reason">' +
      ABSENCE_REASON_OPTIONS.map(function (r, i) {
        return (
          '<label class="pp-absence-reason-chip">' +
          '<input type="radio" name="ppAbsenceReasonCode" value="' +
          esc(r.code) +
          '"' +
          (i === 0 ? " checked" : "") +
          " />" +
          "<span>" +
          esc(r.label) +
          "</span></label>"
        );
      }).join("") +
      "</div>"
    );
  }

  function formatProofDeadline(iso) {
    if (!iso) return "";
    try {
      var p = String(iso).split("-");
      if (p.length !== 3) return String(iso);
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (_e) {
      return String(iso);
    }
  }

  function hubOpsSessionSlotHtml(s) {
    var tone = serviceChipToneClass(s.rawLabel || s.label || "");
    return (
      '<li class="pp-hub-ops__slot pp-hub-ops__slot--' +
      esc(tone) +
      '">' +
      '<span class="pp-hub-ops__slot-name">' +
      esc(s.label || "Service") +
      "</span>" +
      (s.time ? '<span class="pp-hub-ops__slot-time">' + esc(s.time) + "</span>" : "") +
      "</li>"
    );
  }

  function hubOpsCardHtml(data) {
    var hasServices = !!(
      data &&
      data.general &&
      Array.isArray(data.general.services_detail) &&
      data.general.services_detail.length
    );
    var nextList = findNextSessions(data, 4);
    var next = nextList[0] || null;
    // Same calendar day as the next session (e.g. Rodin Climbing + Aquatic on Sunday).
    var sameDay = next
      ? nextList.filter(function (x) {
          return x.iso === next.iso;
        })
      : [];
    var calIco =
      '<svg class="pp-hub-ops__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    var nextBody;
    if (!hasServices) {
      nextBody =
        '<div class="pp-hub-ops__empty-wrap">' +
        calIco +
        '<p class="pp-muted pp-hub-ops__empty">Booked sessions will appear here once services are on the current roster.</p>' +
        "</div>";
    } else if (!next) {
      nextBody =
        '<div class="pp-hub-ops__next">' +
        '<div class="pp-hub-ops__badge-row">' +
        termSessionDateChipsHtml(data) +
        "</div>" +
        '<p class="pp-muted pp-hub-ops__empty">No more sessions left this year. Book 2026/27 when you are ready.</p>' +
        "</div>";
    } else {
      nextBody =
        '<div class="pp-hub-ops__next">' +
        '<div class="pp-hub-ops__badge-row">' +
        termSessionDateChipsHtml(data) +
        "</div>" +
        '<div class="pp-hub-ops__when-row">' +
        '<span class="pp-hub-ops__when-label">' +
        esc(next.isToday ? "Today:" : "Next session:") +
        "</span>" +
        '<strong class="pp-hub-ops__when">' +
        esc(next.dayLabel) +
        "</strong></div>" +
        '<ul class="pp-hub-ops__slots">' +
        sameDay.map(hubOpsSessionSlotHtml).join("") +
        "</ul></div>";
    }
    return (
      '<section class="pp-hub-ops" aria-label="Upcoming session">' +
      '<div class="pp-hub-ops__panel">' +
      '<div class="pp-hub-ops__main">' +
      nextBody +
      "</div></div>" +
      '<div id="ppHubAlerts" class="pp-hub-alerts" hidden></div>' +
      "</section>"
    );
  }

  function hubAlertKindLabel(kind) {
    var k = String(kind || "").toLowerCase();
    if (k === "instructor_change" || k === "instructor_reassign") return "Instructor update";
    if (k === "session_cancelled") return "Session cancelled";
    if (k === "absence_announced") return "Absence noted";
    return k.replace(/_/g, " ") || "Club update";
  }

  function messageMatchesParticipant(m, data) {
    var p = (data && data.participant) || {};
    var want = String(p.display_name || "").trim().toLowerCase();
    if (!want) return true;
    var got = String((m && m.client_display) || "").trim().toLowerCase();
    if (!got) return true;
    if (got === want) return true;
    var w0 = want.split(/\s+/)[0];
    var g0 = got.split(/\s+/)[0];
    return !!(w0 && g0 && (w0 === g0 || want.indexOf(g0) === 0 || got.indexOf(w0) === 0));
  }

  function filterHubAlerts(messages, data) {
    var ALERT = {
      instructor_change: 1,
      instructor_reassign: 1,
      session_cancelled: 1,
      absence_announced: 1,
    };
    var cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return (messages || [])
      .filter(function (m) {
        if (!m || m.direction !== "out") return false;
        if (!ALERT[String(m.kind || "").toLowerCase()]) return false;
        if (!messageMatchesParticipant(m, data)) return false;
        var t = Date.parse(m.created_at || "");
        if (Number.isFinite(t) && t < cutoff) return false;
        return true;
      })
      .slice(0, 3);
  }

  function renderHubAlertsInto(host, alerts) {
    var el = host.querySelector("#ppHubAlerts");
    if (!el) return;
    if (!alerts || !alerts.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<div class="pp-hub-alerts__head">' +
      '<h4 class="pp-hub-alerts__title">Recent club updates</h4>' +
      '<button type="button" class="pp-hub-alerts__all" data-pp-open="messages">All messages</button>' +
      "</div>" +
      '<ul class="pp-hub-alerts__list">' +
      alerts
        .map(function (m) {
          var preview = String(m.body_text || m.subject || "").trim().replace(/\s+/g, " ");
          if (preview.length > 110) preview = preview.slice(0, 107) + "…";
          return (
            '<li class="pp-hub-alerts__item">' +
            '<button type="button" class="pp-hub-alerts__btn" data-pp-open="messages">' +
            '<span class="pp-hub-alerts__kind">' +
            esc(hubAlertKindLabel(m.kind)) +
            "</span>" +
            '<span class="pp-hub-alerts__when muted">' +
            esc(formatMessageWhen(m.created_at)) +
            "</span>" +
            (preview
              ? '<span class="pp-hub-alerts__preview">' + esc(preview) + "</span>"
              : "") +
            "</button></li>"
          );
        })
        .join("") +
      "</ul>";
  }

  function mountHubAlerts(host, data, opts) {
    if (!host || typeof opts.loadMessages !== "function") return;
    return opts
      .loadMessages({ markRead: false })
      .then(function (payload) {
        if (!host.isConnected) return payload;
        renderHubAlertsInto(host, filterHubAlerts((payload && payload.messages) || [], data));
        host.querySelectorAll("#ppHubAlerts [data-pp-open]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            openSubview(host, data, opts, btn.getAttribute("data-pp-open") || "messages");
          });
        });
        return payload;
      })
      .catch(function () {
        return null;
      });
  }

  function renderHub(host, data, opts) {
    ensureGeneralFields(data, { allowPlaceholders: true });
    setParticipantPageTitle(hubBackLabel(data).text);
    // Services once: chips beside the name. No second "Booked services" block.
    // Messages only in the info buttons row (not again under next session).
    host.innerHTML =
      '<div class="pp-pax-shell" data-pp-view="hub">' +
      hubHeroHtml(data, opts) +
      hubOpsCardHtml(data) +
      infoButtonsHtml(data, opts) +
      "</div>";
    bindHub(host, data, opts);
    var messagesPromise = mountHubAlerts(host, data, opts);
    mountTermDateChipStatuses(host, data, opts, messagesPromise);
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
        '<p class="pp-muted pp-pax-subview-note">Attendance, engagement, emotions and independence across the term — shown separately for each activity when your child does more than one.</p>' +
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

  /** Prefer stable colours by service type; never use closed-day red. */
  var PP_CAL_SERVICE_TONES = [
    "#2d84b3",
    "#0d9488",
    "#7c4dbf",
    "#15803d",
    "#b45309",
    "#0369a1",
  ];

  function toneForServiceLabel(label, fallbackIdx) {
    var s = String(label || "").toLowerCase();
    if (/aquatic|swim/.test(s)) return "#0d9488"; // teal — not closed red
    if (/climb/.test(s)) return "#2d84b3";
    if (/multi/.test(s)) return "#15803d";
    if (/bespoke/.test(s)) return "#7c4dbf";
    if (/day\s*centre|daycentre/.test(s)) return "#b45309";
    return PP_CAL_SERVICE_TONES[fallbackIdx % PP_CAL_SERVICE_TONES.length];
  }

  function dayNameToCalCol(day) {
    var s = String(day || "")
      .trim()
      .toLowerCase()
      .slice(0, 3);
    var map = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    return Object.prototype.hasOwnProperty.call(map, s) ? map[s] : null;
  }

  /**
   * Per weekday: one colour, or an array when several services share the day
   * (half/half or pie thirds in the calendar cell).
   */
  function buildMyCalendarDayColors(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    var byCol = Object.create(null);
    var serviceTone = Object.create(null);
    var toneIdx = 0;
    detail.forEach(function (s) {
      var col = dayNameToCalCol(s && s.day);
      if (col == null) return;
      var label = String((s && s.label) || "Service").trim() || "Service";
      var toneKey = label.toLowerCase();
      if (!serviceTone[toneKey]) {
        serviceTone[toneKey] = toneForServiceLabel(label, toneIdx);
        toneIdx += 1;
      }
      if (!byCol[col]) byCol[col] = [];
      if (byCol[col].indexOf(serviceTone[toneKey]) < 0) {
        byCol[col].push(serviceTone[toneKey]);
      }
    });
    var colMap = {};
    Object.keys(byCol).forEach(function (k) {
      var colors = byCol[k];
      colMap[k] = colors.length === 1 ? colors[0] : colors;
    });
    return { colMap: colMap, serviceTone: serviceTone };
  }

  function myCalendarLegendHtml(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    if (!detail.length) {
      return '<p class="pp-muted pp-cal-legend-empty">Booked weekdays will highlight here once services are confirmed on the roster.</p>';
    }
    var built = buildMyCalendarDayColors(data);
    var seen = Object.create(null);
    var items = [];
    detail.forEach(function (s) {
      var label = String((s && s.label) || "Service").trim() || "Service";
      var key = label.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var tone = (built.serviceTone && built.serviceTone[key]) || PP_CAL_SERVICE_TONES[0];
      var when = [s.day, s.time].filter(Boolean).join(" · ");
      items.push(
        '<li class="pp-cal-legend__item">' +
          '<span class="pp-cal-legend__swatch" style="background:' +
          esc(tone) +
          '" aria-hidden="true"></span>' +
          '<span class="pp-cal-legend__text">' +
          esc(label) +
          (when ? ' <span class="pp-muted">(' + esc(when) + ")</span>" : "") +
          "</span></li>",
      );
    });
    return (
      '<ul class="pp-cal-legend" aria-label="Your session days">' +
      items.join("") +
      '<li class="pp-cal-legend__item pp-cal-legend__item--note">' +
      '<span class="pp-cal-legend__swatch pp-cal-legend__swatch--red" aria-hidden="true"></span>' +
      '<span class="pp-cal-legend__text">Red = closed / half-term (no sessions)</span></li>' +
      "</ul>"
    );
  }

  function mountMyCalendar(host, data) {
    var calHost = host.querySelector("#ppCalYearHost");
    if (!calHost) return;
    var built = buildMyCalendarDayColors(data);
    var dayColors = built.colMap || {};
    if (typeof global.portalLoadSessionsCalendar202627Into === "function") {
      calHost.innerHTML = '<p class="pp-muted">Loading calendar…</p>';
      void global
        .portalLoadSessionsCalendar202627Into(calHost, {
          dayColors: dayColors,
          circles: true,
        })
        .catch(function () {
          if (calHost.isConnected) {
            calHost.innerHTML =
              '<p class="pp-muted">Could not load the sessions calendar.</p>';
          }
        });
      return;
    }
    calHost.innerHTML =
      '<p class="pp-muted">Calendar script is not available. Please refresh the page.</p>';
  }

  function renderCalendar(host, data, opts) {
    var pName =
      (data && data.participant && data.participant.display_name) || "your child";
    var body =
      '<h3 class="pp-pax-subview-title">My Calendar</h3>' +
      '<p class="pp-muted pp-pax-subview-note">ClubSENsational sessions calendar 2026/27. Coloured circles are ' +
      esc(pName) +
      "&apos;s usual session weekdays. Two services on the same day split the circle in half; three services use three slices.</p>" +
      myCalendarLegendHtml(data) +
      '<div class="pp-cal-block">' +
      '<div id="ppCalYearHost" class="pp-cal-host pp-cal-host--year" role="region" aria-label="Sessions calendar 2026/27"></div>' +
      "</div>";
    host.innerHTML = subviewShell(data, "calendar", body);
    bindBack(host, data, opts);
    mountMyCalendar(host, data);
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
    if (!el) return;
    var label = String(text || "Participant");
    el.innerHTML =
      '<span class="pp-title-inner">' +
      '<span class="pp-title-ico" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.25"/><path d="M5.5 19.5c1.2-3.2 3.5-4.75 6.5-4.75s5.3 1.55 6.5 4.75"/></svg>' +
      "</span>" +
      "<span>" +
      esc(label) +
      "</span></span>";
  }

  function renderTeam(host, data, opts) {
    var p = (data && data.participant) || {};
    var pName = p.display_name || "Participant";
    setParticipantPageTitle(pName + "\u2019s Team");

    function paint(members) {
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
        hubBackButtonHtml(data) +
        "</div>" +
        '<div class="pp-pax-subview-body">' +
        '<p class="pp-muted pp-team-intro">Instructors from recent sessions, plus anyone covering after an instructor change — open this anytime to show your child who to expect.</p>' +
        bodyHtml +
        "</div></div>";
      bindBack(host, data, opts);
    }

    var base = teamMembers(data);
    paint(base);

    if (!opts || typeof opts.loadMessages !== "function") return;
    void opts
      .loadMessages({ markRead: false })
      .then(function (payload) {
        if (!host.isConnected) return;
        var covers = coverInstructorsFromMessages((payload && payload.messages) || []);
        if (!covers.length) return;
        var seen = Object.create(null);
        var merged = [];
        base.forEach(function (m) {
          var k = String((m && (m.staff_key || m.key || m.username || m.name)) || "")
            .trim()
            .toLowerCase()
            .split(/\s+/)[0];
          if (k) seen[k] = true;
          merged.push(m);
        });
        covers.forEach(function (c) {
          if (seen[c.key]) return;
          var card = null;
          if (
            global.PortalParentTeam &&
            typeof global.PortalParentTeam.catalogMember === "function"
          ) {
            card = global.PortalParentTeam.catalogMember(c.key);
          }
          if (!card) {
            card = {
              name: c.name,
              avatar_url: "/portal/staff_photos/" + c.key + ".png",
              bio: "Covering instructor for a recent session change.",
            };
          } else {
            card = Object.assign({}, card, {
              bio:
                (card.bio ? card.bio + " " : "") +
                "Also covering after a recent instructor change.",
            });
          }
          seen[c.key] = true;
          merged.push(card);
        });
        if (merged.length !== base.length) paint(merged);
      })
      .catch(function () {});
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
    if (k === "session_cancelled") return "Session cancelled";
    if (k === "absence_announced") return "Absence noted";
    if (!k) return "Club message";
    return k.replace(/_/g, " ");
  }

  /**
   * Render club message body for the in-app thread: embed staff dashboard photos
   * instead of showing the raw /portal/staff_photos/… URL.
   */
  function formatMessageBodyHtml(raw) {
    var text = String(raw || "").trim();
    if (!text) return "";
    if (text.length > 1200) text = text.slice(0, 1197) + "…";

    var photoBlocks = [];
    // "Photo of Youssef (your instructor): https://…/portal/staff_photos/youssef.png"
    text = text.replace(
      /\n*\s*Photo of\s+([^\n(]+?)\s*\((?:your )?instructor\)\s*:\s*(https?:\/\/[^\s]+|\/portal\/staff_photos\/[^\s]+)\s*/gi,
      function (_m, name, url) {
        var idx = photoBlocks.length;
        photoBlocks.push({
          name: String(name || "").trim(),
          url: String(url || "").trim().replace(/[),.;]+$/, ""),
        });
        return "\n\n__PP_PHOTO_" + idx + "__\n\n";
      },
    );
    // Fallback: bare staff photo URL on its own line
    text = text.replace(
      /(^|\n)\s*(https?:\/\/[^\s]*\/portal\/staff_photos\/[a-z0-9_-]+\.(?:png|jpe?g|webp)|\/portal\/staff_photos\/[a-z0-9_-]+\.(?:png|jpe?g|webp))\s*(?=\n|$)/gi,
      function (_m, lead, url) {
        var idx = photoBlocks.length;
        photoBlocks.push({ name: "", url: String(url || "").trim() });
        return lead + "__PP_PHOTO_" + idx + "__";
      },
    );

    var parts = text.split(/(__PP_PHOTO_\d+__)/);
    var html = "";
    parts.forEach(function (part) {
      var pm = String(part || "").match(/^__PP_PHOTO_(\d+)__$/);
      if (pm) {
        var block = photoBlocks[Number(pm[1])];
        if (!block || !block.url) return;
        html +=
          '<figure class="pp-pax-msg__photo">' +
          '<img src="' +
          esc(block.url) +
          '" alt="' +
          esc(block.name ? "Photo of " + block.name : "Instructor photo") +
          '" loading="lazy" decoding="async" />' +
          (block.name
            ? '<figcaption class="pp-pax-msg__photo-cap">' +
              esc(block.name) +
              " — your instructor</figcaption>"
            : "") +
          "</figure>";
        return;
      }
      if (!part) return;
      html +=
        '<span class="pp-pax-msg__text">' +
        esc(part).replace(/\n/g, "<br>") +
        "</span>";
    });
    return html;
  }

  /** Cover / new instructors mentioned in club messages → Team catalog keys. */
  function coverInstructorsFromMessages(messages) {
    var out = [];
    var seen = Object.create(null);
    (messages || []).forEach(function (m) {
      if (!m || m.direction !== "out") return;
      var k = String(m.kind || "").toLowerCase();
      if (k !== "instructor_change" && k !== "instructor_reassign" && k !== "makeup_scheduled") {
        return;
      }
      var body = String(m.body_text || "");
      var names = [];
      var photoName = body.match(/Photo of\s+([^\n(]+?)\s*\((?:your )?instructor\)/i);
      if (photoName) names.push(photoName[1]);
      var withName = body.match(
        /(?:now be with|will be with|session will now be with)\s+([A-Za-z][A-Za-z' -]{1,40}?)(?:\s*\(|\.|,|\n|$)/i,
      );
      if (withName) names.push(withName[1]);
      names.forEach(function (raw) {
        var name = String(raw || "").trim();
        if (!name) return;
        var key = "";
        if (
          global.PortalParentTeam &&
          typeof global.PortalParentTeam.staffKeyFromFeedbackName === "function"
        ) {
          key = global.PortalParentTeam.staffKeyFromFeedbackName(name);
        }
        if (!key) {
          key = name.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, "");
        }
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push({ key: key, name: name, role: "cover" });
      });
    });
    return out;
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
    // Club → parent: corporate blue so it is obvious we wrote it.
    // Parent → club: keep WhatsApp green / app grey.
    if (m && m.direction === "out") {
      var chOut = messageDeliveryChannel(m);
      if (chOut === "email") return "pp-pax-msg--email";
      return "pp-pax-msg--club";
    }
    var ch = messageDeliveryChannel(m);
    if (ch === "whatsapp" || ch === "whatsapp_in") return "pp-pax-msg--wa";
    if (ch === "app_in") return "pp-pax-msg--app-in";
    return "pp-pax-msg--app-in";
  }

  /** Parent/carer display names from WhatsApp are often all-lowercase. */
  function titleCasePersonName(raw) {
    var s = String(raw || "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    return s
      .split(" ")
      .map(function (part) {
        if (!part) return part;
        // Keep short particles lowercase when mid-name (de, da, van…) except first token.
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function messagesThreadHtml(messages, waBiz) {
    if (!messages || !messages.length) {
      return '<p class="pp-muted pp-pax-msgs-empty">No messages yet. Club updates by WhatsApp and email appear here when we send them. Blue = ClubSENsational, green = your WhatsApp.</p>';
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
                (channel === "email" ? "email" : isOut ? "club" : "wa") +
                '">' +
                esc(messageChannelLabel(channel)) +
                "</span>"
              : "";
          var unreadMark = m.is_unread
            ? '<span class="pp-pax-msg__unread-dot" aria-hidden="true"></span>'
            : "";
          var whoLabel = isOut
            ? "CLUBSENSATIONAL"
            : titleCasePersonName(m.sender_name) || "You";
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
            esc(whoLabel) +
            "</span>" +
            '<span class="pp-pax-msg__when pp-muted">' +
            esc(formatMessageWhen(m.created_at)) +
            "</span></div>" +
            (preview ? '<div class="pp-pax-msg__body">' + formatMessageBodyHtml(preview) + "</div>" : "") +
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
    opts = opts || {};
    var state = { messages: [], waBiz: null, filter: "whatsapp" };
    var prefill = String(opts.prefillMessage || "").trim();
    var body =
      '<h3 class="pp-pax-subview-title">Messages</h3>' +
      '<p class="pp-muted pp-pax-subview-note">Club updates by WhatsApp and email. Use the buttons to see each channel on its own.</p>' +
      messagesFilterBarHtml(state.filter) +
      '<div id="ppMsgsThreadHost"><p class="pp-muted">Loading messages…</p></div>' +
      messagesComposeHtml(null);
    host.innerHTML = subviewShell(data, "messages", body);
    bindBack(host, data, opts);
    if (prefill) {
      var input0 = host.querySelector("#ppMsgsInput");
      if (input0) {
        input0.value = prefill;
        try {
          input0.focus();
          input0.setSelectionRange(prefill.length, prefill.length);
        } catch (_e) {}
      }
    }

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

  function absenceReportCardHtml(r) {
    var canUpload = !!r.can_upload_proof;
    var status = String(r.status || "");
    var outcome =
      status === "excused" && r.outcome
        ? '<p class="pp-absence-card__meta">Outcome: <strong>' +
          esc(String(r.outcome)) +
          "</strong>" +
          (r.outcome_notes ? " — " + esc(r.outcome_notes) : "") +
          "</p>"
        : "";
    var review =
      r.review_notes && (status === "rejected" || status === "excused")
        ? '<p class="pp-absence-card__meta muted">Admin: ' + esc(r.review_notes) + "</p>"
        : "";
    var proofLine = r.proof_file_name
      ? '<p class="pp-absence-card__meta muted">Proof on file: ' + esc(r.proof_file_name) + "</p>"
      : "";
    var actions = "";
    if (status === "noted") {
      actions =
        '<p class="pp-muted pp-absence-card__hint">Logged for the office — not a Missed session (no credit / refund / makeup path).</p>';
    } else if (canUpload) {
      var uploadLabel = status === "pending_review" || r.proof_file_name ? "Replace proof" : "Upload proof";
      var hint =
        status === "pending_review"
          ? "Waiting for admin validation. You can replace the file until " +
            formatProofDeadline(r.proof_deadline) +
            "."
          : "Medical note, prescription (participant name), school note, etc. Admin must validate. Deadline: " +
            formatProofDeadline(r.proof_deadline) +
            ".";
      actions =
        '<div class="pp-absence-card__upload">' +
        '<label class="pp-btn pp-btn--primary pp-absence-upload-btn">' +
        esc(uploadLabel) +
        '<input type="file" accept="image/*,application/pdf" hidden data-pp-absence-proof="' +
        esc(r.id) +
        '" />' +
        "</label>" +
        '<p class="pp-muted pp-absence-card__hint">' +
        esc(hint) +
        "</p>" +
        "</div>";
    } else if (
      status === "expired" ||
      (status === "missed" && r.proof_window_closed) ||
      (status === "rejected" && !canUpload)
    ) {
      actions =
        '<p class="pp-notice pp-notice--error pp-absence-expired" role="status">The 2-week window to upload proof has passed. Please contact the office/admin — uploads are no longer available here.</p>';
    } else if (status === "excused") {
      var outcomeKind = String(r.outcome || "").toLowerCase();
      if (outcomeKind === "credit" || outcomeKind === "refund") {
        actions =
          '<p class="pp-notice pp-notice--ok" role="status">Validated. Open <strong>Credits &amp; refunds</strong> on the hub to see your balance.</p>';
      } else if (outcomeKind === "makeup") {
        actions =
          '<p class="pp-notice pp-notice--info" role="status">Validated. A makeup grant may appear below when the office offers a slot.</p>';
      } else {
        actions =
          '<p class="pp-notice pp-notice--info" role="status">Validated by admin.</p>';
      }
    } else if (status === "missed") {
      actions =
        '<p class="pp-muted pp-absence-card__hint">Missed session — no proof on file yet. If you can still upload within 2 weeks of the session date, use Upload proof above when available.</p>';
    }
    return (
      '<article class="pp-absence-card" data-status="' +
      esc(status) +
      '">' +
      '<div class="pp-absence-card__head">' +
      "<strong>" +
      esc(formatHubDateLabel(r.session_date) || r.session_date) +
      "</strong>" +
      '<span class="pp-absence-chip">' +
      esc(absenceStatusLabel(status)) +
      "</span></div>" +
      '<p class="pp-absence-card__svc">' +
      esc(r.service_label || "Session") +
      (r.session_time ? " · " + esc(r.session_time) : "") +
      "</p>" +
      (r.reason_text ? '<p class="pp-absence-card__reason">' + esc(r.reason_text) + "</p>" : "") +
      proofLine +
      outcome +
      review +
      actions +
      "</article>"
    );
  }

  function renderAbsence(host, data, opts) {
    var sessions = findNextSessions(data, 8);
    var optionsHtml = sessions
      .map(function (s, i) {
        var val = s.iso + "|" + (s.rawLabel || s.label || "") + "|" + (s.time || "");
        return (
          '<option value="' +
          esc(val) +
          '"' +
          (i === 0 ? " selected" : "") +
          ">" +
          esc(s.dayLabel + (s.label ? " · " + s.label : "") + (s.time ? " · " + s.time : "")) +
          "</option>"
        );
      })
      .join("");
    host.innerHTML = subviewShell(
      data,
      "absence",
      '<h3 class="pp-pax-subview-title">Report absent</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Choose a reason first. Only <strong>Unwell</strong> can become a Missed session (with optional proof for admin). Other reasons are noted for the office — they do not open credit / refund / makeup.</p>' +
        '<div class="pp-card pp-absence-form-card">' +
        '<form id="ppAbsenceForm" class="pp-absence-form">' +
        '<label class="pp-field"><span>Session</span>' +
        (sessions.length
          ? '<select id="ppAbsenceSession" name="session" required>' + optionsHtml + "</select>"
          : '<p class="pp-muted">No upcoming sessions found.</p>') +
        "</label>" +
        '<div class="pp-field"><span>Reason</span>' +
        absenceReasonChipsHtml() +
        "</div>" +
        '<div id="ppAbsenceUnwellBlock" class="pp-absence-unwell" hidden>' +
        '<p class="pp-absence-unwell__q">Can you prove it? (medical note, prescription in the participant&apos;s name, school note…)</p>' +
        '<div class="pp-absence-prove" role="group" aria-label="Can you prove it">' +
        '<label class="pp-absence-prove-chip"><input type="radio" name="ppAbsenceCanProve" value="yes" /><span>Yes — I will upload proof</span></label>' +
        '<label class="pp-absence-prove-chip"><input type="radio" name="ppAbsenceCanProve" value="no" checked /><span>No — Missed session</span></label>' +
        "</div>" +
        '<div id="ppAbsenceUploadBlock" class="pp-absence-upload-block" hidden>' +
        '<label class="pp-btn pp-btn--primary pp-absence-upload-btn" id="ppAbsenceUploadLabel">' +
        "Upload proof" +
        '<input type="file" id="ppAbsenceProofFile" accept="image/*,application/pdf" hidden />' +
        "</label>" +
        '<p class="pp-muted pp-absence-card__hint" id="ppAbsenceProofName"></p>' +
        '<p class="pp-muted pp-absence-card__hint">PDF or photo. Admin must always validate. You have 2 weeks from the session date.</p>' +
        "</div></div>" +
        '<label class="pp-field"><span>Note (optional)</span>' +
        '<textarea id="ppAbsenceReason" name="reason" rows="2" maxlength="800" placeholder="Extra detail for the office"></textarea>' +
        "</label>" +
        '<button type="submit" class="pp-btn pp-btn--primary" id="ppAbsenceSubmit"' +
        (sessions.length ? "" : " disabled") +
        ">Submit absence</button>" +
        "</form>" +
        '<div id="ppAbsenceNotice" class="pp-notice" hidden></div>' +
        "</div>" +
        '<h4 class="pp-absence-list-title">Makeup offers</h4>' +
        '<div id="ppMakeupListHost"><p class="pp-muted">Loading…</p></div>' +
        '<h4 class="pp-absence-list-title">Your absence reports</h4>' +
        '<div id="ppAbsenceListHost"><p class="pp-muted">Loading…</p></div>',
    );
    bindBack(host, data, opts);
    bindAbsence(host, data, opts);
  }

  function formatCreditMoney(n) {
    if (n == null || n === "") return null;
    var v = Number(n);
    if (!isFinite(v)) return null;
    return "£" + v.toFixed(2);
  }

  function creditStatusLabel(status) {
    var s = String(status || "");
    if (s === "open") return "Open";
    if (s === "applied") return "Applied";
    if (s === "refunded") return "Refunded";
    if (s === "cancelled") return "Cancelled";
    return s || "—";
  }

  function creditEntryCardHtml(e) {
    var kind = String(e.kind || "");
    var money = formatCreditMoney(e.amount_gbp);
    var title = kind === "refund" ? "Refund" : "Credit";
    return (
      '<article class="pp-absence-card pp-credit-card" data-status="' +
      esc(e.status) +
      '">' +
      '<div class="pp-absence-card__head">' +
      "<strong>" +
      esc(title) +
      "</strong>" +
      '<span class="pp-absence-chip">' +
      esc(creditStatusLabel(e.status)) +
      "</span></div>" +
      (money
        ? '<p class="pp-credit-card__amount">' + esc(money) + "</p>"
        : '<p class="pp-muted pp-absence-card__hint">Session credit on file (amount set by the office if needed).</p>') +
      '<p class="pp-absence-card__svc">' +
      esc(e.service_label || "Session") +
      (e.session_date
        ? " · " + esc(formatHubDateLabel(e.session_date) || e.session_date)
        : "") +
      "</p>" +
      (e.notes ? '<p class="pp-absence-card__reason">' + esc(e.notes) + "</p>" : "") +
      (e.close_notes && e.status !== "open"
        ? '<p class="pp-absence-card__meta muted">' + esc(e.close_notes) + "</p>"
        : "") +
      "</article>"
    );
  }

  function renderBalance(host, data, opts) {
    host.innerHTML = subviewShell(
      data,
      "balance",
      '<h3 class="pp-pax-subview-title">Credits &amp; refunds</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Balances appear here after the office validates an excused absence as a credit or refund. Refunds stay open until the office marks them paid.</p>' +
        '<div id="ppBalanceSummary" class="pp-balance-summary" hidden></div>' +
        '<div id="ppBalanceNotice" class="pp-notice" hidden></div>' +
        '<div id="ppBalanceListHost"><p class="pp-muted">Loading…</p></div>',
    );
    bindBack(host, data, opts);
    bindBalance(host, data, opts);
  }

  function formatDocWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    try {
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function documentCardHtml(doc) {
    var title = String((doc && doc.title) || doc.form_type || "Document").trim();
    var when = formatDocWhen(doc && doc.submitted_at);
    var status = String((doc && doc.status) || "").trim();
    var pdf = (doc && doc.pdf_url) || "";
    var photo = (doc && doc.photo_url) || "";
    return (
      '<article class="pp-doc-card">' +
      '<div class="pp-doc-card__head">' +
      "<strong>" +
      esc(title) +
      "</strong>" +
      (status ? '<span class="pp-doc-chip">' + esc(status) + "</span>" : "") +
      "</div>" +
      (when ? '<p class="pp-doc-card__when muted">Submitted ' + esc(when) + "</p>" : "") +
      '<div class="pp-doc-card__acts">' +
      (pdf
        ? '<a class="pp-btn pp-btn--primary" href="' +
          esc(pdf) +
          '" target="_blank" rel="noopener noreferrer">Open PDF</a>'
        : "") +
      (photo
        ? '<a class="pp-btn pp-btn--ghost" href="' +
          esc(photo) +
          '" target="_blank" rel="noopener noreferrer">Photo</a>'
        : "") +
      (!pdf && !photo ? '<p class="pp-muted">File not available yet.</p>' : "") +
      "</div></article>"
    );
  }

  function renderDocuments(host, data, opts) {
    host.innerHTML = subviewShell(
      data,
      "documents",
      '<h3 class="pp-pax-subview-title">Documents</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Registration forms submitted for ' +
        esc(firstNameOf(data)) +
        ". Open a PDF to view or download.</p>" +
        '<div id="ppDocsNotice" class="pp-notice" hidden></div>' +
        '<div id="ppDocsListHost"><p class="pp-muted">Loading…</p></div>',
    );
    bindBack(host, data, opts);
    bindDocuments(host, data, opts);
  }

  function bindDocuments(host, data, opts) {
    var listHost = host.querySelector("#ppDocsListHost");
    var notice = host.querySelector("#ppDocsNotice");

    function showNotice(kind, text) {
      if (!notice) return;
      notice.hidden = !text;
      notice.className = "pp-notice" + (kind ? " pp-notice--" + kind : "");
      notice.textContent = text || "";
    }

    if (!listHost || typeof opts.listDocuments !== "function") {
      if (listHost) listHost.innerHTML = '<p class="pp-muted">Documents are not available right now.</p>';
      return;
    }

    void opts
      .listDocuments()
      .then(function (j) {
        var docs = (j && j.documents) || [];
        if (!docs.length) {
          listHost.innerHTML =
            '<p class="pp-muted">No registration documents on file yet for this participant.</p>';
          return;
        }
        listHost.innerHTML = docs.map(documentCardHtml).join("");
      })
      .catch(function () {
        showNotice("error", "Could not load documents — please try again.");
        listHost.innerHTML = "";
      });
  }

  function formatInvoiceMoney(n) {
    if (n == null || n === "") return "";
    var v = Number(n);
    if (!isFinite(v)) return "";
    return "£" + v.toFixed(2);
  }

  function invoiceStatusLabel(status) {
    var s = String(status || "unpaid").toLowerCase();
    if (s === "paid") return "Paid";
    if (s === "partial") return "Partial";
    if (s === "void") return "Void";
    if (s === "pending_confirmation") return "Pending confirmation";
    return "Unpaid";
  }

  function invoiceBankPanelHtml(inv) {
    var bank = inv && inv.bank_transfer;
    if (!bank) return "";
    var status = String((inv && inv.payment_status) || "").toLowerCase();
    if (status === "paid" || status === "void") return "";
    var ref = String((inv && inv.suggested_reference) || bank.reference_hint || "").trim();
    if (!bank.available) {
      return (
        '<div class="pp-invoice-pay">' +
        '<p class="pp-invoice-pay__title">Pay by bank transfer</p>' +
        '<p class="pp-muted pp-invoice-pay__note">' +
        esc(bank.message || "Contact the office for bank transfer details.") +
        "</p></div>"
      );
    }
    return (
      '<div class="pp-invoice-pay">' +
      '<p class="pp-invoice-pay__title">Pay by bank transfer (Tide)</p>' +
      '<dl class="pp-invoice-pay__dl">' +
      "<div><dt>Payee</dt><dd>" +
      esc(bank.payee_name) +
      "</dd></div>" +
      "<div><dt>Sort code</dt><dd>" +
      esc(bank.sort_code) +
      "</dd></div>" +
      "<div><dt>Account</dt><dd>" +
      esc(bank.account_number) +
      "</dd></div>" +
      (ref
        ? "<div><dt>Reference</dt><dd>" + esc(ref) + "</dd></div>"
        : "") +
      "</dl>" +
      '<p class="pp-muted pp-invoice-pay__note">Use the reference so we can match your payment. Prefer bank transfer — no card fee.</p>' +
      "</div>"
    );
  }

  function invoiceCardHtml(inv) {
    var title = String((inv && inv.title) || "Invoice").trim();
    var num = String((inv && inv.invoice_number) || "").trim();
    var amount = formatInvoiceMoney(inv && inv.amount_gbp);
    var due = formatDocWhen(inv && inv.due_date);
    var status = String((inv && inv.payment_status) || "unpaid").toLowerCase();
    var pdf = (inv && inv.pdf_url) || "";
    var canReport = !!(inv && inv.can_report_paid);
    var canPay = !!(inv && inv.can_pay);
    var gc = String((inv && inv.gocardless_url) || "").trim();
    var pl = String((inv && inv.payment_link_url) || "").trim();
    var surcharge = String((inv && inv.payment_link_surcharge_note) || "").trim();
    var suggestedRef = String((inv && inv.suggested_reference) || "").trim();
    var pendingNote =
      status === "pending_confirmation"
        ? '<p class="pp-invoice-card__meta">Thanks — we will confirm when the payment appears' +
          (inv.parent_reported_ref
            ? " (ref " + esc(inv.parent_reported_ref) + ")"
            : "") +
          ".</p>"
        : "";
    return (
      '<article class="pp-invoice-card pp-invoice-card--' +
      esc(status) +
      '" data-invoice-id="' +
      esc(inv.id) +
      '">' +
      '<div class="pp-invoice-card__head">' +
      "<strong>" +
      esc(title) +
      "</strong>" +
      '<span class="pp-invoice-chip pp-invoice-chip--' +
      esc(status) +
      '">' +
      esc(invoiceStatusLabel(status)) +
      "</span></div>" +
      (num ? '<p class="pp-invoice-card__meta">Invoice ' + esc(num) + "</p>" : "") +
      (amount
        ? '<p class="pp-invoice-card__amount">' + esc(amount) + "</p>"
        : "") +
      (due ? '<p class="pp-invoice-card__meta muted">Due ' + esc(due) + "</p>" : "") +
      pendingNote +
      invoiceBankPanelHtml(inv) +
      '<div class="pp-invoice-card__acts">' +
      (pdf
        ? '<a class="pp-btn pp-btn--ghost" href="' +
          esc(pdf) +
          '" target="_blank" rel="noopener noreferrer">Open PDF</a>'
        : '<p class="pp-muted">PDF not available yet.</p>') +
      (gc
        ? '<a class="pp-btn pp-btn--primary" href="' +
          esc(gc) +
          '" target="_blank" rel="noopener noreferrer">Pay with GoCardless</a>'
        : "") +
      (pl
        ? '<a class="pp-btn pp-btn--ghost" href="' +
          esc(pl) +
          '" target="_blank" rel="noopener noreferrer">Card / Apple Pay link</a>'
        : "") +
      (canPay
        ? '<button type="button" class="pp-btn pp-btn--ghost" data-pp-pay-invoice="' +
          esc(inv.id) +
          '">Card checkout</button>'
        : "") +
      "</div>" +
      (pl
        ? '<p class="pp-muted pp-invoice-pay__note">Card / Payment Link may include a surcharge' +
          (surcharge ? ": " + esc(surcharge) : " to cover fees") +
          ". Bank transfer is preferred.</p>"
        : "") +
      (canReport
        ? '<div class="pp-invoice-report">' +
          '<label class="pp-invoice-report__label">Transfer reference (optional)' +
          '<input class="pp-invoice-report__input" type="text" data-pp-pay-ref="' +
          esc(inv.id) +
          '" value="' +
          esc(suggestedRef) +
          '" maxlength="120" autocomplete="off" /></label>' +
          '<button type="button" class="pp-btn pp-btn--primary" data-pp-report-paid="' +
          esc(inv.id) +
          '">I&apos;ve paid by bank transfer</button>' +
          "</div>"
        : "") +
      "</article>"
    );
  }

  function renderInvoices(host, data, opts) {
    host.innerHTML = subviewShell(
      data,
      "invoices",
      '<h3 class="pp-pax-subview-title">Invoices</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Statements shared by the office for ' +
        esc(firstNameOf(data)) +
        ". Prefer <strong>bank transfer</strong> to our Tide account. GoCardless or a card link appear only when the office adds them.</p>" +
        '<div id="ppInvoicesNotice" class="pp-notice" hidden></div>' +
        '<div id="ppInvoicesListHost"><p class="pp-muted">Loading…</p></div>',
    );
    bindBack(host, data, opts);
    bindInvoices(host, data, opts);
  }

  function bindInvoices(host, data, opts) {
    var listHost = host.querySelector("#ppInvoicesListHost");
    var notice = host.querySelector("#ppInvoicesNotice");

    function showNotice(kind, text) {
      if (!notice) return;
      notice.hidden = !text;
      notice.className = "pp-notice" + (kind ? " pp-notice--" + kind : "");
      notice.textContent = text || "";
    }

    if (!listHost || typeof opts.listInvoices !== "function") {
      if (listHost) listHost.innerHTML = '<p class="pp-muted">Invoices are not available right now.</p>';
      return;
    }

    function refreshList() {
      return opts.listInvoices().then(function (j) {
        var invoices = (j && j.invoices) || [];
        if (!invoices.length) {
          listHost.innerHTML =
            '<p class="pp-muted">No invoices shared yet for this participant.</p>';
          return;
        }
        listHost.innerHTML = invoices.map(invoiceCardHtml).join("");
        wireInvoiceActions();
      });
    }

    function wireInvoiceActions() {
      listHost.querySelectorAll("[data-pp-pay-invoice]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-pp-pay-invoice");
          if (!id || typeof opts.startInvoiceCheckout !== "function") return;
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
          showNotice("info", "Opening secure card payment…");
          void opts
            .startInvoiceCheckout(id)
            .then(function (j) {
              var url = j && j.checkout_url;
              if (!url) throw new Error("no_url");
              global.location.href = url;
            })
            .catch(function (err) {
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
              var code = err && err.code ? String(err.code) : "";
              var msg =
                (err && err.messageText) ||
                (code === "stripe_not_configured"
                  ? "Card checkout is not available. Use bank transfer or contact the office."
                  : code === "already_paid"
                    ? "This invoice is already marked paid."
                    : code === "amount_required"
                      ? "This invoice has no amount for card payment. Contact the office."
                      : "Could not start card payment — please try bank transfer or contact the office.");
              showNotice("error", msg);
            });
        });
      });

      listHost.querySelectorAll("[data-pp-report-paid]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-pp-report-paid");
          if (!id || typeof opts.reportInvoicePaid !== "function") return;
          var refInput = listHost.querySelector('[data-pp-pay-ref="' + id + '"]');
          var ref = refInput ? String(refInput.value || "").trim() : "";
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
          void opts
            .reportInvoicePaid(id, { payment_ref: ref, method: "bank_transfer" })
            .then(function (j) {
              showNotice(
                "info",
                (j && j.message) ||
                  "Thanks — the office will confirm when the payment appears.",
              );
              return refreshList();
            })
            .catch(function (err) {
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
              var code = err && err.code ? String(err.code) : "";
              showNotice(
                "error",
                (err && err.messageText) ||
                  (code === "already_paid"
                    ? "This invoice is already marked paid."
                    : "Could not save — please try again."),
              );
            });
        });
      });
    }

    void refreshList().catch(function () {
      showNotice("error", "Could not load invoices — please try again.");
      listHost.innerHTML = "";
    });
  }

  function bindBalance(host, data, opts) {
    var listHost = host.querySelector("#ppBalanceListHost");
    var summary = host.querySelector("#ppBalanceSummary");
    var notice = host.querySelector("#ppBalanceNotice");

    function showNotice(kind, text) {
      if (!notice) return;
      notice.hidden = !text;
      notice.className = "pp-notice" + (kind ? " pp-notice--" + kind : "");
      notice.textContent = text || "";
    }

    if (!listHost || typeof opts.listCredits !== "function") {
      if (listHost) listHost.innerHTML = '<p class="pp-muted">Balance is not available right now.</p>';
      return;
    }

    void opts
      .listCredits()
      .then(function (j) {
        var entries = (j && j.entries) || [];
        var s = (j && j.summary) || {};
        if (summary) {
          var parts = [];
          if (s.open_credit_count > 0) {
            parts.push(
              String(s.open_credit_count) +
                " open credit" +
                (s.open_credit_count === 1 ? "" : "s") +
                (formatCreditMoney(s.open_credit_gbp)
                  ? " (" + formatCreditMoney(s.open_credit_gbp) + ")"
                  : ""),
            );
          }
          if (s.open_refund_count > 0) {
            parts.push(
              String(s.open_refund_count) +
                " open refund" +
                (s.open_refund_count === 1 ? "" : "s") +
                (formatCreditMoney(s.open_refund_gbp)
                  ? " (" + formatCreditMoney(s.open_refund_gbp) + ")"
                  : ""),
            );
          }
          if (parts.length) {
            summary.hidden = false;
            summary.innerHTML =
              '<p class="pp-balance-summary__line"><strong>' +
              esc(parts.join(" · ")) +
              "</strong></p>";
          } else {
            summary.hidden = true;
            summary.innerHTML = "";
          }
        }
        if (!entries.length) {
          listHost.innerHTML =
            '<p class="pp-muted">No credits or refunds on file yet for this participant.</p>';
          return;
        }
        listHost.innerHTML = entries.map(creditEntryCardHtml).join("");
      })
      .catch(function () {
        showNotice("error", "Could not load balance — please try again.");
        listHost.innerHTML = "";
      });
  }

  function makeupGrantCardHtml(g) {
    var pending = g.pending_offer;
    var status = String(g.status || "");
    if (pending) {
      return (
        '<article class="pp-absence-card pp-makeup-card" data-status="offered">' +
        '<div class="pp-absence-card__head">' +
        "<strong>Makeup offer</strong>" +
        '<span class="pp-absence-chip">Respond now</span></div>' +
        '<p class="pp-absence-card__svc">' +
        esc(pending.venue || g.preferred_venue || "") +
        " · " +
        esc(formatHubDateLabel(pending.session_date) || pending.session_date) +
        (pending.session_time ? " · " + esc(pending.session_time) : "") +
        "</p>" +
        (pending.service_label
          ? '<p class="pp-absence-card__meta">' + esc(pending.service_label) + "</p>"
          : "") +
        (pending.instructor_name
          ? '<p class="pp-absence-card__meta muted">Instructor: ' +
            esc(pending.instructor_name) +
            " (may differ from usual)</p>"
          : '<p class="pp-absence-card__meta muted">Instructor may differ from your usual one.</p>') +
        (pending.offer_notes
          ? '<p class="pp-absence-card__reason">' + esc(pending.offer_notes) + "</p>"
          : "") +
        '<p class="pp-notice pp-notice--error" role="status">If you decline, you forfeit this makeup — the slot may go to another family.</p>' +
        '<div class="pp-makeup-acts">' +
        '<button type="button" class="pp-btn pp-btn--primary" data-pp-makeup-accept="' +
        esc(pending.id) +
        '">Accept</button>' +
        '<button type="button" class="pp-btn pp-btn--ghost" data-pp-makeup-decline="' +
        esc(pending.id) +
        '">Decline</button>' +
        "</div></article>"
      );
    }
    var acceptedOffer = (g.offers || []).find(function (o) {
      return o && o.status === "accepted";
    });
    var hint =
      status === "open"
        ? "You have a makeup grant for " +
          (g.preferred_venue || "your centre") +
          ". The office will offer a slot when one is available at that venue."
        : status === "consumed"
          ? acceptedOffer && acceptedOffer.roster_override_id
            ? "Makeup accepted and placed on the club roster" +
              (acceptedOffer.session_date
                ? " (" +
                  (formatHubDateLabel(acceptedOffer.session_date) || acceptedOffer.session_date) +
                  (acceptedOffer.session_time ? " · " + acceptedOffer.session_time : "") +
                  ")"
                : "") +
              "."
            : "Makeup accepted — roster confirmation is in progress."
          : status === "forfeited"
            ? "Makeup forfeited after a declined offer."
            : "Status: " + status;
    return (
      '<article class="pp-absence-card" data-status="' +
      esc(status) +
      '">' +
      '<div class="pp-absence-card__head">' +
      "<strong>Makeup grant</strong>" +
      '<span class="pp-absence-chip">' +
      esc(status) +
      "</span></div>" +
      '<p class="pp-absence-card__svc">' +
      esc(g.preferred_venue || "") +
      (g.service_label ? " · " + esc(g.service_label) : "") +
      "</p>" +
      '<p class="pp-muted pp-absence-card__hint">' +
      esc(hint) +
      "</p></article>"
    );
  }

  function bindAbsence(host, data, opts) {
    var notice = host.querySelector("#ppAbsenceNotice");
    var listHost = host.querySelector("#ppAbsenceListHost");
    var makeupHost = host.querySelector("#ppMakeupListHost");
    var unwellBlock = host.querySelector("#ppAbsenceUnwellBlock");
    var uploadBlock = host.querySelector("#ppAbsenceUploadBlock");
    var proofInput = host.querySelector("#ppAbsenceProofFile");
    var proofName = host.querySelector("#ppAbsenceProofName");

    function showNotice(kind, text) {
      if (!notice) return;
      notice.hidden = !text;
      notice.className = "pp-notice" + (kind ? " pp-notice--" + kind : "");
      notice.textContent = text || "";
    }

    function selectedReasonCode() {
      var el = host.querySelector('input[name="ppAbsenceReasonCode"]:checked');
      return el ? String(el.value || "") : "";
    }

    function canProveYes() {
      var el = host.querySelector('input[name="ppAbsenceCanProve"]:checked');
      return el && String(el.value) === "yes";
    }

    function syncUnwellUi() {
      var code = selectedReasonCode();
      var isUnwell = code === "unwell";
      if (unwellBlock) unwellBlock.hidden = !isUnwell;
      var showUpload = isUnwell && canProveYes();
      if (uploadBlock) uploadBlock.hidden = !showUpload;
      if (!showUpload && proofInput) {
        proofInput.value = "";
        if (proofName) proofName.textContent = "";
      }
      var btn = host.querySelector("#ppAbsenceSubmit");
      if (btn) {
        if (!isUnwell) btn.textContent = "Submit absence";
        else if (canProveYes()) btn.textContent = "Submit & send proof";
        else btn.textContent = "Mark as missed";
      }
    }

    host.querySelectorAll('input[name="ppAbsenceReasonCode"]').forEach(function (inp) {
      inp.addEventListener("change", syncUnwellUi);
    });
    host.querySelectorAll('input[name="ppAbsenceCanProve"]').forEach(function (inp) {
      inp.addEventListener("change", syncUnwellUi);
    });
    if (proofInput) {
      proofInput.addEventListener("change", function () {
        var f = proofInput.files && proofInput.files[0];
        if (proofName) proofName.textContent = f ? "Selected: " + f.name : "";
      });
    }
    syncUnwellUi();

    function refreshMakeupList() {
      if (!makeupHost || typeof opts.listMakeups !== "function") {
        if (makeupHost) makeupHost.innerHTML = "";
        return;
      }
      makeupHost.innerHTML = '<p class="pp-muted">Loading…</p>';
      void opts
        .listMakeups()
        .then(function (payload) {
          var grants = (payload && payload.grants) || [];
          if (!grants.length) {
            makeupHost.innerHTML =
              '<p class="pp-muted">No makeup grants yet. If the office issues one after a missed session without proof, it will appear here.</p>';
            return;
          }
          makeupHost.innerHTML =
            '<div class="pp-absence-list">' + grants.map(makeupGrantCardHtml).join("") + "</div>";
          makeupHost.querySelectorAll("[data-pp-makeup-accept]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var offerId = btn.getAttribute("data-pp-makeup-accept");
              if (!offerId || typeof opts.respondMakeup !== "function") return;
              btn.disabled = true;
              showNotice("info", "Accepting…");
              void opts
                .respondMakeup(offerId, "accept")
                .then(function (r) {
                  showNotice("info", (r && r.message) || "Accepted.");
                  refreshMakeupList();
                })
                .catch(function (err) {
                  showNotice(
                    "error",
                    (err && err.messageText) || "Could not accept — try again or contact the office.",
                  );
                  btn.disabled = false;
                });
            });
          });
          makeupHost.querySelectorAll("[data-pp-makeup-decline]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              var offerId = btn.getAttribute("data-pp-makeup-decline");
              if (!offerId || typeof opts.respondMakeup !== "function") return;
              var reason =
                global.prompt(
                  "Optional reason (e.g. want same instructor). Declining forfeits this makeup:",
                  "",
                ) || "";
              if (
                !global.confirm(
                  "Decline this offer? You will forfeit the makeup grant and the slot may go to another family.",
                )
              ) {
                return;
              }
              btn.disabled = true;
              showNotice("info", "Declining…");
              void opts
                .respondMakeup(offerId, "decline", reason)
                .then(function (r) {
                  showNotice("info", (r && r.message) || "Declined — grant forfeited.");
                  refreshMakeupList();
                })
                .catch(function () {
                  showNotice("error", "Could not decline — try again.");
                  btn.disabled = false;
                });
            });
          });
        })
        .catch(function () {
          makeupHost.innerHTML = '<p class="pp-muted">Could not load makeup offers.</p>';
        });
    }

    function refreshList() {
      if (!listHost || typeof opts.listAbsences !== "function") {
        if (listHost) listHost.innerHTML = '<p class="pp-muted">Absence list unavailable.</p>';
        return;
      }
      listHost.innerHTML = '<p class="pp-muted">Loading…</p>';
      void opts
        .listAbsences()
        .then(function (payload) {
          var reports = (payload && payload.reports) || [];
          if (!reports.length) {
            listHost.innerHTML = '<p class="pp-muted">No absence reports yet.</p>';
            return;
          }
          listHost.innerHTML =
            '<div class="pp-absence-list">' + reports.map(absenceReportCardHtml).join("") + "</div>";
          listHost.querySelectorAll("[data-pp-absence-proof]").forEach(function (input) {
            input.addEventListener("change", function () {
              var file = input.files && input.files[0];
              var reportId = input.getAttribute("data-pp-absence-proof");
              if (!file || !reportId || typeof opts.uploadAbsenceProof !== "function") return;
              showNotice("info", "Uploading proof…");
              void opts
                .uploadAbsenceProof(reportId, file)
                .then(function () {
                  showNotice(
                    "info",
                    "Proof uploaded. Admin must validate it — you will hear from the office.",
                  );
                  refreshList();
                })
                .catch(function (err) {
                  var code = err && err.code ? String(err.code) : "";
                  if (code === "proof_window_closed") {
                    showNotice(
                      "error",
                      "The 2-week window has passed. Please contact the office/admin — uploads are closed.",
                    );
                  } else {
                    showNotice("error", "Could not upload proof — try again or contact the office.");
                  }
                  refreshList();
                });
            });
          });
        })
        .catch(function () {
          listHost.innerHTML = '<p class="pp-muted">Could not load reports — try again later.</p>';
        });
    }

    var form = host.querySelector("#ppAbsenceForm");
    if (form && typeof opts.submitAbsence === "function") {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var sel = host.querySelector("#ppAbsenceSession");
        var reasonEl = host.querySelector("#ppAbsenceReason");
        var btn = host.querySelector("#ppAbsenceSubmit");
        var raw = sel ? String(sel.value || "") : "";
        var parts = raw.split("|");
        var reasonCode = selectedReasonCode();
        if (parts.length < 2 || !parts[0] || !parts[1]) {
          showNotice("error", "Choose a session.");
          return;
        }
        if (!reasonCode) {
          showNotice("error", "Choose a reason.");
          return;
        }
        var wantsProof = reasonCode === "unwell" && canProveYes();
        var file = proofInput && proofInput.files && proofInput.files[0];
        if (wantsProof && !file) {
          showNotice("error", "Choose a proof file to upload, or select No.");
          return;
        }
        if (btn) {
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
        }
        showNotice("info", "Saving…");
        void opts
          .submitAbsence({
            session_date: parts[0],
            service_label: parts[1],
            session_time: parts[2] || "",
            reason_code: reasonCode,
            reason_text: reasonEl ? String(reasonEl.value || "").trim() : "",
            can_prove: wantsProof,
          })
          .then(function (payload) {
            var report = payload && payload.report;
            if (wantsProof && file && report && report.id && typeof opts.uploadAbsenceProof === "function") {
              showNotice("info", "Uploading proof…");
              return opts.uploadAbsenceProof(report.id, file).then(function () {
                return { kind: "proof" };
              });
            }
            return { kind: report && report.status === "noted" ? "noted" : "missed" };
          })
          .then(function (result) {
            if (result && result.kind === "proof") {
              showNotice(
                "info",
                "Submitted with proof. Admin must validate before any credit, refund, or makeup.",
              );
            } else if (result && result.kind === "noted") {
              showNotice(
                "info",
                "Absence noted for the office. This is not a Missed session.",
              );
            } else {
              showNotice(
                "info",
                "Marked as Missed session. Without proof there is no credit / refund / makeup path unless admin decides otherwise.",
              );
            }
            if (reasonEl) reasonEl.value = "";
            if (proofInput) proofInput.value = "";
            if (proofName) proofName.textContent = "";
            syncUnwellUi();
            refreshList();
            refreshMakeupList();
          })
          .catch(function (err) {
            var code = err && err.code ? String(err.code) : "";
            if (code === "proof_window_closed") {
              showNotice(
                "error",
                "The 2-week window has passed. Please contact the office/admin.",
              );
            } else {
              showNotice("error", "Could not save — please try again.");
            }
          })
          .finally(function () {
            if (btn) {
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
            }
          });
      });
    }
    refreshList();
    refreshMakeupList();
  }

  function openSubview(host, data, opts, view, viewOpts) {
    viewOpts = viewOpts || {};
    if (view === "general") {
      void ensureGeneralFieldsAsync(data).then(function () {
        renderGeneral(host, data, opts);
      });
    } else if (view === "sessions") renderSessions(host, data, opts);
    else if (view === "achievements") renderAchievements(host, data, opts);
    else if (view === "swim") renderSwim(host, data, opts);
    else if (view === "team") renderTeam(host, data, opts);
    else if (view === "booking") renderBooking(host, data, opts);
    else if (view === "calendar") renderCalendar(host, data, opts);
    else if (view === "absence") renderAbsence(host, data, opts);
    else if (view === "balance") renderBalance(host, data, opts);
    else if (view === "invoices") renderInvoices(host, data, opts);
    else if (view === "documents") renderDocuments(host, data, opts);
    else if (view === "messages") {
      var msgOpts = opts || {};
      if (viewOpts.prefillMessage) {
        msgOpts = Object.assign({}, opts, { prefillMessage: viewOpts.prefillMessage });
      }
      renderMessages(host, data, msgOpts);
    }
  }

  function bindHub(host, data, opts) {
    var sectionByView = {
      sessions: "sessions",
      achievements: "achievements",
      swim: "swim",
    };
    host.querySelectorAll("[data-pp-switch-child]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.classList.contains("is-active")) return;
        var nextId = btn.getAttribute("data-pp-switch-child");
        if (nextId && typeof opts.switchChild === "function") opts.switchChild(nextId);
      });
    });
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
