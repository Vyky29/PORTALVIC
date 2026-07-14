/**
 * Swimming session E / R / I axes — aligned with swimming term review domains.
 * Day Centre / support worker keep the generic form; aquatic uses these labels.
 */
(function (global) {
  "use strict";

  var ENGAGEMENT = [
    {
      value: 1,
      label: "Needed lots of support to join in",
      termHint: "Building",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    },
    {
      value: 2,
      label: "Joined some",
      termHint: "Building",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    },
    {
      value: 3,
      label: "Joined most",
      termHint: "Progressing",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    {
      value: 4,
      label: "Stayed with the session well",
      termHint: "Secure",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    },
  ];

  var REGULATION = [
    {
      value: "Found the water hard today",
      label: "Found the water hard today",
      termHint: "Building",
      score: 1,
      icon:
        '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.25" fill="currentColor" stroke="none"/><path d="M8 15.5Q12 12.7 16 15.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>',
    },
    {
      value: "Needed help to settle",
      label: "Needed help to settle",
      termHint: "Building",
      score: 2,
      icon:
        '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><path d="M8 8.5l2 1.5M16 8.5l-2 1.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M8.5 14.5h7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    },
    {
      value: "Mostly calm",
      label: "Mostly calm",
      termHint: "Progressing",
      score: 3,
      icon:
        '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.25" fill="currentColor" stroke="none"/><path d="M9 15h6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>',
    },
    {
      value: "Calm and settled",
      label: "Calm and settled",
      termHint: "Secure",
      score: 4,
      icon:
        '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.75"/><circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.25" fill="currentColor" stroke="none"/><path d="M8 14Q12 17.2 16 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>',
    },
  ];

  var INDEPENDENCE = [
    {
      value: "Full support in the water",
      label: "Full support in the water",
      sub: "Hands-on throughout",
      termHint: "Building",
      score: 1,
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    },
    {
      value: "Regular support / hands-on help",
      label: "Regular support / hands-on help",
      sub: "Frequent help",
      termHint: "Building",
      score: 2,
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    },
    {
      value: "Mostly with prompts",
      label: "Mostly with prompts",
      sub: "Occasional reminders",
      termHint: "Progressing",
      score: 3,
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/></svg>',
    },
    {
      value: "Mostly on their own",
      label: "Mostly on their own",
      sub: "Independent in the water",
      termHint: "Secure",
      score: 4,
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    },
  ];

  function engIconHtml(svg) {
    return '<span class="pill-independence-icon" aria-hidden="true">' + (svg || "") + "</span>";
  }

  function regFaceHtml(svg) {
    return '<span class="pill-emotion-face" aria-hidden="true">' + (svg || "") + "</span>";
  }

  function indIconHtml(svg) {
    return '<span class="pill-independence-icon" aria-hidden="true">' + (svg || "") + "</span>";
  }

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

  function isMultiActivityService(service) {
    var s = clean(service).toLowerCase();
    return (
      s.indexOf("multi") !== -1 ||
      s.indexOf("splash") !== -1 ||
      (s.indexOf("connect") !== -1 && s.indexOf("splash") !== -1)
    );
  }

  /** Pure pool / aquatic sessions use swim E/R/I on the main form (no No/Swimming choice). */
  function isAquaticService(service) {
    var s = clean(service).toLowerCase();
    if (!s) return false;
    // Multi / Splash & Connect: exclusive No swimming vs Swimming choice (not always aquatic).
    if (isMultiActivityService(s)) return false;
    if (isDayCentreService(s)) return false;
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

  function isDayCentreService(service) {
    var s = clean(service).toLowerCase();
    return s.indexOf("day centre") !== -1 || s.indexOf("daycentre") !== -1 || s === "dc";
  }

  /** Day Centre kids who may also swim in the same block (Ikram, Emmanuel, Timi, Fadi). */
  var DAY_CENTRE_SWIM_NAME_KEYS = ["ikram", "fadi", "timi", "emmanuel", "emanuel"];

  function normalizePersonKey(name) {
    return clean(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isDayCentreSwimEligible(clientName, service) {
    if (!isDayCentreService(service)) return false;
    var n = normalizePersonKey(clientName);
    if (!n) return false;
    for (var i = 0; i < DAY_CENTRE_SWIM_NAME_KEYS.length; i++) {
      var key = DAY_CENTRE_SWIM_NAME_KEYS[i];
      if (n === key || n.indexOf(key + " ") === 0 || n.indexOf(" " + key + " ") !== -1 || n.slice(-(key.length + 1)) === " " + key) {
        return true;
      }
    }
    return false;
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
      var pack = swimJudgmentFromFeedbackRow(r);
      if (!pack) return;
      var e = scoreFromEngagement(pack.engagement_rating);
      var g = scoreFromRegulation(pack.client_emotions);
      var i = scoreFromIndependence(pack.engagement_patterns);
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

  /** Pure aquatic row OR Day Centre row with optional swim_* judgment OR Multi with swim vocab. */
  function rowUsesSwimAxisVocab(r) {
    if (!r) return false;
    var bits = [];
    if (Array.isArray(r.engagement_patterns)) {
      r.engagement_patterns.forEach(function (x) {
        bits.push(clean(x));
      });
    } else if (r.engagement_patterns != null) {
      bits = bits.concat(clean(r.engagement_patterns).split(/[;|]/));
    }
    bits = bits.concat(clean(r.client_emotions).split(/[;|]/));
    for (var i = 0; i < bits.length; i++) {
      var p = clean(bits[i]).toLowerCase();
      if (!p) continue;
      if (REG_BY_VALUE[p] || IND_BY_VALUE[p]) return true;
    }
    return false;
  }

  function swimJudgmentFromFeedbackRow(r) {
    if (!r) return null;
    if (r.swim_done === true || r.swim_done === "true" || r.swim_done === 1) {
      var has =
        r.swim_engagement_rating != null ||
        clean(r.swim_regulation) ||
        clean(r.swim_independence);
      if (!has) return null;
      return {
        force_swim: true,
        service: "aquatic",
        engagement_rating: r.swim_engagement_rating,
        client_emotions: r.swim_regulation,
        engagement_patterns: r.swim_independence,
      };
    }
    if (
      isAquaticService(r.service) ||
      r.force_swim ||
      (isMultiActivityService(r.service) && rowUsesSwimAxisVocab(r))
    ) {
      return {
        service: r.service || "aquatic",
        engagement_rating: r.engagement_rating,
        client_emotions: r.client_emotions,
        engagement_patterns: r.engagement_patterns,
      };
    }
    return null;
  }

  function optionalSwimBlockHtml() {
    return (
      '<div class="field fb-dc-swim" id="fbDayCentreSwimBlock" hidden data-swim-choice-mode="">' +
      '<label class="fb-dc-swim__title"><span class="field-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M2 12c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/>' +
      '<path d="M2 16c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/>' +
      "</svg></span> Swimming today?</label>" +
      '<p class="small field-note fb-dc-swim__note fb-dc-swim__note--dual" style="margin:0 0 10px">Day Centre feedback stays as usual. If they also swam, add the swimming judgment below <strong>before</strong> the session notes.</p>' +
      '<p class="small field-note fb-dc-swim__note fb-dc-swim__note--exclusive" hidden style="margin:0 0 10px"><strong>No swimming</strong> = original session feedback. <strong>Swimming</strong> = swimming feedback only.</p>' +
      '<div class="fb-dc-swim__toggle" role="group" aria-label="Did they swim today">' +
      '<label class="pill fb-dc-swim-choice"><input type="radio" name="dayCentreSwimDone" value="no" checked><span>No swimming</span></label>' +
      '<label class="pill fb-dc-swim-choice"><input type="radio" name="dayCentreSwimDone" value="yes"><span>Swimming</span></label>' +
      "</div>" +
      '<div class="fb-dc-swim__axes" id="fbDayCentreSwimAxes" hidden>' +
      '<div class="field fb-dc-swim__axis">' +
      "<label>Swimming engagement <span class=\"req\">*</span></label>" +
      '<p class="small" style="margin:0 0 8px;font-weight:600;color:var(--muted)">Select all that apply.</p>' +
      '<div class="swim-axis-row options--dc-swim-engagement" role="group" aria-label="Swimming engagement">' +
      ENGAGEMENT.map(function (o) {
        return (
          '<label class="pill rate swim-axis-pill" data-kind="dc-swim-rating" data-value="' +
          o.value +
          '"><input type="checkbox" name="swimEngagementRating" value="' +
          o.value +
          '"><span class="pill-independence-inner">' +
          engIconHtml(o.icon) +
          '<span class="pill-independence-text"><span class="pill-independence-title">' +
          esc(o.label) +
          "</span></span></span></label>"
        );
      }).join("") +
      "</div></div>" +
      '<div class="field fb-dc-swim__axis">' +
      "<label>Regulation in the water <span class=\"req\">*</span></label>" +
      '<p class="small" style="margin:0 0 8px;font-weight:600;color:var(--muted)">Select all that apply.</p>' +
      '<div class="options options--dc-swim-regulation swim-axis-row" role="group" aria-label="Swimming regulation">' +
      REGULATION.map(function (o) {
        return (
          '<label class="pill emotion swim-axis-pill" data-kind="dc-swim-regulation" data-value="' +
          esc(o.value) +
          '"><input type="checkbox" name="swimRegulation" value="' +
          esc(o.value) +
          '"><span class="pill-emotion-inner">' +
          regFaceHtml(o.icon) +
          '<span class="pill-emotion-label">' +
          esc(o.label) +
          "</span></span></label>"
        );
      }).join("") +
      "</div></div>" +
      '<div class="field fb-dc-swim__axis">' +
      "<label>Independence in the water <span class=\"req\">*</span></label>" +
      '<p class="small" style="margin:0 0 8px;font-weight:600;color:var(--muted)">Select all that apply.</p>' +
      '<div class="options options--dc-swim-independence swim-axis-row" role="group" aria-label="Swimming independence">' +
      INDEPENDENCE.map(function (o) {
        return (
          '<label class="pill independence swim-axis-pill" data-kind="dc-swim-independence" data-value="' +
          esc(o.value) +
          '"><input type="checkbox" name="swimIndependence" value="' +
          esc(o.value) +
          '"><span class="pill-independence-inner">' +
          indIconHtml(o.icon) +
          '<span class="pill-independence-text"><span class="pill-independence-title">' +
          esc(o.label) +
          '</span><span class="pill-independence-sub">' +
          esc(o.sub || "") +
          "</span></span></span></label>"
        );
      }).join("") +
      "</div></div>" +
      "</div></div>"
    );
  }

  function ensureOptionalSwimBlock(root) {
    if (!root) return null;
    var existing = document.getElementById("fbDayCentreSwimBlock");
    if (existing) return existing;
    var host = document.createElement("div");
    host.innerHTML = optionalSwimBlockHtml();
    var block = host.firstChild;
    var before =
      document.getElementById("fbInputChoice") ||
      document.getElementById("fbNarrativeField") ||
      null;
    if (before && before.parentNode) before.parentNode.insertBefore(block, before);
    else root.appendChild(block);
    return block;
  }

  function syncOptionalDayCentreSwim(root, clientName, service, opts) {
    opts = opts || {};
    var block = ensureOptionalSwimBlock(root);
    if (!block) return false;
    var pureAquatic = !!opts.aquaticFullMode || isAquaticService(service);
    var dual = isDayCentreSwimEligible(clientName, service);
    var exclusive = !pureAquatic && !dual && isMultiActivityService(service);
    var showChoice = dual || exclusive;

    block.hidden = !showChoice;
    block.setAttribute("data-swim-choice-mode", dual ? "dual" : exclusive ? "exclusive" : "");
    block.querySelectorAll(".fb-dc-swim__note--dual").forEach(function (el) {
      el.hidden = !dual;
    });
    block.querySelectorAll(".fb-dc-swim__note--exclusive").forEach(function (el) {
      el.hidden = !exclusive;
    });

    if (!showChoice) {
      setAddonAxesVisible(false);
      block.querySelectorAll('input[name="dayCentreSwimDone"]').forEach(function (inp) {
        inp.checked = inp.value === "no";
      });
      clearAddonSwimInputs();
      if (root) applyFeedbackFormMode(root, pureAquatic);
      return false;
    }

    // Dual Day Centre (Fadi / Ikram / Emmanuel / Timi): always keep classic main axes.
    // Exclusive Multi: start / stay on choice — refreshApplyMode from radios.
    if (dual) applyFeedbackFormMode(root, false);
    wireOptionalSwimToggle(block, root, dual ? "dual" : "exclusive");
    refreshSwimChoice(block, root, dual ? "dual" : "exclusive");
    return true;
  }

  function clearAddonSwimInputs() {
    document
      .querySelectorAll(
        'input[name="swimEngagementRating"], input[name="swimRegulation"], input[name="swimIndependence"]',
      )
      .forEach(function (inp) {
        inp.checked = false;
        inp.removeAttribute("required");
      });
  }

  function setAddonAxesVisible(on) {
    var axes = document.getElementById("fbDayCentreSwimAxes");
    if (!axes) return;
    axes.hidden = !on;
    if (!on) axes.setAttribute("hidden", "");
    else axes.removeAttribute("hidden");
  }

  function refreshSwimChoice(block, root, mode) {
    if (!block) return;
    var yes = block.querySelector('input[name="dayCentreSwimDone"][value="yes"]');
    var on = !!(yes && yes.checked);
    if (mode === "dual") {
      // Classic Day Centre always; swimming E/R/I only when "Swimming" is selected.
      if (root) applyFeedbackFormMode(root, false);
      setAddonAxesVisible(on);
      if (!on) clearAddonSwimInputs();
      else {
        block.querySelectorAll('input[name="swimEngagementRating"]').forEach(function (inp) {
          if (inp.value === "1") inp.setAttribute("required", "");
        });
      }
    } else {
      // Exclusive: No swimming → original form; Swimming → swim form only (no dual addon).
      setAddonAxesVisible(false);
      clearAddonSwimInputs();
      if (root) applyFeedbackFormMode(root, on);
    }
    block.querySelectorAll(".fb-dc-swim-choice").forEach(function (lab) {
      var inp = lab.querySelector("input");
      lab.classList.toggle("isSelected", !!(inp && inp.checked));
    });
    block.querySelectorAll(".swim-axis-pill").forEach(function (lab) {
      var inp = lab.querySelector("input");
      lab.classList.toggle("isSelected", !!(inp && inp.checked));
    });
  }

  function wireOptionalSwimToggle(block, root, mode) {
    if (!block) return;
    block.__dcSwimMode = mode;
    block.__dcSwimRoot = root || null;
    if (block.__dcSwimWired) return;
    block.__dcSwimWired = true;
    block.addEventListener("change", function () {
      refreshSwimChoice(block, block.__dcSwimRoot, block.__dcSwimMode || "dual");
      try {
        if (typeof global.syncPillSelection === "function") global.syncPillSelection();
      } catch (_e) {}
      // Session feedback page uses local syncPillSelection — fire a custom event.
      try {
        block.dispatchEvent(new CustomEvent("portal:swim-choice-changed", { bubbles: true }));
      } catch (_e2) {}
    });
  }

  function readOptionalSwimFields(form) {
    var block = document.getElementById("fbDayCentreSwimBlock");
    if (!block || block.hidden) {
      return { swim_done: false, swim_engagement_rating: null, swim_regulation: null, swim_independence: null };
    }
    var mode = block.getAttribute("data-swim-choice-mode") || "dual";
    var yes = form.querySelector('input[name="dayCentreSwimDone"][value="yes"]');
    if (!(yes && yes.checked)) {
      return { swim_done: false, swim_engagement_rating: null, swim_regulation: null, swim_independence: null };
    }
    // Exclusive Multi "Swimming" uses the main form axes (not swim_* columns).
    if (mode === "exclusive") {
      return { swim_done: false, swim_engagement_rating: null, swim_regulation: null, swim_independence: null };
    }
    var fd = new FormData(form);
    var engVals = fd
      .getAll("swimEngagementRating")
      .map(function (v) {
        return parseInt(String(v || ""), 10);
      })
      .filter(function (n) {
        return Number.isFinite(n);
      });
    var eng =
      engVals.length
        ? Math.round(
            engVals.reduce(function (a, b) {
              return a + b;
            }, 0) / engVals.length
          )
        : null;
    var reg = fd
      .getAll("swimRegulation")
      .map(function (v) {
        return clean(v);
      })
      .filter(Boolean)
      .join("; ");
    var ind = fd
      .getAll("swimIndependence")
      .map(function (v) {
        return clean(v);
      })
      .filter(Boolean)
      .join("; ");
    return {
      swim_done: true,
      swim_engagement_rating: eng,
      swim_regulation: reg || null,
      swim_independence: ind || null,
    };
  }

  function validateOptionalSwimFields(form) {
    var block = document.getElementById("fbDayCentreSwimBlock");
    if (!block || block.hidden) return null;
    var mode = block.getAttribute("data-swim-choice-mode") || "dual";
    var yes = form.querySelector('input[name="dayCentreSwimDone"][value="yes"]');
    if (!(yes && yes.checked)) return null;
    if (mode === "exclusive") {
      // Main-form swim axes are required by the usual engagementRating validators.
      return null;
    }
    var fields = readOptionalSwimFields(form);
    if (!fields.swim_done) return null;
    if (fields.swim_engagement_rating == null) return "Please select at least one swimming engagement option.";
    if (!fields.swim_regulation) return "Please select at least one regulation in the water option.";
    if (!fields.swim_independence) return "Please select at least one independence in the water option.";
    return null;
  }

  function swimAxesDisplayHtml(row, escFn) {
    if (!(row && (row.swim_done === true || row.swim_done === "true" || row.swim_done === 1))) return "";
    var e = engagementLabelForDisplay(row.swim_engagement_rating, "aquatic");
    var r = regulationLabelForDisplay(row.swim_regulation, "aquatic");
    var i = independenceLabelForDisplay(row.swim_independence, "aquatic");
    if (e === "—" && r === "—" && i === "—") return "";
    var esc = typeof escFn === "function" ? escFn : esc;
    return (
      '<div class="pcso-swim-addon" title="Swimming judgment on this Day Centre session">' +
      "<strong>Swimming</strong> · E: " +
      esc(e) +
      " · R: " +
      esc(r) +
      " · I: " +
      esc(i) +
      "</div>"
    );
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
      '<div class="swim-axis-row" role="group" aria-label="Swimming engagement">' +
      ENGAGEMENT.map(function (o) {
        return (
          '<label class="pill rate swim-axis-pill" data-kind="rating" data-value="' +
          o.value +
          '"><input type="checkbox" name="engagementRating" value="' +
          o.value +
          '"><span class="pill-independence-inner">' +
          engIconHtml(o.icon) +
          '<span class="pill-independence-text"><span class="pill-independence-title">' +
          esc(o.label) +
          "</span></span></span></label>"
        );
      }).join("") +
      "</div>";

    var engField = engHost.closest(".field");
    if (engField) {
      var eh = engField.querySelector("p.small");
      if (!eh) {
        eh = document.createElement("p");
        eh.className = "small";
        eh.style.cssText = "margin:0 0 8px;font-weight:600;color:var(--muted)";
        var engLab = engField.querySelector(":scope > label");
        if (engLab && engLab.nextSibling) engField.insertBefore(eh, engLab.nextSibling);
        else engField.insertBefore(eh, engHost);
      }
      eh.textContent = "Select all that apply.";
    }

    var regField = regHost.closest(".field");
    if (regField) {
      var rh = regField.querySelector("p.small");
      if (rh) rh.textContent = "Select all that apply.";
      var rlab = regField.querySelector(":scope > label");
      if (rlab) {
        rlab.innerHTML =
          rlab.innerHTML.replace(/Participant Emotions \/ Regulation/i, "Regulation in the water") ||
          rlab.innerHTML;
      }
    }
    regHost.setAttribute("role", "group");
    regHost.innerHTML = REGULATION.map(function (o) {
      return (
        '<label class="pill emotion swim-axis-pill" data-kind="emotion" data-value="' +
        esc(o.value) +
        '"><input type="checkbox" name="clientEmotions" value="' +
        esc(o.value) +
        '"><span class="pill-emotion-inner">' +
        regFaceHtml(o.icon) +
        '<span class="pill-emotion-label">' +
        esc(o.label) +
        "</span></span></label>"
      );
    }).join("");

    var indField = indHost.closest(".field");
    if (indField) {
      var ih = indField.querySelector("p.small");
      if (ih) ih.textContent = "Select all that apply.";
    }
    indHost.setAttribute("role", "group");
    indHost.innerHTML = INDEPENDENCE.map(function (o) {
      return (
        '<label class="pill independence swim-axis-pill" data-kind="independence" data-value="' +
        esc(o.value) +
        '"><input type="checkbox" name="independenceLevel" value="' +
        esc(o.value) +
        '"><span class="pill-independence-inner">' +
        indIconHtml(o.icon) +
        '<span class="pill-independence-text"><span class="pill-independence-title">' +
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
    isMultiActivityService: isMultiActivityService,
    isDayCentreService: isDayCentreService,
    isDayCentreSwimEligible: isDayCentreSwimEligible,
    engagementLabelForDisplay: engagementLabelForDisplay,
    regulationLabelForDisplay: regulationLabelForDisplay,
    independenceLabelForDisplay: independenceLabelForDisplay,
    suggestTermDomainsFromSessions: suggestTermDomainsFromSessions,
    swimJudgmentFromFeedbackRow: swimJudgmentFromFeedbackRow,
    applyFeedbackFormMode: applyFeedbackFormMode,
    syncOptionalDayCentreSwim: syncOptionalDayCentreSwim,
    readOptionalSwimFields: readOptionalSwimFields,
    validateOptionalSwimFields: validateOptionalSwimFields,
    swimAxesDisplayHtml: swimAxesDisplayHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
