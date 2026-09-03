/**
 * Communications unread badge + Staff COMMS launcher.
 * Same count on Staff, Admin, CEO and Office — per signed-in user, not shared reads.
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
  var unreadRetryTimer = null;
  var unreadChannel = null;
  var COMMS_ICO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';

  function detectFromPortal() {
    try {
      var path = String(global.location && global.location.pathname || "").toLowerCase();
      if (path.indexOf("admin_dashboard") >= 0) return "admin";
      if (path.indexOf("ceo_dashboard") >= 0) return "ceo";
      if (path.indexOf("office_portal") >= 0) return "office";
      if (path.indexOf("staff_dashboard") >= 0) return "staff";
    } catch (_e) {}
    return "";
  }

  function commsUrl() {
    try {
      var u = new URL("comunicaciones.html", global.location.href);
      var from = detectFromPortal();
      if (from) u.searchParams.set("from", from);
      return u.href;
    } catch (_e) {
      var from2 = detectFromPortal();
      return from2 ? "comunicaciones.html?from=" + encodeURIComponent(from2) : "comunicaciones.html";
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

  function unreadLabel(n) {
    if (n > 99) return "99+";
    return String(n);
  }

  function paintDataUnreadNodes(count) {
    var nodes = document.querySelectorAll("[data-comms-unread]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.textContent = count > 0 ? unreadLabel(count) : "0";
      el.classList.toggle("is-empty", count < 1);
      el.hidden = count < 1;
      el.setAttribute("aria-hidden", count < 1 ? "true" : "false");
      var host = el.closest("[data-comms-unread-host]") || el.parentElement;
      if (host) host.classList.toggle("portal-comms-has-unread", count > 0);
    }
  }

  function applyUnreadBadge(count) {
    lastUnreadCount = Math.max(0, Number(count) || 0);
    paintDataUnreadNodes(lastUnreadCount);
    var btn = document.getElementById("topbarStaffWaBtn");
    if (btn) {
      var inGrid = btn.classList.contains("topbar-tool-btn--staff-wa");
      btn.classList.toggle("topbar-staff-wa-btn--unread", !inGrid && lastUnreadCount > 0);
      btn.classList.toggle("topbar-tool-btn--staff-wa-unread", inGrid && lastUnreadCount > 0);
      var badge = btn.querySelector("[data-comms-unread], .topbar-staff-wa-btn__badge");
      if (lastUnreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "topbar-staff-wa-btn__badge";
          badge.setAttribute("data-comms-unread", "");
          badge.setAttribute("aria-hidden", "true");
          btn.appendChild(badge);
        }
        badge.hidden = false;
        badge.classList.remove("is-empty");
        badge.textContent = unreadLabel(lastUnreadCount);
      } else if (badge) {
        badge.hidden = true;
        badge.classList.add("is-empty");
        badge.textContent = "0";
      }
      var lab = lastUnreadCount > 0 ? "Communications (" + lastUnreadCount + ")" : "Communications";
      btn.setAttribute("aria-label", lab);
      var labelEl = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
      if (labelEl) labelEl.textContent = lastUnreadCount > 0 ? "COMMS (" + lastUnreadCount + ")" : "COMMS";
    }
    var adminBtn = document.getElementById("btnComunicaciones");
    if (adminBtn) {
      adminBtn.classList.toggle("admin-icon-btn--has-alerts", lastUnreadCount > 0);
      adminBtn.setAttribute(
        "aria-label",
        lastUnreadCount > 0 ? "Communications (" + lastUnreadCount + ")" : "Communications"
      );
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
        alertsBtn.textContent = lastUnreadCount > 0 ? "Open Communications (" + lastUnreadCount + ")" : "Open Communications";
      }
    }
    try {
      global.dispatchEvent(
        new CustomEvent("portal:comms-unread", { detail: { count: lastUnreadCount } })
      );
    } catch (_ev) {}
  }

  function scheduleUnreadRetry() {
    if (unreadRetryTimer) return;
    unreadRetryTimer = global.setTimeout(function () {
      unreadRetryTimer = null;
      void refreshUnread();
    }, 700);
  }

  async function refreshUnread() {
    if (fetchInFlight) return fetchInFlight;
    fetchInFlight = (async function () {
      try {
        var c = client();
        if (!c || !c.rpc) {
          scheduleUnreadRetry();
          return lastUnreadCount;
        }
        var res = await c.rpc("communication_unread_count");
        if (res.error) return lastUnreadCount;
        var next = Math.max(0, Number(res.data) || 0);
        applyUnreadBadge(next);
        subscribeUnreadRealtime();
        return lastUnreadCount;
      } catch (_e) {
        scheduleUnreadRetry();
        return lastUnreadCount;
      } finally {
        fetchInFlight = null;
      }
    })();
    return fetchInFlight;
  }

  function subscribeUnreadRealtime() {
    var c = client();
    if (!c || typeof c.channel !== "function") return;
    if (unreadChannel) return;
    try {
      unreadChannel = c
        .channel("portal-comms-unread-badge")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_messages" },
          function () {
            void refreshUnread();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communication_message_reads" },
          function () {
            void refreshUnread();
          }
        )
        .subscribe();
    } catch (_rt) {
      unreadChannel = null;
    }
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
      existing.setAttribute("aria-label", "Communications");
      if (!existing.getAttribute("href") || existing.getAttribute("href").indexOf("comunicaciones") >= 0) {
        existing.setAttribute("href", commsUrl());
      }
      syncWaTopbarPlacement();
      void refreshUnread();
      return existing;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "topbarStaffWaBtn";
    btn.className = "topbar-staff-wa-btn";
    btn.setAttribute("aria-label", "Communications");
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
  global.portalAdminRefreshCommsBadge = refreshUnread;

  function boot() {
    try {
      var key = "";
      if (typeof global.resolveTopbarStaffKey === "function") {
        key = global.resolveTopbarStaffKey() || "";
      }
      if (!key && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        key = normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
      if (
        document.getElementById("topbarToolsGridLeft") ||
        document.getElementById("topbarToolsGridRight") ||
        document.getElementById("topbarToolsGrid") ||
        document.getElementById("topbarWaRow") ||
        document.getElementById("topbarStaffWaBtn")
      ) {
        syncForStaffKey(key);
      } else {
        void refreshUnread();
      }
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
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") void refreshUnread();
    });
  } catch (_e2) {}
  if (!global.__PORTAL_COMMS_UNREAD_POLL__) {
    global.__PORTAL_COMMS_UNREAD_POLL__ = true;
    global.setInterval(function () {
      try {
        if (document.visibilityState === "visible") void refreshUnread();
      } catch (_p) {}
    }, 8000);
  }
})(typeof window !== "undefined" ? window : this);
