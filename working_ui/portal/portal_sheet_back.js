/**
 * Sheet back navigation — stack history, header handle tap/swipe, Quick menu toggle.
 * Staff + lead dashboards wire openSheet/closeSheet and call portalInitSheetBackNavigation().
 */
(function (global) {
  "use strict";

  var stack = [];
  var backNavActive = false;
  var swipe = null;
  var suppressHandleClick = false;
  var SWIPE_MIN_PX = 36;

  function getOpenSheetIds() {
    if (!global.document) return [];
    return Array.prototype.slice
      .call(global.document.querySelectorAll(".sheet.open"))
      .map(function (s) {
        return String(s.id || "").trim();
      })
      .filter(Boolean);
  }

  function getTopOpenSheetId() {
    var ids = getOpenSheetIds();
    return ids.length ? ids[ids.length - 1] : null;
  }

  function clearStack() {
    stack = [];
  }

  function popNavForSheet(sheetId) {
    var id = String(sheetId || "").trim();
    if (!id) return null;
    for (var i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].to === id) {
        return stack.splice(i, 1)[0];
      }
    }
    return null;
  }

  function peekNavForSheet(sheetId) {
    var id = String(sheetId || "").trim();
    if (!id) return null;
    for (var i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].to === id) return stack[i];
    }
    return null;
  }

  function portalRecordSheetNavigation(nextId) {
    var next = String(nextId || "").trim();
    if (!next) return;
    var from = getTopOpenSheetId();
    if (from === next) return;
    stack.push({ from: from, to: next });
  }

  function portalOnSheetClosed(opts) {
    if (backNavActive) return;
    if (opts && opts.preserveNavStack) return;
    clearStack();
  }

  function portalGetSheetBackTarget(sheetId) {
    var entry = peekNavForSheet(sheetId || getTopOpenSheetId());
    return entry ? entry.from : null;
  }

  function closeNestedClientSheets() {
    var gen = global.document.getElementById("clientGeneralSheet");
    if (gen && gen.classList.contains("open")) {
      if (typeof global.closeClientGeneralSheet === "function") {
        global.closeClientGeneralSheet();
        return true;
      }
    }
    var overview = global.document.getElementById("clientSessionsOverviewSheet");
    if (overview && overview.classList.contains("open")) {
      if (typeof global.closeClientSessionsOverviewSheet === "function") {
        global.closeClientSessionsOverviewSheet();
        return true;
      }
    }
    return false;
  }

  function backInternalChatThread() {
    var chat = global.document.getElementById("internalChatSheet");
    if (!chat || !chat.classList.contains("open")) return false;
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var threadId = ui.threadId ? String(ui.threadId).trim() : "";
    if (!threadId) return false;
    if (
      typeof global.portalInternalChatOfficeRestricted === "function" &&
      global.portalInternalChatOfficeRestricted()
    ) {
      if (typeof global.portalCloseInternalChatToDashboard === "function") {
        global.portalCloseInternalChatToDashboard();
        return true;
      }
      if (typeof global.portalCloseInternalChatReturnToAlertsMenu === "function") {
        global.portalCloseInternalChatReturnToAlertsMenu();
        return true;
      }
      return true;
    }
    ui.threadId = null;
    global.__PORTAL_INTERNAL_CHAT_UI = ui;
    var inp = global.document.getElementById("internalChatInput");
    if (inp) inp.value = "";
    if (typeof global.portalRenderInternalChatSheet === "function") {
      void global.portalRenderInternalChatSheet();
    }
    return true;
  }

  function portalNavigateSheetBack() {
    if (closeNestedClientSheets()) return true;
    if (backInternalChatThread()) return true;

    var current = getTopOpenSheetId();
    if (current === "internalChatSheet") {
      if (typeof global.portalCloseInternalChatToDashboard === "function") {
        global.portalCloseInternalChatToDashboard();
        clearStack();
        return true;
      }
    }

    if (!current) return false;

    var entry = popNavForSheet(current);
    var open = typeof global.openSheet === "function" ? global.openSheet : null;
    var close = typeof global.closeSheet === "function" ? global.closeSheet : null;

    backNavActive = true;
    try {
      if (entry && entry.from) {
        if (open) open(entry.from, { skipNavRecord: true });
        return true;
      }
      if (close) {
        close({ bypassAnnouncementLock: true });
        clearStack();
        return true;
      }
    } finally {
      backNavActive = false;
    }
    return false;
  }

  function portalQuickMenuDockShouldBack() {
    var menu = global.document.getElementById("menuSheet");
    if (menu && menu.classList.contains("open")) return true;
    var current = getTopOpenSheetId();
    if (!current) return false;
    return portalGetSheetBackTarget(current) === "menuSheet";
  }

  function portalIsQuickMenuSheetOpen() {
    var menu = global.document && global.document.getElementById("menuSheet");
    return !!(menu && menu.classList.contains("open"));
  }

  function portalCloseQuickMenuSheet() {
    if (!portalIsQuickMenuSheetOpen()) return false;
    var close = typeof global.closeSheet === "function" ? global.closeSheet : null;
    if (close) {
      close({ bypassAnnouncementLock: true });
      return true;
    }
    var menu = global.document.getElementById("menuSheet");
    if (menu) menu.classList.remove("open");
    return true;
  }

  function portalSyncQuickMenuDockChrome() {
    var btn = global.document && global.document.getElementById("dockQuickMenuTile");
    if (!btn) return;
    var open = portalIsQuickMenuSheetOpen();
    btn.setAttribute("aria-label", open ? "Close quick menu" : "Open quick menu");
    btn.setAttribute("aria-pressed", open ? "true" : "false");
    btn.classList.toggle("dock-nav-item--active", open);
  }

  /** Footer Quick menu: open on first tap, close on second (full menu sheet). */
  function portalToggleQuickMenuFromDock(opts) {
    opts = opts || {};
    try {
      if (typeof global.portalQuickMenuEntryMode !== "undefined") {
        global.portalQuickMenuEntryMode = "full";
      }
    } catch (_mode) {}
    if (portalIsQuickMenuSheetOpen()) {
      if (typeof global.portalNavigateSheetBack === "function") {
        global.portalNavigateSheetBack();
      } else {
        portalCloseQuickMenuSheet();
      }
      portalSyncQuickMenuDockChrome();
      return "closed";
    }
    if (typeof global.portalQuickMenuDockShouldBack === "function" && global.portalQuickMenuDockShouldBack()) {
      if (typeof global.portalNavigateSheetBack === "function") {
        global.portalNavigateSheetBack();
      } else {
        portalCloseQuickMenuSheet();
      }
      portalSyncQuickMenuDockChrome();
      return "back";
    }
    if (typeof global.openSheet === "function") {
      global.openSheet("menuSheet", opts.openOpts || {});
      portalSyncQuickMenuDockChrome();
      return "opened";
    }
    return "noop";
  }

  function handleTargetIsSheetBack(el) {
    if (!el || !el.closest) return false;
    if (el.closest(".sheet.sheet--popover")) return false;
    var head = el.closest(".sheet-head");
    if (!head) return false;
    var sheet = head.closest(".sheet");
    if (!sheet || !sheet.classList.contains("open")) return false;
    if (sheet.id === "setupReminderSheet") return false;
    var handle = head.querySelector(".sheet-handle");
    if (!handle || handle.offsetParent === null) return false;
    if (window.getComputedStyle(handle).display === "none") return false;
    return el === handle || handle.contains(el);
  }

  function onHandlePointerDown(ev) {
    if (!handleTargetIsSheetBack(ev.target)) return;
    swipe = {
      x: ev.clientX,
      y: ev.clientY,
      moved: false,
      pointerId: ev.pointerId,
    };
    try {
      ev.target.setPointerCapture(ev.pointerId);
    } catch (_cap) {}
  }

  function onHandlePointerMove(ev) {
    if (!swipe || swipe.pointerId !== ev.pointerId) return;
    if (Math.abs(ev.clientY - swipe.y) > 8 || Math.abs(ev.clientX - swipe.x) > 8) {
      swipe.moved = true;
    }
  }

  function onHandlePointerUp(ev) {
    if (!swipe || swipe.pointerId !== ev.pointerId) return;
    var deltaY = ev.clientY - swipe.y;
    var moved = swipe.moved;
    swipe = null;
    if (moved && deltaY >= SWIPE_MIN_PX) {
      ev.preventDefault();
      ev.stopPropagation();
      suppressHandleClick = true;
      global.setTimeout(function () {
        suppressHandleClick = false;
      }, 400);
      portalNavigateSheetBack();
    }
  }

  function onHandleClick(ev) {
    if (suppressHandleClick) {
      ev.preventDefault();
      return;
    }
    if (!handleTargetIsSheetBack(ev.target)) return;
    ev.preventDefault();
    portalNavigateSheetBack();
  }

  function decorateSheetHandles() {
    if (!global.document) return;
    Array.prototype.forEach.call(global.document.querySelectorAll(".sheet-handle"), function (el) {
      if (el.dataset.portalSheetBackBound === "1") return;
      el.dataset.portalSheetBackBound = "1";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", "Go back");
    });
  }

  function portalInitSheetBackNavigation() {
    decorateSheetHandles();
    if (global.__PORTAL_SHEET_BACK_BOUND__) return;
    global.__PORTAL_SHEET_BACK_BOUND__ = true;

    global.document.addEventListener("click", onHandleClick, true);
    global.document.addEventListener("pointerdown", onHandlePointerDown, true);
    global.document.addEventListener("pointermove", onHandlePointerMove, true);
    global.document.addEventListener("pointerup", onHandlePointerUp, true);
    global.document.addEventListener("pointercancel", function () {
      swipe = null;
    });

    global.document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var handle = ev.target && ev.target.classList && ev.target.classList.contains("sheet-handle")
        ? ev.target
        : null;
      if (!handle) return;
      ev.preventDefault();
      portalNavigateSheetBack();
    });
  }

  global.portalRecordSheetNavigation = portalRecordSheetNavigation;
  global.portalOnSheetClosed = portalOnSheetClosed;
  global.portalNavigateSheetBack = portalNavigateSheetBack;
  global.portalQuickMenuDockShouldBack = portalQuickMenuDockShouldBack;
  global.portalIsQuickMenuSheetOpen = portalIsQuickMenuSheetOpen;
  global.portalCloseQuickMenuSheet = portalCloseQuickMenuSheet;
  global.portalSyncQuickMenuDockChrome = portalSyncQuickMenuDockChrome;
  global.portalToggleQuickMenuFromDock = portalToggleQuickMenuFromDock;
  global.portalGetSheetBackTarget = portalGetSheetBackTarget;
  global.portalInitSheetBackNavigation = portalInitSheetBackNavigation;
  global.portalClearSheetNavigation = clearStack;
})(typeof window !== "undefined" ? window : globalThis);
