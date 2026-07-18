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
    if (/physical/.test(s)) return "physical";
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

  function participantNeedsPhoto(p, opts) {
    p = p || {};
    if (p.has_avatar === true) return false;
    if (p.avatar_url) return false;
    if (opts && typeof opts.childHasPhoto === "function") {
      return !opts.childHasPhoto(p.contact_id);
    }
    return true;
  }

  function hubPhotoNoticeHtml(data, opts) {
    var p = (data && data.participant) || {};
    if (!participantNeedsPhoto(p, opts)) return "";
    var photoApi = global.ParentPortalApp && global.ParentPortalApp.photo;
    var notice =
      photoApi && typeof photoApi.missingNoticeHtml === "function"
        ? photoApi.missingNoticeHtml()
        : '<p class="pp-child-photo-missing" role="status"><strong>No photo on file.</strong> Please add a photo so instructors can identify them at sessions.</p>';
    return '<div class="pp-hub-photo-cta">' + notice + "</div>";
  }

  function hubHeroPhotoHtml(data, opts) {
    var p = (data && data.participant) || {};
    var needsPhoto = participantNeedsPhoto(p, opts);
    var photoApi = global.ParentPortalApp && global.ParentPortalApp.photo;
    if (
      needsPhoto &&
      photoApi &&
      typeof photoApi.blockHtml === "function"
    ) {
      // One avatar only — Add photo sits under this circle (no second PD).
      return photoApi.blockHtml({
        contact_id: p.contact_id,
        display_name: p.display_name,
        has_avatar: false,
        avatar_url: "",
      });
    }
    return participantPhotoHtml(p);
  }

  function hubHeroHtml(data, opts) {
    var p = data.participant || {};
    var status = statusChips(p);
    var needsPhoto = participantNeedsPhoto(p, opts);
    return (
      hubSiblingsHtml(data, opts) +
      '<header class="pp-hub-hero' +
      (needsPhoto ? " pp-hub-hero--needs-photo" : "") +
      '">' +
      '<div class="pp-hub-hero__id">' +
      hubHeroPhotoHtml(data, opts) +
      '<h3 class="pp-hub-hero__name">' +
      esc(p.display_name || "Participant") +
      "</h3>" +
      participantIdentityMetaHtml(p) +
      enrolledServiceChipsHtml(data) +
      (status ? '<div class="pp-chip-row pp-hub-hero__status">' + status + "</div>" : "") +
      hubPhotoNoticeHtml(data, opts) +
      "</div>" +
      "</header>" +
      reenrolBannerHtml(data)
    );
  }

  function hubGeneralInfoHtml(data) {
    return (
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
      "</div></div></details>"
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
    var action = String(r.parent_action || "").toLowerCase() === "auto" ? "auto" : "required";
    var reasons = Array.isArray(r.parent_action_reasons) ? r.parent_action_reasons : [];
    var showInvoices =
      r.show_invoices !== false &&
      data &&
      data.show_invoices !== false &&
      reasons.indexOf("la_funded") < 0;
    return {
      submitted: !!r.submitted,
      submitted_at: r.submitted_at || null,
      hint: String(r.summary_hint || "").trim() || "Not submitted yet",
      items: Array.isArray(r.items) ? r.items : [],
      parent_action: action,
      parent_action_reasons: reasons,
      parent_action_note:
        String(r.parent_action_note || "").trim() ||
        (action === "auto"
          ? "Your place renews with the office — nothing for you to submit."
          : "Confirm places for next year"),
      acat_confirm_notice: String(r.acat_confirm_notice || "").trim(),
      can_book_extras: r.can_book_extras !== false && data && data.can_book_extras !== false,
      /** False for Ealing / H&F / NHS club-invoiced LA — My booking stays, My invoices hidden. */
      show_invoices: showInvoices,
    };
  }

  function showInvoicesForParticipant(data) {
    return bookingSummary(data).show_invoices !== false;
  }

  /** Tinashe, Ikram, Fadi, Timi — no crash / extras (mirrors Edge identity list). */
  function participantBlocksExtraBookingLocal(data) {
    var p = (data && data.participant) || {};
    if (data && data.can_book_extras === false) return true;
    if (data && data.reenrolment && data.reenrolment.can_book_extras === false) return true;
    var blob = [p.contact_id, p.display_name, p.first_name, p.last_name, p.name]
      .map(function (x) { return String(x || "").toLowerCase(); })
      .join(" ");
    if (/\btinashe\b/.test(blob)) return true;
    if (/\bikram\b/.test(blob)) return true;
    if (/\bfadi\b/.test(blob)) return true;
    if (/\btimi\b/.test(blob) || /oluwatimilehin/.test(blob)) return true;
    return false;
  }

  function canBookExtrasFor(data) {
    if (participantBlocksExtraBookingLocal(data)) return false;
    var booking = bookingSummary(data);
    return booking.can_book_extras !== false;
  }

  function reenrolBannerHtml(data) {
    var booking = bookingSummary(data);
    var acatNotice = booking.acat_confirm_notice
      ? '<p class="pp-muted pp-hub-reenrol__acat">' + esc(booking.acat_confirm_notice) + "</p>"
      : "";
    if (booking.submitted) {
      return (
        '<p class="pp-hub-reenrolled" role="status">' +
        '<span class="pp-hub-reenrolled__mark" aria-hidden="true">✓</span>' +
        " Re-enrolled for 2026/27" +
        "</p>" +
        (acatNotice
          ? '<aside class="pp-hub-reenrol pp-hub-reenrol--acat" role="note">' + acatNotice + "</aside>"
          : "")
      );
    }
    if (booking.parent_action === "auto") {
      return (
        '<aside class="pp-hub-reenrol pp-hub-reenrol--auto" role="status" aria-label="Booking 2026/27">' +
        '<div class="pp-hub-reenrol__copy">' +
        "<strong>2026/27 booking</strong>" +
        '<span class="pp-muted">' +
        esc(booking.parent_action_note) +
        "</span>" +
        acatNotice +
        "</div>" +
        crashBookBtnHtml(data) +
        "</aside>"
      );
    }
    var p = data.participant || {};
    var contactId = p.contact_id || "";
    var href =
      "/parent/re-enrolment?from=portal&contact_id=" + encodeURIComponent(String(contactId));
    return (
      '<aside class="pp-hub-reenrol" aria-label="Re-enrolment 2026/27">' +
      '<div class="pp-hub-reenrol__copy">' +
      "<strong>Re-enrol 2026/27</strong>" +
      '<span class="pp-muted">Confirm by Wed 22 July · July crash courses are fully booked</span>' +
      acatNotice +
      "</div>" +
      '<div class="pp-hub-reenrol__actions">' +
      '<a class="pp-btn pp-btn--primary pp-hub-reenrol__cta" href="' +
      esc(href) +
      '">' +
      '<svg class="pp-hub-reenrol__cta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>' +
      "<span>Start re-enrolment</span></a>" +
      crashBookBtnHtml(data) +
      "</div>" +
      "</aside>"
    );
  }

  function crashBookBtnHtml(data) {
    if (!canBookExtrasFor(data)) {
      return (
        '<p class="pp-muted pp-hub-reenrol__no-extra" role="note">' +
        "Extra holiday sessions are not available for this place." +
        "</p>"
      );
    }
    return (
      '<span class="pp-btn pp-btn--ghost pp-hub-reenrol__cta pp-hub-reenrol__cta--crash" aria-disabled="true">' +
      '<svg class="pp-hub-reenrol__cta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
      "<span>Crash courses · Fully booked</span></span>"
    );
  }

  function contactLinkHtml(opts) {
    if (!opts || typeof opts.openContactDetails !== "function") return "";
    return (
      '<p class="pp-hub-contact-link">' +
      '<button type="button" class="pp-hub-contact-link__btn" data-pp-open-contact>' +
      "Contact details on file" +
      "</button>" +
      "</p>"
    );
  }

  function infoBtnHtml(view, caption, iconSvg, opts) {
    opts = opts || {};
    var disabled = !!opts.disabled;
    var subtitle = opts.subtitle ? String(opts.subtitle).trim() : "";
    var extraClass = opts.extraClass || "";
    var unreadBadge = opts.unreadBadge || "";
    var plate =
      '<span class="pp-pax-info-icon-plate" aria-hidden="true">' + iconSvg + "</span>";
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
        ? '<span class="pp-pax-info-icon-wrap">' + plate + unreadBadge + "</span>"
        : plate) +
      '<span class="pp-pax-info-caption">' +
      esc(caption) +
      "</span>" +
      (subtitle ? '<span class="pp-pax-info-subcaption">' + esc(subtitle) + "</span>" : "") +
      "</span></button>"
    );
  }

  function weekRangeLabel(startIso, endIso) {
    var a = formatDate(startIso);
    var b = formatDate(endIso);
    if (a === "—" && b === "—") return "";
    if (a === b) return a;
    return a + " – " + b;
  }

  var WEEKLY_NOTES_SEEN_KEY = "portal_weekly_notes_seen_v1";

  function weeklyNotesContactId(data, opts) {
    return String(
      (data && data.participant && data.participant.contact_id) ||
        (opts && opts.contactId) ||
        "",
    );
  }

  function readWeeklyNotesSeenMap() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(WEEKLY_NOTES_SEEN_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function weeklyNotesSeenWeekStart(contactId) {
    var id = String(contactId || "");
    if (!id) return "";
    return String(readWeeklyNotesSeenMap()[id] || "");
  }

  function markWeeklyNotesSeen(data, opts) {
    var id = weeklyNotesContactId(data, opts);
    if (!id) return;
    var notes = Array.isArray(data && data.weekly_notes) ? data.weekly_notes : [];
    var newest = "";
    notes.forEach(function (n) {
      var w = String((n && n.week_start) || "");
      if (w && w > newest) newest = w;
    });
    if (!newest) return;
    try {
      var map = readWeeklyNotesSeenMap();
      map[id] = newest;
      global.localStorage.setItem(WEEKLY_NOTES_SEEN_KEY, JSON.stringify(map));
    } catch (_e) {}
  }

  function unreadWeeklyNotesCount(data, opts) {
    var notes = Array.isArray(data && data.weekly_notes) ? data.weekly_notes : [];
    if (!notes.length) return 0;
    var seen = weeklyNotesSeenWeekStart(weeklyNotesContactId(data, opts));
    if (!seen) return notes.length;
    var n = 0;
    notes.forEach(function (row) {
      if (String((row && row.week_start) || "") > seen) n += 1;
    });
    return n;
  }

  function hubShortcutBtn(view, caption, iconSvg, opts) {
    opts = opts || {};
    var disabled = !!opts.disabled;
    var unreadBadge = opts.unreadBadge || "";
    var extraClass = opts.extraClass || "";
    return (
      '<button type="button" class="pp-hub-shortcut' +
      extraClass +
      (disabled ? " pp-hub-shortcut--disabled" : "") +
      (unreadBadge ? " pp-hub-shortcut--has-unread" : "") +
      '" data-pp-open="' +
      esc(view) +
      '"' +
      (disabled ? ' disabled aria-disabled="true"' : "") +
      ' aria-label="' +
      esc(caption) +
      '">' +
      '<span class="pp-hub-shortcut__ico" aria-hidden="true">' +
      iconSvg +
      "</span>" +
      (unreadBadge
        ? '<span class="pp-hub-shortcut__badge-wrap">' + unreadBadge + "</span>"
        : "") +
      '<span class="pp-hub-shortcut__label">' +
      esc(caption) +
      "</span></button>"
    );
  }

  function hubShortcutsHtml(data, opts) {
    var msgUnread =
      opts && typeof opts.unreadMessagesTotal === "function" ? opts.unreadMessagesTotal() : 0;
    var msgBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && msgUnread > 0
        ? opts.unreadBadgeHtml(msgUnread, "Unread messages")
        : "";
    var consentPending =
      opts && typeof opts.consentsPendingCount === "function" ? opts.consentsPendingCount() : 0;
    var consentBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && consentPending > 0
        ? opts.unreadBadgeHtml(consentPending, "Pending consents")
        : "";
    var notesUnread = unreadWeeklyNotesCount(data, opts);
    var notesBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && notesUnread > 0
        ? opts.unreadBadgeHtml(notesUnread, "New weekly notes")
        : "";
    var hasServices = !!(
      data &&
      data.general &&
      Array.isArray(data.general.services_detail) &&
      data.general.services_detail.length
    );
    var sessionProgressEnabled =
      !(data && data.session_progress) || data.session_progress.enabled !== false;
    var ico = function (paths) {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        paths +
        "</svg>"
      );
    };
    return (
      '<section class="pp-hub-shortcuts" aria-label="Quick access">' +
      '<p class="pp-pax-info-section-label">Quick access</p>' +
      '<div class="pp-hub-shortcuts__grid">' +
      hubShortcutBtn(
        "messages",
        "Messages",
        ico('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
        { unreadBadge: msgBadge, extraClass: " pp-hub-shortcut--messages" },
      ) +
      (sessionProgressEnabled
        ? hubShortcutBtn(
            "sessions",
            "Sessions",
            ico('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
            { extraClass: " pp-hub-shortcut--sessions" },
          )
        : "") +
      hubShortcutBtn(
        "calendar",
        "Calendar",
        ico(
          '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
        ),
        { extraClass: " pp-hub-shortcut--calendar" },
      ) +
      hubShortcutBtn(
        "booking",
        "Booking",
        ico(
          '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/>',
        ),
        { extraClass: " pp-hub-shortcut--booking" },
      ) +
      hubShortcutBtn(
        "absence",
        "Absent",
        ico(
          '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.2-5 8-5s6.5 1.5 8 5"/><path d="M16 4l4 4M20 4l-4 4"/>',
        ),
        { disabled: !hasServices, extraClass: " pp-hub-shortcut--absence" },
      ) +
      hubShortcutBtn(
        "consents",
        "Consents",
        ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
        { unreadBadge: consentBadge, extraClass: " pp-hub-shortcut--consents" },
      ) +
      (showInvoicesForParticipant(data)
        ? hubShortcutBtn(
            "invoices",
            "Invoices",
            ico(
              '<path d="M4 2h16v20l-2-1.5L16 22l-2-1.5L12 22l-2-1.5L8 22l-2-1.5L4 22V2z"/><path d="M8 8h8M8 12h8"/>',
            ),
            { extraClass: " pp-hub-shortcut--invoices" },
          )
        : "") +
      (sessionProgressEnabled
        ? hubShortcutBtn(
            "weekly_notes",
            "Notes",
            ico(
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
            ),
            { unreadBadge: notesBadge, extraClass: " pp-hub-shortcut--notes" },
          )
        : "") +
      "</div></section>"
    );
  }

  function hubMenuHtml(data, opts) {
    return (
      '<details class="pp-hub-menu">' +
      '<summary class="pp-hub-menu__summary">' +
      '<span class="pp-hub-menu__summary-main">' +
      '<svg class="pp-hub-menu__burger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
      "<strong>Menu</strong>" +
      '<span class="pp-muted">All sections by category</span>' +
      "</span>" +
      '<span class="pp-hub-menu__chev" aria-hidden="true"></span>' +
      "</summary>" +
      '<div class="pp-hub-menu__body">' +
      infoButtonsHtml(data, opts) +
      '<div class="pp-hub-menu__extra">' +
      '<button type="button" class="pp-hub-menu__link" data-pp-open="general">' +
      "General information" +
      "</button>" +
      (opts && typeof opts.openContactDetails === "function"
        ? '<button type="button" class="pp-hub-menu__link" data-pp-open-contact>Contact details on file</button>'
        : "") +
      "</div></div></details>"
    );
  }

  function infoButtonsHtml(data, opts) {
    var msgUnread =
      opts && typeof opts.unreadMessagesTotal === "function" ? opts.unreadMessagesTotal() : 0;
    var msgBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && msgUnread > 0
        ? opts.unreadBadgeHtml(msgUnread, "Unread messages")
        : "";
    var consentPending =
      opts && typeof opts.consentsPendingCount === "function" ? opts.consentsPendingCount() : 0;
    var consentBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && consentPending > 0
        ? opts.unreadBadgeHtml(consentPending, "Pending consents")
        : "";
    var notesUnread = unreadWeeklyNotesCount(data, opts);
    var notesBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && notesUnread > 0
        ? opts.unreadBadgeHtml(notesUnread, "New weekly notes")
        : "";
    var announceCount = Array.isArray(data && data.club_announcements)
      ? data.club_announcements.length
      : 0;
    var announceBadge =
      opts && typeof opts.unreadBadgeHtml === "function" && announceCount > 0
        ? opts.unreadBadgeHtml(announceCount, "Club announcements")
        : "";
    var booking = bookingSummary(data);
    var swimAvailable = !!data.swim_term_review_available;
    var noteCount = Array.isArray(data && data.weekly_notes) ? data.weekly_notes.length : 0;
    var sessionProgressEnabled =
      !(data && data.session_progress) || data.session_progress.enabled !== false;
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
    var invoiceIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2h16v20l-2-1.5L16 22l-2-1.5L12 22l-2-1.5L8 22l-2-1.5L4 22V2z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
    var consentIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>';
    var teamCaption = firstNameOf(data) + "'s Team";
    var calIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/></svg>';
    var bookingIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>';
    var notesIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';
    var announceIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7"/><path d="M18.5 6a8 8 0 0 1 0 12"/></svg>';
    var teamIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    var sessionsIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';
    var achievementsIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-5 5"/></svg>';
    var swimIcon =
      '<svg class="pp-pax-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/><path d="M2 16c2.5 2.5 5.5 4 10 4s7.5-1.5 10-4"/></svg>';
    return (
      '<div class="pp-pax-info-buttons">' +
      '<p class="pp-pax-info-section-label pp-pax-info-section-label--schedule">Schedule</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--schedule">' +
      infoBtnHtml("calendar", "My Calendar", calIcon, {
        extraClass: " pp-pax-info-btn--calendar",
        subtitle: "Year view",
      }) +
      (sessionProgressEnabled
        ? infoBtnHtml("sessions", "Sessions Overview", sessionsIcon, {
            extraClass: " pp-pax-info-btn--sessions",
            subtitle: "Term dates & by activity",
          })
        : "") +
      infoBtnHtml("booking", "My booking", bookingIcon, {
        subtitle: booking.submitted
          ? booking.hint || "2026/27 choices"
          : booking.parent_action === "auto"
            ? "2026/27 with the office"
            : "Crash & 2026/27 places",
        extraClass: " pp-pax-info-btn--booking",
      }) +
      infoBtnHtml("absence", "Report absent", absentIcon, {
        extraClass: " pp-pax-info-btn--absence",
        subtitle: hasServices ? "Missed / note" : "No sessions yet",
        disabled: !hasServices,
      }) +
      infoBtnHtml("team", teamCaption, teamIcon, {
        extraClass: " pp-pax-info-btn--team",
        subtitle: "Instructors",
      }) +
      "</div>" +
      '<p class="pp-pax-info-section-label pp-pax-info-section-label--progress">Progress</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--progress">' +
      (sessionProgressEnabled
        ? infoBtnHtml("weekly_notes", "Weekly notes", notesIcon, {
            extraClass:
              " pp-pax-info-btn--weekly-notes" +
              (notesUnread > 0 ? " pp-pax-info-btn--has-unread" : ""),
            subtitle: noteCount ? noteCount + " in folder" : "From feedback",
            unreadBadge: notesBadge,
          })
        : "") +
      infoBtnHtml("achievements", "Achievement photos", achievementsIcon, {
        extraClass: " pp-pax-info-btn--achievements",
      }) +
      infoBtnHtml("swim", "Swimming term review", swimIcon, {
        disabled: !swimAvailable,
        subtitle: swimAvailable ? "" : "Not available yet",
        extraClass: " pp-pax-info-btn--swim",
      }) +
      "</div>" +
      '<p class="pp-pax-info-section-label pp-pax-info-section-label--paper">Paperwork</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--paper">' +
      infoBtnHtml("consents", "Consents & forms", consentIcon, {
        extraClass:
          " pp-pax-info-btn--consents" +
          (consentPending > 0 ? " pp-pax-info-btn--has-unread" : ""),
        subtitle:
          consentPending > 0
            ? consentPending + " pending"
            : "Permissions & registration PDFs",
        unreadBadge: consentBadge,
      }) +
      (showInvoicesForParticipant(data)
        ? infoBtnHtml("invoices", "My invoices", invoiceIcon, {
            extraClass: " pp-pax-info-btn--invoices",
            subtitle: "Pay crash & term invoices",
          })
        : "") +
      infoBtnHtml("balance", "Credits & refunds", balanceIcon, {
        extraClass: " pp-pax-info-btn--balance",
        subtitle: "Family ledger",
      }) +
      "</div>" +
      '<p class="pp-pax-info-section-label pp-pax-info-section-label--club">Club</p>' +
      '<div class="pp-pax-info-row pp-pax-info-row--club">' +
      infoBtnHtml("announcements", "Club announcements", announceIcon, {
        extraClass:
          " pp-pax-info-btn--announcements" +
          (announceCount > 0 ? " pp-pax-info-btn--has-unread" : ""),
        subtitle: announceCount ? announceCount + " active" : "Club notices",
        unreadBadge: announceBadge,
      }) +
      infoBtnHtml("messages", "Messages", msgIcon, {
        extraClass:
          " pp-pax-info-btn--messages" +
          (msgUnread > 0 ? " pp-pax-info-btn--has-unread" : ""),
        unreadBadge: msgBadge,
      }) +
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
    var label = "Back to " + hub.text;
    return (
      '<button type="button" class="pp-btn pp-btn--ghost pp-pax-back" data-pp-back="hub" aria-label="' +
      esc(label) +
      '">' +
      '<svg class="pp-nav-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>' +
      "<span>" +
      esc(label) +
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

  function parseServiceEndMinutes(time) {
    var s = String(time || "").trim();
    if (!s) return null;
    var range = s.match(
      /(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i,
    );
    if (range) {
      var endRaw =
        range[4] +
        (range[5] ? ":" + range[5] : "") +
        (range[6] ? " " + range[6] : range[3] ? " " + range[3] : "");
      var end = parseServiceStartMinutes(endRaw);
      return end < 9999 ? end : null;
    }
    var start = parseServiceStartMinutes(s);
    if (start >= 9999) return null;
    return start + 60;
  }

  /** True after the last slot that day has ended (or the calendar day is past). */
  function isIsoSessionFinished(iso, data) {
    var todayIso = isoDateLocal(new Date());
    if (!iso) return false;
    if (iso < todayIso) return true;
    if (iso > todayIso) return false;
    var ends = [];
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    try {
      var parts = String(iso).split("-");
      var day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      var jsDow = day.getDay();
      var col = jsDow === 0 ? 6 : jsDow - 1;
      detail.forEach(function (s) {
        if (dayNameToCalCol(s && s.day) !== col) return;
        var end = parseServiceEndMinutes(s.time);
        if (end != null) ends.push(end);
      });
    } catch (_e) {}
    var crash = (data && data.crash_course && Array.isArray(data.crash_course.dates)
      ? data.crash_course.dates
      : []) || [];
    crash.forEach(function (row) {
      if (String((row && row.iso) || "").slice(0, 10) !== iso) return;
      var end = parseServiceEndMinutes(row.slot_label || row.time || "");
      if (end != null) ends.push(end);
    });
    if (!ends.length) return false;
    var maxEnd = Math.max.apply(null, ends);
    var now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= maxEnd;
  }

  function annotateChipDate(d, data) {
    if (!d || !d.iso) return d;
    var finished = isIsoSessionFinished(d.iso, data);
    d.past = finished;
    if (finished) d.isNext = false;
    return d;
  }

  /**
   * Earliest date this child should show on hub session chips.
   * Uses registration_date from parent-portal-participant-detail when set
   * (late joiners must not see projected weekdays from term start).
   */
  function participantSessionStartIso(data) {
    var p = (data && data.participant) || {};
    var iso = String(p.registration_date || p.registrationDate || "").trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return "";
  }

  /** Raise a term window start so chips never begin before the child joined. */
  function chipWindowFromIso(termFromIso, data) {
    var from = String(termFromIso || "").trim().slice(0, 10);
    var start = participantSessionStartIso(data);
    if (start && (!from || start > from)) return start;
    return from;
  }

  function isoInRange(iso, from, to) {
    if (!iso || !from || !to) return false;
    return iso >= from && iso <= to;
  }

  /** Summer Term 25/26 hub chips: afterschool & weekends through Fri 17 Jul.
   *  Day Centre runs longer (through 31 Jul). May half-term (23–31 May) stays closed. */
  var CURRENT_YEAR_TERM_FROM = "2026-04-12";
  var CURRENT_YEAR_TERM_TO = "2026-07-17";
  var CURRENT_YEAR_TERM_TO_DAY_CENTRE = "2026-07-31";
  var CURRENT_YEAR_TERM_BREAK_FROM = "2026-05-23";
  var CURRENT_YEAR_TERM_BREAK_TO = "2026-05-31";
  var CURRENT_YEAR_TERM_CLOSED = { "2026-05-04": true };

  /** 2026/27: only Day Centre runs 1–4 Sept; after-schools & weekend services start 5 Sept. */
  var NEXT_YEAR_AFTERSCHOOL_FROM = "2026-09-05";

  function serviceIsDayCentre(labelOrService) {
    return /day\s*centre/i.test(String(labelOrService || ""));
  }

  function participantHasDayCentre(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    for (var i = 0; i < detail.length; i++) {
      var lab = String((detail[i] && (detail[i].label || detail[i].service)) || "");
      if (serviceIsDayCentre(lab)) return true;
    }
    return false;
  }

  /** True when this 26/27 date is before the service kind starts (non-Day-Centre → 5 Sept). */
  function nextYearDateBeforeServiceStart(iso, isDayCentreService) {
    if (isDayCentreService) return false;
    return iso >= "2026-09-01" && iso < NEXT_YEAR_AFTERSCHOOL_FROM;
  }

  function currentYearTermToIso(data) {
    return participantHasDayCentre(data)
      ? CURRENT_YEAR_TERM_TO_DAY_CENTRE
      : CURRENT_YEAR_TERM_TO;
  }

  /** Hub / Absent use 2026/27 closed dates only after the family has submitted Booking 2026/27. */
  function familyAcceptedNextYear(data) {
    var r = (data && data.reenrolment) || {};
    return !!r.submitted;
  }

  function isNextYearClubClosedIso(iso) {
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

  function isClubClosedIso(iso, data) {
    var termTo = currentYearTermToIso(data);
    // Until Booking 2026/27 is submitted: current-year roster only.
    if (!familyAcceptedNextYear(data)) {
      if (!iso || iso < CURRENT_YEAR_TERM_FROM || iso > termTo) return true;
      if (CURRENT_YEAR_TERM_CLOSED[iso]) return true;
      if (isoInRange(iso, CURRENT_YEAR_TERM_BREAK_FROM, CURRENT_YEAR_TERM_BREAK_TO)) return true;
      return false;
    }
    // After re-enrolment: still honour remaining Summer 25/26 sessions, then 2026/27.
    if (
      iso &&
      iso >= CURRENT_YEAR_TERM_FROM &&
      iso <= termTo &&
      !CURRENT_YEAR_TERM_CLOSED[iso] &&
      !isoInRange(iso, CURRENT_YEAR_TERM_BREAK_FROM, CURRENT_YEAR_TERM_BREAK_TO)
    ) {
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
    var termTo = currentYearTermToIso(data);
    var acceptedNext = familyAcceptedNextYear(data);
    var horizon = acceptedNext ? 28 : 14;
    if (!acceptedNext) {
      try {
        var end = new Date(String(termTo) + "T12:00:00");
        var daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000) + 1;
        if (daysLeft > horizon) horizon = Math.min(45, Math.max(horizon, daysLeft));
      } catch (_e) {}
    } else {
      // After re-enrolment, first Autumn session may be weeks away (e.g. Jul → Sep).
      try {
        var calNy = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
        var openFrom = calNy && calNy.openFrom ? String(calNy.openFrom) : "2026-09-01";
        var open = new Date(openFrom + "T12:00:00");
        var daysToOpen = Math.ceil((open.getTime() - today.getTime()) / 86400000);
        if (Number.isFinite(daysToOpen)) {
          horizon = Math.max(horizon, Math.min(200, Math.max(0, daysToOpen) + 28));
        }
      } catch (_e2) {}
    }
    for (var offset = 0; offset < horizon && out.length < max; offset++) {
      var d = addDaysLocal(today, offset);
      var iso = isoDateLocal(d);
      // Stop scanning past current-year end for this participant.
      if (!familyAcceptedNextYear(data) && iso > termTo) break;
      if (isClubClosedIso(iso, data)) continue;
      var startIso = participantSessionStartIso(data);
      if (startIso && iso < startIso) continue;
      // JS: Sun=0 … Sat=6 → calendar Mon=0 … Sun=6
      var jsDow = d.getDay();
      var col = jsDow === 0 ? 6 : jsDow - 1;
      var slots = byCol[col];
      if (!slots || !slots.length) continue;
      slots.forEach(function (s) {
        if (out.length >= max) return;
        if (nextYearDateBeforeServiceStart(iso, serviceIsDayCentre(s.label || s.service))) {
          return;
        }
        out.push({
          iso: iso,
          dayLabel: formatHubDateLabel(iso),
          label: shortServiceChipLabel(s.label || "Service") || s.label || "Service",
          rawLabel: s.label || "Service",
          day: s.day || "",
          time: s.time || "",
          venue: String(s.venue || "").trim(),
          area: String(s.area || "").trim(),
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
    var dcCols = Object.create(null);
    detail.forEach(function (s) {
      var col = dayNameToCalCol(s && s.day);
      if (col == null) return;
      cols[col] = true;
      if (serviceIsDayCentre((s && (s.label || s.service)) || "")) dcCols[col] = true;
    });
    if (!Object.keys(cols).length) return [];

    var fromIso = chipWindowFromIso(CURRENT_YEAR_TERM_FROM, data);
    var toIso = currentYearTermToIso(data);
    if (familyAcceptedNextYear(data)) {
      var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
      if (cal && cal.openFrom) fromIso = chipWindowFromIso(cal.openFrom, data);
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
        // 1–4 Sept 2026: Day Centre only — other services start 5 Sept.
        var runs =
          cols[col] && (dcCols[col] || !nextYearDateBeforeServiceStart(iso, false));
        if (runs) {
          out.push(
            annotateChipDate(
              {
                iso: iso,
                shortLabel: formatTermChipLabel(iso),
                past: iso < todayIso,
                isToday: iso === todayIso,
                isNext: !!nextIso && iso === nextIso,
              },
              data,
            ),
          );
        }
      }
      cursor = addDaysLocal(cursor, 1);
    }
    return out;
  }

  /**
   * Summer Term 25/26 only (Apr–Jul), even after 2026/27 re-enrol is submitted.
   * Used so past greens stay visible alongside crash / Autumn chips.
   */
  function findCurrentSummerSessionDates(data) {
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

    var fromIso = chipWindowFromIso(CURRENT_YEAR_TERM_FROM, data);
    var toIso = currentYearTermToIso(data);
    var todayIso = isoDateLocal(new Date());
    // Prefer the next remaining summer session (not a Sept 26/27 next session).
    var nextIso = "";
    var startParts = fromIso.split("-");
    var cursor = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]));
    var out = [];
    var guard = 0;
    while (guard < 200) {
      guard++;
      var iso = isoDateLocal(cursor);
      if (iso > toIso) break;
      var closed =
        CURRENT_YEAR_TERM_CLOSED[iso] ||
        isoInRange(iso, CURRENT_YEAR_TERM_BREAK_FROM, CURRENT_YEAR_TERM_BREAK_TO);
      if (!closed) {
        var jsDow = cursor.getDay();
        var col = jsDow === 0 ? 6 : jsDow - 1;
        if (cols[col]) {
          out.push({
            iso: iso,
            shortLabel: formatTermChipLabel(iso),
            past: iso < todayIso,
            isToday: iso === todayIso,
            isNext: false,
          });
        }
      }
      cursor = addDaysLocal(cursor, 1);
    }
    for (var i = 0; i < out.length; i++) {
      if (!out[i].past) {
        nextIso = out[i].iso;
        break;
      }
    }
    out.forEach(function (d) {
      d.isNext = !!nextIso && d.iso === nextIso;
      annotateChipDate(d, data);
    });
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
        title: "Cancelled — " + d.iso,
        icon: CHIP_X_SVG,
      };
    }
    if (d.past) {
      return { tone: "done", title: "Completed — " + d.iso, icon: "" };
    }
    if (d.isNext || d.isToday) {
      return { tone: "next", title: (d.isToday ? "Today — " : "Next session — ") + d.iso, icon: "" };
    }
    return { tone: "upcoming", title: "Upcoming — " + d.iso, icon: "" };
  }

  /**
   * Half-term break windows used to split chips into first / second half rows.
   * Current year: May break. 2026/27: Oct / Feb / May weekend closures.
   */
  function termHalfBreakWindows(data, forceNextYear) {
    if (!forceNextYear && !familyAcceptedNextYear(data)) {
      return [
        {
          from: CURRENT_YEAR_TERM_BREAK_FROM,
          to: CURRENT_YEAR_TERM_BREAK_TO,
          termFrom: CURRENT_YEAR_TERM_FROM,
          termTo: currentYearTermToIso(data),
        },
      ];
    }
    var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
    var terms = (cal && Array.isArray(cal.terms) ? cal.terms : []) || [];
    var closures = (cal && Array.isArray(cal.weekendClosures) ? cal.weekendClosures : []) || [];
    var windows = [];
    terms.forEach(function (t) {
      if (!t || !t.starts) return;
      var termEnd = t.mainTermEnds || t.ends || t.lastDay || "";
      if (!termEnd) return;
      var hit = null;
      for (var i = 0; i < closures.length; i++) {
        var c = closures[i];
        if (!c || !c.from || !c.to) continue;
        if (c.from >= t.starts && c.to <= termEnd) {
          if (!hit || c.from < hit.from) hit = { from: c.from, to: c.to };
        }
      }
      // Cluster consecutive weekend closures in this term into one half-term window.
      if (hit) {
        for (var j = 0; j < closures.length; j++) {
          var c2 = closures[j];
          if (!c2 || !c2.from || !c2.to) continue;
          if (c2.from >= t.starts && c2.to <= termEnd) {
            if (c2.from < hit.from) hit.from = c2.from;
            if (c2.to > hit.to) hit.to = c2.to;
          }
        }
      }
      windows.push({
        from: hit ? hit.from : null,
        to: hit ? hit.to : null,
        termFrom: t.starts,
        termTo: termEnd,
      });
    });
    return windows;
  }

  /** true = first half of its term, false = second half (after half-term break). */
  function isFirstHalfTermDate(iso, data, forceNextYear) {
    var windows = termHalfBreakWindows(data, !!forceNextYear);
    for (var i = 0; i < windows.length; i++) {
      var w = windows[i];
      if (!w.termFrom || !w.termTo) continue;
      if (iso < w.termFrom || iso > w.termTo) continue;
      if (!w.from || !w.to) return true;
      if (iso < w.from) return true;
      if (iso > w.to) return false;
      return true; // closed break days should not appear; treat as first
    }
    // Before first known term → first; after last → second
    if (windows.length && iso < windows[0].termFrom) return true;
    return false;
  }

  function dateChipSpanHtml(d, statusByIso) {
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
  }

  /** Confirmed / held summer crash days for this child (hub chips). */
  function findCrashCourseDates(data) {
    var crash = (data && data.crash_course) || {};
    var raw = Array.isArray(crash.dates) ? crash.dates : [];
    if (!raw.length) return [];
    var todayIso = isoDateLocal(new Date());
    var mapped = raw
      .map(function (row) {
        var iso = String((row && row.iso) || "").slice(0, 10);
        if (!iso) return null;
        return annotateChipDate(
          {
            iso: iso,
            activity: String((row && row.activity) || "").trim(),
            slot_label: String((row && row.slot_label) || "").trim(),
            shortLabel: formatTermChipLabel(iso),
            past: iso < todayIso,
            isToday: iso === todayIso,
            isNext: false,
          },
          data,
        );
      })
      .filter(Boolean);
    var nextByActivity = Object.create(null);
    mapped.forEach(function (d) {
      var key = crashActivityRowKey(d.activity);
      if (!key) key = "other";
      if (nextByActivity[key]) return;
      if (!d.past) nextByActivity[key] = d.iso;
    });
    mapped.forEach(function (d) {
      var key = crashActivityRowKey(d.activity) || "other";
      d.isNext = !!nextByActivity[key] && d.iso === nextByActivity[key];
    });
    return mapped;
  }

  function crashActivityRowKey(activity) {
    var a = String(activity || "").toLowerCase();
    if (/swim|aquatic/.test(a)) return "swim";
    if (/climb/.test(a)) return "climb";
    return "";
  }

  function crashActivityRowLabel(activity) {
    var key = crashActivityRowKey(activity);
    if (key === "swim") return "Aquatic Activity";
    if (key === "climb") return "Climbing Activity";
    var raw = String(activity || "").trim();
    return raw || "Intensive Activity";
  }

  /** Parse "12:00–13:00 · …" / "16:30-17:00" style labels into {start,end} minutes. */
  function crashParseSlotLabelMinutes(slotLabel) {
    var head = String(slotLabel || "").split("·")[0].trim();
    if (!head) return null;
    var range = head.match(
      /(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?/i,
    );
    if (!range) return null;
    var startRaw =
      range[1] +
      (range[2] ? ":" + range[2] : "") +
      (range[3] ? " " + range[3] : "");
    var endRaw =
      range[4] +
      (range[5] ? ":" + range[5] : "") +
      (range[6] ? " " + range[6] : range[3] ? " " + range[3] : "");
    var start = parseServiceStartMinutes(startRaw);
    var end = parseServiceStartMinutes(endRaw);
    if (start >= 9999 || end >= 9999) return null;
    /* If end looks earlier and neither side had am/pm, assume afternoon continuation. */
    if (end <= start && !range[3] && !range[6] && end < 12 * 60) end += 12 * 60;
    if (end <= start) end = start + 30;
    return { start: start, end: end };
  }

  function crashFormatClockHour(mins) {
    var h24 = Math.floor(mins / 60) % 24;
    var mm = mins % 60;
    var h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    var period = h24 >= 12 ? "pm" : "am";
    if (mm === 0) return { text: String(h12), period: period };
    return {
      text: h12 + ":" + (mm < 10 ? "0" : "") + mm,
      period: period,
    };
  }

  /** e.g. "12 to 1 pm", "11 to 12 pm", "4:30 to 6:30 pm". */
  function crashFormatTimeRangeLabel(startMins, endMins) {
    if (startMins == null || endMins == null || endMins <= startMins) return "";
    var a = crashFormatClockHour(startMins);
    var b = crashFormatClockHour(endMins);
    if (a.period === b.period) {
      return a.text + " to " + b.text + " " + b.period;
    }
    return a.text + " " + a.period + " to " + b.text + " " + b.period;
  }

  function crashTimeRangeFromDates(dates) {
    var minStart = null;
    var maxEnd = null;
    (dates || []).forEach(function (d) {
      var parsed = crashParseSlotLabelMinutes(d && d.slot_label);
      if (!parsed) return;
      if (minStart == null || parsed.start < minStart) minStart = parsed.start;
      if (maxEnd == null || parsed.end > maxEnd) maxEnd = parsed.end;
    });
    return crashFormatTimeRangeLabel(minStart, maxEnd);
  }

  function crashActivityIcon(activity) {
    var key = crashActivityRowKey(activity);
    if (key === "swim") {
      return (
        '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 16c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/><path d="M2 20c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/><circle cx="7" cy="8" r="2.5"/><path d="M11 9.5c1.2 1.4 2.8 2.5 5 2.5"/></svg>'
      );
    }
    if (key === "climb") {
      return (
        '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 7l3 3-7 7-3-3z"/><path d="M7 17l-2 2"/><path d="M17 7l2-2"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/></svg>'
      );
    }
    return (
      '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>'
    );
  }

  function groupCrashDatesByActivity(dates) {
    var groups = [];
    var indexByKey = Object.create(null);
    (dates || []).forEach(function (d) {
      var key = crashActivityRowKey(d.activity) || "other:" + String(d.activity || "").toLowerCase();
      if (indexByKey[key] == null) {
        indexByKey[key] = groups.length;
        groups.push({
          key: key,
          activity: d.activity,
          label: crashActivityRowLabel(d.activity),
          icon: crashActivityIcon(d.activity),
          dates: [],
        });
      }
      groups[indexByKey[key]].dates.push(d);
    });
    groups.forEach(function (g) {
      var time = crashTimeRangeFromDates(g.dates);
      if (time) g.label = g.label + " — " + time;
    });
    return groups;
  }

  function hasCrashBooking(data) {
    return findCrashCourseDates(data).length > 0;
  }

  /** Weekday columns from current roster (for Autumn preview when nothing new booked). */
  function rosterWeekdayCols(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    var cols = Object.create(null);
    detail.forEach(function (s) {
      var col = dayNameToCalCol(s && s.day);
      if (col != null) cols[col] = true;
    });
    return cols;
  }

  /** Autumn 2026 first / second half date chips from roster weekdays (preview only). */
  function findAutumnPreviewDates(data) {
    var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
    var autumn = null;
    var terms = (cal && Array.isArray(cal.terms) ? cal.terms : []) || [];
    for (var t = 0; t < terms.length; t++) {
      if (terms[t] && terms[t].id === "autumn_2026") {
        autumn = terms[t];
        break;
      }
    }
    if (!autumn || !autumn.starts || !autumn.ends) return [];
    var cols = rosterWeekdayCols(data);
    if (!Object.keys(cols).length) {
      // No roster days yet — show Mon–Fri autumn structure.
      cols = { 0: true, 1: true, 2: true, 3: true, 4: true };
    }
    var dcCols = dayCentreWeekdayCols(data);
    var todayIso = isoDateLocal(new Date());
    var startParts = String(autumn.starts).split("-");
    var cursor = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]));
    var out = [];
    var guard = 0;
    while (guard < 200) {
      guard++;
      var iso = isoDateLocal(cursor);
      if (iso > autumn.ends) break;
      if (!isNextYearClubClosedIso(iso)) {
        var jsDow = cursor.getDay();
        var col = jsDow === 0 ? 6 : jsDow - 1;
        // 1–4 Sept 2026: Day Centre only — after-schools start 5 Sept.
        var runs = cols[col] && (dcCols[col] || !nextYearDateBeforeServiceStart(iso, false));
        if (runs) {
          out.push(
            annotateChipDate(
              {
                iso: iso,
                shortLabel: formatTermChipLabel(iso),
                past: iso < todayIso,
                isToday: iso === todayIso,
                isNext: false,
              },
              data,
            ),
          );
        }
      }
      cursor = addDaysLocal(cursor, 1);
    }
    var nextIso = "";
    for (var i = 0; i < out.length; i++) {
      if (!out[i].past) {
        nextIso = out[i].iso;
        break;
      }
    }
    if (nextIso) {
      out.forEach(function (d) {
        d.isNext = d.iso === nextIso;
      });
    }
    return out;
  }

  function filterChipListForDisplay(list, statusByIso, hideCompleted) {
    statusByIso = statusByIso || {};
    if (!hideCompleted) return list || [];
    return (list || []).filter(function (d) {
      var st = statusByIso[d.iso] || "";
      if (st === "absent" || st === "cancelled") return true;
      var meta = termChipToneMeta(d, statusByIso);
      return meta.tone !== "done";
    });
  }

  /** Icons for term half-rows (same size/style as crash activity icons). */
  function termHalfRowIcon(label) {
    var l = String(label || "").toLowerCase();
    var second = /second/.test(l);
    if (/summer/.test(l)) {
      if (second) {
        return (
          '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        );
      }
      return (
        '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
      );
    }
    if (/autumn|fall/.test(l)) {
      return (
        '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>'
      );
    }
    if (/spring/.test(l)) {
      return (
        '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4-3 6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 2 7 6 10z"/><path d="M12 12v10"/></svg>'
      );
    }
    // Generic first / second half
    if (second) {
      return (
        '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>'
      );
    }
    return (
      '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
    );
  }

  /** Blue / green / red key for date chips (hub + booking). */
  function termChipColorLegendHtml() {
    return (
      '<ul class="pp-hub-ops__chip-legend" aria-label="Date colour key">' +
      '<li class="pp-hub-ops__chip-legend__item">' +
      '<span class="pp-hub-ops__chip-legend__swatch pp-hub-ops__chip-legend__swatch--blue" aria-hidden="true"></span>' +
      '<span class="pp-hub-ops__chip-legend__text"><strong>Blue</strong> — upcoming / next session</span></li>' +
      '<li class="pp-hub-ops__chip-legend__item">' +
      '<span class="pp-hub-ops__chip-legend__swatch pp-hub-ops__chip-legend__swatch--green" aria-hidden="true"></span>' +
      '<span class="pp-hub-ops__chip-legend__text"><strong>Green</strong> — completed</span></li>' +
      '<li class="pp-hub-ops__chip-legend__item">' +
      '<span class="pp-hub-ops__chip-legend__swatch pp-hub-ops__chip-legend__swatch--red" aria-hidden="true"></span>' +
      '<span class="pp-hub-ops__chip-legend__text"><strong>Red</strong> — absent or cancelled</span></li>' +
      "</ul>"
    );
  }

  function termSessionDateChipsHtml(data, statusByIso) {
    function chipsOnly(list, ariaLabel) {
      if (!list.length) return "";
      return (
        '<div class="pp-hub-ops__date-chips" role="list" aria-label="' +
        esc(ariaLabel) +
        '">' +
        list
          .map(function (d) {
            return dateChipSpanHtml(d, statusByIso);
          })
          .join("") +
        "</div>"
      );
    }
    function rowHtml(label, list, iconHtml, labelClass) {
      if (!list.length) return "";
      var ico = iconHtml != null ? iconHtml : termHalfRowIcon(label);
      return (
        '<div class="pp-hub-ops__date-chips-row">' +
        '<div class="pp-hub-ops__date-chips-label' +
        (labelClass ? " " + labelClass : "") +
        '">' +
        (ico || "") +
        "<span>" +
        esc(label) +
        "</span></div>" +
        chipsOnly(list, label) +
        "</div>"
      );
    }
    function termAccordionHtml(label, contentHtml, isOpen, isCompleted) {
      if (!contentHtml) return "";
      return (
        '<details class="pp-hub-ops__term-accordion' +
        (isCompleted ? " pp-hub-ops__term-accordion--completed" : "") +
        '"' +
        (isOpen ? " open" : "") +
        ">" +
        '<summary class="pp-hub-ops__term-summary">' +
        termHalfRowIcon(label) +
        '<span class="pp-hub-ops__term-summary-title">' +
        esc(label) +
        "</span>" +
        '<svg class="pp-hub-ops__term-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
        "</summary>" +
        '<div class="pp-hub-ops__term-body">' +
        contentHtml +
        "</div></details>"
      );
    }

    var intensiveIcon =
      '<svg class="pp-hub-ops__date-chips-label-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>';

    var rows = [];
    var completedTermHtml = "";
    var firstUpcomingTermRendered = false;
    var crashDates = findCrashCourseDates(data);
    var todayIso = isoDateLocal(new Date());
    var summerTo = currentYearTermToIso(data);

    // Summer Term 25/26 (12 Apr – 17/31 Jul): past = green, next (last of this week) highlighted.
    // Keep showing while still in / just finishing summer, including after crash / re-enrol.
    if (todayIso <= summerTo) {
      var summerDates = findCurrentSummerSessionDates(data);
      var summerFirst = [];
      var summerSecond = [];
      summerDates.forEach(function (d) {
        if (isFirstHalfTermDate(d.iso, data, false)) summerFirst.push(d);
        else summerSecond.push(d);
      });
      // Keep completed greens, but place this finished term after all upcoming terms.
      var completedRows = [];
      if (summerFirst.length) {
        completedRows.push(rowHtml("Summer · First half term", summerFirst));
      }
      if (summerSecond.length) {
        completedRows.push(rowHtml("Summer · Second half term", summerSecond));
      }
      completedTermHtml = termAccordionHtml(
        "Summer Term 25/26 · completed",
        completedRows.join(""),
        false,
        true,
      );
    }

    if (crashDates.length) {
      var crashGroups = groupCrashDatesByActivity(crashDates);
      var activityRows = [];
      crashGroups.forEach(function (g) {
        var visible = filterChipListForDisplay(g.dates, statusByIso, true);
        if (!visible.length) return;
        activityRows.push(
          rowHtml(g.label, visible, g.icon || "", "pp-hub-ops__date-chips-label--activity"),
        );
      });
      if (activityRows.length) {
        rows.push(
          '<div class="pp-hub-ops__date-chips-section" aria-label="July Intensive Courses & Camps">' +
            '<div class="pp-hub-ops__date-chips-section-head">' +
            intensiveIcon +
            "<span>July Intensive Courses &amp; Camps</span></div>" +
            activityRows.join("") +
            "</div>",
        );
      }
    }

    if (familyAcceptedNextYear(data)) {
      var nextDates = findTermSessionDates(data).filter(function (d) {
        return d.iso > summerTo;
      });
      var calNy = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27;
      var termsNy = (calNy && Array.isArray(calNy.terms) ? calNy.terms : []) || [];
      if (termsNy.length) {
        termsNy.forEach(function (t) {
          if (!t || !t.starts) return;
          var termEnd = t.mainTermEnds || t.ends || t.lastDay || "";
          if (!termEnd) return;
          var labelBase =
            String(t.name || t.id || "Term")
              .replace(/\s+Term(?:\s+\d{4})?\s*$/i, "")
              .replace(/\s+\d{4}\s*$/i, "")
              .trim() || "Term";
          var tFirst = [];
          var tSecond = [];
          nextDates.forEach(function (d) {
            if (d.iso < t.starts || d.iso > termEnd) return;
            if (isFirstHalfTermDate(d.iso, data)) tFirst.push(d);
            else tSecond.push(d);
          });
          tFirst = filterChipListForDisplay(tFirst, statusByIso, true);
          tSecond = filterChipListForDisplay(tSecond, statusByIso, true);
          var termRows = [];
          if (tFirst.length) termRows.push(rowHtml(labelBase + " · First half term", tFirst));
          if (tSecond.length) termRows.push(rowHtml(labelBase + " · Second half term", tSecond));
          if (termRows.length) {
            rows.push(
              termAccordionHtml(
                labelBase + " Term 26/27",
                termRows.join(""),
                !firstUpcomingTermRendered,
                false,
              ),
            );
            firstUpcomingTermRendered = true;
          }
        });
      } else {
        var first = [];
        var second = [];
        nextDates.forEach(function (d) {
          if (isFirstHalfTermDate(d.iso, data)) first.push(d);
          else second.push(d);
        });
        first = filterChipListForDisplay(first, statusByIso, true);
        second = filterChipListForDisplay(second, statusByIso, true);
        var fallbackRows = [];
        if (first.length) fallbackRows.push(rowHtml("Autumn · First half term", first));
        if (second.length) fallbackRows.push(rowHtml("Autumn · Second half term", second));
        if (fallbackRows.length) {
          rows.push(termAccordionHtml("Autumn Term 26/27", fallbackRows.join(""), true, false));
        }
      }
    }

    if (completedTermHtml) rows.push(completedTermHtml);
    if (!rows.length) return "";
    return (
      '<div class="pp-hub-ops__date-chips-stack" aria-label="Session dates">' +
      termChipColorLegendHtml() +
      rows.join("") +
      "</div>"
    );
  }

  /** Weekday columns for Day Centre services only (My booking 2026/27). */
  function dayCentreWeekdayCols(data) {
    var detail =
      data && data.general && Array.isArray(data.general.services_detail)
        ? data.general.services_detail
        : [];
    var cols = Object.create(null);
    detail.forEach(function (s) {
      var lab = String((s && (s.label || s.service)) || "");
      if (!/day\s*centre/i.test(lab)) return;
      var col = dayNameToCalCol(s && s.day);
      if (col != null) cols[col] = true;
    });
    return cols;
  }

  function dayCentreWeekdayLabels(data) {
    var cols = dayCentreWeekdayCols(data);
    var names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return names.filter(function (_n, i) {
      return !!cols[i];
    });
  }

  /** All Day Centre session dates for academic year 2026/27 (closed days skipped). */
  function findDayCentreYearSessionDates(data) {
    var cols = dayCentreWeekdayCols(data);
    if (!Object.keys(cols).length) return [];
    var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27 || {};
    var fromIso = chipWindowFromIso(cal.openFrom || "2026-09-01", data);
    var toIso = cal.openTo || "2027-07-30";
    var todayIso = isoDateLocal(new Date());
    var startParts = String(fromIso).split("-");
    var cursor = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]));
    var out = [];
    var guard = 0;
    while (guard < 450) {
      guard++;
      var iso = isoDateLocal(cursor);
      if (iso > toIso) break;
      if (!isNextYearClubClosedIso(iso)) {
        var jsDow = cursor.getDay();
        var col = jsDow === 0 ? 6 : jsDow - 1;
        if (cols[col]) {
          out.push({
            iso: iso,
            shortLabel: formatTermChipLabel(iso),
            past: iso < todayIso,
            isToday: iso === todayIso,
            isNext: false,
          });
        }
      }
      cursor = addDaysLocal(cursor, 1);
    }
    var nextIso = "";
    for (var i = 0; i < out.length; i++) {
      if (!out[i].past) {
        nextIso = out[i].iso;
        break;
      }
    }
    out.forEach(function (d) {
      d.isNext = !!nextIso && d.iso === nextIso;
    });
    return out;
  }

  function bookingDayCentreYearChipsHtml(data) {
    var dates = findDayCentreYearSessionDates(data);
    if (!dates.length) return "";
    var cal = global.PORTAL_DAY_CENTRE_CALENDAR_2026_27 || {};
    var terms = Array.isArray(cal.terms) ? cal.terms : [];

    function chipsOnly(list, ariaLabel) {
      if (!list.length) return "";
      return (
        '<div class="pp-hub-ops__date-chips" role="list" aria-label="' +
        esc(ariaLabel) +
        '">' +
        list
          .map(function (d) {
            return dateChipSpanHtml(d, {});
          })
          .join("") +
        "</div>"
      );
    }
    function rowHtml(label, list) {
      if (!list.length) return "";
      return (
        '<div class="pp-hub-ops__date-chips-row">' +
        '<div class="pp-hub-ops__date-chips-label">' +
        termHalfRowIcon(label) +
        "<span>" +
        esc(label) +
        "</span></div>" +
        chipsOnly(list, label) +
        "</div>"
      );
    }

    var blocks = [];
    if (!terms.length) {
      return (
        '<div class="pp-hub-ops__date-chips-stack" aria-label="Day Centre 2026/27">' +
        termChipColorLegendHtml() +
        chipsOnly(dates, "Day Centre 2026/27") +
        "</div>"
      );
    }

    terms.forEach(function (t) {
      if (!t || !t.starts) return;
      var termEnd = t.mainTermEnds || t.ends || t.lastDay || "";
      if (!termEnd) return;
      var inTerm = dates.filter(function (d) {
        return d.iso >= t.starts && d.iso <= termEnd;
      });
      if (!inTerm.length) return;
      var first = [];
      var second = [];
      inTerm.forEach(function (d) {
        if (isFirstHalfTermDate(d.iso, data, true)) first.push(d);
        else second.push(d);
      });
      var termName = String(t.name || "Term").replace(/\s+Term$/i, "");
      var section =
        '<div class="pp-booking-term">' +
        '<h4 class="pp-booking-term__title">' +
        termHalfRowIcon(termName) +
        "<span>" +
        esc(termName) +
        "</span></h4>" +
        '<div class="pp-hub-ops__date-chips-stack" aria-label="' +
        esc(termName) +
        ' session dates">' +
        (first.length ? rowHtml(termName + " · First half term", first) : "") +
        (second.length ? rowHtml(termName + " · Second half term", second) : "") +
        (!first.length && !second.length ? chipsOnly(inTerm, termName) : "") +
        "</div></div>";
      blocks.push(section);
    });

    if (!blocks.length) return "";
    return (
      '<div class="pp-booking-year-dates">' +
      termChipColorLegendHtml() +
      blocks.join("") +
      "</div>"
    );
  }

  function applyTermDateChipStatuses(host, data, statusByIso) {
    if (!host) return;
    var wrap =
      host.querySelector(".pp-hub-ops__date-chips-stack") ||
      host.querySelector(".pp-hub-ops__date-chips");
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
    // Admin / staff-recorded absences (schedule overrides + absent feedback) from participant detail.
    ((data && data.attendance_summary && data.attendance_summary.absent_dates) || []).forEach(
      function (iso) {
        var d = String(iso || "").slice(0, 10);
        if (d) statusByIso[d] = "absent";
      },
    );
    ((data && data.sessions) || []).forEach(function (s) {
      var iso = String((s && s.session_date) || "").slice(0, 10);
      if (!iso) return;
      var att = String((s && s.attendance) || "").toLowerCase();
      if (
        /\b(absent|absence|no[\s-]?show|noshow|did not attend)\b/.test(att) ||
        /^(no|n|false|0)$/.test(att)
      ) {
        statusByIso[iso] = "absent";
      }
    });
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

  function hubOpsSlotGlyph(tone) {
    var t = String(tone || "other");
    if (t === "aquatic") {
      return '<svg class="pp-hub-ops__slot-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 7.5 0"/><path d="M2 17c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 7.5 0"/></svg>';
    }
    if (t === "climb") {
      return '<svg class="pp-hub-ops__slot-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.5 5.5L20 10l-4.5 3.5L17 20l-5-3-5 3 1.5-6.5L4 10l5.5-1.5L12 3z"/></svg>';
    }
    if (t === "daycentre") {
      return '<svg class="pp-hub-ops__slot-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"/></svg>';
    }
    if (t === "multi") {
      return '<svg class="pp-hub-ops__slot-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.5 10.5l3 3"/></svg>';
    }
    if (t === "bespoke") {
      return '<svg class="pp-hub-ops__slot-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5 8h14M7 16h10"/></svg>';
    }
    return '<svg class="pp-hub-ops__slot-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>';
  }

  function hubOpsSessionSlotHtml(s) {
    var tone = serviceChipToneClass(s.rawLabel || s.label || "");
    var placeBits = [s.venue, s.area].filter(Boolean);
    var place = placeBits.join(" · ");
    var pinIco =
      '<svg class="pp-hub-ops__meta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    var clockIco =
      '<svg class="pp-hub-ops__meta-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    return (
      '<li class="pp-hub-ops__slot pp-hub-ops__slot--' +
      esc(tone) +
      '">' +
      '<span class="pp-hub-ops__slot-ico" aria-hidden="true">' +
      hubOpsSlotGlyph(tone) +
      "</span>" +
      '<div class="pp-hub-ops__slot-body">' +
      '<span class="pp-hub-ops__slot-name">' +
      esc(s.label || "Service") +
      "</span>" +
      (place
        ? '<div class="pp-hub-ops__slot-place">' + pinIco + "<span>" + esc(place) + "</span></div>"
        : "") +
      "</div>" +
      (s.time
        ? '<span class="pp-hub-ops__slot-time">' + clockIco + "<span>" + esc(s.time) + "</span></span>"
        : "") +
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
      var booking = bookingSummary(data);
      var hasCrash = hasCrashBooking(data);
      var hasNextYear = familyAcceptedNextYear(data);
      var endNote;
      if (!hasCrash && !hasNextYear) {
        endNote =
          "No upcoming session on the calendar yet. Past sessions are green; the next one will show here when dates open.";
      } else if (booking.parent_action === "auto") {
        endNote =
          "No more sessions left this summer term. Your 2026/27 place continues with the office — nothing for you to submit.";
      } else if (hasNextYear) {
        endNote =
          "No upcoming session found on your usual days yet. Open Sessions for term dates and when 2026/27 starts.";
      } else {
        endNote = "No more sessions left this summer term. Book 2026/27 when you are ready.";
      }
      nextBody = '<p class="pp-muted pp-hub-ops__empty">' + esc(endNote) + "</p>";
    } else {
      nextBody =
        '<div class="pp-hub-ops__next">' +
        '<div class="pp-hub-ops__when-row' +
        (next.isToday ? " pp-hub-ops__when-row--today" : "") +
        '">' +
        (next.isToday
          ? '<span class="pp-hub-ops__when-pill">Today</span>'
          : "") +
        '<strong class="pp-hub-ops__when">' +
        esc(next.dayLabel) +
        "</strong></div>" +
        '<ul class="pp-hub-ops__slots">' +
        sameDay.map(hubOpsSessionSlotHtml).join("") +
        "</ul></div>";
    }
    return (
      '<section class="pp-hub-ops" aria-label="Next session">' +
      '<p class="pp-pax-info-section-label pp-pax-info-section-label--next">Next session</p>' +
      '<div class="pp-hub-ops__next-block">' +
      nextBody +
      "</div>" +
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
    // Dashboard: profile + next session + shortcuts + categorized menu.
    // Term date accordion lives on Sessions (not on home).
    host.innerHTML =
      '<div class="pp-pax-shell" data-pp-view="hub">' +
      hubHeroHtml(data, opts) +
      hubOpsCardHtml(data) +
      hubShortcutsHtml(data, opts) +
      hubMenuHtml(data, opts) +
      "</div>";
    bindHub(host, data, opts);
    void mountHubAlerts(host, data, opts);
    if (global.ParentPortalApp && global.ParentPortalApp.photo && typeof global.ParentPortalApp.photo.bindOn === "function") {
      global.ParentPortalApp.photo.bindOn(host);
    }
    void refreshConsentsHubBadge(host, data, opts);
  }

  function refreshConsentsHubBadge(host, data, opts) {
    if (!host || !opts || typeof opts.loadConsents !== "function") return;
    void opts
      .loadConsents()
      .then(function (j) {
        var pending = (j && j.summary && j.summary.pending_count) || 0;
        if (typeof opts.setConsentsPendingCount === "function") {
          opts.setConsentsPendingCount(pending);
        }
        var shortcutsOld = host.querySelector(".pp-hub-shortcuts");
        if (shortcutsOld) {
          var sw = document.createElement("div");
          sw.innerHTML = hubShortcutsHtml(data, opts);
          if (sw.firstChild) shortcutsOld.replaceWith(sw.firstChild);
        }
        var old = host.querySelector(".pp-pax-info-buttons");
        if (old) {
          var wrap = document.createElement("div");
          wrap.innerHTML = infoButtonsHtml(data, opts);
          if (wrap.firstChild) old.replaceWith(wrap.firstChild);
        }
        bindHubOpenButtons(host, data, opts);
      })
      .catch(function () {});
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

  function sessionProgressEnabled(data) {
    return !(data && data.session_progress) || data.session_progress.enabled !== false;
  }

  function renderSessions(host, data, opts) {
    if (!sessionProgressEnabled(data)) {
      host.innerHTML = subviewShell(
        data,
        "sessions",
        '<h3 class="pp-pax-subview-title">Sessions Overview</h3>' +
          '<p class="pp-muted">Session overview and stats are not shown for this participant.</p>',
      );
      bindBack(host, data, opts);
      return;
    }
    var termChips = termSessionDateChipsHtml(data);
    host.innerHTML = subviewShell(
      data,
      "sessions",
      '<h3 class="pp-pax-subview-title">Sessions Overview</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Term dates below, then date, service, venue, instructor, engagement, regulation and independence — shown separately for each activity when your child does more than one.</p>' +
        (termChips
          ? '<section class="pp-sessions-term-dates" aria-label="Term session dates">' +
            '<div class="pp-hub-ops__badge-row">' +
            termChips +
            "</div></section>"
          : "") +
        '<div id="ppPaxSessionsHost"><p class="pcso-loading" role="status">Loading sessions…</p></div>',
    );
    bindBack(host, data, opts);
    var messagesPromise =
      opts && typeof opts.loadMessages === "function"
        ? opts.loadMessages({ markRead: false }).catch(function () {
            return null;
          })
        : null;
    mountTermDateChipStatuses(host, data, opts, messagesPromise);
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

  /** Prefer stable colours by service type; never use closed-day red. Each type unique. */
  var PP_CAL_SERVICE_TONES = [
    "#4f46e5", /* physical / fallback 0 — indigo */
    "#0d9488", /* aquatic — teal */
    "#2d84b3", /* climb — steel blue */
    "#15803d", /* multi — green */
    "#7c4dbf", /* bespoke — purple */
    "#b45309", /* day centre — amber */
    "#0369a1", /* extra */
  ];

  function toneForServiceLabel(label, fallbackIdx) {
    var s = String(label || "").toLowerCase();
    if (/aquatic|swim/.test(s)) return "#0d9488"; // teal
    if (/climb/.test(s)) return "#2d84b3"; // steel blue
    if (/physical/.test(s)) return "#4f46e5"; // indigo — not the same as climb
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

  function crashBookedDateRows(data) {
    var crash = (data && data.crash_course) || {};
    return Array.isArray(crash.dates) ? crash.dates : [];
  }

  function myCrashCalendarLegendHtml(data) {
    var rows = crashBookedDateRows(data);
    if (!rows.length) return "";
    var acts = [];
    var seen = Object.create(null);
    rows.forEach(function (r) {
      var act = String((r && r.activity) || "Crash").trim() || "Crash";
      var key = act.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      acts.push(act);
    });
    return (
      '<ul class="pp-cal-legend" aria-label="Your crash course">' +
      acts
        .map(function (a) {
          return (
            '<li class="pp-cal-legend__item">' +
            '<span class="pp-cal-legend__swatch pp-cal-legend__swatch--crash-mine" aria-hidden="true"></span>' +
            '<span class="pp-cal-legend__text">Booked: ' +
            esc(a) +
            "</span></li>"
          );
        })
        .join("") +
      '<li class="pp-cal-legend__item pp-cal-legend__item--note">' +
      '<span class="pp-cal-legend__swatch" style="background:#86efac" aria-hidden="true"></span>' +
      '<span class="pp-cal-legend__text">Other green days = crash course offered (not your booking)</span></li>' +
      "</ul>"
    );
  }

  function mountMyCalendar(host, data) {
    var crashRows = crashBookedDateRows(data);
    var crashHost = host.querySelector("#ppCalCrashHost");
    if (crashHost && crashRows.length) {
      if (typeof global.portalLoadCrashCalendar202627Into === "function") {
        crashHost.innerHTML = '<p class="pp-muted">Loading crash calendar…</p>';
        void global
          .portalLoadCrashCalendar202627Into(crashHost, {
            bookedDates: crashRows,
          })
          .catch(function () {
            if (crashHost.isConnected) {
              crashHost.innerHTML =
                '<p class="pp-muted">Could not load the crash course calendar.</p>';
            }
          });
      } else {
        crashHost.innerHTML =
          '<p class="pp-muted">Crash calendar script is not available. Please refresh the page.</p>';
      }
    }

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
    var crashRows = crashBookedDateRows(data);
    var hasCrash = crashRows.length > 0;
    var crashBlock = hasCrash
      ? '<div class="pp-cal-block pp-cal-block--crash">' +
        '<h4 class="pp-cal-block__title">' +
        '<svg class="pp-cal-block__title-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>' +
        "<span>July Intensive Courses &amp; Camps</span></h4>" +
        '<p class="pp-muted pp-pax-subview-note">Your booked intensive days are highlighted first.</p>' +
        myCrashCalendarLegendHtml(data) +
        '<div id="ppCalCrashHost" class="pp-cal-host pp-cal-host--crash" role="region" aria-label="July Intensive Courses & Camps calendar"></div>' +
        "</div>"
      : "";
    var body =
      '<h3 class="pp-pax-subview-title">My Calendar</h3>' +
      crashBlock +
      '<div class="pp-cal-block">' +
      (hasCrash ? '<h4 class="pp-cal-block__title">2026/27 sessions</h4>' : "") +
      '<p class="pp-muted pp-pax-subview-note">ClubSENsational sessions calendar 2026/27. Coloured circles are ' +
      esc(pName) +
      "&apos;s usual session weekdays. Two services on the same day split the circle in half; three services use three slices.</p>" +
      myCalendarLegendHtml(data) +
      '<div id="ppCalYearHost" class="pp-cal-host pp-cal-host--year" role="region" aria-label="Sessions calendar 2026/27"></div>' +
      "</div>";
    host.innerHTML = subviewShell(data, "calendar", body);
    bindBack(host, data, opts);
    mountMyCalendar(host, data);
  }

  function bookingItemIconSvg(label) {
    var t = String(label || "").toLowerCase();
    var open =
      '<svg class="pp-booking-item__type-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    if (/aquatic|swim|pool/.test(t)) {
      return (
        open +
        '<path d="M2 12c1.5-1.5 3.5-2 5-2s3.5.5 5 2 3.5 2 5 2 3.5-.5 5-2"/><path d="M2 17c1.5-1.5 3.5-2 5-2s3.5.5 5 2 3.5 2 5 2 3.5-.5 5-2"/><path d="M2 7c1.5-1.5 3.5-2 5-2s3.5.5 5 2 3.5 2 5 2 3.5-.5 5-2"/></svg>'
      );
    }
    if (/climb|westway|physical/.test(t)) {
      return (
        open +
        '<path d="M8 21l4-7 3 4 3-8 4 11"/><path d="M4 21h16"/><circle cx="10" cy="7" r="1.5"/></svg>'
      );
    }
    if (/day centre|day-centre|multi/.test(t)) {
      return (
        open +
        '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/></svg>'
      );
    }
    return (
      open +
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>'
    );
  }

  function bookingMetaIcon(kind) {
    var open =
      '<svg class="pp-booking-item__meta-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    if (kind === "when") {
      return open + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    }
    if (kind === "venue") {
      return (
        open +
        '<path d="M12 21s7-5.3 7-11a7 7 0 10-14 0c0 5.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
      );
    }
    return open + '<path d="M20 6L9 17l-5-5"/></svg>';
  }

  function isBookingActivityItem(item) {
    var label = String((item && item.label) || "").trim().toLowerCase();
    if (!label) return false;
    if (label.indexOf("funding") >= 0 || label.indexOf("payment") >= 0) return false;
    if (label.indexOf("re-enrolment style") >= 0 || label.indexOf("reenrolment style") >= 0) {
      return false;
    }
    return true;
  }

  function bookingActivityItemHtml(item) {
    var rawLabel = String((item && item.label) || "Activity").trim();
    var choice = String((item && item.choice) || "—").trim();
    var parts = rawLabel.split(/\s*·\s*/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
    var title = parts[0] || rawLabel;
    var when = parts.length > 1 ? parts[1] : "";
    var venue = parts.length > 2 ? parts.slice(2).join(" · ") : "";
    var meta = "";
    if (when) {
      meta +=
        '<span class="pp-booking-item__meta">' +
        bookingMetaIcon("when") +
        "<span>" +
        esc(when) +
        "</span></span>";
    }
    if (venue) {
      meta +=
        '<span class="pp-booking-item__meta">' +
        bookingMetaIcon("venue") +
        "<span>" +
        esc(venue) +
        "</span></span>";
    }
    return (
      '<li class="pp-booking-item">' +
      '<div class="pp-booking-item__row">' +
      '<span class="pp-booking-item__badge" aria-hidden="true">' +
      bookingItemIconSvg(title) +
      "</span>" +
      '<div class="pp-booking-item__copy">' +
      '<div class="pp-booking-item__label">' +
      esc(title) +
      "</div>" +
      (meta ? '<div class="pp-booking-item__metas">' + meta + "</div>" : "") +
      '<div class="pp-booking-item__choice">' +
      '<span class="pp-booking-item__choice-ico" aria-hidden="true">' +
      bookingMetaIcon("ok") +
      "</span>" +
      "<span>" +
      esc(choice) +
      "</span></div>" +
      "</div></div></li>"
    );
  }

  function renderBooking(host, data, opts) {
    var booking = bookingSummary(data);
    var p = data.participant || {};
    var contactId = p.contact_id || (opts && opts.contactId) || "";
    var reenrolHref =
      "/parent/re-enrolment?from=portal&contact_id=" + encodeURIComponent(String(contactId));
    var body;
    var note =
      booking.parent_action === "auto"
        ? "Your 2026/27 Day Centre place continues with the office / funder."
        : "Your selections for the next academic year.";
    if (booking.parent_action === "auto" && (!booking.submitted || !booking.items.length)) {
      var days = dayCentreWeekdayLabels(data);
      var daysLine = days.length
        ? "Usual days: " + days.join(", ") + "."
        : "Your usual Day Centre weekdays from this term carry into 2026/27.";
      var yearChips = bookingDayCentreYearChipsHtml(data);
      body =
        '<p class="pp-muted">' +
        esc(booking.parent_action_note) +
        "</p>" +
        '<p class="pp-muted">' +
        esc(daysLine) +
        " Session dates for the full academic year below (club closed days are skipped).</p>" +
        (yearChips
          ? yearChips
          : '<p class="pp-muted">Day Centre dates will appear here once your weekdays are on the current roster.</p>');
    } else if (!booking.submitted || !booking.items.length) {
      var crashAction = canBookExtrasFor(data)
        ? '<span class="pp-btn pp-btn--ghost" aria-disabled="true">July crash courses · Fully booked</span>'
        : '<p class="pp-muted">Extra holiday sessions are not available for this place.</p>';
      body =
        '<p class="pp-muted">You have not submitted re-enrolment choices for 2026/27 yet.</p>' +
        '<p class="pp-muted">Please respond by <strong>Wednesday 22 July 2026</strong>. From Thursday 23 July, unconfirmed places may be released to new clients.' +
        (canBookExtrasFor(data)
          ? " You can book crash courses first if you prefer, then complete re-enrolment."
          : "") +
        "</p>" +
        '<div class="pp-hub-reenrol__actions" style="margin-top:10px">' +
        '<a class="pp-btn pp-btn--primary" href="' +
        esc(reenrolHref) +
        '">Open re-enrolment form</a>' +
        crashAction +
        "</div>";
    } else {
      var activityItems = (booking.items || []).filter(isBookingActivityItem);
      body =
        '<p class="pp-muted">Submitted ' +
        esc(formatDate(booking.submitted_at)) +
        ". The office will review your choices.</p>" +
        (activityItems.length
          ? '<ul class="pp-booking-list">' +
            activityItems.map(bookingActivityItemHtml).join("") +
            "</ul>"
          : '<p class="pp-muted">No activity choices on this submission yet.</p>') +
        (booking.parent_action === "auto"
          ? bookingDayCentreYearChipsHtml(data)
          : '<a class="pp-btn pp-btn--ghost" href="' +
            esc(reenrolHref) +
            '">Update booking choices</a>');
    }
    host.innerHTML = subviewShell(
      data,
      "booking",
      '<h3 class="pp-pax-subview-title">My booking</h3>' +
        '<p class="pp-muted pp-pax-subview-note">' +
        esc(note) +
        "</p>" +
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

  function renderWeeklyNotes(host, data, opts) {
    if (!sessionProgressEnabled(data)) {
      host.innerHTML = subviewShell(
        data,
        "weekly_notes",
        '<h3 class="pp-pax-subview-title">Weekly notes</h3>' +
          '<p class="pp-muted">Weekly notes are not shown for this participant.</p>',
      );
      bindBack(host, data, opts);
      return;
    }
    markWeeklyNotesSeen(data, opts);
    var raw = Array.isArray(data.weekly_notes) ? data.weekly_notes : [];
    // Newest first; one card per week_start (never dump duplicate weeks).
    var seenWeek = Object.create(null);
    var notes = [];
    raw.forEach(function (n) {
      var w = String((n && n.week_start) || "");
      if (!w || seenWeek[w]) return;
      seenWeek[w] = true;
      notes.push(n);
    });
    notes.sort(function (a, b) {
      return String(b.week_start || "").localeCompare(String(a.week_start || ""));
    });
    var body;
    if (!notes.length) {
      body =
        '<p class="pp-muted">Weekly notes will collect here once session feedbacks for a Saturday–Friday week are ready. Each note is a short, warm summary of the week.</p>';
    } else {
      body =
        '<ul class="pp-week-notes-folder" aria-label="Weekly notes by week">' +
        notes
          .map(function (n, idx) {
            var range = weekRangeLabel(n.week_start, n.week_end);
            var full = String(n.body || "").trim();
            var teaser = full.replace(/\s+/g, " ");
            if (teaser.length > 100) {
              teaser = teaser.slice(0, 98).replace(/\s+\S*$/, "") + "…";
            }
            return (
              '<li class="pp-week-notes-folder__item">' +
              '<details class="pp-week-note"' +
              (idx === 0 ? " open" : "") +
              ">" +
              "<summary class=\"pp-week-note__sum\">" +
              '<span class="pp-week-note__range">' +
              esc(range || "Week") +
              "</span>" +
              (teaser
                ? '<span class="pp-week-note__teaser">' + esc(teaser) + "</span>"
                : "") +
              "</summary>" +
              '<p class="pp-week-notes-folder__body">' +
              esc(full) +
              "</p></details></li>"
            );
          })
          .join("") +
        "</ul>";
    }
    host.innerHTML = subviewShell(
      data,
      "weekly_notes",
      '<h3 class="pp-pax-subview-title">Weekly notes</h3>' +
        '<p class="pp-muted pp-pax-subview-note">One short note per week. Open a week to read it — older notes stay collapsed so the list stays easy to scroll.</p>' +
        body,
    );
    bindBack(host, data, opts);
  }

  function renderAnnouncements(host, data, opts) {
    var items = Array.isArray(data.club_announcements) ? data.club_announcements : [];
    var body;
    if (!items.length) {
      body =
        '<p class="pp-muted">Club notices will appear here when something affects sessions this week (venue change, closure, key dates).</p>';
    } else {
      body =
        '<ul class="pp-week-notes-folder">' +
        items
          .map(function (a) {
            return (
              '<li class="pp-week-notes-folder__item">' +
              '<div class="pp-week-notes-folder__meta">' +
              '<strong class="pp-week-notes-folder__range">' +
              esc((a && a.title) || "Notice") +
              "</strong></div>" +
              (a && a.body
                ? '<p class="pp-week-notes-folder__body">' + esc(String(a.body)) + "</p>"
                : "") +
              "</li>"
            );
          })
          .join("") +
        "</ul>";
    }
    host.innerHTML = subviewShell(
      data,
      "announcements",
      '<h3 class="pp-pax-subview-title">Club announcements</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Short club notices — not personal messages.</p>' +
        body,
    );
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
        '<p class="pp-muted pp-pax-subview-note">Balances appear here after the office validates an excused absence as a credit or refund. Open credits with a £ amount can be applied to an unpaid invoice under Invoices. Refunds stay open until the office marks them paid.</p>' +
        '<div id="ppBalanceSummary" class="pp-balance-summary" hidden></div>' +
        '<div id="ppBalanceNotice" class="pp-notice" hidden></div>' +
        '<div id="ppBalanceListHost"><p class="pp-muted">Loading…</p></div>',
    );
    bindBack(host, data, opts);
    bindBalance(host, data, opts);
  }

  function formatDocWhen(iso, withTime) {
    if (!iso) return "";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    try {
      if (withTime) {
        return d.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Europe/London",
        });
      }
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
    var when = formatDocWhen(doc && doc.submitted_at, true);
    var status = String((doc && doc.status) || "").trim();
    var pdf = (doc && doc.pdf_url) || "";
    var photo = (doc && doc.photo_url) || "";
    var formType = String((doc && doc.form_type) || "").trim();
    var isConsent = formType === "annual_consents";
    var ico = isConsent
      ? '<span class="pp-doc-card__ico pp-doc-card__ico--consent" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg></span>'
      : '<span class="pp-doc-card__ico pp-doc-card__ico--form" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg></span>';
    var statusChip = "";
    if (isConsent) {
      statusChip =
        status === "reviewed"
          ? '<span class="pp-consent-chip pp-consent-chip--done">On file</span>'
          : '<span class="pp-consent-chip pp-consent-chip--done">Signed</span>';
    } else if (status) {
      statusChip = '<span class="pp-doc-chip">' + esc(status) + "</span>";
    }
    return (
      '<article class="pp-doc-card' +
      (isConsent ? " pp-doc-card--consent" : "") +
      '">' +
      '<div class="pp-doc-card__head">' +
      '<div class="pp-doc-card__title-row">' +
      ico +
      "<strong>" +
      esc(title) +
      "</strong>" +
      "</div>" +
      statusChip +
      "</div>" +
      (when
        ? '<p class="pp-doc-card__when muted">' +
          (isConsent ? "Signed " : "Submitted ") +
          esc(when) +
          "</p>"
        : "") +
      '<div class="pp-doc-card__acts">' +
      (pdf
        ? '<a class="pp-btn pp-btn--primary pp-doc-card__open" href="' +
          esc(pdf) +
          '" target="_blank" rel="noopener noreferrer">' +
          '<svg class="pp-doc-card__open-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 13h4M10 17h4"/></svg>' +
          "<span>Open PDF</span></a>"
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

  function bindRegistrationDocs(host, data, opts) {
    var listHost = host.querySelector("#ppDocsListHost");
    if (!listHost) return;

    if (typeof opts.listDocuments !== "function") {
      listHost.innerHTML = '<p class="pp-muted">Forms &amp; PDFs are not available right now.</p>';
      return;
    }

    void opts
      .listDocuments()
      .then(function (j) {
        var docs = (j && j.documents) || [];
        if (!docs.length) {
          listHost.innerHTML =
            '<div class="pp-docs-empty">' +
            '<p class="pp-muted">No PDFs on file yet. After you save &amp; sign consents above, a signed PDF with the club logo and your answers appears here.</p>' +
            "</div>";
          return;
        }
        listHost.innerHTML = docs.map(documentCardHtml).join("");
      })
      .catch(function () {
        listHost.innerHTML =
          '<p class="pp-muted">Could not load forms — please try again.</p>';
      });
  }

  function formatConsentWhen(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (_e) {
      return "";
    }
  }

  function consentStatusChip(done, label) {
    return (
      '<span class="pp-consent-chip' +
      (done ? " pp-consent-chip--done" : " pp-consent-chip--pending") +
      '">' +
      esc(done ? label || "Signed" : "Pending") +
      "</span>"
    );
  }

  function consentSvg(kind) {
    if (kind === "camera") {
      return (
        '<svg class="pp-consent-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
      );
    }
    if (kind === "web") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>'
      );
    }
    if (kind === "megaphone") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11v2a4 4 0 0 0 4 4h1"/><path d="M11 5l10 4v6l-10 4V5z"/><path d="M7 15v4"/></svg>'
      );
    }
    if (kind === "training") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/></svg>'
      );
    }
    if (kind === "research") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'
      );
    }
    if (kind === "pill") {
      return (
        '<svg class="pp-consent-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/><path d="M7 12h.01"/></svg>'
      );
    }
    if (kind === "check") {
      return (
        '<svg class="pp-consent-choice__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>'
      );
    }
    if (kind === "block") {
      return (
        '<svg class="pp-consent-choice__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>'
      );
    }
    if (kind === "med-yes") {
      return (
        '<svg class="pp-consent-choice__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/><rect x="4" y="4" width="16" height="16" rx="4"/></svg>'
      );
    }
    if (kind === "emergency") {
      return (
        '<svg class="pp-consent-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'
      );
    }
    if (kind === "travel") {
      return (
        '<svg class="pp-consent-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>'
      );
    }
    if (kind === "walk") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M10 22l2-7 2 7"/><path d="M8 10l4 2 4-2"/><path d="M9 14l-2 3"/><path d="M15 14l2 3"/></svg>'
      );
    }
    if (kind === "bus") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M8 17v2"/><path d="M16 17v2"/><circle cx="8" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/></svg>'
      );
    }
    if (kind === "taxi") {
      return (
        '<svg class="pp-consent-use__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5"/><path d="M5 13v4"/><path d="M19 13v4"/><path d="M3 17h18"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/><path d="M10 7h4"/></svg>'
      );
    }
    if (kind === "phone") {
      return (
        '<svg class="pp-consent-choice__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.19a2 2 0 0 1 2.11-.45c.83.29 1.7.5 2.6.62A2 2 0 0 1 22 16.92z"/></svg>'
      );
    }
    return "";
  }

  function consentChoiceHtml(name, value, selected, ico, title, sub) {
    return (
      '<label class="pp-consent-choice' +
      (selected ? " is-selected" : "") +
      '">' +
      '<input type="radio" name="' +
      esc(name) +
      '" value="' +
      esc(value) +
      '"' +
      (selected ? " checked" : "") +
      ">" +
      '<span class="pp-consent-choice__mark" aria-hidden="true">' +
      consentSvg(ico) +
      "</span>" +
      '<span class="pp-consent-choice__copy">' +
      "<strong>" +
      esc(title) +
      "</strong>" +
      (sub ? '<span class="pp-muted">' + esc(sub) + "</span>" : "") +
      "</span></label>"
    );
  }

  function renderConsents(host, data, opts) {
    var parentName =
      opts && typeof opts.parentDisplayName === "function" ? opts.parentDisplayName() : "";
    host.innerHTML = subviewShell(
      data,
      "consents",
      '<h3 class="pp-pax-subview-title">Consents &amp; forms</h3>' +
        '<p class="pp-muted pp-pax-subview-note">Sign permissions for ' +
        esc(firstNameOf(data)) +
        " (photos, medication, emergency, travel — renewed each year). When you save, a signed PDF with the club logo and your answers is added under <strong>Signed PDFs</strong> below.</p>" +
        '<div class="pp-card pp-consent-form-card">' +
        '<div id="ppConsentsHost"><p class="pp-muted">Loading…</p></div>' +
        '<div id="ppConsentsNotice" class="pp-notice" hidden></div>' +
        "</div>" +
        '<section class="pp-card pp-consent-docs-card" aria-labelledby="ppConsentDocsTitle">' +
        '<div class="pp-consent-docs__head">' +
        '<span class="pp-consent-docs__ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg></span>' +
        '<div class="pp-consent-docs__copy" style="min-width:0">' +
        '<h4 id="ppConsentDocsTitle" class="pp-consent-docs__title">Signed PDFs &amp; registration forms</h4>' +
        '<p class="pp-muted pp-consent-docs__note">Annual consents PDF (after you sign) plus any registration forms on file.</p>' +
        "</div></div>" +
        '<div id="ppDocsListHost"><p class="pp-muted">Loading…</p></div>' +
        "</section>",
    );
    bindBack(host, data, opts);
    bindConsents(host, data, opts, parentName);
    bindRegistrationDocs(host, data, opts);
  }

  function bindConsents(host, data, opts, parentName) {
    var formHost = host.querySelector("#ppConsentsHost");
    var notice = host.querySelector("#ppConsentsNotice");

    function showNotice(kind, text) {
      if (!notice) return;
      notice.hidden = !text;
      notice.className = "pp-notice" + (kind ? " pp-notice--" + kind : "");
      notice.textContent = text || "";
      if (text && (kind === "success" || kind === "error")) {
        try {
          notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (_e) {}
      }
    }

    if (!formHost || typeof opts.loadConsents !== "function") {
      if (formHost) formHost.innerHTML = '<p class="pp-muted">Consents are not available right now.</p>';
      return;
    }

    function paint(consents, summary) {
      consents = consents || {};
      summary = summary || {};
      var photoRaw = String(consents.photo_consent || "unknown");
      /* Progress / family portal photos do not need this consent. Map legacy internal_only → no. */
      var photo = photoRaw === "yes" ? "yes" : photoRaw === "no" || photoRaw === "internal_only" ? "no" : "";
      var med = String(consents.medication_at_centre_needed || "unknown");
      var details = String(consents.medication_at_centre_details || "");
      var photoSigner = String(consents.photo_consent_signed_by_name || parentName || "");
      var medSigner = String(consents.medication_at_centre_signed_by_name || parentName || "");
      var photoWhen = formatConsentWhen(consents.photo_consent_signed_at);
      var medWhen = formatConsentWhen(consents.medication_at_centre_signed_at);
      var emergencyRaw = String(consents.emergency_treatment_consent || "unknown");
      var emergency = emergencyRaw === "yes" || emergencyRaw === "no" ? emergencyRaw : "";
      var emergencySigner = String(
        consents.emergency_treatment_signed_by_name || parentName || "",
      );
      var emergencyWhen = formatConsentWhen(consents.emergency_treatment_signed_at);
      var emergencyName = String(consents.emergency_contact_name || "");
      var emergencyPhone = String(consents.emergency_contact_phone || "");
      var walkRaw = String(consents.community_walk_consent || "unknown");
      var walk = walkRaw === "yes" || walkRaw === "no" ? walkRaw : "";
      var publicRaw = String(consents.public_transport_consent || "unknown");
      var publicTransport = publicRaw === "yes" || publicRaw === "no" ? publicRaw : "";
      var taxiRaw = String(consents.taxi_home_transport_consent || "unknown");
      var taxi = taxiRaw === "yes" || taxiRaw === "no" ? taxiRaw : "";
      var offsiteSigner = String(consents.offsite_transport_signed_by_name || parentName || "");
      var offsiteWhen = formatConsentWhen(consents.offsite_transport_signed_at);
      var photoDone = !!summary.photo_done;
      var medDone = !!summary.medication_done;
      var emergencyDone = !!summary.emergency_done;
      var offsiteDone = !!summary.offsite_done;
      var renewalNeeded = !!summary.renewal_needed;
      var validUntil = formatConsentWhen(summary.valid_until);
      if (typeof opts.setConsentsPendingCount === "function") {
        opts.setConsentsPendingCount(summary.pending_count || 0);
      }

      var renewalBanner = renewalNeeded
        ? '<div class="pp-consent-renewal" role="status">Annual renewal needed — please review and re-sign the consents below.</div>'
        : validUntil
          ? '<p class="pp-muted pp-consent-valid-until">Current consents valid until ' +
            esc(validUntil) +
            " (renew each year).</p>"
          : "";

      var photoSummary =
        photo === "yes" ? "Yes — wider use" : photo === "no" ? "No — family only" : "Not answered yet";
      var medSummary =
        med === "yes"
          ? "Yes — medication at centre"
          : med === "no"
            ? "No medication at the centre"
            : "Not answered yet";
      var emergencySummary =
        emergency === "yes"
          ? "Yes — act in an emergency"
          : emergency === "no"
            ? "No — wait for carer"
            : "Not answered yet";
      var travelSummary =
        walk && publicTransport && taxi
          ? "Walk " +
            walk.toUpperCase() +
            " · Public " +
            publicTransport.toUpperCase() +
            " · Taxi " +
            taxi.toUpperCase()
          : "Not answered yet";

      function consentAccordionStart(optsAcc) {
        var openAttr = optsAcc.open ? " open" : "";
        return (
          '<details class="pp-consent-card pp-consent-card--' +
          esc(optsAcc.kind) +
          '"' +
          openAttr +
          ">" +
          '<summary class="pp-consent-card__summary">' +
          '<div class="pp-consent-card__summary-main">' +
          '<div class="pp-consent-card__title-row">' +
          '<span class="pp-consent-ico-wrap pp-consent-ico-wrap--' +
          esc(optsAcc.kind === "travel" ? "travel" : optsAcc.kind) +
          '" aria-hidden="true">' +
          consentSvg(optsAcc.icon) +
          "</span>" +
          '<span class="pp-consent-card__title-stack">' +
          '<h4 id="' +
          esc(optsAcc.titleId) +
          '" class="pp-consent-card__title">' +
          optsAcc.titleHtml +
          "</h4>" +
          '<span class="pp-consent-card__preview">' +
          esc(optsAcc.preview) +
          "</span>" +
          "</span></div>" +
          consentStatusChip(optsAcc.done) +
          "</div>" +
          '<span class="pp-consent-card__chev" aria-hidden="true"></span>' +
          "</summary>" +
          '<div class="pp-consent-card__body">'
        );
      }

      var openPhoto = !photoDone;
      var openMed = photoDone && !medDone;
      var openEmergency = photoDone && medDone && !emergencyDone;
      var openTravel = photoDone && medDone && emergencyDone && !offsiteDone;

      formHost.innerHTML =
        renewalBanner +
        '<form class="pp-consent-form" id="ppConsentForm" novalidate>' +
        consentAccordionStart({
          kind: "photo",
          icon: "camera",
          titleId: "ppConsentPhotoTitle",
          titleHtml: "Photo &amp; media for marketing",
          preview: photoSummary,
          done: photoDone,
          open: openPhoto,
        }) +
        '<p class="pp-muted pp-consent-card__hint">Achievement photos in the portal (progress shared with you) already happen. This consent is only for wider use:</p>' +
        '<ul class="pp-consent-uses" aria-label="Wider photo uses">' +
        '<li class="pp-consent-use">' +
        consentSvg("web") +
        "<span>Website</span></li>" +
        '<li class="pp-consent-use">' +
        consentSvg("megaphone") +
        "<span>Marketing</span></li>" +
        '<li class="pp-consent-use">' +
        consentSvg("training") +
        "<span>Staff training</span></li>" +
        '<li class="pp-consent-use">' +
        consentSvg("research") +
        "<span>Research / resources</span></li>" +
        "</ul>" +
        '<fieldset class="pp-consent-choices">' +
        '<legend class="pp-sr-only">Photo consent for marketing and resources</legend>' +
        consentChoiceHtml(
          "photo_consent",
          "yes",
          photo === "yes",
          "check",
          "Yes — allow wider use",
          "Website, marketing, training materials and research resources",
        ) +
        consentChoiceHtml(
          "photo_consent",
          "no",
          photo === "no",
          "block",
          "No — progress & family only",
          "Keep photos for the portal and updates to you; not for public or marketing use",
        ) +
        "</fieldset>" +
        '<div class="pp-field"><label for="ppConsentPhotoSigner">Signed by</label>' +
        '<input id="ppConsentPhotoSigner" name="photo_consent_signed_by_name" type="text" autocomplete="name" required value="' +
        esc(photoSigner) +
        '"></div>' +
        (photoWhen
          ? '<p class="pp-muted pp-consent-signed">Last signed ' + esc(photoWhen) + "</p>"
          : "") +
        "</div></details>" +
        consentAccordionStart({
          kind: "med",
          icon: "pill",
          titleId: "ppConsentMedTitle",
          titleHtml: "Medication at the centre",
          preview: medSummary,
          done: medDone,
          open: openMed,
        }) +
        '<p class="pp-muted pp-consent-card__hint">Only if staff need to hold or help with medication during sessions (name, dose, when, storage).</p>' +
        '<fieldset class="pp-consent-choices">' +
        '<legend class="pp-sr-only">Medication at centre</legend>' +
        consentChoiceHtml(
          "medication_at_centre_needed",
          "no",
          med === "no",
          "block",
          "No medication at the centre",
          "Nothing left with staff for sessions",
        ) +
        consentChoiceHtml(
          "medication_at_centre_needed",
          "yes",
          med === "yes",
          "med-yes",
          "Yes — staff may hold / assist",
          "Describe the medication below",
        ) +
        "</fieldset>" +
        '<div class="pp-field pp-consent-med-details"' +
        (med === "yes" ? "" : " hidden") +
        '><label for="ppConsentMedDetails">Medication details (name, dose, when, storage)</label>' +
        '<textarea id="ppConsentMedDetails" name="medication_at_centre_details" rows="3" placeholder="e.g. Salbutamol inhaler — 2 puffs if wheezy; kept in labelled pouch">' +
        esc(details) +
        "</textarea></div>" +
        '<div class="pp-field"><label for="ppConsentMedSigner">Signed by</label>' +
        '<input id="ppConsentMedSigner" name="medication_at_centre_signed_by_name" type="text" autocomplete="name" required value="' +
        esc(medSigner) +
        '"></div>' +
        (medWhen ? '<p class="pp-muted pp-consent-signed">Last signed ' + esc(medWhen) + "</p>" : "") +
        "</div></details>" +
        consentAccordionStart({
          kind: "emergency",
          icon: "emergency",
          titleId: "ppConsentEmergencyTitle",
          titleHtml: "Emergency treatment",
          preview: emergencySummary,
          done: emergencyDone,
          open: openEmergency,
        }) +
        '<p class="pp-muted pp-consent-card__hint">If we cannot reach you quickly, may staff arrange urgent first aid / medical treatment and call the emergency contact below?</p>' +
        '<fieldset class="pp-consent-choices">' +
        '<legend class="pp-sr-only">Emergency treatment consent</legend>' +
        consentChoiceHtml(
          "emergency_treatment_consent",
          "yes",
          emergency === "yes",
          "check",
          "Yes — act in an emergency",
          "First aid and urgent medical help if needed",
        ) +
        consentChoiceHtml(
          "emergency_treatment_consent",
          "no",
          emergency === "no",
          "block",
          "No — wait for carer only",
          "Staff will still call emergency services if life is at risk",
        ) +
        "</fieldset>" +
        '<div class="pp-consent-emergency-fields">' +
        '<div class="pp-field"><label for="ppConsentEmergencyName">Emergency contact name</label>' +
        '<input id="ppConsentEmergencyName" name="emergency_contact_name" type="text" autocomplete="name" required value="' +
        esc(emergencyName) +
        '"></div>' +
        '<div class="pp-field"><label for="ppConsentEmergencyPhone">Emergency contact phone</label>' +
        '<input id="ppConsentEmergencyPhone" name="emergency_contact_phone" type="tel" autocomplete="tel" required value="' +
        esc(emergencyPhone) +
        '"></div></div>' +
        '<div class="pp-field"><label for="ppConsentEmergencySigner">Signed by</label>' +
        '<input id="ppConsentEmergencySigner" name="emergency_treatment_signed_by_name" type="text" autocomplete="name" required value="' +
        esc(emergencySigner) +
        '"></div>' +
        (emergencyWhen
          ? '<p class="pp-muted pp-consent-signed">Last signed ' + esc(emergencyWhen) + "</p>"
          : "") +
        "</div></details>" +
        consentAccordionStart({
          kind: "travel",
          icon: "travel",
          titleId: "ppConsentTravelTitle",
          titleHtml: "Off-site &amp; transport",
          preview: travelSummary,
          done: offsiteDone,
          open: openTravel,
        }) +
        '<p class="pp-muted pp-consent-card__hint">Answer each option. Staff only use the types you allow for community activities and travel.</p>' +
        '<ul class="pp-consent-uses pp-consent-uses--travel" aria-hidden="true">' +
        '<li class="pp-consent-use">' +
        consentSvg("walk") +
        "<span>Community walk</span></li>" +
        '<li class="pp-consent-use">' +
        consentSvg("bus") +
        "<span>Train / metro / bus</span></li>" +
        '<li class="pp-consent-use">' +
        consentSvg("taxi") +
        "<span>Taxi with PA</span></li>" +
        "</ul>" +
        '<div class="pp-consent-travel-block">' +
        '<p class="pp-consent-travel-label">Community walk (on foot)</p>' +
        '<fieldset class="pp-consent-choices">' +
        '<legend class="pp-sr-only">Community walk consent</legend>' +
        consentChoiceHtml(
          "community_walk_consent",
          "yes",
          walk === "yes",
          "check",
          "Yes — walking outings",
          "Short community trips on foot with staff",
        ) +
        consentChoiceHtml(
          "community_walk_consent",
          "no",
          walk === "no",
          "block",
          "No walks",
          "Stay at the centre for community activities",
        ) +
        "</fieldset></div>" +
        '<div class="pp-consent-travel-block">' +
        '<p class="pp-consent-travel-label">Public transport (train, metro, bus)</p>' +
        '<fieldset class="pp-consent-choices">' +
        '<legend class="pp-sr-only">Public transport consent</legend>' +
        consentChoiceHtml(
          "public_transport_consent",
          "yes",
          publicTransport === "yes",
          "check",
          "Yes — public transport",
          "Accompanied trips by train, metro or bus",
        ) +
        consentChoiceHtml(
          "public_transport_consent",
          "no",
          publicTransport === "no",
          "block",
          "No public transport",
          "Do not use train, metro or bus",
        ) +
        "</fieldset></div>" +
        '<div class="pp-consent-travel-block">' +
        '<p class="pp-consent-travel-label">Taxi home ↔ centre (with their PA)</p>' +
        '<p class="pp-muted pp-consent-card__hint" style="margin-top:0">Taxi booked for travel between home and the centre with their personal assistant (not our staff).</p>' +
        '<fieldset class="pp-consent-choices">' +
        '<legend class="pp-sr-only">Taxi home transport consent</legend>' +
        consentChoiceHtml(
          "taxi_home_transport_consent",
          "yes",
          taxi === "yes",
          "check",
          "Yes — taxi with PA",
          "Home to centre (and return) by taxi with their assistant",
        ) +
        consentChoiceHtml(
          "taxi_home_transport_consent",
          "no",
          taxi === "no",
          "block",
          "No taxi arrangement",
          "Do not arrange taxi travel with their PA",
        ) +
        "</fieldset></div>" +
        '<div class="pp-field"><label for="ppConsentOffsiteSigner">Signed by</label>' +
        '<input id="ppConsentOffsiteSigner" name="offsite_transport_signed_by_name" type="text" autocomplete="name" required value="' +
        esc(offsiteSigner) +
        '"></div>' +
        (offsiteWhen
          ? '<p class="pp-muted pp-consent-signed">Last signed ' + esc(offsiteWhen) + "</p>"
          : "") +
        "</div></details>" +
        '<button type="submit" class="pp-btn pp-btn--primary pp-consent-save-btn" id="ppConsentSaveBtn">Save &amp; sign consents</button>' +
        "</form>";

      var form = formHost.querySelector("#ppConsentForm");
      var medDetailsWrap = formHost.querySelector(".pp-consent-med-details");

      function syncChoiceStyles() {
        formHost.querySelectorAll(".pp-consent-choice").forEach(function (lab) {
          var input = lab.querySelector('input[type="radio"]');
          lab.classList.toggle("is-selected", !!(input && input.checked));
        });
      }

      formHost.querySelectorAll(".pp-consent-choice input").forEach(function (r) {
        r.addEventListener("change", function () {
          syncChoiceStyles();
          if (r.name === "medication_at_centre_needed" && medDetailsWrap) {
            var checked = formHost.querySelector(
              'input[name="medication_at_centre_needed"]:checked',
            );
            medDetailsWrap.hidden = !(checked && checked.value === "yes");
          }
        });
      });

      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          showNotice("", "");
          if (typeof opts.saveConsents !== "function") {
            showNotice("error", "Saving is not available right now.");
            return;
          }
          var photoEl = form.querySelector('input[name="photo_consent"]:checked');
          var medEl = form.querySelector('input[name="medication_at_centre_needed"]:checked');
          var emergencyEl = form.querySelector('input[name="emergency_treatment_consent"]:checked');
          var walkEl = form.querySelector('input[name="community_walk_consent"]:checked');
          var publicEl = form.querySelector('input[name="public_transport_consent"]:checked');
          var taxiEl = form.querySelector('input[name="taxi_home_transport_consent"]:checked');
          var photoName = String((form.querySelector("#ppConsentPhotoSigner") || {}).value || "").trim();
          var medName = String((form.querySelector("#ppConsentMedSigner") || {}).value || "").trim();
          var medText = String((form.querySelector("#ppConsentMedDetails") || {}).value || "").trim();
          var emergencyNameVal = String(
            (form.querySelector("#ppConsentEmergencyName") || {}).value || "",
          ).trim();
          var emergencyPhoneVal = String(
            (form.querySelector("#ppConsentEmergencyPhone") || {}).value || "",
          ).trim();
          var emergencySignerVal = String(
            (form.querySelector("#ppConsentEmergencySigner") || {}).value || "",
          ).trim();
          var offsiteSignerVal = String(
            (form.querySelector("#ppConsentOffsiteSigner") || {}).value || "",
          ).trim();
          if (!photoEl) {
            showNotice("error", "Choose a photo consent option.");
            return;
          }
          if (!medEl) {
            showNotice("error", "Choose whether medication is left at the centre.");
            return;
          }
          if (!emergencyEl) {
            showNotice("error", "Choose an emergency treatment option.");
            return;
          }
          if (!walkEl || !publicEl || !taxiEl) {
            showNotice("error", "Answer each off-site / transport option.");
            return;
          }
          if (!photoName || !medName || !emergencySignerVal || !offsiteSignerVal) {
            showNotice("error", "Enter the name of the person signing.");
            return;
          }
          if (medEl.value === "yes" && !medText) {
            showNotice("error", "Add medication details (name, dose, when).");
            return;
          }
          if (!emergencyNameVal || !emergencyPhoneVal) {
            showNotice("error", "Add an emergency contact name and phone.");
            return;
          }
          var btn = form.querySelector("#ppConsentSaveBtn");
          if (btn) {
            btn.disabled = true;
            btn.setAttribute("aria-busy", "true");
          }
          void opts
            .saveConsents({
              photo_consent: photoEl.value,
              photo_consent_signed_by_name: photoName,
              medication_at_centre_needed: medEl.value,
              medication_at_centre_details: medText,
              medication_at_centre_signed_by_name: medName,
              emergency_treatment_consent: emergencyEl.value,
              emergency_treatment_signed_by_name: emergencySignerVal,
              emergency_contact_name: emergencyNameVal,
              emergency_contact_phone: emergencyPhoneVal,
              community_walk_consent: walkEl.value,
              public_transport_consent: publicEl.value,
              taxi_home_transport_consent: taxiEl.value,
              offsite_transport_signed_by_name: offsiteSignerVal,
            })
            .then(function (j) {
              if (typeof opts.setConsentsPendingCount === "function") {
                opts.setConsentsPendingCount((j.summary && j.summary.pending_count) || 0);
              }
              paint(
                j.consents || {},
                j.summary || {
                  photo_done: true,
                  medication_done: true,
                  emergency_done: true,
                  offsite_done: true,
                },
              );
              bindRegistrationDocs(host, data, opts);
              var okMsg = "Consents saved. Thank you — valid for one year.";
              if (j && j.document && j.document.pdf_url) {
                okMsg += " Your signed PDF is ready below.";
              } else {
                okMsg += " Your signed PDF will appear under Signed PDFs below.";
              }
              showNotice("success", okMsg);
            })
            .catch(function (err) {
              var code = err && err.code ? String(err.code) : "";
              var msg = "Could not save — please try again.";
              if (code === "medication_details_required") msg = "Add medication details before saving.";
              if (code === "photo_consent_required") msg = "Choose a photo consent option.";
              if (code === "emergency_consent_required") msg = "Choose an emergency treatment option.";
              if (code === "emergency_contact_name_required" || code === "emergency_contact_phone_required") {
                msg = "Add an emergency contact name and phone.";
              }
              if (
                code === "community_walk_consent_required" ||
                code === "public_transport_consent_required" ||
                code === "taxi_home_transport_consent_required"
              ) {
                msg = "Answer each off-site / transport option.";
              }
              showNotice("error", msg);
            })
            .finally(function () {
              if (btn) {
                btn.disabled = false;
                btn.removeAttribute("aria-busy");
              }
            });
        });
      }
    }

    void opts
      .loadConsents()
      .then(function (j) {
        if (typeof opts.setConsentsPendingCount === "function") {
          opts.setConsentsPendingCount((j && j.summary && j.summary.pending_count) || 0);
        }
        paint((j && j.consents) || {}, (j && j.summary) || {});
      })
      .catch(function () {
        showNotice("error", "Could not load consents — please try again.");
        formHost.innerHTML = "";
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

  function invoiceActIco(kind) {
    var base =
      ' class="pp-invoice-act-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === "download") {
      return (
        "<svg" +
        base +
        '><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
      );
    }
    if (kind === "preview") {
      return (
        "<svg" +
        base +
        '><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
      );
    }
    if (kind === "gocardless") {
      return (
        "<svg" +
        base +
        '><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>'
      );
    }
    if (kind === "card") {
      return (
        "<svg" +
        base +
        '><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'
      );
    }
    if (kind === "bank") {
      return (
        "<svg" +
        base +
        '><path d="M3 10h18"/><path d="M5 10V6l7-3 7 3v4"/><rect x="5" y="14" width="4" height="6"/><rect x="15" y="14" width="4" height="6"/></svg>'
      );
    }
    return "";
  }

  function invoiceBtnLabel(kind, text) {
    return invoiceActIco(kind) + '<span class="pp-invoice-act-label">' + text + "</span>";
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
      '<p class="pp-muted pp-invoice-pay__note">Use the participant name as the payment reference so we can match it in Tide. Prefer bank transfer — no card fee.</p>' +
      "</div>"
    );
  }

  function invoiceCardHtml(inv) {
    var num = String((inv && inv.invoice_number) || "").trim();
    // Parent-facing title must start with INV-… — never a naked "Crash £700" style label.
    var title = num;
    if (!title) {
      title = String((inv && inv.title) || "Invoice")
        .replace(/^Invoice\s+/i, "")
        .replace(/\s*[·•|]\s*VAT\s*(?:20%|Exempt)?/gi, "")
        .replace(/\s*[·•|]\s*PAID\b/gi, "")
        .trim();
      if (!title || /^Crash\b/i.test(title) || /£\s*\d/.test(title)) {
        title = "Invoice";
      }
    }
    var subtitle = String((inv && inv.subtitle) || "").trim();
    if (!subtitle) {
      var ref = String((inv && inv.reference_text) || "").trim();
      var rawTitle = String((inv && inv.title) || "");
      var lineDesc = String((inv && inv.line_description) || "").trim();
      if (/crash/i.test(ref) || /crash/i.test(rawTitle) || /summer term 25\/26/i.test(ref)) {
        subtitle = "Summer crash course Jul 2026";
      } else if (
        /autumn/i.test(ref) ||
        /re-enrol/i.test(lineDesc) ||
        /Autumn term/i.test(rawTitle) ||
        /26\/27|2026-27|2026\/27/.test(ref)
      ) {
        subtitle = ref || "Autumn term 26/27";
      } else if (ref && ref !== num) {
        subtitle = ref;
      } else if (lineDesc) {
        var firstLine = lineDesc.split("\n")[0].trim();
        if (firstLine && !/^structured activity support/i.test(firstLine)) {
          subtitle = firstLine;
        }
      }
    }
    var amount = formatInvoiceMoney(inv && inv.amount_gbp);
    var dueNow = inv && inv.amount_due_now != null ? formatInvoiceMoney(inv.amount_due_now) : "";
    var paidSoFar =
      inv && inv.amount_paid_gbp != null && Number(inv.amount_paid_gbp) > 0
        ? formatInvoiceMoney(inv.amount_paid_gbp)
        : "";
    var schedule = (inv && inv.payment_schedule) || [];
    var due = formatDocWhen(inv && inv.due_date);
    var status = String((inv && inv.payment_status) || "unpaid").toLowerCase();
    var pdf = (inv && inv.pdf_url) || "";
    var canReport = !!(inv && inv.can_report_paid);
    var canPay = !!(inv && inv.can_pay);
    var card = inv && inv.card_checkout;
    var cardCharge = card ? formatInvoiceMoney(card.charge_gbp) : "";
    var cardFee = card ? formatInvoiceMoney(card.fee_gbp) : "";
    var gc = String((inv && inv.gocardless_url) || "").trim();
    var canSetupGc = !!(inv && inv.can_setup_gocardless);
    var gcPending = !!(inv && inv.gocardless_pending_collection);
    var isGcInvoice =
      String((inv && inv.payment_method_hint) || "").toLowerCase() === "gocardless";
    var isLaInvoice =
      String((inv && inv.payment_method_hint) || "").toLowerCase() === "la_funded" ||
      String((inv && inv.vat_mode) || "").toLowerCase() === "exempt";
    var pl = isGcInvoice || isLaInvoice
      ? ""
      : String((inv && inv.payment_link_url) || "").trim();
    var surcharge = String((inv && inv.payment_link_surcharge_note) || "").trim();
    var suggestedRef = String((inv && inv.suggested_reference) || "").trim();
    // Direct Payment (mandate) / LA funded: no Tide / card / "I've paid by bank transfer".
    if (isGcInvoice || isLaInvoice) {
      canReport = false;
      canPay = false;
    }
    var pendingNote =
      status === "pending_confirmation"
        ? '<p class="pp-invoice-card__meta">Thanks — we will confirm when the payment appears' +
          (inv.parent_reported_ref
            ? " (ref " + esc(inv.parent_reported_ref) + ")"
            : "") +
          ".</p>"
        : "";
    var paidNote =
      status === "paid"
        ? '<p class="pp-invoice-card__meta">Paid' +
          (inv.paid_via ? " via " + esc(String(inv.paid_via)) : "") +
          (inv.paid_at ? " · " + esc(formatDocWhen(inv.paid_at)) : "") +
          ". Keep the PDF for your records.</p>"
        : "";
    var cardFeeNote =
      canPay && card && cardFee
        ? '<p class="pp-muted pp-invoice-pay__note">Card / Apple Pay total <strong>' +
          esc(cardCharge) +
          "</strong> (includes " +
          esc(cardFee) +
          " processing fee so we receive the invoice amount in full). Bank transfer has no fee.</p>"
        : "";
    var credits = (inv && inv.applicable_credits) || [];
    var creditHtml = "";
    if (credits.length && (status === "unpaid" || status === "partial")) {
      creditHtml =
        '<div class="pp-invoice-credit">' +
        '<p class="pp-invoice-pay__title">Pay with credit on file</p>' +
        credits
          .map(function (c) {
            var cAmt = formatInvoiceMoney(c.amount_gbp);
            var invAmtN = Number(inv.amount_gbp);
            var credN = Number(c.amount_gbp);
            var covers =
              Number.isFinite(invAmtN) && Number.isFinite(credN) && credN + 1e-9 >= invAmtN;
            var label =
              (c.service_label ? String(c.service_label) + " · " : "") + (cAmt || "Credit");
            var sub = covers
              ? "Pays this invoice in full"
              : "Applies " +
                (cAmt || "") +
                "; £" +
                (Number.isFinite(invAmtN) && Number.isFinite(credN)
                  ? (invAmtN - credN).toFixed(2)
                  : "?") +
                " still due";
            return (
              '<button type="button" class="pp-btn pp-btn--primary" data-pp-apply-credit="' +
              esc(inv.id) +
              '" data-pp-credit-id="' +
              esc(c.id) +
              '">Use ' +
              esc(label) +
              "</button>" +
              '<p class="pp-muted pp-invoice-pay__note" style="margin:0">' +
              esc(sub) +
              "</p>"
            );
          })
          .join("") +
        "</div>";
    }
    var isPaid = status === "paid";
    var showDraftFlow =
      !isPaid &&
      status !== "void" &&
      (status === "unpaid" || status === "partial" || status === "pending_confirmation");
    var pdfActs = "";
    if (isPaid && pdf) {
      pdfActs =
        '<div class="pp-invoice-card__acts pp-invoice-card__acts--stack pp-invoice-card__acts--paid-only">' +
        '<a class="pp-btn pp-btn--primary pp-invoice-card__btn-full" href="' +
        esc(pdf) +
        '" download="' +
        esc((num || "invoice").replace(/[^\w.-]+/g, "_") + ".pdf") +
        '" target="_blank" rel="noopener noreferrer">' +
        invoiceBtnLabel("download", "Download PDF") +
        "</a>" +
        "</div>";
    } else if (showDraftFlow) {
      pdfActs =
        '<div class="pp-invoice-card__acts pp-invoice-card__acts--stack">' +
        (pdf
          ? '<button type="button" class="pp-btn pp-btn--primary pp-invoice-card__btn-full" data-pp-preview-invoice="' +
            esc(inv.id) +
            '" data-pp-pdf-url="' +
            esc(pdf) +
            '" data-pp-pdf-title="' +
            esc(num ? "Draft — " + num : "Draft invoice") +
            '">' +
            invoiceBtnLabel("preview", "Preview draft invoice") +
            "</button>"
          : '<p class="pp-muted">Draft invoice not available yet.</p>') +
        (canSetupGc
          ? '<button type="button" class="pp-btn pp-btn--primary pp-invoice-card__btn-full" data-pp-setup-gocardless="' +
            esc(inv.id) +
            '">' +
            invoiceBtnLabel("gocardless", "Set up Direct Payment") +
            "</button>"
          : "") +
        (!canSetupGc && gc && !isGcInvoice
          ? '<a class="pp-btn pp-btn--primary pp-invoice-card__btn-full" href="' +
            esc(gc) +
            '" target="_blank" rel="noopener noreferrer">' +
            invoiceBtnLabel("gocardless", "Pay with GoCardless") +
            "</a>"
          : "") +
        (pl
          ? '<a class="pp-btn pp-btn--ghost pp-invoice-card__btn-full" href="' +
            esc(pl) +
            '" target="_blank" rel="noopener noreferrer">' +
            invoiceBtnLabel(
              "card",
              "Card / Apple Pay link" + (cardCharge ? " · " + esc(cardCharge) : ""),
            ) +
            "</a>"
          : "") +
        (canPay
          ? '<button type="button" class="pp-btn pp-btn--sec pp-invoice-card__btn-full" data-pp-pay-invoice="' +
            esc(inv.id) +
            '">' +
            invoiceBtnLabel(
              "card",
              "Card / Apple Pay" + (cardCharge ? " · " + esc(cardCharge) : ""),
            ) +
            "</button>"
          : "") +
        "</div>";
    } else if (!pdf) {
      pdfActs = '<p class="pp-muted">PDF not available yet.</p>';
    }
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
      (subtitle
        ? '<p class="pp-invoice-card__meta">' + esc(subtitle) + "</p>"
        : "") +
      (amount
        ? '<p class="pp-invoice-card__amount">' +
          (schedule.length ? "Total " : "") +
          esc(amount) +
          (dueNow && (status === "partial" || status === "unpaid") && schedule.length
            ? " · Due now " + esc(dueNow)
            : "") +
          (paidSoFar ? " · Paid " + esc(paidSoFar) : "") +
          "</p>"
        : "") +
      (schedule.length && !isPaid
        ? '<ul class="pp-invoice-card__schedule pp-muted" style="margin:6px 0 0;padding-left:18px;font-size:12px">' +
          schedule
            .map(function (row) {
              var st = String(row.status || "").toLowerCase();
              var mark = st === "paid" ? "✓ " : "";
              return (
                "<li>" +
                mark +
                esc(row.label || "Payment") +
                " · " +
                esc(formatDocWhen(row.due_date)) +
                " · " +
                esc(formatInvoiceMoney(row.amount_gbp)) +
                "</li>"
              );
            })
            .join("") +
          "</ul>"
        : "") +
      (due ? '<p class="pp-invoice-card__meta muted">Due ' + esc(due) + "</p>" : "") +
      pendingNote +
      paidNote +
      (isPaid ? "" : isGcInvoice || isLaInvoice ? "" : invoiceBankPanelHtml(inv)) +
      (isPaid ? "" : creditHtml) +
      (isPaid
        ? ""
        : gcPending
          ? '<p class="pp-muted pp-invoice-pay__note">Direct Payment (GoCardless) — your mandate will collect this automatically around the due date. No bank transfer or card payment needed.</p>'
          : "") +
      (isPaid
        ? ""
        : isLaInvoice
          ? '<p class="pp-muted pp-invoice-pay__note">LA funded (VAT exempt) — the office invoices the local authority / funded provision. No parent card or bank transfer is needed here.</p>'
          : "") +
      (isPaid
        ? ""
        : canSetupGc
          ? '<p class="pp-muted pp-invoice-pay__note">Set up Direct Payment once — then invoices are collected automatically by mandate.</p>'
          : "") +
      pdfActs +
      (isPaid ? "" : cardFeeNote) +
      (isPaid
        ? ""
        : pl
          ? '<p class="pp-muted pp-invoice-pay__note">External card link may include a surcharge' +
            (surcharge ? ": " + esc(surcharge) : "") +
            ". Bank transfer is preferred (no fee).</p>"
          : "") +
      (isPaid
        ? ""
        : canReport
          ? '<div class="pp-invoice-report">' +
            '<label class="pp-invoice-report__label">Transfer reference (optional)' +
            '<input class="pp-invoice-report__input" type="text" data-pp-pay-ref="' +
            esc(inv.id) +
            '" value="' +
            esc(suggestedRef) +
            '" maxlength="120" autocomplete="off" /></label>' +
            '<button type="button" class="pp-btn pp-btn--primary pp-invoice-card__btn-full" data-pp-report-paid="' +
            esc(inv.id) +
            '">' +
            invoiceBtnLabel("bank", "I&apos;ve paid by bank transfer") +
            "</button>" +
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
        ". Prefer <strong>bank transfer</strong> (no fee). <strong>Direct Payment (GoCardless)</strong> collects automatically once set up. Card / Apple Pay adds a small processing fee.</p>" +
        '<div id="ppInvoicesNotice" class="pp-notice" hidden></div>' +
        '<div id="ppGocardlessSetupHost" class="pp-invoice-gc-setup" hidden></div>' +
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
        var gcMeta = (j && j.gocardless) || {};
        var gcHost = host.querySelector("#ppGocardlessSetupHost");
        var gcSetupOnCard = invoices.some(function (inv) {
          return !!(inv && inv.can_setup_gocardless);
        });
        if (gcHost) {
          if (gcMeta.mandate_active) {
            gcHost.hidden = false;
            gcHost.innerHTML =
              '<p class="pp-muted pp-invoice-pay__note">Direct Payment mandate is active. Upcoming invoices are collected automatically.</p>';
          } else if (gcMeta.setup_available && !gcSetupOnCard) {
            gcHost.hidden = false;
            gcHost.innerHTML =
              '<p class="pp-invoice-pay__title">Direct Payment (GoCardless)</p>' +
              '<p class="pp-muted pp-invoice-pay__note">Authorise once with your bank. We then collect each Direct Payment invoice on its due date.</p>' +
              '<button type="button" class="pp-btn pp-btn--primary" data-pp-setup-gocardless="">' +
              invoiceBtnLabel("gocardless", "Set up Direct Payment") +
              "</button>";
          } else {
            gcHost.hidden = true;
            gcHost.innerHTML = "";
          }
        }
        if (!invoices.length) {
          listHost.innerHTML =
            '<p class="pp-muted">No invoices shared yet for this participant.</p>';
          wireInvoiceActions();
          return;
        }
        listHost.innerHTML = invoices.map(invoiceCardHtml).join("");
        wireInvoiceActions();
        try {
          var pendingReturn = sessionStorage.getItem("pp_invoice_return_pending");
          if (pendingReturn) {
            var pendingInv = invoices.find(function (inv) {
              return String(inv.id) === String(pendingReturn);
            });
            var pendingPaid =
              pendingInv &&
              String(pendingInv.payment_status || "").toLowerCase() === "paid";
            if (pendingPaid) {
              sessionStorage.removeItem("pp_invoice_return_pending");
              sessionStorage.removeItem("pp_invoice_return_tries");
              showNotice(
                "success",
                "Payment received — " +
                  (pendingInv.invoice_number
                    ? "invoice " + pendingInv.invoice_number
                    : "invoice") +
                  " is marked paid. Open the PDF below.",
              );
              var paidCard = listHost.querySelector(
                '[data-invoice-id="' + String(pendingReturn).replace(/"/g, "") + '"]',
              );
              if (paidCard && typeof paidCard.scrollIntoView === "function") {
                paidCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            } else {
              var tries = Number(sessionStorage.getItem("pp_invoice_return_tries") || "0");
              if (tries < 5) {
                sessionStorage.setItem("pp_invoice_return_tries", String(tries + 1));
                global.setTimeout(function () {
                  void refreshList();
                }, 3000);
              } else {
                sessionStorage.removeItem("pp_invoice_return_pending");
                sessionStorage.removeItem("pp_invoice_return_tries");
                showNotice(
                  "info",
                  "We have not confirmed card or Apple Pay for this invoice yet. If payment completed, wait a minute and refresh. If it still shows Unpaid, contact the office with your receipt — we do not have it on file yet.",
                );
              }
            }
          }
          var gcFlash = sessionStorage.getItem("pp_gocardless_flash");
          if (gcFlash) {
            sessionStorage.removeItem("pp_gocardless_flash");
            if (gcFlash === "1") {
              showNotice(
                "success",
                "Thanks — if you finished bank authorisation, Direct Payment is being confirmed. Collections follow your invoice due dates.",
              );
            } else if (gcFlash === "cancel") {
              showNotice("info", "GoCardless setup was cancelled. You can try again anytime.");
            }
          }
        } catch (_eFlash) {}
      });
    }

    function openInvoicePreview(url, title) {
      closeInvoicePreview();
      var overlay = global.document.createElement("div");
      overlay.id = "ppInvoicePreviewOverlay";
      overlay.className = "pp-invoice-preview";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", title || "Invoice preview");
      overlay.innerHTML =
        '<div class="pp-invoice-preview__sheet">' +
        '<div class="pp-invoice-preview__bar">' +
        "<strong>" +
        esc(title || "Invoice") +
        "</strong>" +
        '<button type="button" class="pp-btn pp-btn--ghost pp-invoice-preview__close" data-pp-preview-close="1">Close</button>' +
        "</div>" +
        '<div class="pp-invoice-preview__frame-wrap">' +
        '<iframe class="pp-invoice-preview__frame" title="' +
        esc(title || "Invoice PDF") +
        '" src="' +
        esc(url) +
        '"></iframe>' +
        "</div>" +
        '<div class="pp-invoice-preview__foot">' +
        '<a class="pp-btn pp-btn--primary" href="' +
        esc(url) +
        '" download target="_blank" rel="noopener noreferrer">Download</a>' +
        '<button type="button" class="pp-btn pp-btn--ghost" data-pp-preview-close="1">Close</button>' +
        "</div></div>";
      global.document.body.appendChild(overlay);
      try {
        global.document.body.classList.add("pp-invoice-preview-open");
      } catch (_e) {}
      overlay.addEventListener("click", function (ev) {
        if (ev.target === overlay || (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-pp-preview-close"))) {
          closeInvoicePreview();
        }
      });
      var onKey = function (ev) {
        if (ev.key === "Escape") closeInvoicePreview();
      };
      overlay._ppKeyHandler = onKey;
      global.document.addEventListener("keydown", onKey);
    }

    function closeInvoicePreview() {
      var overlay = global.document.getElementById("ppInvoicePreviewOverlay");
      if (!overlay) return;
      if (overlay._ppKeyHandler) {
        global.document.removeEventListener("keydown", overlay._ppKeyHandler);
      }
      try {
        global.document.body.classList.remove("pp-invoice-preview-open");
      } catch (_e2) {}
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function wireInvoiceActions() {
      listHost.querySelectorAll("[data-pp-preview-invoice]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var url = btn.getAttribute("data-pp-pdf-url") || "";
          var title = btn.getAttribute("data-pp-pdf-title") || "Invoice";
          if (!url) return;
          openInvoicePreview(url, title);
        });
      });

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

      function navigateExternal(url) {
        if (!url) return false;
        try {
          var link = global.document.createElement("a");
          link.href = url;
          link.rel = "noopener noreferrer";
          link.style.display = "none";
          global.document.body.appendChild(link);
          link.click();
          if (link.parentNode) link.parentNode.removeChild(link);
          return true;
        } catch (_navA) {
          try {
            global.location.assign(url);
            return true;
          } catch (_navB) {
            global.location.href = url;
            return true;
          }
        }
      }

      function runGocardlessSetup(btn, invoiceId) {
        if (typeof opts.startGocardlessSetup !== "function") {
          showNotice(
            "error",
            "Direct Payment is not available on this page — refresh and try again.",
          );
          return;
        }
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        showNotice("info", "Opening GoCardless to set up Direct Payment…");
        void opts
          .startGocardlessSetup(invoiceId || "")
          .then(function (j) {
            var url =
              (j && j.authorisation_url) ||
              (j && j.url) ||
              (j && j.data && j.data.authorisation_url) ||
              "";
            if (url) {
              if (!navigateExternal(url)) throw new Error("no_url");
              return;
            }
            if (j && j.already_mandated) {
              showNotice(
                "success",
                (j && j.message) ||
                  "Direct Payment mandate is active. Collections are scheduled where needed.",
              );
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
              return refreshList();
            }
            throw new Error("no_url");
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            var code = err && err.code ? String(err.code) : "";
            var msg =
              (err && err.messageText) ||
              (code === "gocardless_not_configured"
                ? "Direct Payment is not available yet. Contact the office."
                : "Could not start GoCardless setup — please try again or contact the office.");
            showNotice("error", msg);
          });
      }

      listHost.querySelectorAll("[data-pp-setup-gocardless]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          runGocardlessSetup(btn, btn.getAttribute("data-pp-setup-gocardless") || "");
        });
      });
      var gcHost = host.querySelector("#ppGocardlessSetupHost");
      if (gcHost) {
        gcHost.querySelectorAll("[data-pp-setup-gocardless]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            runGocardlessSetup(btn, btn.getAttribute("data-pp-setup-gocardless") || "");
          });
        });
      }

      listHost.querySelectorAll("[data-pp-apply-credit]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var invId = btn.getAttribute("data-pp-apply-credit");
          var creditId = btn.getAttribute("data-pp-credit-id");
          if (!invId || !creditId || typeof opts.applyCreditToInvoice !== "function") return;
          if (
            !global.confirm(
              "Apply this credit to the invoice? If the credit is less than the invoice, the rest stays due (bank transfer or card).",
            )
          ) {
            return;
          }
          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");
          void opts
            .applyCreditToInvoice(invId, creditId)
            .then(function (j) {
              if (j && j.partial) {
                showNotice(
                  "success",
                  "Credit applied (£" +
                    Number(j.applied_gbp).toFixed(2) +
                    "). £" +
                    Number(j.remaining_gbp).toFixed(2) +
                    " still due.",
                );
              } else {
                showNotice("success", "Credit applied — invoice marked paid.");
              }
              return refreshList();
            })
            .catch(function (err) {
              btn.disabled = false;
              btn.removeAttribute("aria-busy");
              var code = err && err.code ? String(err.code) : "";
              var msg =
                (err && err.messageText) ||
                (code === "already_paid"
                  ? "This invoice is already paid."
                  : "Could not apply credit — please try again or contact the office.");
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
    if (opts && typeof opts.activityPing === "function") {
      var pingView =
        view === "documents" || view === "consents"
          ? "consents"
          : view === "achievements"
            ? "photos"
            : view || "hub";
      opts.activityPing(pingView);
    }
    if (view === "general") {
      void ensureGeneralFieldsAsync(data).then(function () {
        renderGeneral(host, data, opts);
      });
    }     else if (view === "sessions") renderSessions(host, data, opts);
    else if (view === "achievements") renderAchievements(host, data, opts);
    else if (view === "swim") renderSwim(host, data, opts);
    else if (view === "weekly_notes") renderWeeklyNotes(host, data, opts);
    else if (view === "announcements") renderAnnouncements(host, data, opts);
    else if (view === "team") renderTeam(host, data, opts);
    else if (view === "booking") renderBooking(host, data, opts);
    else if (view === "calendar") renderCalendar(host, data, opts);
    else if (view === "absence") renderAbsence(host, data, opts);
    else if (view === "balance") renderBalance(host, data, opts);
    else if (view === "invoices") {
      if (!showInvoicesForParticipant(data)) {
        // LA / NHS club-invoiced: no invoice surface — send them to booking instead.
        openSubview(host, data, opts, "booking", viewOpts || {});
        return;
      }
      renderInvoices(host, data, opts);
    }
    else if (view === "documents" || view === "consents") renderConsents(host, data, opts);
    else if (view === "messages") {
      var msgOpts = opts || {};
      if (viewOpts.prefillMessage) {
        msgOpts = Object.assign({}, opts, { prefillMessage: viewOpts.prefillMessage });
      }
      renderMessages(host, data, msgOpts);
    }
  }

  function bindHubOpenButtons(host, data, opts) {
    var sectionByView = {
      sessions: "sessions",
      achievements: "achievements",
      swim: "swim",
      weekly_notes: "weekly_notes",
    };
    host.querySelectorAll("[data-pp-open]").forEach(function (btn) {
      if (btn.__ppBoundOpen) return;
      btn.__ppBoundOpen = true;
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

  function bindHub(host, data, opts) {
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
    host.querySelectorAll("[data-pp-open-contact]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (opts && typeof opts.openContactDetails === "function") opts.openContactDetails();
      });
    });
    bindHubOpenButtons(host, data, opts);
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
