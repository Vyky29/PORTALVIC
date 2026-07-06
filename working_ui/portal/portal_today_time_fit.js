/**
 * portal_today_time_fit.js
 *
 * Keeps the "Today" session time labels (e.g. "12 to 12.30", "10.30 to 11") on a
 * SINGLE line by auto-shrinking the font so long labels fit their column instead
 * of wrapping to two lines. Short labels keep the full size; only long ones shrink.
 *
 * The CSS base rule already forces white-space:nowrap + ellipsis as a safety net,
 * so if this script never runs the label still won't wrap (it clips instead).
 */
(function (global) {
  'use strict';

  var MAX_PX = 13; // matches --today-time-fs base
  var MIN_PX = 7.5;
  var STEP = 0.5;
  var SELECTOR = '.section-card--today .session-line--time-stack .session-slot-time';

  function fitOne(el) {
    if (!el) return;
    // Only measurable when laid out (visible tab / has width).
    var box = el.clientWidth;
    if (!box) return;
    el.style.whiteSpace = 'nowrap';
    var size = MAX_PX;
    el.style.fontSize = size + 'px';
    var guard = 0;
    while (el.scrollWidth > el.clientWidth + 0.5 && size > MIN_PX && guard < 32) {
      size -= STEP;
      el.style.fontSize = size + 'px';
      guard++;
    }
  }

  function fitAll() {
    var nodes;
    try {
      nodes = document.querySelectorAll(SELECTOR);
    } catch (_) {
      return;
    }
    for (var i = 0; i < nodes.length; i++) fitOne(nodes[i]);
  }

  var raf = null;
  function schedule() {
    if (raf) {
      if (global.cancelAnimationFrame) global.cancelAnimationFrame(raf);
    }
    if (global.requestAnimationFrame) {
      raf = global.requestAnimationFrame(function () {
        raf = null;
        fitAll();
      });
    } else {
      fitAll();
    }
  }

  function boot() {
    schedule();
    // Re-fit when the roster data or layout changes.
    global.addEventListener('resize', schedule);
    global.addEventListener('orientationchange', schedule);
    global.addEventListener('portal:staff-dashboard-source-updated', schedule);
    global.addEventListener('portal:dashboard-rendered', schedule);
    document.addEventListener('visibilitychange', schedule);

    // Catch tab switches / re-renders that replace the Today cards.
    try {
      var obs = new MutationObserver(function () { schedule(); });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}

    // A couple of delayed passes cover late layout (web fonts, avatars, etc.).
    global.setTimeout(schedule, 300);
    global.setTimeout(schedule, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  global.addEventListener('load', schedule);

  global.portalFitTodayTimeLabels = fitAll;
})(typeof window !== 'undefined' ? window : this);
