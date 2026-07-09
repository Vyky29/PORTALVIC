/**
 * Participant identity — portal contact name ↔ roster client_id (shared with edge functions).
 */
(function (global) {
  "use strict";

  function slugify(raw) {
    return String(raw || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  var ROSTER_SPELLING_ALIASES = {
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
  };

  var CLIENT_INFO_SLUG_ALIASES = {
    adam_a: "adam_ab",
    adam_abed: "adam_ab",
    abodi: "abodi_pa",
    junaid: "junaid_f",
    khalid_ab: "khalid",
    rayyan_fi: "rayyan_f",
    chaitanya_trial_28_06: "chaitanya",
  };

  var PORTAL_PARTICIPANT_SLUG_ALIASES = {
    fadi_abu_daud: "fadi",
    fadi_ab: "fadi",
    cyrus_mahdavi: "cyrus",
    cyrus_ma: "cyrus",
  };

  var CLIENT_INFO_SHEET_ALIASES = {
    rayan_tapa: "rayan_ta",
    aadam_ah: "adaam_ah",
  };

  function rosterSlugAlias(slug) {
    var s = slugify(slug);
    if (!s) return s;
    return (
      ROSTER_SPELLING_ALIASES[s] ||
      CLIENT_INFO_SLUG_ALIASES[s] ||
      CLIENT_INFO_SHEET_ALIASES[s] ||
      PORTAL_PARTICIPANT_SLUG_ALIASES[s] ||
      s
    );
  }

  function canonicalClientId(nameRaw) {
    return rosterSlugAlias(slugify(nameRaw));
  }

  function normName(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function workerShortName(firstName, lastName) {
    var fn = String(firstName || "").trim();
    var ln = String(lastName || "").trim();
    if (!fn) return "";
    if (!ln) return fn;
    return fn + " " + ln.slice(0, 2);
  }

  function resolveLookupNames(opts) {
    opts = opts || {};
    var names = [];
    var seen = Object.create(null);
    function add(n) {
      n = String(n || "").trim();
      if (!n || seen[n]) return;
      seen[n] = true;
      names.push(n);
    }
    add(opts.displayName);
    if (opts.firstName || opts.lastName) {
      add(((opts.firstName || "") + " " + (opts.lastName || "")).trim());
      add(workerShortName(opts.firstName, opts.lastName));
    }
    return names;
  }

  function lookupClientsInfoSheet(displayName, firstName, lastName) {
    try {
      var rows = global.PORTAL_CLIENTS_INFO_ROWS;
      if (!Array.isArray(rows) || !rows.length) return "";
      var wantSlugs = Object.create(null);
      resolveLookupNames({ displayName: displayName, firstName: firstName, lastName: lastName }).forEach(
        function (n) {
          wantSlugs[canonicalClientId(n)] = true;
        }
      );
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || !r.client_name) continue;
        if (wantSlugs[canonicalClientId(r.client_name)]) {
          return String(r.client_info || "").trim();
        }
        if (normName(r.client_name) === normName(displayName)) {
          return String(r.client_info || "").trim();
        }
        if (firstName && normName(r.client_name) === normName(firstName)) {
          return String(r.client_info || "").trim();
        }
      }
    } catch (_e) {}
    return "";
  }

  global.PortalParticipantIdentity = {
    slugify: slugify,
    canonicalClientId: canonicalClientId,
    rosterSlugAlias: rosterSlugAlias,
    normName: normName,
    workerShortName: workerShortName,
    resolveLookupNames: resolveLookupNames,
    lookupClientsInfoSheet: lookupClientsInfoSheet,
  };
  global.portalCanonicalParticipantClientId = canonicalClientId;
})(typeof window !== "undefined" ? window : globalThis);
