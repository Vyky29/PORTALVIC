(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Avatar + gap sizing for Next session chips on day-off TODAY panel. */
  function portalTodayNextChipGridVars(count) {
    var n = Math.max(1, Number(count) || 1);
    var avatar = 64;
    if (n === 1) avatar = 84;
    else if (n === 2) avatar = 76;
    else if (n <= 4) avatar = 68;
    else if (n <= 6) avatar = 64;
    else if (n <= 9) avatar = 60;
    else if (n <= 12) avatar = 50;
    else avatar = 44;
    var gapX = n >= 7 ? 5 : 8;
    var gapY = n >= 7 ? 4 : 6;
    return { avatar: avatar, gapX: gapX, gapY: gapY };
  }

  /**
   * 6-column grid placement: rows of 3; orphan row centred (1 mid, 2 split halves).
   * index is 0-based.
   */
  function portalTodayNextChipColumnStyle(index, count) {
    var i = index | 0;
    var n = Math.max(1, Number(count) || 1);
    if (i < 0 || i >= n) return "";
    var remainder = n % 3;
    var fullRows = Math.floor(n / 3);
    var row = Math.floor(i / 3);
    var isPartialRow = remainder > 0 && row === fullRows;
    if (!isPartialRow) {
      var pos = i % 3;
      return "grid-column:" + (1 + pos * 2) + " / span 2";
    }
    var idxInPartial = i - fullRows * 3;
    if (remainder === 1) return "grid-column:3 / span 2";
    return idxInPartial === 0 ? "grid-column:2 / span 2" : "grid-column:4 / span 2";
  }

  var TODAY_PARTICIPANT_MED_ICON =
    '<svg class="today-participant-chip__med-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M9 2h6a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1z"/></svg>';

  function chipAvatarGenderClass(name) {
    if (typeof global.portalParticipantGenderClass === "function") {
      return global.portalParticipantGenderClass(name, "today-participant-chip__avatar--");
    }
    return "";
  }

  function chipAvatarInitials(name) {
    if (typeof global.portalParticipantInitials === "function") {
      return global.portalParticipantInitials(name);
    }
    return String(name || "?").slice(0, 2).toUpperCase();
  }

  /** Day-off NEXT SESSION participant circles — one equal chip per client. */
  function portalTodayNextParticipantChipsHtml(participants, opts) {
    opts = opts || {};
    var esc = typeof opts.escapeHtml === "function" ? opts.escapeHtml : escapeHtml;
    var chips = Array.isArray(participants) ? participants : [];
    if (!chips.length) return "";
    var gridVars = portalTodayNextChipGridVars(chips.length);
    var html =
      '<div class="today-day-panel__chips" style="--today-next-avatar:' +
      gridVars.avatar +
      "px;--today-next-chip-gap-x:" +
      gridVars.gapX +
      "px;--today-next-chip-gap-y:" +
      gridVars.gapY +
      'px" data-chip-count="' +
      chips.length +
      '" role="list">';
    chips.forEach(function (p, chipIdx) {
      var rawName = String((p && p.name) || "—").trim();
      var name = esc(rawName);
      var rawId = String((p && p.clientId) || "").trim();
      var src = p && p.photoUrl ? String(p.photoUrl).trim() : "";
      var loadAttr =
        typeof global.portalParticipantPhotoLoadingAttr === "function"
          ? global.portalParticipantPhotoLoadingAttr()
          : ' loading="eager" fetchpriority="low"';
      var genderCls = chipAvatarGenderClass(rawName);
      var av = src
        ? '<img class="portal-screenshot-protected" src="' +
          esc(src) +
          '" alt=""' +
          loadAttr +
          ' decoding="async" draggable="false" onerror="this.remove();var el=this.parentElement;if(el){el.classList.add(\'today-participant-chip__avatar--initials\');el.textContent=' +
          JSON.stringify(chipAvatarInitials(rawName)) +
          ";}" +
          '"/>'
        : esc(chipAvatarInitials(rawName));
      var chipCol = portalTodayNextChipColumnStyle(chipIdx, chips.length);
      html +=
        '<button type="button" class="today-participant-chip"' +
        (chipCol ? ' style="' + chipCol + '"' : "") +
        ' data-next-session-participant="1" data-next-session-client="' +
        esc(rawId) +
        '" data-next-session-name="' +
        esc(rawName) +
        '" aria-label="Open profile for ' +
        name +
        '" role="listitem">';
      html += '<span class="today-participant-chip__avatar-wrap">';
      html +=
        '<span class="today-participant-chip__avatar' +
        (src ? "" : " today-participant-chip__avatar--initials") +
        genderCls +
        '">' +
        av +
        "</span>";
      if (p && p.hasMedicalAlert) {
        html +=
          '<span class="today-participant-chip__med" title="Medical condition on file">' +
          TODAY_PARTICIPANT_MED_ICON +
          "</span>";
      }
      html += "</span>";
      html += '<span class="today-participant-chip__name">' + name + "</span></button>";
    });
    html += "</div>";
    return html;
  }

  global.portalTodayNextChipGridVars = portalTodayNextChipGridVars;
  global.portalTodayNextChipColumnStyle = portalTodayNextChipColumnStyle;
  global.portalTodayNextParticipantChipsHtml = portalTodayNextParticipantChipsHtml;
})(typeof window !== "undefined" ? window : globalThis);
