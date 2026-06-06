/**
 * Area / pool note icons for TODAY rows, Next session list, etc.
 * PNG assets cropped from the approved mockup (portal/area-note-icons/).
 */
(function (global) {
  "use strict";

  var ICON_IMG_BASE = "/portal/area-note-icons/";
  var ICON_IMG_VER = "20260622-fish-shark-colors";
  var IMG_CLASS = "session-area-note-img";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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

  function portalAreaNoteIconMarkup(key) {
    return (
      '<img class="' +
      IMG_CLASS +
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
      portalAreaNoteIconMarkup(key) +
      "</span>";
    if (!opts.showLabel) return iconHtml;
    var caption = portalAreaNoteCaptionLabel(key, meta);
    return (
      '<span class="session-area-note-stack">' +
      iconHtml +
      '<span class="session-area-note-label" aria-hidden="true">' +
      escapeHtml(caption) +
      "</span></span>"
    );
  }

  global.portalNormalizeAreaNoteKey = portalNormalizeAreaNoteKey;
  global.portalResolveAreaNoteLabelFromItem = portalResolveAreaNoteLabelFromItem;
  global.portalAreaNoteIconHtml = portalAreaNoteIconHtml;
})(typeof window !== "undefined" ? window : globalThis);
