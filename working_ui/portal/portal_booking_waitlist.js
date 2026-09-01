/**
 * Booking Portal — join waiting list for a full bookable slot.
 * Uses lead OTP session header (x-booking-lead-session).
 */
(function (global) {
  "use strict";

  function cfg() {
    var staticCfg =
      (global.PortalStaticBootstrap &&
        typeof global.PortalStaticBootstrap.getConfig === "function" &&
        global.PortalStaticBootstrap.getConfig()) ||
      {};
    return {
      url: String(staticCfg.supabaseUrl || global.SUPABASE_URL || "").replace(/\/$/, ""),
      anon: String(staticCfg.supabaseAnonKey || global.SUPABASE_ANON_KEY || ""),
    };
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sessionToken() {
    if (global.PortalBookingLeadGate && typeof global.PortalBookingLeadGate.getSessionToken === "function") {
      return String(global.PortalBookingLeadGate.getSessionToken() || "").trim();
    }
    return "";
  }

  function leadPrefill() {
    if (global.PortalBookingLeadGate && typeof global.PortalBookingLeadGate.getLeadForPrefill === "function") {
      return global.PortalBookingLeadGate.getLeadForPrefill() || {};
    }
    return {};
  }

  async function join(payload) {
    var c = cfg();
    if (!c.url || !c.anon) {
      return {
        res: { ok: false, status: 0 },
        data: { ok: false, error: "missing_config" },
      };
    }
    var tok = sessionToken();
    if (!tok) {
      return {
        res: { ok: false, status: 401 },
        data: { ok: false, error: "unauthorized" },
      };
    }
    try {
      var res = await fetch(c.url + "/functions/v1/portal-booking-waitlist-join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + c.anon,
          apikey: c.anon,
          "x-booking-lead-session": tok,
        },
        body: JSON.stringify(payload || {}),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data || typeof data !== "object") data = {};
      if (data.ok == null && !res.ok) data.ok = false;
      if (!data.error && !res.ok) data.error = "join_failed";
      return { res: res, data: data };
    } catch (_err) {
      return {
        res: { ok: false, status: 0 },
        data: { ok: false, error: "network_error" },
      };
    }
  }

  function formHtml(opts) {
    opts = opts || {};
    var lead = leadPrefill();
    var parent = String(lead.parent_name || "").trim() || "—";
    var email = String(lead.email || "").trim() || "—";
    var mobile = String(lead.mobile || "").trim() || "—";
    var contactLine = [parent, mobile !== "—" ? mobile : "", email !== "—" ? email : ""]
      .filter(Boolean)
      .join(" · ");
    return (
      '<div class="wl-join" data-wl-join="1">' +
      '<p class="wl-join__lede" style="margin:0 0 12px;font-size:0.92rem;overflow-wrap:break-word">' +
      esc(opts.lede || "This time is full. Join the waiting list and we’ll contact you if a place opens.") +
      "</p>" +
      '<label class="wl-join__label" for="wlParticipantName">Participant name <span aria-hidden="true">*</span></label>' +
      '<input class="wl-join__input" id="wlParticipantName" name="participant_name" type="text" autocomplete="name" required maxlength="120" placeholder="Full name of the participant" />' +
      '<label class="wl-join__label" for="wlNote">Note <span class="muted">(optional)</span></label>' +
      '<textarea class="wl-join__input wl-join__textarea" id="wlNote" name="note" rows="2" maxlength="500" placeholder="Anything useful for the office"></textarea>' +
      '<p class="wl-join__contact muted" style="margin:10px 0 0;font-size:12px;min-width:0;overflow-wrap:break-word">We’ll use your Booking Portal contact: <strong>' +
      esc(contactLine) +
      "</strong></p>" +
      '<p class="wl-join__err" id="wlJoinErr" hidden style="margin:10px 0 0;color:#b42318;font-size:13px;overflow-wrap:break-word"></p>' +
      '<button type="button" class="btn sheet__choice--pri wl-join__submit" id="wlJoinSubmit" style="margin-top:14px;width:100%">Join waiting list</button>' +
      "</div>"
    );
  }

  global.PortalBookingWaitlist = {
    join: join,
    formHtml: formHtml,
    leadPrefill: leadPrefill,
  };
})(typeof window !== "undefined" ? window : globalThis);
