/**
 * Area / pool note icons for TODAY rows, Next session list, etc.
 * PNG crops from approved mockup (portal/area-note-icons/).
 */
(function (global) {
  "use strict";

  var ICON_IMG_BASE = "/portal/area-note-icons/";
  var ICON_IMG_VER = "20260606-room-2-mockup";
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
    "climbing-wall": { label: "Climbing Wall", cls: "session-area-note-icon--climbing-wall" },
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
    if (s === "hub room") return "hub-room";
    if (s === "room 2" || s === "room2") return "room-2";
    if (s === "gym" || s === "fitness" || s === "fitness gym") return "gym";
    if (s === "wall" || s.indexOf("climbing") >= 0) return "climbing-wall";
    if (s.indexOf("day centre") >= 0 || s.indexOf("day center") >= 0) return "day-center";
    if (s === "bespoke") return "bespoke";
    if (s === "swimming" || s === "swimming activity" || s === "aquatic activity") return "";
    return "";
  }

  function portalResolveAreaNoteLabelFromItem(item) {
    if (!item) return "";
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
    return pool;
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

  function portalTodayAreaNoteMetrics(sessionCount, scrollMode, gridEl) {
    var n = Math.min(9, Math.max(1, sessionCount | 0));
    if (scrollMode) {
      return { iconPx: 32, areaIconPx: 38, labelFs: 12, symbolColMax: 72 };
    }
    var rowH = portalMeasureTodaySessionRowHeight(gridEl, n);
    var labelFs = 12;
    var labelReserve = labelFs + 4;
    var areaIconPx;
    if (rowH > 0) {
      areaIconPx = Math.round(rowH * 0.74 - labelReserve);
    } else {
      var areaByCount = { 1: 80, 2: 72, 3: 62, 4: 54, 5: 46, 6: 40 };
      areaIconPx = areaByCount[n] || 38;
    }
    var maxCap = n <= 1 ? 128 : n <= 2 ? 112 : n <= 4 ? 96 : n <= 6 ? 84 : 72;
    var minCap = n <= 2 ? 56 : n <= 4 ? 46 : 36;
    areaIconPx = Math.min(maxCap, Math.max(minCap, areaIconPx));
    var symbolColMax = Math.min(120, Math.max(68, Math.round(areaIconPx * 1.12)));
    if (n <= 6) {
      areaIconPx = Math.min(maxCap, Math.max(areaIconPx, symbolColMax - 8));
    }
    var iconPx = Math.max(28, Math.round(areaIconPx * 0.92));
    return { iconPx: iconPx, areaIconPx: areaIconPx, labelFs: labelFs, symbolColMax: symbolColMax };
  }

  global.portalMeasureTodaySessionRowHeight = portalMeasureTodaySessionRowHeight;

  global.portalNormalizeAreaNoteKey = portalNormalizeAreaNoteKey;
  global.portalResolveAreaNoteLabelFromItem = portalResolveAreaNoteLabelFromItem;
  global.portalAreaNoteIconHtml = portalAreaNoteIconHtml;
  global.portalTodayAreaNoteMetrics = portalTodayAreaNoteMetrics;
})(typeof window !== "undefined" ? window : globalThis);
