/**
 * Participant directory — dedupe tiles, exclude roster group rows (ACAT), merge profile fields.
 */
(function (global) {
  "use strict";

  var EXCLUDE_IDS = { closed: true, available: true, acat: true, home: true, manager: true };
  var EXCLUDE_NAME_RE = /^(acat|acat group|home|manager)$/i;

  function normalizeParticipantDisplayName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function collapseRepeatedLetters(name) {
    return String(name || "").replace(/(.)\1+/gi, "$1");
  }

  function isParticipantCatalogExcluded(clientId, name) {
    var id = String(clientId || "").trim().toLowerCase();
    if (EXCLUDE_IDS[id]) return true;
    var n = normalizeParticipantDisplayName(name);
    if (!n) return true;
    if (EXCLUDE_NAME_RE.test(n)) return true;
    return false;
  }

  function participantCatalogMergeKey(name, clientId, photoUrlFn) {
    var photo = "";
    try {
      if (typeof photoUrlFn === "function") {
        photo = String(photoUrlFn(name, clientId) || "").trim();
      }
    } catch (_) {}
    if (photo) return "photo:" + photo.toLowerCase();
    var norm = normalizeParticipantDisplayName(name);
    return "name:" + collapseRepeatedLetters(norm);
  }

  function mergeCatalogNoteFields(clientNotesById, groupIds, pickId) {
    var note = clientNotesById[pickId];
    if (!note || !groupIds || groupIds.length < 2) return;
    if (!String(note.gender || "").trim()) {
      for (var i = 0; i < groupIds.length; i++) {
        var alt = clientNotesById[groupIds[i]];
        var g = alt && String(alt.gender || "").trim();
        if (g) {
          note.gender = g;
          break;
        }
      }
    }
    if (!String(note.generalInfoSheet || "").trim()) {
      for (var j = 0; j < groupIds.length; j++) {
        var alt2 = clientNotesById[groupIds[j]];
        var sheet = alt2 && String(alt2.generalInfoSheet || "").trim();
        if (sheet) {
          note.generalInfoSheet = sheet;
          break;
        }
      }
    }
  }

  /**
   * @param {string[]} ids
   * @param {{ clientNotesById: object, photoUrl?: function, score?: function }} opts
   */
  function portalDedupeParticipantClientIds(ids, opts) {
    opts = opts || {};
    var notes = opts.clientNotesById || {};
    var photoUrlFn = opts.photoUrl;
    var scoreFn =
      typeof opts.score === "function"
        ? opts.score
        : function () {
            return 0;
          };
    var groups = new Map();
    (Array.isArray(ids) ? ids : []).forEach(function (clientId) {
      var c = notes[clientId];
      if (!c) return;
      if (isParticipantCatalogExcluded(clientId, c.name)) return;
      var key = participantCatalogMergeKey(c.name, clientId, photoUrlFn);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(clientId);
    });
    var out = [];
    groups.forEach(function (groupIds) {
      var pick = groupIds
        .slice()
        .sort(function (a, b) {
          return scoreFn(b) - scoreFn(a);
        })[0];
      mergeCatalogNoteFields(notes, groupIds, pick);
      out.push(pick);
    });
    return out;
  }

  function portalFilterParticipantCatalogIds(ids, clientNotesById) {
    return (Array.isArray(ids) ? ids : []).filter(function (clientId) {
      var c = clientNotesById && clientNotesById[clientId];
      return !isParticipantCatalogExcluded(clientId, c && c.name);
    });
  }

  /** One tile/row per participant when linked services share the same day (e.g. Yusuf aquatic + MA). */
  function portalDedupeParticipantListEntries(entries, photoUrlFn) {
    var seen = new Set();
    var out = [];
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      if (!entry) return;
      var key = participantCatalogMergeKey(entry.name, entry.clientId, photoUrlFn);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(entry);
    });
    return out;
  }

  global.portalNormalizeParticipantDisplayName = normalizeParticipantDisplayName;
  global.portalIsParticipantCatalogExcluded = isParticipantCatalogExcluded;
  global.portalDedupeParticipantClientIds = portalDedupeParticipantClientIds;
  global.portalFilterParticipantCatalogIds = portalFilterParticipantCatalogIds;
  global.portalDedupeParticipantListEntries = portalDedupeParticipantListEntries;
})(typeof window !== "undefined" ? window : globalThis);
