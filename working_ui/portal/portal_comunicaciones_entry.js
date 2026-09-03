/**
 * Staff dashboard — light launcher for the independent Comunicaciones app.
 * Replaces the CS WhatsApp sheet button (WhatsApp API UI) without loading that sheet.
 */
(function (global) {
  "use strict";

  function normalizeKey(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isCommsUser(_key) {
    return true;
  }

  function supabaseBox() {
    return global.__PORTAL_SUPABASE__ || null;
  }

  function client() {
    var box = supabaseBox();
    return box && box.client ? box.client : null;
  }

  var lastUnreadCount = 0;
  var fetchInFlight = null;
  var COMMS_ICO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

  function commsUrl() {
    try {
      return new URL("comunicaciones.html", global.location.href).href;
    } catch (_e) {
      return "comunicaciones.html";
    }
  }

  function openApp() {
    global.location.href = commsUrl();
  }

  function currentStaffKey() {
    try {
      if (typeof global.resolveTopbarStaffKey === "function") {
        var k = normalizeKey(global.resolveTopbarStaffKey() || "");
        if (k) return k;
      }
      if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        return normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
    } catch (_e) {}
    return "";
  }

  function applyUnreadBadge(count) {
    lastUnreadCount = Math.max(0, Number(count) || 0);
    var btn = document.getElementById("topbarStaffWaBtn");
    if (btn) {
      var inGrid = btn.classList.contains("topbar-tool-btn--staff-wa");
      btn.classList.toggle("topbar-staff-wa-btn--unread", !inGrid && lastUnreadCount > 0);
      btn.classList.toggle("topbar-tool-btn--staff-wa-unread", inGrid && lastUnreadCount > 0);
      var badge = btn.querySelector(".topbar-staff-wa-btn__badge");
      if (lastUnreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "topbar-staff-wa-btn__badge";
          badge.setAttribute("aria-hidden", "true");
          btn.appendChild(badge);
        }
        badge.textContent = lastUnreadCount > 9 ? "9+" : String(lastUnreadCount);
      } else if (badge) {
        badge.remove();
      }
      var lab = lastUnreadCount > 0 ? "Comunicaciones (" + lastUnreadCount + ")" : "Comunicaciones";
      btn.setAttribute("aria-label", lab);
      var labelEl = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
      if (labelEl) labelEl.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
    }
    var alertsBlock = document.getElementById("portalStaffWaAlertsBlock");
    var alertsStatus = document.getElementById("portalStaffWaAlertsStatus");
    var alertsBtn = document.getElementById("portalStaffWaAlertsOpenBtn");
    if (alertsBlock) {
      alertsBlock.hidden = false;
      alertsBlock.classList.toggle("portal-alerts-block--wa-unread", lastUnreadCount > 0);
      if (alertsStatus) {
        alertsStatus.textContent =
          lastUnreadCount > 0
            ? lastUnreadCount === 1
              ? "1 unread message"
              : lastUnreadCount + " unread messages"
            : "No unread messages";
      }
      if (alertsBtn) {
        alertsBtn.textContent = lastUnreadCount > 0 ? "Open Comunicaciones (" + lastUnreadCount + ")" : "Open Comunicaciones";
      }
    }
  }

  async function refreshUnread() {
    if (fetchInFlight) return fetchInFlight;
    fetchInFlight = (async function () {
      try {
        var c = client();
        if (!c) return lastUnreadCount;
        var res = await c.rpc("communication_unread_count");
        if (res.error) return lastUnreadCount;
        var next = Math.max(0, Number(res.data) || 0);
        applyUnreadBadge(next);
        return lastUnreadCount;
      } catch (_e) {
        return lastUnreadCount;
      } finally {
        fetchInFlight = null;
      }
    })();
    return fetchInFlight;
  }

  function countSessionTopbarTools() {
    var roots = [];
    var left = document.getElementById("topbarToolsGridLeft");
    var right = document.getElementById("topbarToolsGridRight");
    var legacy = document.getElementById("topbarToolsGrid");
    if (left) roots.push(left);
    if (right) roots.push(right);
    if (!left && !right && legacy) roots.push(legacy);
    var n = 0;
    roots.forEach(function (grid) {
      var cells = grid.querySelectorAll(".topbar-tool-cell");
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (cell.id === "topbarToolCellStaffWa") continue;
        if (cell.classList.contains("topbar-tool-cell--staff-wa")) continue;
        if (cell.hidden) continue;
        n++;
      }
    });
    return n;
  }

  function ensureWaGridCell() {
    var cell = document.getElementById("topbarToolCellStaffWa");
    if (cell) return cell;
    var host =
      document.getElementById("topbarToolsGridRight") ||
      document.getElementById("topbarWaRow") ||
      document.getElementById("topbarToolsGrid");
    if (!host) return null;
    cell = document.createElement("div");
    cell.id = "topbarToolCellStaffWa";
    cell.className = "topbar-tool-cell topbar-tool-cell--staff-wa topbar-tool-cell--span2";
    host.appendChild(cell);
    return cell;
  }

  function styleWaButtonForMode(btn, inGrid) {
    if (!btn) return;
    var lab = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
    var ico = btn.querySelector(".topbar-staff-wa-btn__ico, .topbar-tool-btn__ico");
    if (inGrid) {
      btn.className = "topbar-tool-btn topbar-tool-btn--staff-wa";
      if (ico) ico.className = "topbar-tool-btn__ico";
      if (lab) {
        lab.className = "topbar-tool-label";
        lab.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
      }
    } else {
      btn.className = "topbar-staff-wa-btn";
      if (ico) ico.className = "topbar-staff-wa-btn__ico";
      if (lab) {
        lab.className = "topbar-staff-wa-btn__label";
        lab.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
      }
    }
    if (lastUnreadCount > 0) {
      btn.classList.add(inGrid ? "topbar-tool-btn--staff-wa-unread" : "topbar-staff-wa-btn--unread");
    }
  }

  function placeWaInGrid(btn) {
    if (!btn) return;
    var cell = ensureWaGridCell();
    if (!cell) return;
    styleWaButtonForMode(btn, true);
    cell.hidden = false;
    cell.setAttribute("aria-hidden", "false");
    cell.style.gridColumn = "1 / -1";
    cell.style.width = "100%";
    if (btn.parentNode !== cell) cell.appendChild(btn);
    var right = document.getElementById("topbarToolsGridRight");
    if (right && cell.parentNode !== right) right.appendChild(cell);
  }

  function syncWaTopbarPlacement() {
    var btn = document.getElementById("topbarStaffWaBtn");
    var cell = document.getElementById("topbarToolCellStaffWa");
    var lead = document.querySelector(".topbar-lead");
    if (!btn) {
      if (cell) {
        cell.hidden = true;
        cell.setAttribute("aria-hidden", "true");
      }
      if (lead) lead.classList.remove("topbar-lead--wa-in-grid");
      return;
    }
    placeWaInGrid(btn);
    if (lead) lead.classList.add("topbar-lead--wa-in-grid");
    applyUnreadBadge(lastUnreadCount);
    try {
      if (typeof global.portalSyncHaloFlankToolPlacement === "function") {
        global.portalSyncHaloFlankToolPlacement();
      }
    } catch (_e) {}
  }

  function ensureButton(staffKey) {
    if (
      !document.getElementById("topbarToolsGridLeft") &&
      !document.getElementById("topbarToolsGridRight") &&
      !document.getElementById("topbarToolsGrid") &&
      !document.getElementById("topbarWaRow")
    ) {
      return;
    }
    var existing = document.getElementById("topbarStaffWaBtn");
    if (existing) {
      existing.setAttribute("aria-label", "Comunicaciones");
      if (!existing.getAttribute("href")) existing.setAttribute("href", commsUrl());
      syncWaTopbarPlacement();
      void refreshUnread();
      return existing;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "topbarStaffWaBtn";
    btn.className = "topbar-staff-wa-btn";
    btn.setAttribute("aria-label", "Comunicaciones");
    btn.innerHTML =
      '<span class="topbar-staff-wa-btn__ico" aria-hidden="true">' +
      COMMS_ICO +
      "</span>" +
      '<span class="topbar-staff-wa-btn__label">COMMS</span>';
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openApp();
    });
    placeWaInGrid(btn);
    syncWaTopbarPlacement();
    void refreshUnread();
    return btn;
  }

  function syncForStaffKey(staffKey) {
    ensureButton(staffKey);
    if (isCommsUser(staffKey)) void refreshUnread();
    else applyUnreadBadge(0);
  }

  global.portalStaffWaSyncTopbar = syncForStaffKey;
  global.portalStaffWaSyncPlacement = syncWaTopbarPlacement;
  global.portalCountSessionTopbarTools = countSessionTopbarTools;
  global.portalStaffWaOpen = openApp;
  global.portalStaffWaClose = function () {};
  global.portalStaffIsWhatsappLeaderKey = isCommsUser;
  global.portalStaffWaRefreshUnread = refreshUnread;
  global.portalCommsOpen = openApp;
  global.portalCommsRefreshUnread = refreshUnread;

  function boot() {
    try {
      var key = "";
      if (typeof global.resolveTopbarStaffKey === "function") {
        key = global.resolveTopbarStaffKey() || "";
      }
      if (!key && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        key = normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
      syncForStaffKey(key);
    } catch (_e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  try {
    global.addEventListener("portal:staff-profile-ready", boot);
    global.addEventListener("portal:supabase-ready", function () {
      boot();
      void refreshUnread();
    });
  } catch (_e2) {}
  if (!global.__PORTAL_STAFF_WA_UNREAD_POLL__) {
    global.__PORTAL_STAFF_WA_UNREAD_POLL__ = true;
    global.setInterval(function () {
      try {
        if (document.visibilityState === "visible") void refreshUnread();
      } catch (_p) {}
    }, 20000);
  }
})(typeof window !== "undefined" ? window : this);
