/**
 * Area / pool note icons for TODAY rows, Next session list, etc.
 * PNG crops from approved mockup (portal/area-note-icons/).
 */
(function (global) {
  "use strict";

  var ICON_IMG_BASE = "/portal/area-note-icons/";
  var ICON_IMG_VER = "20260618-lane-caption";
  var IMG_CLASS = "session-area-note-img";
  var SVG_CLASS = "session-area-note-svg";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var SVG_HEAD =
    '<svg class="' +
    SVG_CLASS +
    '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">';

  var ICONS = {
    "big-pool": { label: "Big Pool", cls: "session-area-note-icon--big-pool" },
    "small-pool": { label: "Small Pool", cls: "session-area-note-icon--small-pool" },
    "teaching-pool": { label: "Teaching Pool", cls: "session-area-note-icon--teaching-pool" },
    "lane-se": { label: "Lane (SE)", cls: "session-area-note-icon--lane-se" },
    "lane-de": { label: "Lane (DE)", cls: "session-area-note-icon--lane-de" },
    "hub-room": { label: "Hub Room", cls: "session-area-note-icon--hub-room" },
    "room-2": { label: "Room 2", cls: "session-area-note-icon--room-2" },
    gym: { label: "Gym", cls: "session-area-note-icon--gym" },
    "climbing-wall": { label: "Wall", cls: "session-area-note-icon--climbing-wall" },
    "day-center": { label: "Day Centre", cls: "session-area-note-icon--day-center" },
    bespoke: { label: "Bespoke", cls: "session-area-note-icon--bespoke" },
  };

  function portalAreaNoteIconMarkup(key, opts) {
    opts = opts || {};
    var venueCls = opts.venueSessionCard ? " session-venue-icon" : "";
    var meta = ICONS[key];
    if (meta && meta.svg) {
      return meta.svg.replace(
        'class="' + SVG_CLASS + '"',
        'class="' + SVG_CLASS + venueCls + '"'
      );
    }
    return (
      '<img class="' +
      IMG_CLASS +
      venueCls +
      '" src="' +
      ICON_IMG_BASE +
      key +
      ".png?v=" +
      ICON_IMG_VER +
      '" alt="" aria-hidden="true" decoding="async" draggable="false" />'
    );
  }

  function portalNormalizeAreaNoteKey(raw) {
    var s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[\-_]+/g, " ")
      .replace(/\s+/g, " ");
    if (!s) return "";
    if (s === "big pool" || s === "main pool") return "big-pool";
    if (s === "small pool") return "small-pool";
    if (s === "teaching pool") return "teaching-pool";
    if (/^lane\s*\(\s*se\s*\)$/.test(s) || s === "lane se") return "lane-se";
    if (/^lane\s*\(\s*de\s*\)$/.test(s) || s === "lane de") return "lane-de";
    if (s === "shark pool" || s === "shark") return "lane-de";
    if (s === "fish pool" || s === "fish") return "lane-se";
    if (s === "hub room") return "hub-room";
    if (s === "room 2" || s === "room2") return "room-2";
    if (s === "gym" || s === "fitness" || s === "fitness gym") return "gym";
    if (s === "wall" || s.indexOf("climbing") >= 0) return "climbing-wall";
    if (s.indexOf("day centre") >= 0 || s.indexOf("day center") >= 0) return "day-center";
    if (s === "bespoke") return "bespoke";
    if (s === "swimming" || s === "swimming activity" || s === "aquatic activity") return "";
    return "";
  }

  function portalNormalizeProgrammeKey(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/[\-_]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function portalClientKeyFromContext(ctx) {
    ctx = ctx || {};
    var cid = String(ctx.clientId || "")
      .trim()
      .toLowerCase();
    if (cid && cid !== "closed" && cid !== "available") return cid;
    return String(ctx.name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  /** Map roster room + programme to the area note label staff should see. */
  global.portalApplySessionAreaNoteOverrides = function portalApplySessionAreaNoteOverrides(ctx) {
    ctx = ctx || {};
    var activity = portalNormalizeProgrammeKey(
      ctx.activity || ctx.rosterService || ctx.service || ""
    );
    if (/day\s*cent(re|er)/.test(activity)) return "Day Centre";

    var clientKey = portalClientKeyFromContext(ctx);
    if (clientKey === "tinashe" && activity.indexOf("bespoke") >= 0) return "Bespoke";

    return "";
  };

  function portalDisplayAreaNoteLabel(raw) {
    var key = portalNormalizeAreaNoteKey(raw);
    if (key && ICONS[key] && ICONS[key].label) return ICONS[key].label;
    return String(raw || "").trim();
  }

  function portalResolveAreaNoteLabelFromItem(item) {
    if (!item) return "";
    var override = portalApplySessionAreaNoteOverrides({
      activity: item.activity,
      rosterService: item.rosterService,
      service: item.service,
      clientId: item.clientId,
      name: item.name,
      rosterArea: item.areaLabel,
      areaLabel: item.areaLabel,
    });
    if (override) return override;

    var area =
      item.areaLabel != null && String(item.areaLabel).trim()
        ? String(item.areaLabel).trim()
        : "";
    var pool = item.poolLocationLabel ? String(item.poolLocationLabel).trim() : "";
    if (area) {
      var areaKey = portalNormalizeAreaNoteKey(area);
      if (areaKey) return area;
    }
    if (pool) return pool;
    if (area) return area;
    var tier = item.poolTier ? String(item.poolTier).toLowerCase() : "";
    if (tier === "fish") return "Teaching Pool";
    if (tier === "small") return "Small Pool";
    if (tier === "shark") return "Big Pool";
    if (tier === "dolphin") {
      var laneFromArea = portalNormalizeAreaNoteKey(area || pool);
      if (laneFromArea === "lane-de") return "Lane (DE)";
      if (laneFromArea === "lane-se") return "Lane (SE)";
      return "Lane (SE)";
    }
    return portalDisplayAreaNoteLabel(pool || area);
  }

  var AREA_NOTE_SHORT_LABELS = {
    "climbing-wall": "Wall",
  };

  function portalAreaNoteCaptionLabel(key, meta) {
    if (AREA_NOTE_SHORT_LABELS[key]) return AREA_NOTE_SHORT_LABELS[key];
    return meta && meta.label ? meta.label : "";
  }

  function portalAreaNoteIconHtml(labelOrKey, opts) {
    var key = ICONS[labelOrKey] ? labelOrKey : portalNormalizeAreaNoteKey(labelOrKey);
    var meta = ICONS[key];
    if (!meta) return "";
    opts = opts || {};
    var extraCls = opts.className ? " " + String(opts.className).trim() : "";
    var sizeCls = opts.size === "sm" ? " session-area-note-icon--sm" : "";
    var iconHtml =
      '<span class="session-area-note-icon ' +
      meta.cls +
      extraCls +
      sizeCls +
      '" role="img" aria-label="' +
      escapeHtml(meta.label) +
      '">' +
      portalAreaNoteIconMarkup(key, opts) +
      "</span>";
    if (opts.venueSessionCard) {
      iconHtml = '<span class="session-venue-visual">' + iconHtml + "</span>";
    }
    if (!opts.showLabel) return iconHtml;
    var caption = opts.labelText
      ? String(opts.labelText).trim()
      : portalAreaNoteCaptionLabel(key, meta);
    if (!caption && meta && meta.label) caption = meta.label;
    var wrapCls =
      opts.layout === "inline" ? "session-area-note-inline" : "session-area-note-stack";
    return (
      '<span class="' +
      wrapCls +
      '">' +
      iconHtml +
      '<span class="session-area-note-label"' +
      (opts.layout === "inline" ? "" : ' aria-hidden="true"') +
      ">" +
      escapeHtml(caption) +
      "</span></span>"
    );
  }

  /** Icon + label metrics for TODAY session rows (few sessions → larger symbols). */
  function portalMeasureTodaySessionRowHeight(gridEl, sessionCount) {
    if (!gridEl) return 0;
    try {
      var card = gridEl.querySelector(".today-grid-rows > .session-card");
      if (card && card.getBoundingClientRect) {
        var measured = card.getBoundingClientRect().height;
        if (measured > 0) return measured;
      }
      var ch = gridEl.clientHeight;
      if (!ch) return 0;
      var n = Math.max(1, sessionCount | 0);
      var rowsFill = n === 1 ? 0.333333 : 1;
      var gap = n >= 4 ? 3 : 5;
      return (ch * rowsFill - gap * (n - 1)) / n;
    } catch (_e) {
      return 0;
    }
  }

  function portalTodayAreaNoteMetrics(sessionCount, scrollMode, gridEl, nameFs) {
    var n = Math.min(9, Math.max(1, sessionCount | 0));
    var venueAspect = 538 / 484;
    var nameFont = Math.max(12, Math.min(26, Number(nameFs) || 14));
    var nameLineH = nameFont * 1.22;
    if (scrollMode) {
      var scrollH = Math.round(nameLineH * 2.05);
      var scrollLabelFs = 8;
      var scrollStackGap = 0;
      return {
        iconPx: 30,
        areaIconPx: scrollH,
        labelFs: scrollLabelFs,
        symbolColMax: Math.min(88, Math.ceil(scrollH * venueAspect) + 4),
        stackGap: scrollStackGap,
        labelBlock: Math.ceil(scrollLabelFs * 1.12) + scrollStackGap,
      };
    }
    var dense = n >= 6;
    var rowH = portalMeasureTodaySessionRowHeight(gridEl, n);
    var rowPad = dense ? 4 : 6;
    var nameMult = { 1: 2.85, 2: 2.65, 3: 2.45, 4: 2.25, 5: 2.05 };
    var areaIconPx;
    if (n <= 5) {
      areaIconPx = Math.round(nameLineH * (nameMult[n] || 2.05));
    } else {
      var rowFit =
        rowH > 0 ? Math.floor((rowH - rowPad * 2) * (dense ? 0.82 : 0.88)) : 0;
      var nameFit = Math.round(nameLineH * (dense ? 1.95 : 2.15));
      areaIconPx = rowFit > 0 ? Math.min(rowFit, nameFit) : nameFit;
    }
    var minCap = n <= 2 ? 44 : n <= 4 ? 38 : n <= 5 ? 34 : 28;
    var maxCap = Math.round(nameLineH * (n <= 1 ? 3.15 : n <= 3 ? 2.95 : n <= 5 ? 2.75 : 2.35));
    areaIconPx = Math.min(maxCap, Math.max(minCap, areaIconPx));
    if (rowH > 0) {
      areaIconPx = Math.min(
        areaIconPx,
        Math.max(minCap, Math.floor((rowH - rowPad * 2) * (n <= 5 ? 0.72 : 0.85)))
      );
    }
    var symbolColMax = Math.min(
      108,
      Math.max(58, Math.ceil(areaIconPx * venueAspect) + 4)
    );
    var iconPx = Math.max(dense ? 24 : 26, Math.round(areaIconPx * 0.92));
    var labelFs = Math.max(8, Math.min(11, Math.round(nameFont * 0.65)));
    var stackGap = 0;
    var labelBlock = Math.ceil(labelFs * 1.12) + stackGap;
    return {
      iconPx: iconPx,
      areaIconPx: areaIconPx,
      labelFs: labelFs,
      symbolColMax: symbolColMax,
      stackGap: stackGap,
      labelBlock: labelBlock,
    };
  }

  global.portalMeasureTodaySessionRowHeight = portalMeasureTodaySessionRowHeight;

  global.portalNormalizeAreaNoteKey = portalNormalizeAreaNoteKey;
  global.portalDisplayAreaNoteLabel = portalDisplayAreaNoteLabel;
  global.portalResolveAreaNoteLabelFromItem = portalResolveAreaNoteLabelFromItem;
  global.portalAreaNoteIconHtml = portalAreaNoteIconHtml;
  global.portalTodayAreaNoteMetrics = portalTodayAreaNoteMetrics;

  global.portalTomorrowAreaNoteHtml = function portalTomorrowAreaNoteHtml(noteRaw, activity) {
    var note = String(noteRaw || "").trim();
    var act = String(activity || "").trim();
    var line1 = "";
    var line2 = "";
    if (note.indexOf(" / ") >= 0) {
      var parts = note.split(" / ").map(function (p) { return p.trim(); }).filter(Boolean);
      line1 = parts[0] || "";
      line2 = parts.slice(1).join(" / ") || "";
    } else if (note && act && note.toLowerCase() !== act.toLowerCase()) {
      line1 = note;
      line2 = act;
    } else if (note) {
      line1 = note;
    } else if (act) {
      line2 = act;
    }
    if (!line1 && !line2) return "";
    var html = '<span class="calendar-day-tomorrow-note">';
    if (line1) html += '<span class="calendar-day-tomorrow-note__ln1">' + escapeHtml(line1) + "</span>";
    if (line2) html += '<span class="calendar-day-tomorrow-note__ln2">' + escapeHtml(line2) + "</span>";
    html += "</span>";
    return html;
  };

  /** @deprecated use portalTomorrowAreaNoteHtml */
  global.portalTomorrowTwoLineNoteHtml = global.portalTomorrowAreaNoteHtml;

  /** TODAY right column: icon crop + HTML label (same size for every area, Lane SE reference). */
  global.portalAreaNoteTodayColumnHtml = function portalAreaNoteTodayColumnHtml(label) {
    var key = ICONS[label] ? label : portalNormalizeAreaNoteKey(label);
    if (!key || !ICONS[key]) return "";
    var meta = ICONS[key];
    return portalAreaNoteIconHtml(label, {
      showLabel: true,
      labelText: portalAreaNoteCaptionLabel(key, meta) || portalDisplayAreaNoteLabel(label),
      layout: "stack",
      venueSessionCard: false,
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
