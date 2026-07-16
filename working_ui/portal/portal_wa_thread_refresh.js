/**
 * Skip WhatsApp thread DOM refresh while audio/video is playing (poll was cutting playback).
 */
(function (global) {
  function portalWaThreadMediaPlaying(host) {
    if (!host) return false;
    var nodes = host.querySelectorAll("audio,video");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.paused && !el.ended) return true;
    }
    return false;
  }

  function portalWaBindThreadMediaDefer(host, onDeferred) {
    if (!host || host.getAttribute("data-wa-media-defer-bound") === "1") return;
    host.setAttribute("data-wa-media-defer-bound", "1");
    host.addEventListener(
      "pause",
      function () {
        if (portalWaThreadMediaPlaying(host)) return;
        if (typeof onDeferred === "function") onDeferred();
      },
      true
    );
    host.addEventListener(
      "ended",
      function () {
        if (portalWaThreadMediaPlaying(host)) return;
        if (typeof onDeferred === "function") onDeferred();
      },
      true
    );
  }

  /**
   * @param {HTMLElement|null} host
   * @param {string} html
   * @param {string} sig content fingerprint
   * @param {{fromRefresh?:boolean,state?:{sig?:string,deferRefresh?:boolean}}} opts
   * @returns {boolean} true when DOM was updated
   */
  function portalWaMaybeUpdateThreadHost(host, html, sig, opts) {
    opts = opts || {};
    var fromRefresh = !!opts.fromRefresh;
    var state = opts.state || null;
    if (!host) return false;

    if (!fromRefresh) {
      host.innerHTML = html;
      if (state) {
        state.sig = sig;
        state.deferRefresh = false;
      }
      return true;
    }

    if (state && state.sig === sig) return false;

    if (portalWaThreadMediaPlaying(host)) {
      if (state) state.deferRefresh = true;
      return false;
    }

    host.innerHTML = html;
    if (state) {
      state.sig = sig;
      state.deferRefresh = false;
    }
    return true;
  }

  global.portalWaThreadMediaPlaying = portalWaThreadMediaPlaying;
  global.portalWaBindThreadMediaDefer = portalWaBindThreadMediaDefer;
  global.portalWaMaybeUpdateThreadHost = portalWaMaybeUpdateThreadHost;
})(typeof window !== "undefined" ? window : globalThis);
