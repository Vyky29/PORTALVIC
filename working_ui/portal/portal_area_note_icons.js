/**
 * Area / pool note icons for TODAY rows, Next session list, etc.
 * TODAY rows use icon + compact label stack; small contexts stay icon-only.
 */
(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var SVG_CLASS = "session-area-note-svg";

  var ICONS = {
    "big-pool": {
      label: "Big Pool",
      cls: "session-area-note-icon--big-pool",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<rect x="3" y="7" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M5 12.5c2.5-1.2 5-1.2 7.5 0s5 1.2 7.5 0" stroke="#4fc3f7" stroke-width="1.5" stroke-linecap="round"/>' +
        '<circle cx="18.5" cy="10" r="1.15" fill="#4fc3f7"/>' +
        '<circle cx="18.5" cy="14.5" r="1.15" fill="#4fc3f7"/>' +
        "</svg>",
    },
    "small-pool": {
      label: "Small Pool",
      cls: "session-area-note-icon--small-pool",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<rect x="5" y="8" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.75"/>' +
        '<path d="M7 12.5c2-1 4-1 6 0s4 1 6 0" stroke="#4fc3f7" stroke-width="1.5" stroke-linecap="round"/>' +
        '<circle cx="17" cy="11.5" r="1.1" fill="#4fc3f7"/>' +
        "</svg>",
    },
    "teaching-pool": {
      label: "Teaching Pool",
      cls: "session-area-note-icon--teaching-pool",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M4.5 17.5c2-.7 4-.7 6 0s4 .7 6 0 4-.7 6 0" stroke="#4fc3f7" stroke-width="1.7" stroke-linecap="round"/>' +
        '<path d="M12 17.5V10.8" stroke="#4fc3f7" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M12 10.8C9.4 8.8 7.8 7 7 5" stroke="#81d4fa" stroke-width="1.75" stroke-linecap="round"/>' +
        '<path d="M12 10.8c2.6-2 4.2-3.8 5-5.8" stroke="#4fc3f7" stroke-width="1.75" stroke-linecap="round"/>' +
        '<path d="M6.8 6.5c0 1.15-.75 2.1-1.45 2.1s-1.45-.95-1.45-2.1.65-1.95 1.45-2.45c.8.5 1.45 1.3 1.45 2.45z" fill="#4fc3f7"/>' +
        '<path d="M12 4c0 1.35-.95 2.45-1.75 2.45S8.5 5.35 8.5 4s.95-2.2 1.75-2.75C11.05 1.8 12 3 12 4z" fill="#81d4fa"/>' +
        '<path d="M17.2 6.5c0 1.15-.75 2.1-1.45 2.1s-1.45-.95-1.45-2.1.65-1.95 1.45-2.45c.8.5 1.45 1.3 1.45 2.45z" fill="#4fc3f7"/>' +
        "</svg>",
    },
    "lane-se": {
      label: "Lane (SE)",
      cls: "session-area-note-icon--lane-se",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M19.5 12l-3.2-2.6v5.2z" fill="currentColor"/>' +
        '<ellipse cx="10.8" cy="12" rx="6.8" ry="4.1" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M13.8 8.8c-.95-.95-1.85-1.35-2.7-1.35" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
        '<path d="M8.8 14.6c.85.55 1.7.8 2.55.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="7.2" cy="11.5" r="1.2" fill="currentColor"/>' +
        "</svg>",
    },
    "lane-de": {
      label: "Lane (DE)",
      cls: "session-area-note-icon--lane-de",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M20.5 12 17.2 10 14.5 9.6 12.2 10.2 10.5 5.4 9 10.2 5.5 11 3 12 5.5 13 9 13.8 10.5 18.6 12.2 13.8 14.5 14.3 17.2 14Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<circle cx="6.4" cy="11.2" r="1.15" fill="currentColor"/>' +
        "</svg>",
    },
    "hub-room": {
      label: "Hub Room",
      cls: "session-area-note-icon--hub-room",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1v-7.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<path d="M14 5.5V3.5h2.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        "</svg>",
    },
    "room-2": {
      label: "Room 2",
      cls: "session-area-note-icon--room-2",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M4.5 11.5 12 5.5l7.5 6V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        "</svg>",
    },
    gym: {
      label: "Gym",
      cls: "session-area-note-icon--gym",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M6 10v4M18 10v4M8 12h8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
        '<rect x="3.5" y="9" width="2.5" height="6" rx=".6" stroke="currentColor" stroke-width="1.5"/>' +
        '<rect x="18" y="9" width="2.5" height="6" rx=".6" stroke="currentColor" stroke-width="1.5"/>' +
        "</svg>",
    },
    "climbing-wall": {
      label: "Climbing Wall",
      cls: "session-area-note-icon--climbing-wall",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M5 19 12 4l7 15H5z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>' +
        '<circle cx="10" cy="13" r="1.1" fill="#e53935"/>' +
        '<circle cx="13" cy="10.5" r="1" fill="#fdd835"/>' +
        '<circle cx="11.5" cy="16" r=".95" fill="#43a047"/>' +
        '<circle cx="14.5" cy="14.5" r="1" fill="#1e88e5"/>' +
        "</svg>",
    },
    "day-center": {
      label: "Day Centre",
      cls: "session-area-note-icon--day-center",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<circle cx="9" cy="9.5" r="2.2" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M5.5 18c0-2.2 1.6-3.8 3.5-3.8s3.5 1.6 3.5 3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        '<circle cx="15.5" cy="10" r="1.7" stroke="currentColor" stroke-width="1.4"/>' +
        '<path d="M13 17.5c.3-1.6 1.3-2.7 2.5-2.7s2.2 1.1 2.5 2.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
        '<circle cx="18.5" cy="9" r="1.3" stroke="currentColor" stroke-width="1.3"/>' +
        "</svg>",
    },
    bespoke: {
      label: "Bespoke",
      cls: "session-area-note-icon--bespoke",
      svg:
        '<svg class="' +
        SVG_CLASS +
        '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none">' +
        '<path d="M12 4.5 13.6 9l4.7.2-3.7 2.7 1.4 4.6L12 14.8 7 16.5l1.4-4.6-3.7-2.7 4.7-.2L12 4.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M5 6.5 6 8M19 7l-1.2 1.2M6 18l1-1.2M18.5 17l.8-1.3" stroke="#fdd835" stroke-width="1.3" stroke-linecap="round"/>' +
        "</svg>",
    },
  };

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
      meta.svg +
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
