/**
 * Shared stroke SVG icons for internal DM / chat (matches admin nav & achievements style).
 */
(function (global) {
  "use strict";

  var INNER = {
    phone:
      '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>',
    video:
      '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    calendar:
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    mic:
      '<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
    gallery:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    camera:
      '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
    paperclip:
      '<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>',
    folder:
      '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
    chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    crown:
      '<path d="M2 20h20"/><path d="M4 20V9l4 3 4-6 4 6 4-3v11"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    users:
      '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  };

  var KIND_MAP = {
    audio: "phone",
    voice: "phone",
    video: "video",
    meeting: "calendar",
  };

  function svg(name, extraClass) {
    var inner = INNER[name];
    if (!inner) return "";
    var cls = "portal-dm-ico" + (extraClass ? " " + extraClass : "");
    return (
      '<svg class="' +
      cls +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner +
      "</svg>"
    );
  }

  function forKind(kind) {
    var name = KIND_MAP[String(kind || "").toLowerCase()] || "phone";
    return svg(name);
  }

  function injectStyles() {
    if (document.getElementById("portal-dm-icon-styles")) return;
    var st = document.createElement("style");
    st.id = "portal-dm-icon-styles";
    st.textContent =
      ".portal-dm-ico{display:block;width:1em;height:1em;flex-shrink:0}" +
      ".portal-dm-call-bar-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--blue,#2d84b3)}" +
      ".portal-dm-call-bar-icon .portal-dm-ico{width:16px;height:16px}" +
      ".portal-dm-call-card-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--blue,#2d84b3)}" +
      ".portal-dm-call-card-icon .portal-dm-ico{width:22px;height:22px}" +
      ".portal-dm-call-end-icon{display:inline-flex;align-items:center;justify-content:center;color:#64748b}" +
      ".portal-dm-call-end-icon .portal-dm-ico{width:15px;height:15px}" +
      ".portal-incoming-call__icon{display:flex;align-items:center;justify-content:center;color:#5a9fc4;margin:0 0 12px}" +
      ".portal-incoming-call__icon .portal-dm-ico{width:52px;height:52px;stroke-width:1.35}" +
      ".portal-dm-voice-btn,.portal-dm-attach-btn{display:inline-flex;align-items:center;justify-content:center;color:var(--ink,#173247)}" +
      ".portal-dm-voice-btn .portal-dm-ico,.portal-dm-attach-btn .portal-dm-ico{width:20px;height:20px}" +
      ".portal-dm-voice-play{display:inline-flex;align-items:center;justify-content:center}" +
      ".portal-dm-voice-play .portal-dm-ico{width:14px;height:14px}" +
      ".portal-dm-back-btn,.portal-cs-cliq__back-btn{display:inline-flex;align-items:center;justify-content:center;color:var(--blue,#2d84b3)}" +
      ".portal-dm-back-btn::before,.portal-cs-cliq__back-btn::before{content:none!important;display:none!important}" +
      ".portal-dm-back-btn .portal-dm-ico,.portal-cs-cliq__back-btn .portal-dm-ico,.portal-cs-cliq__back-icon .portal-dm-ico{width:22px;height:22px}" +
      ".portal-cs-cliq__back-icon{display:inline-flex;align-items:center;justify-content:center;line-height:0;flex-shrink:0}" +
      ".portal-dm-file-msg .portal-dm-ico{width:16px;height:16px;color:#64748b}";
    document.head.appendChild(st);
  }

  function upgradeBackButton(btn) {
    if (!btn || btn.getAttribute("data-portal-back-icon") === "1") return;
    var svgHtml = svg("chevronLeft");
    if (!svgHtml) return;
    var iconWrap = btn.querySelector(".portal-cs-cliq__back-icon");
    if (iconWrap) {
      iconWrap.innerHTML = svgHtml;
      iconWrap.classList.add("portal-cs-cliq__back-icon--svg");
    } else if (!btn.querySelector(".portal-dm-ico")) {
      btn.textContent = "";
      btn.insertAdjacentHTML("afterbegin", svgHtml);
    }
    btn.setAttribute("data-portal-back-icon", "1");
  }

  function upgrade(root) {
    root = root || document;
    root.querySelectorAll("[data-dm-icon]").forEach(function (el) {
      var name = el.getAttribute("data-dm-icon");
      if (name) el.innerHTML = svg(name);
    });
    root.querySelectorAll(".portal-dm-back-btn, .portal-cs-cliq__back-btn").forEach(upgradeBackButton);
  }

  injectStyles();

  global.portalDmIcons = {
    svg: svg,
    forKind: forKind,
    upgrade: upgrade,
    upgradeBackButton: upgradeBackButton,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      upgrade(document);
    });
  } else {
    upgrade(document);
  }
})(typeof window !== "undefined" ? window : globalThis);
