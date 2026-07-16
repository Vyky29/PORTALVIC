/**
 * Speech-bubble chat icons with a single letter (P = parents, S = staff).
 * Used on admin topbar and staff CS WhatsApp entry.
 */
(function (global) {
  function escLetter(letter) {
    var L = String(letter || "").trim().slice(0, 1).toUpperCase();
    return /^[A-Z]$/.test(L) ? L : "";
  }

  function portalChatBubbleIconSvg(letter, opts) {
    opts = opts || {};
    var L = escLetter(letter) || "?";
    var size = Number(opts.size) > 0 ? Number(opts.size) : 20;
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:' +
      size +
      "px;height:" +
      size +
      'px">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '<text x="12" y="12.8" text-anchor="middle" dominant-baseline="middle" fill="currentColor" stroke="none" font-size="9.5" font-weight="800" font-family="system-ui,-apple-system,BlinkMacSystemFont,sans-serif">' +
      L +
      "</text></svg>"
    );
  }

  global.portalChatBubbleIconSvg = portalChatBubbleIconSvg;
  global.portalParentChatIconSvg = function portalParentChatIconSvg(opts) {
    return portalChatBubbleIconSvg("P", opts);
  };
  global.portalStaffChatIconSvg = function portalStaffChatIconSvg(opts) {
    return portalChatBubbleIconSvg("S", opts);
  };
})(typeof window !== "undefined" ? window : globalThis);
