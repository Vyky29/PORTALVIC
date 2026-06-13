/**
 * WhatsApp-style internal chat composer: camera + mic when empty, Send when typing.
 */
(function (global) {
  "use strict";

  function sync(inputId) {
    var inp = document.getElementById(inputId || "internalChatInput");
    if (!inp) return;
    var composer = inp.closest(".portal-cs-cliq-composer--chat");
    if (!composer) return;
    var hasText = !!String(inp.value || "").trim();
    composer.classList.toggle("portal-cs-cliq-composer--has-text", hasText);
    var sendBtn = document.getElementById("internalChatSendBtn");
    if (sendBtn) {
      sendBtn.hidden = !hasText;
      sendBtn.setAttribute("aria-hidden", hasText ? "false" : "true");
      sendBtn.tabIndex = hasText ? 0 : -1;
    }
  }

  function bind(inputId) {
    var inp = document.getElementById(inputId || "internalChatInput");
    if (!inp || inp.dataset.portalWaComposerBound === "1") return;
    inp.dataset.portalWaComposerBound = "1";
    inp.addEventListener("input", function () {
      sync(inputId);
    });
    sync(inputId);
  }

  global.portalDmComposerWa = {
    sync: sync,
    bind: bind,
  };
})(typeof window !== "undefined" ? window : globalThis);
