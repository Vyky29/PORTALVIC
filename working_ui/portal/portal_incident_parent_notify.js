/**
 * Incident report — draft parent/carer message with AI, then send via email/WhatsApp.
 */
(function (global) {
  "use strict";

  var DRAFT_FN = "portal-incident-parent-notify-draft";

  var cfg = {
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function (_msg, _type) {},
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
  };

  var composeEl = null;
  var drafting = false;

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
    if (options.esc) cfg.esc = options.esc;
  }

  function clean(v) {
    return String(v == null ? "" : v)
      .replace(/\s+/g, " ")
      .trim();
  }

  function normGenderValue(v) {
    v = String(v == null ? "" : v)
      .trim()
      .toLowerCase();
    if (v === "m" || v === "male" || v === "boy") return "m";
    if (v === "f" || v === "female" || v === "girl") return "f";
    return "";
  }

  function photoKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function participantFirstName(name) {
    var parts = clean(name).split(/\s+/).filter(Boolean);
    return parts[0] || clean(name) || "Participant";
  }

  function participantGender(name) {
    var n = photoKey(name);
    var first = n.split(/\s+/)[0] || "";
    try {
      var map = global.PORTAL_CLIENT_GENDER_OVERRIDES || {};
      var g = normGenderValue(map[n]) || normGenderValue(map[first]);
      if (g) return g;
    } catch (_) {}
    return "";
  }

  function baseUrl() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function portalAuthToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  function notifyDigitsOnly(s) {
    return String(s == null ? "" : s).replace(/\D/g, "");
  }

  function parentPrefill(clientDisplay) {
    var meta = { parentCarerName: "", parentEmail: "", parentWhatsapp: "" };
    var slot = { clientDisplay: clean(clientDisplay) };
    if (typeof global.adminParentNotifyPrefillFromDirectory === "function") {
      return global.adminParentNotifyPrefillFromDirectory(meta, slot);
    }
    if (typeof global.adminParticipantsParentsRowForClientDisplayName === "function") {
      var pp = global.adminParticipantsParentsRowForClientDisplayName(slot.clientDisplay);
      if (pp) {
        if (pp.parentDisplay) meta.parentCarerName = String(pp.parentDisplay).trim();
        if (pp.username) meta.parentEmail = String(pp.username).trim();
        if (pp.mobile) meta.parentWhatsapp = notifyDigitsOnly(String(pp.mobile).trim());
      }
    }
    return meta;
  }

  function incidentPayloadFromRow(row) {
    var clientName = clean(row && row.client_name);
    var meta = parentPrefill(clientName);
    return {
      participant_name: clientName,
      participant_gender: participantGender(clientName),
      parent_name: clean(meta.parentCarerName),
      session_date: clean(row && row.session_date).slice(0, 10),
      session_time: clean(row && row.session_time),
      incident_category: clean(row && row.incident_category),
      service: clean(row && row.service),
      location: clean(row && row.location),
      statement_before: clean(row && row.statement_before),
      statement_during: clean(row && row.statement_during),
      statement_after: clean(row && row.statement_after),
      injuries_client: clean(row && row.injuries_client),
      injuries_staff: clean(row && row.injuries_staff),
      submitted_by_name: clean(row && row.submitted_by_name),
    };
  }

  function offlineDraft(row) {
    var client = participantFirstName(row && row.client_name);
    var g = participantGender(row && row.client_name);
    var subj = g === "m" ? "He" : g === "f" ? "She" : client;
    var pos = g === "m" ? "his" : g === "f" ? "her" : client + "'s";
    var during = clean(row && row.statement_during);
    var after = clean(row && row.statement_after);
    var inj = clean(row && row.injuries_client);
    var lines = [
      "Hi,",
      "",
      "We are writing to let you know about an incident during " +
        client +
        "'s session today.",
      "",
      during || after || "(Details on file.)",
    ];
    if (after) lines.push("", "Our team responded as follows:", after);
    if (inj && inj.toLowerCase() !== "nobody" && inj !== "—") {
      lines.push("", client + " " + (inj.toLowerCase().indexOf("no ") === 0 ? inj : "had the following injury: " + inj));
    }
    lines.push(
      "",
      "Please contact us if you would like to discuss this further.",
      "",
      "Thank you,",
      "ClubSENsational",
    );
    return {
      email_subject: "Session incident update · " + client,
      parent_message: lines.join("\n"),
      offline: true,
      hint: subj + " / " + pos + " — sign in for live AI drafting.",
    };
  }

  async function requestDraft(row) {
    var payload = incidentPayloadFromRow(row);
    var token = await portalAuthToken();
    if (!token || !baseUrl()) {
      return { ok: true, data: offlineDraft(row) };
    }
    var res = await fetch(baseUrl() + "/functions/v1/" + DRAFT_FN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: JSON.stringify(payload),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok) {
      var err = (j && j.error) || "draft_failed";
      if (err === "no_openai" || err === "openai_failed" || !res.ok) {
        return { ok: true, data: offlineDraft(row) };
      }
      return { ok: false, error: err };
    }
    return {
      ok: true,
      data: {
        email_subject: clean(j.email_subject),
        parent_message: clean(j.parent_message),
      },
    };
  }

  function closeCompose() {
    if (!composeEl) return;
    try {
      composeEl.remove();
    } catch (_) {}
    composeEl = null;
  }

  function ensureParentNotifySend() {
    if (global.__portalParentNotifyConfigured || !global.PortalParentNotifySend) return;
    if (typeof global.portalParentNotifyConfigureOnce === "function") {
      global.portalParentNotifyConfigureOnce();
      return;
    }
    global.__portalParentNotifyConfigured = true;
    global.PortalParentNotifySend.configure({
      esc: cfg.esc,
      toast: cfg.toast,
      getClient: cfg.getClient,
      getSupabaseUrl: cfg.getSupabaseUrl,
      getAnonKey: cfg.getAnonKey,
    });
  }

  function subjectForIncident(clientDisplay) {
    var T = global.PortalParentNotifyTemplates;
    if (T && typeof T.subjectForKind === "function") {
      return T.subjectForKind("incident_report", clientDisplay);
    }
    return "Session incident update · " + clean(clientDisplay);
  }

  function openViaDashboardModal(row, draft, meta) {
    if (typeof global.openParentNotifyModal !== "function") return false;
    var clientDisplay = clean(row.client_name);
    var dateIso = clean(row.session_date).slice(0, 10);
    var slot = {
      demoId: "incident-" + String(row.id || row.created_at || Date.now()),
      clientDisplay: clientDisplay,
      sessionDate: dateIso,
      venue: clean(row.location),
    };
    global.openParentNotifyModal({
      kind: "incident_report",
      slot: slot,
      dateIso: dateIso,
      defaultChannel: "both",
      hideSaveContact: true,
      notifyPack: {
        ov: null,
        meta: meta,
        snap: null,
        body: draft.parent_message,
        subject: draft.email_subject || subjectForIncident(clientDisplay),
      },
    });
    return true;
  }

  function openComposeModal(row, draft, meta) {
    closeCompose();
    ensureParentNotifySend();
    var esc = cfg.esc;
    var clientDisplay = clean(row.client_name);
    var dateIso = clean(row.session_date).slice(0, 10);
    var subj = draft.email_subject || subjectForIncident(clientDisplay);
    var body = draft.parent_message || "";

    composeEl = document.createElement("div");
    composeEl.className = "pfrm-modal-backdrop pfrm-modal-backdrop--notify";
    composeEl.style.zIndex = "2147483002";
    composeEl.innerHTML =
      '<div class="pfrm-modal" role="dialog" aria-modal="true" aria-labelledby="ipnTitle">' +
      '<header class="pfrm-modal__head">' +
      '<h2 id="ipnTitle" class="pfrm-modal__title">Notify parent</h2>' +
      '<p class="pfrm-modal__sub">' +
      esc(clientDisplay) +
      (dateIso ? " · " + esc(dateIso) : "") +
      "</p>" +
      '<button type="button" class="pfrm-modal__close" data-ipn-close aria-label="Close">×</button>' +
      "</header>" +
      '<div class="pfrm-modal__body">' +
      (draft.offline
        ? '<p class="muted" style="margin:0 0 10px;overflow-wrap:break-word">Offline draft — edit before sending. ' +
          esc(draft.hint || "") +
          "</p>"
        : '<p class="muted" style="margin:0 0 10px;overflow-wrap:break-word">AI draft — review and edit before sending.</p>') +
      '<div class="grid-2" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0">' +
      '<div style="min-width:0"><label class="muted" for="ipnParentName">Parent / carer name</label>' +
      '<input id="ipnParentName" class="inp" style="max-width:100%;min-width:0" value="' +
      esc(meta.parentCarerName || "") +
      '" /></div>' +
      '<div style="min-width:0"><label class="muted" for="ipnParentEmail">Email</label>' +
      '<input id="ipnParentEmail" class="inp" type="email" style="max-width:100%;min-width:0" value="' +
      esc(meta.parentEmail || "") +
      '" autocomplete="off" /></div>' +
      '<div style="grid-column:1/-1;min-width:0"><label class="muted" for="ipnParentWa">WhatsApp (digits, incl. country code)</label>' +
      '<input id="ipnParentWa" class="inp" style="max-width:100%;min-width:0" value="' +
      esc(meta.parentWhatsapp || "") +
      '" autocomplete="off" /></div>' +
      "</div>" +
      '<fieldset style="margin:12px 0 0;padding:0;border:0;min-width:0"><legend class="muted" style="margin-bottom:6px">Send channel</legend>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;min-width:0">' +
      '<label style="display:inline-flex;align-items:center;gap:6px;min-width:0"><input type="radio" name="ipnChannel" value="email" checked /> <span>Email</span></label>' +
      '<label style="display:inline-flex;align-items:center;gap:6px;min-width:0"><input type="radio" name="ipnChannel" value="whatsapp" /> <span>WhatsApp</span></label>' +
      '<label style="display:inline-flex;align-items:center;gap:6px;min-width:0"><input type="radio" name="ipnChannel" value="both" /> <span>Both</span></label>' +
      "</div></fieldset>" +
      '<label class="muted" for="ipnSubject" style="display:block;margin-top:12px">Subject</label>' +
      '<input id="ipnSubject" class="inp" style="max-width:100%;min-width:0" value="' +
      esc(subj) +
      '" />' +
      '<label class="muted" for="ipnBody" style="display:block;margin-top:12px">Message</label>' +
      '<textarea id="ipnBody" class="txa" style="min-height:200px;max-width:100%;min-width:0;overflow-wrap:break-word">' +
      esc(body) +
      "</textarea>" +
      '<p class="muted" id="ipnStatus" style="margin:8px 0 0;min-width:0;overflow-wrap:break-word;display:none" role="status"></p>' +
      "</div>" +
      '<footer class="pfrm-modal__foot pfrm-modal__foot--actions" style="flex-wrap:wrap">' +
      '<button type="button" class="pfrm-modal__btn" data-ipn-close>Close</button>' +
      '<button type="button" class="pfrm-modal__btn" data-ipn-copy>Copy</button>' +
      '<button type="button" class="pfrm-modal__btn" data-ipn-mail>Open email app</button>' +
      '<button type="button" class="pfrm-modal__btn" data-ipn-wa>Open WhatsApp app</button>' +
      '<button type="button" class="pfrm-modal__btn pfrm-modal__btn--pri" data-ipn-send style="background:#15803d;border-color:#15803d">Send now</button>' +
      "</footer></div>";

    document.body.appendChild(composeEl);

    function $(id) {
      return composeEl.querySelector("#" + id);
    }

    function selectedChannel() {
      var r = composeEl.querySelector('input[name="ipnChannel"]:checked');
      return r && r.value ? String(r.value) : "email";
    }

    function updateButtons() {
      var em = clean($("ipnParentEmail") && $("ipnParentEmail").value);
      var wa = notifyDigitsOnly(($("ipnParentWa") && $("ipnParentWa").value) || "");
      var ch = selectedChannel();
      var mailBtn = composeEl.querySelector("[data-ipn-mail]");
      var waBtn = composeEl.querySelector("[data-ipn-wa]");
      var sendBtn = composeEl.querySelector("[data-ipn-send]");
      if (mailBtn) mailBtn.disabled = !em;
      if (waBtn) waBtn.disabled = !wa;
      if (sendBtn) {
        var needEm = ch === "email" || ch === "both";
        var needWa = ch === "whatsapp" || ch === "both";
        sendBtn.disabled = !((!needEm || em) && (!needWa || wa));
      }
    }

    composeEl.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-ipn-close]")) {
        ev.preventDefault();
        closeCompose();
        return;
      }
      if (t.closest("[data-ipn-copy]")) {
        ev.preventDefault();
        var txt = clean($("ipnBody") && $("ipnBody").value);
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          void global.navigator.clipboard.writeText(txt).then(function () {
            cfg.toast("Copied to clipboard", "ok");
          });
        } else {
          global.prompt("Copy message:", txt);
        }
        return;
      }
      if (t.closest("[data-ipn-mail]")) {
        ev.preventDefault();
        var em = clean($("ipnParentEmail") && $("ipnParentEmail").value);
        var b = clean($("ipnBody") && $("ipnBody").value);
        var s = clean($("ipnSubject") && $("ipnSubject").value);
        if (!em) {
          cfg.toast("Enter an email address", "warn");
          return;
        }
        global.location.href =
          "mailto:" + encodeURIComponent(em) + "?subject=" + encodeURIComponent(s) + "&body=" + encodeURIComponent(b);
        return;
      }
      if (t.closest("[data-ipn-wa]")) {
        ev.preventDefault();
        var waN = notifyDigitsOnly(($("ipnParentWa") && $("ipnParentWa").value) || "");
        var b2 = clean($("ipnBody") && $("ipnBody").value);
        if (!waN) {
          cfg.toast("Enter a WhatsApp number", "warn");
          return;
        }
        global.open("https://wa.me/" + waN + "?text=" + encodeURIComponent(b2), "_blank", "noopener,noreferrer");
        return;
      }
      if (t.closest("[data-ipn-send]")) {
        ev.preventDefault();
        if (!global.PortalParentNotifySend || typeof global.PortalParentNotifySend.send !== "function") {
          cfg.toast("Send module not loaded — refresh the page.", "warn");
          return;
        }
        var ch2 = selectedChannel();
        var msgBody = clean($("ipnBody") && $("ipnBody").value);
        var em2 = clean($("ipnParentEmail") && $("ipnParentEmail").value);
        var wa2 = notifyDigitsOnly(($("ipnParentWa") && $("ipnParentWa").value) || "");
        var subj2 = clean($("ipnSubject") && $("ipnSubject").value);
        if (!msgBody) {
          cfg.toast("Message is empty", "warn");
          return;
        }
        if ((ch2 === "email" || ch2 === "both") && !em2) {
          cfg.toast("Enter an email address", "warn");
          return;
        }
        if ((ch2 === "whatsapp" || ch2 === "both") && !wa2) {
          cfg.toast("Enter a WhatsApp number", "warn");
          return;
        }
        var sendBtn2 = composeEl.querySelector("[data-ipn-send]");
        var statusEl = $("ipnStatus");
        if (sendBtn2) {
          sendBtn2.disabled = true;
          sendBtn2.textContent = "Sending…";
        }
        if (statusEl) {
          statusEl.style.display = "none";
          statusEl.textContent = "";
        }
        void global.PortalParentNotifySend.send({
          kind: "incident_report",
          channel: ch2,
          parentName: clean($("ipnParentName") && $("ipnParentName").value),
          parentEmail: em2,
          parentWhatsapp: wa2,
          subject: subj2,
          body: msgBody,
          clientDisplay: clientDisplay,
          sessionDate: dateIso,
          slotId: "incident-" + String(row.id || row.created_at || ""),
          venue: clean(row.location),
        }).then(function (res) {
          if (sendBtn2) {
            sendBtn2.disabled = false;
            sendBtn2.textContent = "Send now";
          }
          updateButtons();
          if (!res || !res.ok) {
            var errMsg =
              global.PortalParentNotifySend && typeof global.PortalParentNotifySend.formatNotifyError === "function"
                ? global.PortalParentNotifySend.formatNotifyError(res && res.error, res && res.data)
                : String((res && res.error) || "send_failed");
            if (statusEl) {
              statusEl.style.display = "block";
              statusEl.textContent = errMsg;
            } else {
              cfg.toast(errMsg, "warn");
            }
            return;
          }
          var okMsg = global.PortalParentNotifySend.formatSendResult(res.data);
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = okMsg;
          }
          cfg.toast(okMsg, "ok");
        });
      }
    });

    ["ipnBody", "ipnParentEmail", "ipnParentWa", "ipnParentName", "ipnSubject"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", updateButtons);
    });
    composeEl.querySelectorAll('input[name="ipnChannel"]').forEach(function (el) {
      el.addEventListener("change", updateButtons);
    });
    updateButtons();
  }

  async function openNotifyFlow(row, triggerBtn) {
    if (!row || drafting) return;
    if (typeof global.portalIncidentParentNotifyConfigureOnce === "function") {
      global.portalIncidentParentNotifyConfigureOnce();
    }
    drafting = true;
    var prevLabel = triggerBtn ? triggerBtn.textContent : "";
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = "Drafting…";
    }
    try {
      var res = await requestDraft(row);
      if (!res.ok) {
        cfg.toast("Could not draft message — " + String(res.error || "try again"), "warn");
        return;
      }
      var meta = parentPrefill(clean(row.client_name));
      if (openViaDashboardModal(row, res.data, meta)) return;
      openComposeModal(row, res.data, meta);
    } catch (_e) {
      cfg.toast("Draft failed — check your connection.", "warn");
    } finally {
      drafting = false;
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = prevLabel || "Notify parent";
      }
    }
  }

  global.PortalIncidentParentNotify = {
    configure: configure,
    requestDraft: requestDraft,
    openNotifyFlow: openNotifyFlow,
    participantGender: participantGender,
  };
})(typeof window !== "undefined" ? window : globalThis);
