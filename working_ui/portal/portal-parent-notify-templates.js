/**
 * Parent notify — email / WhatsApp message templates (admin composes, server sends).
 * WhatsApp Cloud API uses PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE (one body var {{1}}).
 */
(function (global) {
  "use strict";

  function greet(parentName) {
    var n = String(parentName || "").trim();
    return n ? "Hi " + n + ",\n\n" : "Hi,\n\n";
  }

  function signOff() {
    return "\n\nThank you,\nClubSENsational";
  }

  function participantLabel(slot, ov, effectiveFn) {
    if (typeof effectiveFn === "function") {
      var v = effectiveFn(slot, ov);
      if (v) return String(v).trim();
    }
    return String((slot && slot.clientDisplay) || "this participant").trim();
  }

  function sessionWhen(slot) {
    return String((slot && slot.whenLabel) || "").trim();
  }

  function sessionVenue(slot) {
    return String((slot && slot.venue) || "").trim();
  }

  function serviceLabel(slot, meta) {
    return String(
      (meta && meta.service) || (slot && slot.programme) || "sessions",
    ).trim();
  }

  function moneyFmt(amount, moneyFn) {
    if (typeof moneyFn === "function") return moneyFn(amount);
    var n = Number(amount);
    if (!Number.isFinite(n)) n = 0;
    return "£" + n.toFixed(2);
  }

  /** kind: payment_due */
  function payment(slot, ov, meta, snap, opts) {
    opts = opts || {};
    var client = participantLabel(slot, ov, opts.effectiveParticipantLabel);
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var service = serviceLabel(slot, meta);
    var out =
      snap && typeof snap.outstanding === "number" ? snap.outstanding : 0;
    var nd = snap && snap.nextDue;
    var balLine =
      "Amount currently outstanding: " + moneyFmt(out, opts.bookingMoney) + ".";
    if (nd && nd.dueDate) {
      balLine +=
        " Next instalment: " +
        moneyFmt(nd.left, opts.bookingMoney) +
        " due " +
        nd.dueDate +
        ".";
    }
    var whenPart = when ? " (" + when + ")" : "";
    var venuePart = venue ? " at " + venue + "." : ".";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "We are writing about fees for " +
      client +
      " — " +
      service +
      whenPart +
      venuePart +
      "\n\n" +
      balLine +
      "\n\n" +
      "Please use your usual bank reference, or reply if you need the details again." +
      signOff()
    );
  }

  /** kind: instructor_change | instructor_reassign */
  function instructorChange(slot, ov, meta, newInstructorName, opts) {
    opts = opts || {};
    var client = participantLabel(slot, ov, opts.effectiveParticipantLabel);
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var oldI = String((slot && slot.staffName) || "").trim();
    var newI =
      String(newInstructorName || "").trim() || "[new instructor — edit here]";
    var whenPart = when ? " " + when : "";
    var venuePart = venue ? " at " + venue + "." : ".";
    var swapPart = oldI ? " (instead of " + oldI + ")." : ".";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "We are writing about " +
      client +
      "'s session" +
      whenPart +
      venuePart +
      "\n\n" +
      "There has been a change of instructor. The session will now be with " +
      newI +
      swapPart +
      "\n\n" +
      "We will send a separate photo of " +
      newI +
      " so you can show " +
      client +
      " before the session.\n\n" +
      "If you have any questions, just reply to this message." +
      signOff()
    );
  }

  /** kind: absence_announced — client_absence_announced override */
  function absence(slot, ov, meta, opts) {
    opts = opts || {};
    var client = participantLabel(slot, ov, opts.effectiveParticipantLabel);
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var whenPart = when ? " on " + when : "";
    var venuePart = venue ? " at " + venue : "";
    var reason = ov && ov.reason ? String(ov.reason).trim() : "";
    var reasonPart = reason
      ? "\n\nNote from the team: " + reason
      : "";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "We are confirming that " +
      client +
      " will not attend today's session" +
      whenPart +
      venuePart +
      "." +
      reasonPart +
      "\n\n" +
      "This session will not be charged unless your booking terms say otherwise. " +
      "If you had not told us already, please reply so we can update our records." +
      signOff()
    );
  }

  /** kind: makeup_scheduled — client_replace_in_slot make-up (not trial) */
  function makeup(slot, ov, meta, opts) {
    opts = opts || {};
    var client = participantLabel(slot, ov, opts.effectiveParticipantLabel);
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var payload = (ov && ov.payload) || {};
    var replacement =
      String(payload.to_client_name || payload.replacement_name || "").trim() ||
      client;
    var whenPart = when ? " (" + when + ")" : "";
    var venuePart = venue ? " at " + venue + "." : ".";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "We are writing to confirm a make-up session for " +
      replacement +
      whenPart +
      venuePart +
      "\n\n" +
      "Please reply if this time does not work for you, or if you need directions or parking details again." +
      signOff()
    );
  }

  /** kind: trial_scheduled — client_replace_in_slot + trial */
  function trial(slot, ov, meta, opts) {
    opts = opts || {};
    var client = participantLabel(slot, ov, opts.effectiveParticipantLabel);
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var payload = (ov && ov.payload) || {};
    var participant =
      String(payload.to_client_name || payload.replacement_name || "").trim() ||
      client;
    var whenPart = when ? " (" + when + ")" : "";
    var venuePart = venue ? " at " + venue + "." : ".";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "We are writing to confirm a trial session for " +
      participant +
      whenPart +
      venuePart +
      "\n\n" +
      "Please arrive a few minutes early if you can. Reply if this time does not work or if you need directions or parking details again." +
      signOff()
    );
  }

  /** kind: session_cancelled — client_cancelled / slot_clear_client cancelled */
  function cancelled(slot, ov, meta, opts) {
    opts = opts || {};
    var client = participantLabel(slot, ov, opts.effectiveParticipantLabel);
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var whenPart = when ? " on " + when : "";
    var venuePart = venue ? " at " + venue : "";
    var reason = ov && ov.reason ? String(ov.reason).trim() : "";
    var reasonPart = reason
      ? "\n\nNote from the team: " + reason
      : "";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "We are writing to confirm that " +
      client +
      "'s session" +
      whenPart +
      venuePart +
      " has been cancelled." +
      reasonPart +
      "\n\n" +
      "If you did not request this or need to rebook, please reply and we will help." +
      signOff()
    );
  }

  /** kind: booking_confirmation */
  function bookingConfirmation(slot, meta, svc) {
    var client = String(
      (slot && slot.clientDisplay) || (svc && svc.pax) || "this participant",
    ).trim();
    var when = sessionWhen(slot);
    var venue = sessionVenue(slot);
    var service = String(
      (meta && meta.service) ||
        (slot && slot.programme) ||
        (svc && svc.programme) ||
        "sessions",
    ).trim();
    var ref = svc && svc.bookingRef ? String(svc.bookingRef).trim() : "";
    var whenPart = when ? " (" + when + ")" : "";
    var venuePart = venue ? " at " + venue + "." : ".";
    var refPart = ref ? " Booking ref: " + ref + "." : "";
    return (
      greet(meta && meta.parentCarerName) +
      "This is ClubSENsational.\n\n" +
      "This confirms " +
      client +
      "'s booking for " +
      service +
      whenPart +
      venuePart +
      refPart +
      "\n\n" +
      "If anything looks wrong, reply to this email and we will help." +
      signOff()
    );
  }

  function subjectForKind(kind, clientDisplay) {
    var client = String(clientDisplay || "").trim();
    var k = String(kind || "").trim().toLowerCase();
    if (k === "instructor_change" || k === "instructor_reassign") {
      return "Instructor update · " + client;
    }
    if (k === "absence_announced") return "Absence · " + client;
    if (k === "makeup_scheduled") return "Make up · " + client;
    if (k === "trial_scheduled") return "Trial session · " + client;
    if (k === "session_cancelled") return "Session cancelled · " + client;
    if (k === "booking_confirmation") return "Booking confirmation · " + client;
    return "Payment reminder · " + client;
  }

  /** Map schedule_overrides.override_type → notify kind for auto-draft. */
  function kindFromOverrideType(ovType, ov, opts) {
    var t = String(ovType || "").trim();
    if (t === "client_absence_announced") return "absence_announced";
    if (t === "client_cancelled") return "session_cancelled";
    if (t === "slot_clear_client") {
      var payload = ov && ov.payload ? ov.payload : {};
      if (payload.cancelled_by_admin) return "session_cancelled";
    }
    if (t === "client_replace_in_slot" || t === "replace_participant") {
      if (opts && opts.isTrialOverride && opts.isTrialOverride(ov)) {
        return "trial_scheduled";
      }
      return "makeup_scheduled";
    }
    if (t === "instructor_reassign") return "instructor_change";
    return "instructor_change";
  }

  function bodyForKind(kind, ctx) {
    ctx = ctx || {};
    var k = String(kind || "").trim().toLowerCase();
    var slot = ctx.slot;
    var ov = ctx.ov;
    var meta = ctx.meta || {};
    var opts = ctx.opts || {};
    if (k === "payment_due") {
      return payment(slot, ov, meta, ctx.snap || { outstanding: 0, nextDue: null }, opts);
    }
    if (k === "absence_announced") return absence(slot, ov, meta, opts);
    if (k === "makeup_scheduled") return makeup(slot, ov, meta, opts);
    if (k === "trial_scheduled") return trial(slot, ov, meta, opts);
    if (k === "session_cancelled") return cancelled(slot, ov, meta, opts);
    if (k === "booking_confirmation") {
      return bookingConfirmation(slot, meta, ctx.svc);
    }
    return instructorChange(slot, ov, meta, ctx.newInstructorName, opts);
  }

  global.PortalParentNotifyTemplates = {
    greet: greet,
    signOff: signOff,
    payment: payment,
    instructorChange: instructorChange,
    absence: absence,
    makeup: makeup,
    trial: trial,
    cancelled: cancelled,
    bookingConfirmation: bookingConfirmation,
    subjectForKind: subjectForKind,
    kindFromOverrideType: kindFromOverrideType,
    bodyForKind: bodyForKind,
  };
})(typeof window !== "undefined" ? window : globalThis);
