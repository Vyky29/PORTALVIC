/**
 * Session-feedback voice: keep the client's name spelling, and use he/she
 * for that person. Other words stay as transcribed.
 */
(function (root) {
  var HARD_BLOCK = {
    about: 1, after: 1, again: 1, also: 1, back: 1, because: 1, been: 1, before: 1,
    being: 1, came: 1, come: 1, dad: 1, does: 1, doing: 1, down: 1, father: 1,
    first: 1, from: 1, good: 1, great: 1, handover: 1, happy: 1, have: 1, hello: 1,
    into: 1, just: 1, last: 1, like: 1, little: 1, made: 1, make: 1, mom: 1,
    mother: 1, mum: 1, name: 1, next: 1, only: 1, over: 1, parent: 1, parents: 1,
    play: 1, played: 1, please: 1, pool: 1, quite: 1, really: 1, reception: 1,
    sad: 1, same: 1, seed: 1, session: 1, side: 1, soda: 1, some: 1, staff: 1, still: 1, swim: 1, swimming: 1,
    take: 1, talk: 1, team: 1, tell: 1, thank: 1, thanks: 1, that: 1, their: 1,
    them: 1, then: 1, there: 1, these: 1, they: 1, this: 1, those: 1, time: 1,
    today: 1, told: 1, tomorrow: 1, took: 1, under: 1, very: 1, want: 1, wanted: 1,
    was: 1, water: 1, well: 1, went: 1, were: 1, what: 1, when: 1, where: 1,
    which: 1, while: 1, will: 1, with: 1,
  };
  var AMBIGUOUS_VERBS = { said: 1, says: 1 };

  function soundKey(s) {
    var t = String(s || "").toLowerCase();
    try {
      t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (_) {}
    t = t.replace(/[^a-z]/g, "");
    t = t.replace(/ph/g, "f").replace(/ee/g, "i").replace(/y/g, "i");
    t = t.replace(/z/g, "s").replace(/c/g, "k").replace(/q/g, "k");
    t = t.replace(/(.)\1+/g, "$1");
    return t;
  }

  function lev(a, b) {
    var i, j;
    var prev = [];
    var cur = [];
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
      cur = [];
    }
    return prev[b.length];
  }

  function nameParts(fullName) {
    return String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(function (p) {
        return p.replace(/[^A-Za-z]/g, "").length >= 3;
      });
  }

  function namesClose(token, canon) {
    var raw = String(token || "").toLowerCase();
    var c = String(canon || "").toLowerCase();
    if (!raw || !c) return false;
    if (raw === c) return true;
    if (raw.length < 3 || c.length < 3) return false;
    if (Math.abs(raw.length - c.length) > 2) return false;
    var a = soundKey(raw);
    var b = soundKey(c);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.charAt(0) !== b.charAt(0)) return false;
    var sa = a.replace(/[aeiou]/g, "");
    var sb = b.replace(/[aeiou]/g, "");
    if (sa && sa === sb && sa.length >= 2 && lev(a, b) <= 2) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    return lev(a, b) <= 1;
  }

  function sentenceStart(before) {
    var s = String(before || "");
    if (!s.trim()) return true;
    return /[.!?]["']?\s*$/.test(s);
  }

  function tokenMayBeName(bare, atStart) {
    var low = String(bare || "").toLowerCase();
    if (HARD_BLOCK[low]) return false;
    if (AMBIGUOUS_VERBS[low]) return !!(atStart && /^[A-Z]/.test(bare));
    return true;
  }

  function fixNames(text, fullName) {
    var parts = nameParts(fullName);
    if (!parts.length) return text;
    return String(text || "").replace(/\b[A-Za-z][A-Za-z'’\-]*\b/g, function (word, offset, whole) {
      var poss = "";
      var bare = word;
      var m = word.match(/^(.*?)(['’]s)$/i);
      if (m) {
        bare = m[1];
        poss = m[2];
      }
      if (bare.length < 3) return word;
      var atStart = sentenceStart(String(whole || "").slice(0, offset));
      if (!tokenMayBeName(bare, atStart)) return word;
      for (var i = 0; i < parts.length; i++) {
        var canon = parts[i];
        if (bare.toLowerCase() === canon.toLowerCase()) return word;
        if (namesClose(bare, canon)) return canon + poss;
      }
      return word;
    });
  }

  function applyCase(sample, repl) {
    if (!sample || !repl) return repl;
    var first = sample.charAt(0);
    if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
      return repl.charAt(0).toUpperCase() + repl.slice(1);
    }
    return repl;
  }

  function genderCode(raw) {
    var v = String(raw || "").trim().toLowerCase();
    if (v === "m" || v === "male" || v === "boy") return "m";
    if (v === "f" || v === "female" || v === "girl") return "f";
    return "";
  }

  function fixPronouns(text, gender) {
    var g = genderCode(gender);
    if (!g) return text;
    var male = g === "m";
    var pairs = [
      [/\bthey were\b/gi, male ? "he was" : "she was"],
      [/\bthey are\b/gi, male ? "he is" : "she is"],
      [/\bthey have\b/gi, male ? "he has" : "she has"],
      [/\bthey don't\b/gi, male ? "he doesn't" : "she doesn't"],
      [/\bthey do not\b/gi, male ? "he does not" : "she does not"],
      [/\bthey're\b/gi, male ? "he's" : "she's"],
      [/\bthey’re\b/gi, male ? "he's" : "she's"],
      [/\bthemselves\b/gi, male ? "himself" : "herself"],
      [/\bthemself\b/gi, male ? "himself" : "herself"],
      [/\btheirs\b/gi, male ? "his" : "hers"],
      [/\btheir\b/gi, male ? "his" : "her"],
      [/\bthem\b/gi, male ? "him" : "her"],
      [/\bthey\b/gi, male ? "he" : "she"],
    ];
    var out = String(text || "");
    for (var i = 0; i < pairs.length; i++) {
      var re = pairs[i][0];
      var repl = pairs[i][1];
      out = out.replace(re, function (match) {
        return applyCase(match, repl);
      });
    }
    return out;
  }

  function apply(text, fullName, gender) {
    var named = fixNames(text, fullName);
    return fixPronouns(named, gender);
  }

  function firstName(fullName) {
    var parts = nameParts(fullName);
    return parts[0] || "";
  }

  root.PortalFeedbackVoiceNames = {
    apply: apply,
    firstName: firstName,
  };
})(typeof window !== "undefined" ? window : globalThis);
