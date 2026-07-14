/**
 * Swimming session E / R / I axes — aligned with swimming term review domains.
 * Day Centre / support worker keep the generic form; aquatic uses these labels.
 */
(function (global) {
  "use strict";

  var ENGAGEMENT = [
    { value: 1, label: "Needed lots of support to join in", termHint: "Building" },
    { value: 2, label: "Joined some", termHint: "Building" },
    { value: 3, label: "Joined most", termHint: "Progressing" },
    { value: 4, label: "Stayed with the session well", termHint: "Secure" },
  ];

  var REGULATION = [
    { value: "Found the water hard today", label: "Found the water hard today", termHint: "Building", score: 1 },
    { value: "Needed help to settle", label: "Needed help to settle", termHint: "Building", score: 2 },
    { value: "Mostly calm", label: "Mostly calm", termHint: "Progressing", score: 3 },
    { value: "Calm and settled", label: "Calm and settled", termHint: "Secure", score: 4 },
  ];

  var INDEPENDENCE = [
    { value: "Full support in the water", label: "Full support in the water", sub: "Hands-on throughout", termHint: "Building", score: 1 },
    { value: "Regular support / hands-on help", label: "Regular support / hands-on help", sub: "Frequent help", termHint: "Building", score: 2 },
    { value: "Mostly with prompts", label: "Mostly with prompts", sub: "Occasional reminders", termHint: "Progressing", score: 3 },
    { value: "Mostly on their own", label: "Mostly on their own", sub: "Independent in the water", termHint: "Secure", score: 4 },
  ];

  var REG_BY_VALUE = {};
  REGULATION.forEach(function (r) {
    REG_BY_VALUE[r.value.toLowerCase()] = r;
  });
  var IND_BY_VALUE = {};
  INDEPENDENCE.forEach(function (r) {
    IND_BY_VALUE[r.value.toLowerCase()] = r;
  });

  /** Legacy generic → swim display when service is aquatic. */
  var LEGACY_REG_MAP = {
    withdrawn: REGULATION[0],
    anxious: REGULATION[1],
    "out of control": REGULATION[0],
    "happy/excited": REGULATION[3],
    happy: REGULATION[3],
    excited: REGULATION[3],
  };
  var LEGACY_IND_MAP = {
    independent: INDEPENDENCE[3],
    "independent with prompts": INDEPENDENCE[2],
    "required regular support": INDEPENDENCE[1],
    "required full support": INDEPENDENCE[0],
  };

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function isAquaticService(service) {
    var s = clean(service).toLowerCase();
    if (!s) return false;
    return (
      s.indexOf("aquatic") !== -1 ||
      s.indexOf("swimming") !== -1 ||
      s.indexOf("swim ") !== -1 ||
      s === "swim" ||
      s.indexOf("pool") !== -1
    );
  }

  function engagementLabel(rating, service) {
    var n = Number(rating);
    if (!Number.isFinite(n)) return "";
    if (isAquaticService(service) || (n >= 1 && n <= 4 && arguments.length >= 1)) {
      for (var i = 0; i < ENGAGEMENT.length; i++) {
        if (ENGAGEMENT[i].value === n) return ENGAGEMENT[i].label;
      }
    }
    return String(n);
  }

  function engagementLabelForDisplay(rating, service) {
    var n = Number(rating);
    if (!Number.isFinite(n)) return "—";
    if (isAquaticService(service)) {
      // Map legacy 5-star into 4 swim levels when needed.
      var mapped = n >= 5 ? 4 : n <= 1 ? 1 : n;
      for (var i = 0; i < ENGAGEMENT.length; i++) {
        if (ENGAGEMENT[i].value === mapped) return ENGAGEMENT[i].label;
      }
    }
    return String(n);
  }

  function regulationLabelForDisplay(raw, service) {
    var text = clean(raw);
    if (!text) return "—";
    var aquatic = isAquaticService(service);
    var parts = text.split(/[;|]/).map(clean).filter(Boolean);
    var out = [];
    parts.forEach(function (p) {
      var hit = REG_BY_VALUE[p.toLowerCase()];
      if (hit) {
        out.push(hit.label);
        return;
      }
      if (aquatic) {
        var leg = LEGACY_REG_MAP[p.toLowerCase()];
        if (leg) {
          out.push(leg.label);
          return;
        }
      }
      out.push(p);
    });
    return out.join("; ") || "—";
  }

  function independenceLabelForDisplay(raw, service) {
    var aquatic = isAquaticService(service);
    var list = [];
    if (Array.isArray(raw)) list = raw.map(clean).filter(Boolean);
    else if (raw != null) list = clean(raw).split(/[;|]/).map(clean).filter(Boolean);
    if (!list.length) return "—";
    var out = [];
    list.forEach(function (p) {
      var hit = IND_BY_VALUE[p.toLowerCase()];
      if (hit) {
        out.push(hit.label);
        return;
      }
      if (aquatic) {
        var leg = LEGACY_IND_MAP[p.toLowerCase()];
        if (leg) {
          out.push(leg.label);
          return;
        }
      }
      out.push(p);
    });
    return out.join("; ") || "—";
  }

  function scoreFromEngagement(rating) {
    var n = Number(rating);
    if (!Number.isFinite(n)) return null;
    if (n >= 5) return 4;
    if (n <= 1) return 1;
    return Math.min(4, Math.max(1, Math.round(n)));
  }

  function scoreFromRegulation(raw) {
    var text = clean(raw);
    if (!text) return null;
    var parts = text.split(/[;|]/).map(clean).filter(Boolean);
    var scores = [];
    parts.forEach(function (p) {
      var hit = REG_BY_VALUE[p.toLowerCase()];
      if (hit) scores.push(hit.score);
      else {
        var leg = LEGACY_REG_MAP[p.toLowerCase()];
        if (leg) scores.push(leg.score);
      }
    });
    if (!scores.length) return null;
    return scores.reduce(function (a, b) {
      return a + b;
    }, 0) / scores.length;
  }

  function scoreFromIndependence(raw) {
    var list = [];
    if (Array.isArray(raw)) list = raw.map(clean).filter(Boolean);
    else list = clean(raw).split(/[;|]/).map(clean).filter(Boolean);
    var scores = [];
    list.forEach(function (p) {
      var hit = IND_BY_VALUE[p.toLowerCase()];
      if (hit) scores.push(hit.score);
      else {
        var leg = LEGACY_IND_MAP[p.toLowerCase()];
        if (leg) scores.push(leg.score);
      }
    });
    if (!scores.length) return null;
    return scores.reduce(function (a, b) {
      return a + b;
    }, 0) / scores.length;
  }

  /** Aggregate session rows → suggested term domain labels + RSI radio value. */
  function suggestTermDomainsFromSessions(rows) {
    var eng = [];
    var reg = [];
    var ind = [];
    (rows || []).forEach(function (r) {
      if (!isAquaticService(r && r.service) && !(r && r.force_swim)) return;
      var e = scoreFromEngagement(r.engagement_rating);
      var g = scoreFromRegulation(r.client_emotions);
      var i = scoreFromIndependence(r.engagement_patterns);
      if (e != null) eng.push(e);
      if (g != null) reg.push(g);
      if (i != null) ind.push(i);
    });
    function avg(arr) {
      if (!arr.length) return null;
      return arr.reduce(function (a, b) {
        return a + b;
      }, 0) / arr.length;
    }
    function toHint(score) {
      if (score == null) return null;
      if (score < 2.25) return "Building";
      if (score < 3.25) return "Progressing";
      return "Secure";
    }
    function toRsi(score) {
      if (score == null) return null;
      if (score < 2.25) return "Rarely";
      if (score < 3.25) return "Sometimes";
      return "Always";
    }
    var eAvg = avg(eng);
    var rAvg = avg(reg);
    var iAvg = avg(ind);
    return {
      engagement: { hint: toHint(eAvg), rsi: toRsi(eAvg), avg: eAvg, n: eng.length },
      regulation: { hint: toHint(rAvg), rsi: toRsi(rAvg), avg: rAvg, n: reg.length },
      independence: { hint: toHint(iAvg), rsi: toRsi(iAvg), avg: iAvg, n: ind.length },
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Rebuild E/R/I option panels inside #feedbackExtendedSection for swim or generic. */
  function applyFeedbackFormMode(root, aquatic) {
    if (!root) return;
    var engHost = root.querySelector(".options--engagement");
    var regHost = root.querySelector(".options--emotions");
    var indHost = root.querySelector(".options--independence");
    if (!engHost || !regHost || !indHost) return;

    if (!root.__portalGenericAxesHtml) {
      root.__portalGenericAxesHtml = {
        eng: engHost.innerHTML,
        reg: regHost.innerHTML,
        ind: indHost.innerHTML,
        regLabel: "",
        indHint: "",
      };
      var regField = regHost.closest(".field");
      var indField = indHost.closest(".field");
      if (regField) {
        var rl = regField.querySelector("label");
        var rh = regField.querySelector("p.small");
        root.__portalGenericAxesHtml.regLabel = rl ? rl.innerHTML : "";
        root.__portalGenericAxesHtml.regHint = rh ? rh.outerHTML : "";
      }
      if (indField) {
        var ih = indField.querySelector("p.small");
        root.__portalGenericAxesHtml.indHint = ih ? ih.outerHTML : "";
      }
    }

    root.setAttribute("data-swim-axes", aquatic ? "1" : "0");

    if (!aquatic) {
      engHost.innerHTML = root.__portalGenericAxesHtml.eng;
      regHost.innerHTML = root.__portalGenericAxesHtml.reg;
      indHost.innerHTML = root.__portalGenericAxesHtml.ind;
      var regField0 = regHost.closest(".field");
      var indField0 = indHost.closest(".field");
      if (regField0) {
        var rl0 = regField0.querySelector(":scope > label");
        if (rl0 && root.__portalGenericAxesHtml.regLabel) rl0.innerHTML = root.__portalGenericAxesHtml.regLabel;
        if (root.__portalGenericAxesHtml.regHint) {
          var oldH = regField0.querySelector("p.small");
          if (oldH) oldH.outerHTML = root.__portalGenericAxesHtml.regHint;
        }
      }
      if (indField0 && root.__portalGenericAxesHtml.indHint) {
        var oldI = indField0.querySelector("p.small");
        if (oldI) oldI.outerHTML = root.__portalGenericAxesHtml.indHint;
      }
      return;
    }

    engHost.innerHTML =
      '<div class="swim-axis-row" role="radiogroup" aria-label="Swimming engagement">' +
      ENGAGEMENT.map(function (o) {
        return (
          '<label class="pill rate swim-axis-pill" data-kind="rating" data-value="' +
          o.value +
          '"><input type="radio" name="engagementRating" value="' +
          o.value +
          '"' +
          (o.value === 1 ? " required" : "") +
          "><span class=\"swim-axis-pill__text\">" +
          esc(o.label) +
          "</span></label>"
        );
      }).join("") +
      "</div>";

    var regField = regHost.closest(".field");
    if (regField) {
      var rh = regField.querySelector("p.small");
      if (rh) rh.textContent = "One choice — how they regulated in the water today.";
      var rlab = regField.querySelector(":scope > label");
      if (rlab) {
        rlab.innerHTML =
          rlab.innerHTML.replace(/Participant Emotions \/ Regulation/i, "Regulation in the water") ||
          rlab.innerHTML;
      }
    }
    regHost.setAttribute("role", "radiogroup");
    regHost.innerHTML = REGULATION.map(function (o) {
      return (
        '<label class="pill emotion swim-axis-pill" data-kind="emotion" data-value="' +
        esc(o.value) +
        '"><input type="radio" name="clientEmotions" value="' +
        esc(o.value) +
        '"><span class="pill-emotion-inner"><span class="pill-emotion-label">' +
        esc(o.label) +
        "</span></span></label>"
      );
    }).join("");

    var indField = indHost.closest(".field");
    if (indField) {
      var ih = indField.querySelector("p.small");
      if (ih) ih.textContent = "One choice — support needed in the water today.";
    }
    indHost.setAttribute("role", "radiogroup");
    indHost.innerHTML = INDEPENDENCE.map(function (o) {
      return (
        '<label class="pill independence swim-axis-pill" data-kind="independence" data-value="' +
        esc(o.value) +
        '"><input type="radio" name="independenceLevel" value="' +
        esc(o.value) +
        '"><span class="pill-independence-inner"><span class="pill-independence-text"><span class="pill-independence-title">' +
        esc(o.label) +
        '</span><span class="pill-independence-sub">' +
        esc(o.sub || "") +
        "</span></span></span></label>"
      );
    }).join("");
  }

  global.PortalSwimSessionAxes = {
    ENGAGEMENT: ENGAGEMENT,
    REGULATION: REGULATION,
    INDEPENDENCE: INDEPENDENCE,
    isAquaticService: isAquaticService,
    engagementLabelForDisplay: engagementLabelForDisplay,
    regulationLabelForDisplay: regulationLabelForDisplay,
    independenceLabelForDisplay: independenceLabelForDisplay,
    suggestTermDomainsFromSessions: suggestTermDomainsFromSessions,
    applyFeedbackFormMode: applyFeedbackFormMode,
  };
})(typeof window !== "undefined" ? window : globalThis);
