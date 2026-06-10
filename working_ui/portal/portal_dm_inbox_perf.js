/**
 * Chat inbox perf — debounced unread sync, incremental thread append, focus cleanup.
 */
(function (global) {
  "use strict";

  function portalDmBlurHiddenSubtree(el) {
    if (!el || !el.hidden) return;
    try {
      var active = document.activeElement;
      if (active && el.contains(active) && typeof active.blur === "function") {
        active.blur();
      }
    } catch (_) {}
  }

  function portalDmDebounceAsync(fn, delayMs) {
    var tm = null;
    return function debounced() {
      var args = arguments;
      var self = this;
      if (tm) clearTimeout(tm);
      return new Promise(function (resolve, reject) {
        tm = setTimeout(function () {
          tm = null;
          Promise.resolve(fn.apply(self, args)).then(resolve, reject);
        }, Number(delayMs || 450));
      });
    };
  }

  function portalDmFormatMsgTime(iso) {
    try {
      if (iso) {
        return new Date(iso).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (_) {}
    try {
      return new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_2) {
      return "";
    }
  }

  /**
   * Append one text row to an open DM thread without reloading history.
   * @param {object} opts
   */
  function portalDmAppendThreadTextMessage(opts) {
    opts = opts || {};
    var tid = String(opts.threadId || "").trim();
    var openTid = String(opts.openThreadId || "").trim();
    if (!tid || !openTid || tid !== openTid) return false;
    if (typeof opts.isThreadViewOpen === "function" && !opts.isThreadViewOpen()) return false;
    var msgsBox = document.getElementById(opts.messagesElId || "internalChatMessages");
    if (!msgsBox) return false;

    var me = String(opts.me || "")
      .trim()
      .toLowerCase();
    var authorId = String(opts.authorId || "")
      .trim()
      .toLowerCase();
    var mine =
      opts.isMine != null ? !!opts.isMine : !!(me && authorId && me === authorId);
    var body = String(opts.body || "");
    if (
      opts.stripOperatorTag &&
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.stripDmOperatorTag === "function"
    ) {
      body = global.portalChatActorIdentity.stripDmOperatorTag(body);
    }
    body = String(body || "").trim();
    if (!body) return false;
    if (body.indexOf("[[portal-staff-call:") >= 0) return false;

    var row = document.createElement("div");
    row.className =
      "portal-dm-msg-row " + (mine ? "portal-dm-msg-row--mine" : "portal-dm-msg-row--them");
    var div = document.createElement("div");
    div.className =
      "portal-dm-msg " +
      (mine
        ? "portal-dm-msg--mine"
        : "portal-dm-msg--them portal-dm-msg--them-unread");
    var authorLabel = String(opts.authorLabel || "").trim();
    if (authorLabel && !mine) {
      var chipEl = document.createElement("div");
      chipEl.className = "portal-dm-msg-by";
      chipEl.textContent = authorLabel;
      div.appendChild(chipEl);
    }
    var bodyHost = document.createElement("div");
    bodyHost.className = "portal-dm-msg-body";
    bodyHost.style.minWidth = "0";
    var textEl = document.createElement("div");
    textEl.style.whiteSpace = "pre-wrap";
    textEl.style.overflowWrap = "break-word";
    textEl.textContent = body;
    bodyHost.appendChild(textEl);
    div.appendChild(bodyHost);
    var timeEl = document.createElement("div");
    timeEl.className = "portal-dm-msg-time";
    timeEl.textContent = portalDmFormatMsgTime(opts.createdAt);
    div.appendChild(timeEl);
    row.appendChild(div);

    var emptyPh = msgsBox.querySelector(".muted");
    if (emptyPh && /no messages yet/i.test(String(emptyPh.textContent || ""))) {
      emptyPh.remove();
    }
    msgsBox.appendChild(row);
    try {
      msgsBox.dataset.portalDmLastMsgAt = opts.createdAt
        ? String(opts.createdAt)
        : new Date().toISOString();
    } catch (_) {}
    if (typeof opts.scrollToBottom === "function") {
      opts.scrollToBottom();
    } else if (typeof global.portalStaffDmScrollThreadMessagesToBottom === "function") {
      global.portalStaffDmScrollThreadMessagesToBottom();
    } else {
      requestAnimationFrame(function () {
        msgsBox.scrollTop = msgsBox.scrollHeight;
      });
    }
    return true;
  }

  global.portalDmBlurHiddenSubtree = portalDmBlurHiddenSubtree;
  global.portalDmDebounceAsync = portalDmDebounceAsync;
  global.portalDmAppendThreadTextMessage = portalDmAppendThreadTextMessage;
})(typeof window !== "undefined" ? window : globalThis);
