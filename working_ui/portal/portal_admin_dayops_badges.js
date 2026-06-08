/**
 * Day operations tile badges — numeric overlay on hub buttons.
 * Counts mirror admin bell activity (excluding chat). Clears when the linked screen/tab is opened (any route).
 */
(function (global) {
  "use strict";

  var STORE_PREFIX = "portal_admin_dayops_seen_v1_";
  var BADGE_KEYS = [
    "late_approval",
    "cancellation",
    "incident",
    "absent",
    "wellbeing",
    "feedback",
    "relevant",
  ];

  /** Same identity key as admin DM read acks — per auth user, not shared across admins. */
  function adminUserId() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      var uid =
        box && box.session && box.session.user && box.session.user.id;
      if (uid) return String(uid);
      var p = box && box.staff_profile;
      var sid = p && (p.id || p.staff_id);
      if (sid) return String(sid);
    } catch (_) {}
    return "anon";
  }

  function storeKey() {
    return STORE_PREFIX + adminUserId();
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(storeKey());
      if (!raw) return {};
      var j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    } catch (_) {
      return {};
    }
  }

  function writeStore(obj) {
    try {
      localStorage.setItem(storeKey(), JSON.stringify(obj || {}));
    } catch (_) {}
  }

  function getSeenAt(key) {
    var v = readStore()[String(key || "").trim()];
    return v ? String(v) : "";
  }

  function seenMs(key) {
    var iso = getSeenAt(key);
    if (!iso) return 0;
    var t = new Date(iso).getTime();
    return isNaN(t) ? 0 : t;
  }

  function markSeen(key) {
    key = String(key || "").trim();
    if (!key) return;
    var store = readStore();
    store[key] = new Date().toISOString();
    writeStore(store);
    applyBadges();
  }

  function markSeenKeys(keys) {
    if (!keys || !keys.length) return;
    var store = readStore();
    var now = new Date().toISOString();
    keys.forEach(function (k) {
      k = String(k || "").trim();
      if (k) store[k] = now;
    });
    writeStore(store);
    applyBadges();
  }

  function activityAlerts() {
    return global.__PORTAL_ADMIN_ACTIVITY_ALERTS__ || [];
  }

  function countAlertsByKind(kind) {
    kind = String(kind || "").trim();
    if (!kind || kind === "chat") return 0;
    var ack = seenMs(kind);
    var n = 0;
    activityAlerts().forEach(function (a) {
      if (!a || String(a.kind || "") !== kind) return;
      var t = a.created_at ? new Date(a.created_at).getTime() : 0;
      if (!t || isNaN(t)) {
        n++;
        return;
      }
      if (t > ack) n++;
    });
    return n;
  }

  function feedbackSubmittedMs(row) {
    var iso = String(
      (row &&
        (row.created_at ||
          row.submittedAt ||
          row.submitted_at ||
          row.updated_at)) ||
        ""
    ).trim();
    if (!iso) return 0;
    var t = new Date(iso).getTime();
    return isNaN(t) ? 0 : t;
  }

  function feedbackRows() {
    var ops = global.PortalDayOps;
    var payload = ops && ops.getPayload ? ops.getPayload() : null;
    return (payload && payload.session_feedback) || [];
  }

  function countFeedbackSinceSeen() {
    var ack = seenMs("feedback");
    var n = 0;
    feedbackRows().forEach(function (row) {
      var t = feedbackSubmittedMs(row);
      if (!t) return;
      if (t > ack) n++;
    });
    return n;
  }

  function countRelevantSinceSeen() {
    var ack = seenMs("relevant");
    var rows = feedbackRows();
    var clean = function (s) {
      return String(s == null ? "" : s).trim();
    };
    var n = 0;
    rows.forEach(function (fb) {
      if (!fb || !clean(fb.relevant_information)) return;
      if (
        fb.attendance &&
        String(fb.attendance).toLowerCase().indexOf("no") === 0
      )
        return;
      var t = feedbackSubmittedMs(fb);
      if (!ack) {
        n++;
        return;
      }
      if (t > ack) n++;
    });
    return n;
  }

  function countForKey(key) {
    key = String(key || "").trim();
    if (!key) return 0;
    if (key === "feedback") return countFeedbackSinceSeen();
    if (key === "relevant") return countRelevantSinceSeen();
    if (
      key === "late_approval" ||
      key === "cancellation" ||
      key === "incident" ||
      key === "absent" ||
      key === "wellbeing"
    ) {
      return countAlertsByKind(key);
    }
    return 0;
  }

  function allCounts() {
    var out = {};
    BADGE_KEYS.forEach(function (k) {
      out[k] = countForKey(k);
    });
    return out;
  }

  /** Overlay on the icon chip only — no tile layout changes (same idea as medical X on avatars). */
  function badgeHost(el) {
    if (!el) return null;
    return (
      el.querySelector(".dash-hub__tile-band .admin-nav-ico") ||
      el.querySelector(".dayops-screen-nav__ico-wrap .admin-nav-ico") ||
      el.querySelector(".dayops-screen-nav__ico-wrap") ||
      el.querySelector(".dash-hub__tile-band")
    );
  }

  function applyBadges(root) {
    root = root || document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-portal-badge-key]").forEach(function (el) {
      var key = String(el.getAttribute("data-portal-badge-key") || "").trim();
      var n = countForKey(key);
      var host = badgeHost(el);
      if (!host) return;
      var badge = host.querySelector(".portal-dayops-tile-badge");
      if (n > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "portal-dayops-tile-badge";
          host.appendChild(badge);
        }
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.setAttribute("aria-label", n + " new");
      } else if (badge) {
        badge.remove();
      }
    });
  }

  var HUB_TAB_TO_BADGE = {
    feedback: "feedback",
    positive: "feedback",
    relevant: "relevant",
    cancellations: "cancellation",
    incidents: "incident",
    absents: "absent",
  };

  var DAYOPS_ACT_TO_BADGE = {
    sessions_hub_feedback: "feedback",
    sessions_hub_positive: "feedback",
    sessions_hub_relevant: "relevant",
    sessions_hub_cancellations: "cancellation",
    sessions_hub_incidents: "incident",
    sessions_hub_absents: "absent",
  };

  var VIEW_TO_BADGE = {
    c4k_late_submissions: "late_approval",
    c4k_registers: "feedback",
  };

  function markSeenForHubTab(tabId) {
    var key = HUB_TAB_TO_BADGE[String(tabId || "").trim()];
    if (key) markSeen(key);
  }

  function markSeenForDayopsAct(act) {
    var key = DAYOPS_ACT_TO_BADGE[String(act || "").trim()];
    if (key) markSeen(key);
  }

  function markSeenForView(viewId) {
    var key = VIEW_TO_BADGE[String(viewId || "").trim()];
    if (key) markSeen(key);
  }

  function markSeenForActivityAlert(meta) {
    meta = meta || {};
    var tab = String(meta.view || "").trim();
    if (tab === "wellbeing") {
      markSeen("wellbeing");
      return;
    }
    if (tab === "c4k_late_submissions") {
      markSeen("late_approval");
      return;
    }
    if (tab && HUB_TAB_TO_BADGE[tab]) {
      markSeen(HUB_TAB_TO_BADGE[tab]);
    }
  }

  function portalDayOpsBadgeKeyFromRoute(da, viewId) {
    da = String(da || "").trim();
    viewId = String(viewId || "").trim();
    if (da && DAYOPS_ACT_TO_BADGE[da]) return DAYOPS_ACT_TO_BADGE[da];
    if (viewId && VIEW_TO_BADGE[viewId]) return VIEW_TO_BADGE[viewId];
    return "";
  }

  global.portalAdminDayOpsBadgeKeyFromRoute = portalDayOpsBadgeKeyFromRoute;
  global.portalAdminDayOpsBadgesRefresh = applyBadges;
  global.portalAdminDayOpsBadgesCounts = allCounts;
  global.portalAdminDayOpsBadgesMarkSeen = markSeen;
  global.portalAdminDayOpsBadgesMarkSeenKeys = markSeenKeys;
  global.portalAdminDayOpsBadgesMarkSeenHubTab = markSeenForHubTab;
  global.portalAdminDayOpsBadgesMarkSeenDayopsAct = markSeenForDayopsAct;
  global.portalAdminDayOpsBadgesMarkSeenView = markSeenForView;
  global.portalAdminDayOpsBadgesMarkSeenActivity = markSeenForActivityAlert;
})(typeof window !== "undefined" ? window : globalThis);
