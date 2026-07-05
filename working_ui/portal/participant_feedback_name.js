/**
 * Browser mirror of supabase/functions/_shared/participant_feedback_name.ts
 */
(function (global) {
  "use strict";

  var NAME_ALIASES = {
    yusuf: ["yousef", "yousuf", "yosuf", "yusef"],
  };

  function clean(v, max) {
    max = max || 4000;
    return String(v == null ? "" : v)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function normalizeNameKey(s) {
    return clean(s, 80)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var row = new Array(b.length + 1);
    var i, j, prev, tmp, cost;
    for (j = 0; j <= b.length; j++) row[j] = j;
    for (i = 1; i <= a.length; i++) {
      prev = i - 1;
      row[0] = i;
      for (j = 1; j <= b.length; j++) {
        tmp = row[j];
        cost = a[i - 1] === b[j - 1] ? 0 : 1;
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return row[b.length];
  }

  function canonicalParticipantFirstName(fullName) {
    var parts = clean(fullName, 200).split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    var first = parts[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  function applyCanonicalCasing(canonical, matchedWord) {
    if (matchedWord === matchedWord.toUpperCase()) return canonical.toUpperCase();
    if (matchedWord[0] === matchedWord[0].toUpperCase()) {
      return canonical.charAt(0).toUpperCase() + canonical.slice(1).toLowerCase();
    }
    return canonical.toLowerCase();
  }

  function enforceParticipantFirstNameInText(text, participantFullName) {
    var raw = clean(text, 4000);
    var canonical = canonicalParticipantFirstName(participantFullName);
    if (!raw || !canonical) return raw;
    var normCanon = normalizeNameKey(canonical);
    var aliases = NAME_ALIASES[normCanon] || [];
    var aliasSet = {};
    for (var a = 0; a < aliases.length; a++) aliasSet[normalizeNameKey(aliases[a])] = true;

    return raw.replace(/\b[\p{L}]{2,24}\b/gu, function (word) {
      var wNorm = normalizeNameKey(word);
      if (!wNorm) return word;
      if (wNorm === normCanon) return applyCanonicalCasing(canonical, word);
      if (aliasSet[wNorm]) return applyCanonicalCasing(canonical, word);
      if (
        wNorm[0] === normCanon[0] &&
        word.length >= canonical.length - 2 &&
        word.length <= canonical.length + 2 &&
        levenshtein(wNorm, normCanon) <= 2
      ) {
        return applyCanonicalCasing(canonical, word);
      }
      return word;
    });
  }

  global.PortalParticipantFeedbackName = {
    canonicalParticipantFirstName: canonicalParticipantFirstName,
    enforceParticipantFirstNameInText: enforceParticipantFirstNameInText,
  };
})(typeof window !== "undefined" ? window : globalThis);
