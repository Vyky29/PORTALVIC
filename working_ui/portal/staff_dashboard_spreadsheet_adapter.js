(function () {
  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function parseHm(token) {
    const t = String(token || "").trim();
    if (!t) return { h: 0, m: 0 };
    const colonIdx = t.indexOf(":");
    if (colonIdx >= 0) {
      return {
        h: parseInt(t.slice(0, colonIdx), 10) || 0,
        m: parseInt(t.slice(colonIdx + 1), 10) || 0,
      };
    }
    const parts = t.split(".");
    return {
      h: parseInt(parts[0], 10) || 0,
      m: parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0,
    };
  }

  function hourTo24(hour, day) {
    if (day !== "Sunday" && hour < 8) return hour + 12;
    if (day === "Sunday" && hour >= 1 && hour <= 7) return hour + 12;
    return hour;
  }

  function parseTimeSlot(timeSlot, day) {
    const normalized = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = normalized.split(/\s+to\s+/i);
    if (parts.length < 2) {
      return { start: "16:00", end: "16:30" };
    }
    const a = parseHm(parts[0]);
    const b = parseHm(parts[1]);
    const ah = hourTo24(a.h, day);
    const bh = hourTo24(b.h, day);
    const start = `${String(ah).padStart(2, "0")}:${String(a.m).padStart(2, "0")}`;
    const end = `${String(bh).padStart(2, "0")}:${String(b.m).padStart(2, "0")}`;
    return { start, end };
  }

  function dayNameToday() {
    return new Date().toLocaleDateString("en-GB", { weekday: "long" });
  }

  function normalizePersonId(value) {
    const v = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    if (!v) return "";
    if (v === "yousef" || v === "youssef" || v === "yusef") return "youssef";
    if (v === "luliya") return "lulia";
    if (v === "aida") return "lulia";
    return v;
  }

  /** Apply dated sunday overrides (e.g. BISMARK → JAVI cover on 2026-06-21). */
  function resolveInstructorsForSessionDate(instructorsRaw, sessionDate, source) {
    var raw = String(instructorsRaw || "").trim();
    var iso = String(sessionDate || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return raw;
    var overrides =
      source && source.sundayDateOverrides ? source.sundayDateOverrides : null;
    var day = overrides && overrides[iso] ? overrides[iso] : null;
    var map = day && day.replaceInstructor ? day.replaceInstructor : null;
    if (!map) return raw;
    var out = raw;
    Object.keys(map).forEach(function (fromKey) {
      var to = String(map[fromKey] || "").trim();
      if (!fromKey || !to) return;
      var re = new RegExp(
        String(fromKey).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi"
      );
      out = out.replace(re, to);
    });
    return out;
  }

  /** Instructor tokens on a row → canonical `staffProfiles` keys (one session row per key). */
  function instructorProfileKeysForRow(instructorsRaw, profiles) {
    const keys = Object.keys(profiles || {});
    const parts = String(instructorsRaw || "")
      .split(/,|\/|&|\band\b/gi)
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < parts.length; i++) {
      const n = normalizePersonId(parts[i]);
      if (!n) continue;
      let hit = keys.find((k) => normalizePersonId(k) === n);
      if (!hit && n === "yusef") {
        hit = keys.find((k) => String(k).toLowerCase() === "youssef");
      }
      if (hit && !seen.has(hit)) {
        seen.add(hit);
        out.push(hit);
      }
    }
    return out;
  }

  const EMPTY_NOTE = {
    name: "",
    generalLead: "",
    generalInfoSheet: "",
    avatarFile: "",
    bespokeSchedule: "",
    goals: [],
    communication: "",
    medical: "",
    gender: "",
    hasMedicalAlert: false,
    sessionFocus: "",
    progressNotes: "",
    homePractice: "",
  };

  /** Best-effort gender from the profile text (pronouns). Returns 'm', 'f' or ''. */
  function deriveGenderFromInfo(text) {
    const t = String(text || "").toLowerCase();
    if (!t) return "";
    const hits = function (re) {
      const m = t.match(re);
      return m ? m.length : 0;
    };
    const female =
      hits(/\bshe\b/g) +
      hits(/\bher\b/g) +
      hits(/\bhers\b/g) +
      hits(/\bherself\b/g) +
      hits(/\bfemale\b/g) +
      hits(/\bgirl\b/g) +
      hits(/\bdaughter\b/g);
    const male =
      hits(/\bhe\b/g) +
      hits(/\bhis\b/g) +
      hits(/\bhim\b/g) +
      hits(/\bhimself\b/g) +
      hits(/\bmale\b/g) +
      hits(/\bboy\b/g) +
      hits(/\bson\b/g);
    if (female > male && female > 0) return "f";
    if (male > female && male > 0) return "m";
    return "";
  }

  /** True when the profile text lists a real medical condition (not "none"). */
  function deriveMedicalAlertFromInfo(text) {
    const t = String(text || "");
    if (!t) return false;
    const m = t.match(/Medical\s*:?\s*([\s\S]*?)(?:\s*\d+\s*[.)]\s|$)/i);
    if (!m) return false;
    const seg = String(m[1] || "").trim().toLowerCase();
    if (!seg) return false;
    if (
      /^(none|nil|n\/?a|no\b|not\s|unknown|no known|no medical|no current)/.test(
        seg
      )
    ) {
      return false;
    }
    return true;
  }

  function normGenderValue(v) {
    v = String(v || "").trim().toLowerCase();
    if (v === "m" || v === "male" || v === "boy") return "m";
    if (v === "f" || v === "female" || v === "girl") return "f";
    return "";
  }

  function genderOverrideFor(slug, name) {
    try {
      var map =
        (typeof window !== "undefined" && window.PORTAL_CLIENT_GENDER_OVERRIDES) ||
        {};
      var nameLower = String(name || "").trim().toLowerCase();
      var firstName = nameLower.split(/\s+/)[0] || "";
      var hit =
        normGenderValue(map[slug]) ||
        normGenderValue(map[nameLower]) ||
        normGenderValue(map[firstName]);
      if (hit) return hit;
    } catch (_) {}
    return "";
  }

  /**
   * Ah brothers are separate participants — never alias across:
   * amaar_ah, aydaan_ah (Aydan), adaam_ah.
   */
  var ROSTER_PARTICIPANT_SPELLING_ALIASES = {
    aadam_ah: "adaam_ah",
    abodi_p: "abodi_pa",
    adam_pi: "adam_p",
    amar_ra: "amar_rai",
    sammer: "samer",
    rayan_tapa: "rayan_ta",
    steven_ces: "steven",
    steven_c: "steven",
    steven_ce: "steven",
    yusuf: "yusuf_ah",
    yusef: "yusuf_ah",
    // Worker display label is "Eddie Mc"; collapse its slug back to the roster id "eddie".
    eddie_mc: "eddie",
  };

  /** Roster participant id slug aliases (not clients_info sheet; not Ah brothers). */
  var CLIENT_INFO_SLUG_ALIASES = {
    adam_a: "adam_ab",
    abodi: "abodi_pa",
    junaid: "junaid_f",
    khalid_ab: "khalid",
    rayyan_fi: "rayyan_f",
    chaitanya_trial_28_06: "chaitanya",
  };

  /** clients_info sheet lookup only — must not change roster clientId / portal_session_key. */
  var CLIENT_INFO_SHEET_ALIASES = {
    rayan_tapa: "rayan_ta",
    aadam_ah: "adaam_ah",
  };

  function rosterParticipantSlugAlias(slug) {
    const s = String(slug || "").trim();
    if (!s) return s;
    return ROSTER_PARTICIPANT_SPELLING_ALIASES[s] || CLIENT_INFO_SLUG_ALIASES[s] || s;
  }

  function canonicalParticipantClientId(nameRaw) {
    const slug = slugify(String(nameRaw || "").trim());
    if (!slug) return slug;
    return rosterParticipantSlugAlias(slug);
  }

  var _workerDisplayBySlugCache = null;

  /** Worker dashboard short labels — one name per participant slug (Clients Info + roster). */
  function buildWorkerDisplayNameBySlug() {
    const map = Object.create(null);
    function put(slug, name) {
      const canon = rosterParticipantSlugAlias(String(slug || "").trim());
      const label = String(name || "").trim();
      if (!canon || !label || isParticipantCatalogExcludedName(label)) return;
      if (!map[canon]) map[canon] = label;
    }
    put("aadam_ah", "Adaam Ah");
    put("eddie_mc", "Eddie Mc");
    put("eddie", "Eddie Mc");
    try {
      const rows =
        typeof window !== "undefined" && Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS)
          ? window.PORTAL_CLIENTS_INFO_ROWS
          : [];
      for (let i = 0; i < rows.length; i++) {
        const nm = String(rows[i] && rows[i].client_name || "").trim();
        if (nm) put(slugify(nm), nm);
      }
    } catch (_) {}
    try {
      const src =
        typeof window !== "undefined" && window.STAFF_DASHBOARD_SOURCE
          ? window.STAFF_DASHBOARD_SOURCE
          : null;
      const roster = src && Array.isArray(src.rows) ? src.rows : [];
      for (let j = 0; j < roster.length; j++) {
        const nm2 = String(roster[j] && roster[j].client_name || "").trim();
        if (nm2) put(canonicalParticipantClientId(nm2), nm2);
      }
    } catch (_2) {}
    return map;
  }

  function workerDisplayNameBySlug() {
    if (!_workerDisplayBySlugCache) {
      _workerDisplayBySlugCache = buildWorkerDisplayNameBySlug();
    }
    return _workerDisplayBySlugCache;
  }

  function resetWorkerDisplayNameCache() {
    _workerDisplayBySlugCache = null;
  }

  /** Canonical worker-facing label for dashboards and session_feedback.client_name. */
  function resolveWorkerDisplayName(nameRaw, clientIdRaw) {
    const cid = rosterParticipantSlugAlias(
      slugify(String(clientIdRaw || "").trim()) || slugify(String(nameRaw || "").trim())
    );
    const map = workerDisplayNameBySlug();
    if (cid && map[cid]) return map[cid];
    const name = String(nameRaw || "").trim();
    if (name && !isParticipantCatalogExcludedName(name)) return name;
    if (cid) {
      return cid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "";
  }

  function normalizeWorkerClientName(nameRaw, clientIdRaw) {
    return resolveWorkerDisplayName(nameRaw, clientIdRaw);
  }

  function isParticipantCatalogExcludedName(nameRaw) {
    const n = String(nameRaw || "").trim().toLowerCase();
    return !n || n === "closed" || n === "acat" || n === "acat group";
  }

  function clientInfoLookupKeys(nameOrSlug) {
    const raw = String(nameOrSlug || "").trim();
    const keys = [];
    const seen = new Set();
    const add = function (k) {
      k = String(k || "").trim();
      if (!k || seen.has(k)) return;
      seen.add(k);
      keys.push(k);
    };
    add(slugify(raw));
    const parts = raw.replace(/_/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      add(slugify(first + " " + last));
      add(slugify(first + " " + last.charAt(0)));
      if (last.length >= 2) {
        add(slugify(first + " " + last.slice(0, 2)));
      }
    } else if (parts.length === 1) {
      add(slugify(parts[0]));
    }
    return keys;
  }

  function buildClientsInfoBySlug(rows) {
    const bySlug = new Map();
    const list = Array.isArray(rows) ? rows : [];
    list.forEach((r) => {
      const txt = String(r.client_info || "").trim();
      if (!txt) return;
      clientInfoLookupKeys(r.client_name || "").forEach(function (k) {
        if (k && !bySlug.has(k)) bySlug.set(k, txt);
      });
    });
    return bySlug;
  }

  function clientsInfoRowsFromWindow() {
    if (typeof window === "undefined") return [];
    if (Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS)) {
      return window.PORTAL_CLIENTS_INFO_ROWS;
    }
    return [];
  }

  function lookupClientInfoText(clientId, displayName) {
    const slug = String(clientId || "").trim();
    const bySlug = buildClientsInfoBySlug(clientsInfoRowsFromWindow());
    if (!bySlug.size) return "";
    return clientInfoTextForSlug(bySlug, slug, displayName || slug);
  }

  function applyClientsInfoMerge(clientNotesById) {
    if (!clientNotesById || typeof clientNotesById !== "object") return;
    mergeClientsInfoRows(clientNotesById, clientsInfoRowsFromWindow());
  }

  function clientInfoTextForSlug(bySlug, slug, displayName) {
    const tryKeys = [];
    const seen = new Set();
    const addKey = function (k) {
      k = String(k || "").trim();
      if (!k || seen.has(k)) return;
      seen.add(k);
      tryKeys.push(k);
    };
    clientInfoLookupKeys(displayName || "").forEach(addKey);
    clientInfoLookupKeys(slug || "").forEach(addKey);
    addKey(slug);
    for (let i = 0; i < tryKeys.length; i++) {
      const hit = bySlug.get(tryKeys[i]);
      if (hit) return hit;
    }
    const sheetAlias = CLIENT_INFO_SHEET_ALIASES[slug];
    if (sheetAlias) return bySlug.get(sheetAlias) || "";
    const alias = CLIENT_INFO_SLUG_ALIASES[slug];
    if (alias) return bySlug.get(alias) || "";
    for (const key in CLIENT_INFO_SHEET_ALIASES) {
      if (
        Object.prototype.hasOwnProperty.call(CLIENT_INFO_SHEET_ALIASES, key) &&
        CLIENT_INFO_SHEET_ALIASES[key] === slug
      ) {
        const hit = bySlug.get(key);
        if (hit) return hit;
      }
    }
    for (const key in CLIENT_INFO_SLUG_ALIASES) {
      if (
        Object.prototype.hasOwnProperty.call(CLIENT_INFO_SLUG_ALIASES, key) &&
        CLIENT_INFO_SLUG_ALIASES[key] === slug
      ) {
        const hit = bySlug.get(key);
        if (hit) return hit;
      }
    }
    return "";
  }

  function mergeClientsInfoRows(clientNotesById, rows) {
    const list = Array.isArray(rows) ? rows : [];
    const bySlug = new Map();
    list.forEach((r) => {
      const txt = String(r.client_info || "").trim();
      if (!txt) return;
      clientInfoLookupKeys(r.client_name || "").forEach(function (k) {
        if (k && !bySlug.has(k)) bySlug.set(k, txt);
      });
    });
    Object.keys(clientNotesById).forEach((k) => {
      if (k === "available" || k === "closed") return;
      const note = clientNotesById[k];
      if (!note) return;
      const t = clientInfoTextForSlug(bySlug, k, note.name || k);
      if (t) note.generalInfoSheet = t;
      const infoText = t || note.generalInfoSheet || "";
      const ovGender = genderOverrideFor(k, note.name);
      note.gender = ovGender || deriveGenderFromInfo(infoText) || note.gender || "";
      if (!note.hasMedicalAlert) {
        note.hasMedicalAlert = deriveMedicalAlertFromInfo(infoText);
      }
    });
  }

  /** Every real client on any roster row (any instructor): powers ALL CLIENTS without changing MY CLIENTS logic. */
  function collapseAliasParticipantNotes(clientNotesById) {
    if (!clientNotesById || typeof clientNotesById !== "object") return;
    var mergeAliases = Object.assign({}, ROSTER_PARTICIPANT_SPELLING_ALIASES, CLIENT_INFO_SLUG_ALIASES);
    Object.keys(mergeAliases).forEach(function (alias) {
      var canon = mergeAliases[alias];
      if (!alias || !canon || alias === canon) return;
      var from = clientNotesById[alias];
      if (!from) return;
      if (!clientNotesById[canon]) {
        clientNotesById[canon] = from;
      } else {
        var to = clientNotesById[canon];
        if (!String(to.gender || "").trim() && String(from.gender || "").trim()) {
          to.gender = from.gender;
        }
        if (!String(to.generalInfoSheet || "").trim() && String(from.generalInfoSheet || "").trim()) {
          to.generalInfoSheet = from.generalInfoSheet;
        }
      }
      delete clientNotesById[alias];
    });
  }

  function remapSessionsToCanonicalClientIds(sessionsModel, clientNotesById) {
    if (!Array.isArray(sessionsModel)) return;
    sessionsModel.forEach(function (s) {
      if (!s || !s.clientId) return;
      var canon = rosterParticipantSlugAlias(s.clientId);
      if (canon && canon !== s.clientId && clientNotesById[canon]) s.clientId = canon;
    });
  }

  function mergeCompanyClientsFromRosterRows(clientNotesById, rows) {
    const list = Array.isArray(rows) ? rows : [];
    list.forEach((row) => {
      const nameRaw = normalizeWorkerClientName(String(row.client_name || "").trim(), row.client_name);
      const nameLower = nameRaw.toLowerCase();
      if (!nameRaw || nameLower === "closed" || isParticipantCatalogExcludedName(nameRaw)) return;
      const clientId = canonicalParticipantClientId(nameRaw);
      if (!clientId || clientId === "closed" || clientId === "available") return;
      if (clientNotesById[clientId]) return;
      const rosterService = String(row.service || "").trim();
      const rosterArea =
        row.area !== undefined && row.area !== null ? String(row.area).trim() : "";
      const venue = String(row.venue || "").trim();
      clientNotesById[clientId] = Object.assign({}, EMPTY_NOTE, {
        name: nameRaw,
        generalLead: `${venue} · ${rosterService || rosterArea || ""}`.trim(),
      });
    });
  }

  function buildForStaff(source, staffIdForMatch, staffIdStored) {
    const rows = Array.isArray(source && source.rows) ? source.rows : [];
    const sessionsModel = [];
    const clientNotesById = {};
    const profiles = (source && source.staffProfiles) || {};
    const wanted = normalizePersonId(staffIdForMatch);
    const stored =
      staffIdStored != null && String(staffIdStored).trim()
        ? String(staffIdStored).trim().toLowerCase()
        : null;

    rows.forEach((row) => {
      const sessionDate = String(row.session_date || row.date || "").trim().slice(0, 10);
      const instructorsResolved = resolveInstructorsForSessionDate(
        row.instructors,
        sessionDate,
        source
      );
      const targets = instructorProfileKeysForRow(instructorsResolved, profiles);
      if (!targets.some((k) => normalizePersonId(k) === wanted)) return;

      const nameRaw = normalizeWorkerClientName(String(row.client_name || "").trim(), row.client_name);
      const nameLower = nameRaw.toLowerCase();
      const isClosed = nameLower === "closed";
      const isOpenSlot =
        !nameRaw ||
        nameLower === "no client" ||
        nameLower === "no participant" ||
        nameLower === "noclient" ||
        nameLower === "no_participant";
      const timeSlotLabel = String(row.time_slot || "").trim();
      const rosterService = String(row.service || "").trim();
      const rosterArea =
        row.area !== undefined && row.area !== null ? String(row.area).trim() : "";
      const isHomeSlot =
        nameLower === "casa" ||
        nameLower === "home" ||
        String(rosterArea || "").trim().toUpperCase() === "HOME";
      const isManagerSlot = nameLower === "manager";
      const venue = String(row.venue || "").trim();
      const day = String(row.day || "").trim();

      if (sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) && nameRaw) {
        const startMap =
          (typeof window !== "undefined" &&
            window.STAFF_DASHBOARD_SOURCE &&
            window.STAFF_DASHBOARD_SOURCE.clientRosterStartDates) ||
          null;
        if (startMap) {
          const slug = nameRaw.toLowerCase();
          const slugNorm = slug === "timmy" ? "timi" : slug;
          let startIso = startMap[nameRaw] || startMap[slug] || startMap[slugNorm] || "";
          if (!startIso) {
            for (const k of Object.keys(startMap)) {
              const kl = String(k).trim().toLowerCase();
              if (kl === slug || kl === slugNorm) {
                startIso = startMap[k];
                break;
              }
            }
          }
          startIso = String(startIso || "").trim().slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(startIso) && sessionDate < startIso) return;
        }
      }

      const selfKey =
        targets.find((k) => normalizePersonId(k) === wanted) ||
        String(staffIdForMatch || "").trim().toLowerCase();
      const staffKeyOut = stored || String(selfKey).toLowerCase();

      if (
        sessionDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) &&
        typeof window !== "undefined" &&
        window.PortalTermCalendarDashboard &&
        typeof window.PortalTermCalendarDashboard.staffSessionServiceActiveOnDate === "function" &&
        !window.PortalTermCalendarDashboard.staffSessionServiceActiveOnDate(
          staffKeyOut,
          { rosterService, service: rosterService },
          sessionDate
        )
      ) {
        return;
      }

      if (!timeSlotLabel && !nameRaw && !rosterService && !rosterArea) return;

      const t = parseTimeSlot(row.time_slot, row.day);

      const baseSession = {
        staffId: staffKeyOut,
        day,
        start: t.start,
        end: t.end,
        venue,
        rosterService,
        rosterArea,
        timeSlotLabel,
      };
      const instructorsRaw = String(row.instructors || "").trim();
      if (
        instructorsRaw &&
        instructorsResolved &&
        normalizePersonId(instructorsRaw) !== normalizePersonId(instructorsResolved)
      ) {
        baseSession.__portalSundayInstructorCover = true;
        baseSession.__portalRosterInstructorBeforeOverride = instructorsRaw;
      }
      if (sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        baseSession.session_date = sessionDate;
      }
      if (row.__portal_roster_time_updated) {
        baseSession.portalRosterTimeUpdated = true;
      }
      if (row.__portal_roster_row_id) {
        baseSession.__portal_roster_row_id = row.__portal_roster_row_id;
      }

      if (isClosed) {
        sessionsModel.push(
          Object.assign({}, baseSession, {
            clientId: "closed",
            activity: "",
            status: "closed",
          })
        );
        return;
      }

      if (isHomeSlot || isManagerSlot) {
        const dutyId = isHomeSlot ? "home" : "manager";
        const dutyName = isHomeSlot ? "HOME" : "MANAGER";
        const dutyArea = isHomeSlot ? "HOME" : "Hub Room";
        sessionsModel.push(
          Object.assign({}, baseSession, {
            clientId: dutyId,
            activity: rosterService || "Day Centre",
            status: dutyId,
            rosterArea: dutyArea,
          })
        );
        if (!clientNotesById[dutyId]) {
          clientNotesById[dutyId] = Object.assign({}, EMPTY_NOTE, {
            name: dutyName,
            generalLead: `${venue} · ${rosterService || "Day Centre"}`.trim(),
          });
        }
        return;
      }

      if (isOpenSlot) {
        if (!timeSlotLabel) return;
        sessionsModel.push(
          Object.assign({}, baseSession, {
            clientId: "available",
            activity: rosterService || "Swimming",
            status: "available",
          })
        );
        return;
      }

      if (!nameRaw) {
        if (!timeSlotLabel) return;
        sessionsModel.push(
          Object.assign({}, baseSession, {
            clientId: "available",
            activity: rosterService || "Swimming",
            status: "available",
          })
        );
        return;
      }

      const clientId = canonicalParticipantClientId(nameRaw);
      sessionsModel.push(
        Object.assign({}, baseSession, {
          clientId,
          activity: rosterService || "Swimming",
          status: "scheduled",
        })
      );

      if (!clientNotesById[clientId]) {
        clientNotesById[clientId] = Object.assign({}, EMPTY_NOTE, {
          name: nameRaw,
          generalLead: `${venue} · ${rosterService || rosterArea || ""}`.trim(),
        });
      }
    });

    if (!clientNotesById.available) {
      clientNotesById.available = Object.assign({}, EMPTY_NOTE, {
        name: "NO PARTICIPANT",
        generalLead: "Open roster slot — new clients welcome",
      });
    }

    sessionsModel.sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      return a.start.localeCompare(b.start);
    });

    const seenSessions = Object.create(null);
    const dedupedSessions = [];
    sessionsModel.forEach((sess) => {
      const sd = String(sess.session_date || "").trim().slice(0, 10);
      const key = [
        sd,
        String(sess.day || "").trim(),
        String(sess.start || "").trim(),
        String(sess.end || "").trim(),
        String(sess.venue || "").trim().toLowerCase(),
        String(sess.clientId || "").trim().toLowerCase(),
        String(sess.staffId || "").trim().toLowerCase(),
      ].join("\0");
      if (key && seenSessions[key]) return;
      if (key) seenSessions[key] = true;
      dedupedSessions.push(sess);
    });

    return { sessionsModel: dedupedSessions, clientNotesById };
  }

  function bootstrap(options) {
    const source = (options && options.source) || window.STAFF_DASHBOARD_SOURCE || {};
    const rawId = String((options && options.staffId) || "").trim().toLowerCase();
    const profiles = (source && source.staffProfiles) || {};
    const profile = profiles[rawId] || {};

    const isDemoAcct = rawId === "teflon";
    const effectiveRowStaffId = isDemoAcct ? "teflon" : rawId;
    const built = buildForStaff(source, effectiveRowStaffId, isDemoAcct ? "teflon" : null);
    const allRows = Array.isArray(source && source.rows) ? source.rows : [];
    mergeCompanyClientsFromRosterRows(built.clientNotesById, allRows);

    let clientsInfo = (source && source.clientsInfo) || [];
    if (
      (!clientsInfo || !clientsInfo.length) &&
      typeof window !== "undefined" &&
      Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS)
    ) {
      clientsInfo = window.PORTAL_CLIENTS_INFO_ROWS;
    }
    mergeClientsInfoRows(built.clientNotesById, clientsInfo);
    collapseAliasParticipantNotes(built.clientNotesById);
    remapSessionsToCanonicalClientIds(built.sessionsModel, built.clientNotesById);

    return {
      staffName: profile.staffName || rawId || "Staff",
      avatarFile: profile.avatarFile || "",
      staffRoleTrack: profile.staffRoleTrack || "swimming",
      defaultViewDay: isDemoAcct ? "Monday" : dayNameToday(),
      sessionsModel: built.sessionsModel,
      clientNotesById: built.clientNotesById,
    };
  }

  window.StaffDashboardSpreadsheetAdapter = {
    bootstrap: bootstrap,
    lookupClientInfoText: lookupClientInfoText,
    applyClientsInfoMerge: applyClientsInfoMerge,
    canonicalParticipantClientId: canonicalParticipantClientId,
    resolveWorkerDisplayName: resolveWorkerDisplayName,
    normalizeWorkerClientName: normalizeWorkerClientName,
    resetWorkerDisplayNameCache: resetWorkerDisplayNameCache,
    isParticipantCatalogExcludedName: isParticipantCatalogExcludedName,
    parseTimeSlot: parseTimeSlot,
  };
})();
