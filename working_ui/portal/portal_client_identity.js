/**
 * Same child, two labels.
 * Admin and overrides often store the full name (Yamik Limbu).
 * Staff see the roster label: first name when it is unique (Yamik),
 * or first name plus a few surname letters when it is not (Adam Ma, Adam Ab).
 * Those labels must match. Two different children who share a first name must not.
 */
(function (global) {
  "use strict";

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function slugify(value) {
    return clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  var cache = { rows: null, alias: null, list: null };

  function rosterRows() {
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : null;
  }

  function knownSlugs(aliasSlug) {
    var rows = rosterRows();
    if (!rows || !rows.length || typeof aliasSlug !== "function") return [];
    if (cache.rows === rows && cache.alias === aliasSlug && cache.list) return cache.list;
    var seen = Object.create(null);
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var s = aliasSlug(rows[i] && rows[i].client_name);
      if (!s || seen[s]) continue;
      seen[s] = 1;
      list.push(s);
    }
    cache.rows = rows;
    cache.alias = aliasSlug;
    cache.list = list;
    return list;
  }

  function firstOf(slug) {
    var i = String(slug || "").indexOf("_");
    return i < 0 ? String(slug || "") : String(slug).slice(0, i);
  }

  function restOf(slug) {
    var i = String(slug || "").indexOf("_");
    return i < 0 ? "" : String(slug).slice(i + 1).replace(/_/g, "");
  }

  function groupByFirst(list, first) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (firstOf(list[i]) === first) out.push(list[i]);
    }
    return out;
  }

  /** Privacy letters or a shorter surname identify the longer form. Same first name required. */
  function surnameCovers(shorterSlug, longerSlug) {
    if (firstOf(shorterSlug) !== firstOf(longerSlug)) return false;
    var abbr = restOf(shorterSlug);
    var full = restOf(longerSlug);
    if (!abbr || !full || abbr === full) return abbr === full && !!abbr;
    var short = abbr.length <= full.length ? abbr : full;
    var long = abbr.length <= full.length ? full : abbr;
    if (short.length < 2 || short.length >= long.length) return false;
    return long.indexOf(short) === 0;
  }

  function familiesFor(group) {
    var bare = [];
    var named = [];
    for (var i = 0; i < group.length; i++) {
      if (restOf(group[i])) named.push(group[i]);
      else bare.push(group[i]);
    }
    named.sort(function (a, b) {
      return restOf(b).length - restOf(a).length;
    });
    var clusters = [];
    for (var n = 0; n < named.length; n++) {
      var s = named[n];
      var hits = [];
      for (var c = 0; c < clusters.length; c++) {
        var members = clusters[c].members;
        var hit = false;
        for (var m = 0; m < members.length; m++) {
          if (surnameCovers(members[m], s) || surnameCovers(s, members[m])) {
            hit = true;
            break;
          }
        }
        if (hit) hits.push(c);
      }
      if (hits.length === 1) clusters[hits[0]].members.push(s);
      else clusters.push({ members: [s] });
    }
    if (bare.length && clusters.length <= 1) {
      var members = bare.slice();
      if (clusters.length === 1) members = members.concat(clusters[0].members);
      return [{ canon: bare[0], members: members }];
    }
    var out = [];
    for (var k = 0; k < clusters.length; k++) {
      var mem = clusters[k].members.slice().sort(function (a, b) {
        return a.length - b.length;
      });
      out.push({ canon: mem[0], members: clusters[k].members });
    }
    return out;
  }

  function familyCanon(families, slug) {
    var first = firstOf(slug);
    if (families.length === 1 && firstOf(families[0].canon) === first && families[0].canon === first) {
      return families[0].canon;
    }
    for (var i = 0; i < families.length; i++) {
      var fam = families[i];
      if (fam.members.indexOf(slug) >= 0 || fam.canon === slug) return fam.canon;
      for (var m = 0; m < fam.members.length; m++) {
        if (surnameCovers(fam.members[m], slug) || surnameCovers(slug, fam.members[m])) return fam.canon;
      }
      if (families.length === 1 && slug === first) return fam.canon;
    }
    return "";
  }

  /**
   * slug is already alias-normalized. aliasSlug maps a roster client_name the same way.
   * Returns the roster label for that child, or slug when it is ambiguous or unknown.
   */
  function foldAliasedSlug(slug, aliasSlug) {
    if (!slug) return slug || "";
    var known = knownSlugs(aliasSlug);
    if (!known.length) return slug;
    var group = groupByFirst(known, firstOf(slug));
    if (!group.length) return slug;
    var canon = familyCanon(familiesFor(group), slug);
    return canon || slug;
  }

  global.PortalClientIdentity = {
    slugify: slugify,
    foldAliasedSlug: foldAliasedSlug,
  };
})(typeof window !== "undefined" ? window : globalThis);
