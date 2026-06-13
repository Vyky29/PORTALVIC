/**
 * Worker internal chat — shared group thread pane (portal_ceo_group_message).
 */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function renderPane(opts) {
    opts = opts || {};
    var client = opts.client;
    var me = String(opts.me || "").trim();
    var gid = String(opts.groupId || "").trim();
    var ui = opts.ui || {};
    if (!client || !me || !gid) return false;

    var groupLabel = String(
      ui.peerLabel ||
        opts.groupLabel ||
        (global.portalLeadStaffChatDirectory && global.portalLeadStaffChatDirectory.STAFF_MGMT_GROUP_LABEL) ||
        "Group"
    );

    var peerElG = document.getElementById("internalChatPeerLabel");
    if (peerElG) peerElG.textContent = groupLabel;
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    global.__PORTAL_INTERNAL_CHAT_UI.peerLabel = groupLabel;

    if (global.portalCsCliqThreadHeader && typeof global.portalCsCliqThreadHeader.syncInternal === "function") {
      global.portalCsCliqThreadHeader.syncInternal(groupLabel, "Group", null, { groupId: gid });
    }
    if (
      global.portalCsCliqThreadHeader &&
      typeof global.portalCsCliqThreadHeader.syncThreadBackChrome === "function"
    ) {
      global.portalCsCliqThreadHeader.syncThreadBackChrome(true);
    }
    if (global.portalDmIcons && typeof global.portalDmIcons.upgrade === "function") {
      var threadRootG = document.getElementById("internalChatThreadWrap");
      if (threadRootG) global.portalDmIcons.upgrade(threadRootG);
    }
    if (typeof opts.syncSheetView === "function") {
      opts.syncSheetView(true, groupLabel);
    }

    var msgsBoxG = document.getElementById("internalChatMessages");
    var inpG = document.getElementById("internalChatInput");
    var errBG = document.getElementById("internalChatErr");
    if (errBG) errBG.textContent = "";
    if (msgsBoxG) msgsBoxG.innerHTML = '<p class="muted" style="margin:0">Loading…</p>';

    var dmMsgFieldsG = global.portalDmVoice
      ? global.portalDmVoice.MSG_FIELDS
      : "id,author_id,body,created_at,message_type,audio_storage_path,audio_mime,duration_ms";
    var gres = await client
      .from("portal_ceo_group_message")
      .select(dmMsgFieldsG)
      .eq("group_id", gid)
      .order("created_at", { ascending: true });
    if (gres.error) {
      if (msgsBoxG) {
        msgsBoxG.innerHTML =
          '<p class="muted" style="color:var(--danger);min-width:0;overflow-wrap:break-word">' +
          escapeHtml(String(gres.error.message || gres.error)) +
          "</p>";
      }
      return false;
    }
    if (!msgsBoxG) return false;
    msgsBoxG.innerHTML = "";
    var arrG = gres.data || [];
    var authorChipFn =
      typeof opts.authorChip === "function"
        ? opts.authorChip
        : typeof global.portalDmInternalMsgAuthorChip === "function"
          ? global.portalDmInternalMsgAuthorChip
          : null;

    if (!arrG.length) {
      var phG = document.createElement("p");
      phG.className = "muted";
      phG.style.margin = "0";
      phG.style.fontSize = "13px";
      phG.textContent = "No messages yet.";
      msgsBoxG.appendChild(phG);
    } else {
      var authorIdsG = [];
      arrG.forEach(function (m) {
        var x = String(m.author_id || "").trim();
        if (x && authorIdsG.indexOf(x) === -1) authorIdsG.push(x);
      });
      var authorByG = {};
      if (authorIdsG.length) {
        var apG = await client
          .from("staff_profiles")
          .select("id,full_name,username,app_role,staff_role")
          .in("id", authorIdsG);
        if (!apG.error && Array.isArray(apG.data)) {
          apG.data.forEach(function (p) {
            if (p && p.id) authorByG[String(p.id)] = p;
          });
        }
      }
      if (
        arrG.length &&
        global.portalStaffChatCalls &&
        typeof global.portalStaffChatCalls.scanThreadForIncomingCall === "function"
      ) {
        global.portalStaffChatCalls.scanThreadForIncomingCall(arrG[arrG.length - 1], me);
      }
      for (var gxi = 0; gxi < arrG.length; gxi++) {
        var gm = arrG[gxi];
        if (global.portalStaffChatCalls && typeof global.portalStaffChatCalls.renderCallEndRow === "function") {
          var callEndRowG = global.portalStaffChatCalls.renderCallEndRow(gm);
          if (callEndRowG) {
            msgsBoxG.appendChild(callEndRowG);
            continue;
          }
        }
        var mineG = String(gm.author_id || "").toLowerCase() === me.toLowerCase();
        var aidG = String(gm.author_id || "").trim();
        var rowG = document.createElement("div");
        rowG.className = "portal-dm-msg-row " + (mineG ? "portal-dm-msg-row--mine" : "portal-dm-msg-row--them");
        var divG = document.createElement("div");
        divG.className =
          "portal-dm-msg " + (mineG ? "portal-dm-msg--mine" : "portal-dm-msg--them portal-dm-msg--them-read");
        var tlineG = "";
        try {
          if (gm.created_at) {
            tlineG = new Date(gm.created_at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
        } catch (_tg) {}
        var chipG = authorChipFn ? authorChipFn(mineG, authorByG[aidG] || {}) : "";
        if (chipG) {
          var chipElG = document.createElement("div");
          chipElG.className = "portal-dm-msg-by";
          chipElG.textContent = chipG;
          divG.appendChild(chipElG);
        }
        var bodyHostG = document.createElement("div");
        bodyHostG.className = "portal-dm-msg-body";
        bodyHostG.style.minWidth = "0";
        if (global.portalStaffChatCalls && global.portalStaffChatCalls.fillMessageBody) {
          await global.portalStaffChatCalls.fillMessageBody(bodyHostG, gm, client, escapeHtml, me, arrG);
        } else if (global.portalDmVoice && global.portalDmVoice.fillMessageBody) {
          await global.portalDmVoice.fillMessageBody(bodyHostG, gm, client, escapeHtml);
        } else {
          var textElG = document.createElement("div");
          textElG.style.whiteSpace = "pre-wrap";
          textElG.style.overflowWrap = "break-word";
          textElG.textContent = String(gm.body || "");
          bodyHostG.appendChild(textElG);
        }
        divG.appendChild(bodyHostG);
        if (tlineG) {
          var timeElG = document.createElement("div");
          timeElG.className = "portal-dm-msg-time";
          timeElG.textContent = tlineG;
          divG.appendChild(timeElG);
        }
        rowG.appendChild(divG);
        msgsBoxG.appendChild(rowG);
      }
    }

    requestAnimationFrame(function () {
      msgsBoxG.scrollTop = msgsBoxG.scrollHeight;
      var lastRowG = msgsBoxG.querySelector(".portal-dm-msg-row:last-child");
      if (lastRowG && typeof lastRowG.scrollIntoView === "function") {
        try {
          lastRowG.scrollIntoView({ block: "end", behavior: "auto" });
        } catch (_sig) {}
      }
    });

    var sendBtnG = document.getElementById("internalChatSendBtn");
    if (sendBtnG && !sendBtnG.dataset.portalDmBound) {
      sendBtnG.dataset.portalDmBound = "1";
      sendBtnG.addEventListener("click", function () {
        void global.portalInternalChatSendMessage();
      });
    }
    if (global.portalDmVoice && inpG) {
      global.portalDmVoice.ensureMicButtonBefore(inpG, "internalChatVoiceBtn");
      if (!global.__PORTAL_STAFF_DM_VOICE_BOUND) {
        global.__PORTAL_STAFF_DM_VOICE_BOUND = true;
        global.portalDmVoice.attachVoiceButton({
          buttonId: "internalChatVoiceBtn",
          textareaId: "internalChatInput",
          hintId: "internalChatVoiceBtnHint",
          getContext: function () {
            var boxV = global.__PORTAL_SUPABASE__;
            var uiV = global.__PORTAL_INTERNAL_CHAT_UI || {};
            return {
              client: boxV && boxV.client,
              threadId: "",
              groupId: String(uiV.groupId || "").trim(),
              authorId: String(
                (boxV && boxV.staff_profile && boxV.staff_profile.id) ||
                  (boxV && boxV.session && boxV.session.user && boxV.session.user.id) ||
                  ""
              ).trim(),
            };
          },
          onSent: function () {
            return global.portalRenderInternalChatSheet();
          },
          onError: function (msg) {
            var errBV = document.getElementById("internalChatErr");
            if (errBV) errBV.textContent = msg;
          },
        });
      }
    }
    if (global.portalDmAttachments && typeof global.portalDmAttachments.bindWorkerInternalChatAttachments === "function") {
      global.portalDmAttachments.bindWorkerInternalChatAttachments();
    }
    if (typeof opts.syncMobileViewport === "function") {
      opts.syncMobileViewport();
    }
    return true;
  }

  global.portalWorkerGroupThread = {
    renderPane: renderPane,
  };
})(typeof window !== "undefined" ? window : globalThis);
