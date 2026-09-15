/**
 * Post-trial term offer (same or other slot) with same-day deadline (Europe/London).
 *
 * Waves:
 *  1) shortly after trial session end
 *  2) 20:00 London same day if still pending
 * EOD (23:59 London): release soft hold + office alert.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMessageViaWhatsapp,
} from "./portal_parent_messaging.ts";

const BOOKING_PORTAL_FALLBACK = "https://www.clubsensational.org/bookingportal";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function officeNotifyEmails(): string[] {
  const raw =
    Deno.env.get("PORTAL_OFFICE_NOTIFY_EMAILS") ||
    Deno.env.get("PORTAL_BOOKING_OFFICE_EMAILS") ||
    Deno.env.get("PORTAL_ADMIN_NOTIFY_EMAIL") ||
    "";
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** London wall-clock parts for an Instant. */
export function londonParts(d = new Date()): {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
  isoDate: string;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const y = Number(map.year);
  const m = Number(map.month);
  const day = Number(map.day);
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const minute = Number(map.minute);
  return {
    y,
    m,
    day,
    hour,
    minute,
    isoDate: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Parse end clock from labels like "9.00 – 9.30", "4.30-5", "9 to 9.30". */
export function parseTrialEndMinutes(timeLabel: string): number | null {
  const s = clean(timeLabel, 80).toLowerCase().replace(/–/g, "-").replace(/to/g, "-");
  const parts = s.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const end = parts[parts.length - 1];
  const m = end.match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  if (h >= 1 && h <= 7) h += 12; // afternoon shorthand
  if (h === 24) h = 0;
  return h * 60 + min;
}

/** Instant for London date + HH:MM (approx via Europe/London offset sampling). */
export function londonDateTimeToUtcIso(
  isoDate: string,
  hour: number,
  minute: number,
): string {
  // Build a UTC guess then adjust using London parts (handles BST).
  const [y, mo, d] = isoDate.split("-").map(Number);
  let utc = Date.UTC(y, mo - 1, d, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const p = londonParts(new Date(utc));
    const wantMin = hour * 60 + minute;
    const gotMin = p.hour * 60 + p.minute;
    const dayDrift =
      p.isoDate < isoDate ? -1 : p.isoDate > isoDate ? 1 : 0;
    utc += (wantMin - gotMin) * 60_000 + dayDrift * 24 * 60 * 60 * 1000;
  }
  return new Date(utc).toISOString();
}

export function trialDeadlineUtcIso(sessionDateIso: string): string {
  return londonDateTimeToUtcIso(sessionDateIso, 23, 59);
}

function buildOfferBody(opts: {
  first: string;
  child: string;
  trialLabel: string;
  slotLabel: string;
  deadlineLabel: string;
  finishUrl: string;
  wave: 1 | 2;
}): string {
  const intro =
    opts.wave === 1
      ? `${opts.child}'s trial (${opts.trialLabel}) has finished.`
      : `Reminder: ${opts.child}'s trial (${opts.trialLabel}) finished earlier today, and we have not received a term booking yet.`;
  return (
    `Hi ${opts.first},\n\n` +
    `${intro}\n\n` +
    `To keep the same place for Autumn term (${opts.slotLabel}), finish booking and pay here:\n` +
    `${opts.finishUrl}\n\n` +
    `Please finish by ${opts.deadlineLabel}. ` +
    `If we do not hear from you by then, the place will be released for other families.\n\n` +
    `If you want a different slot, reply and we will help. ` +
    `If you do not want a continuing place, reply FREE and we will release it now.\n\n` +
    `Thanks,\n` +
    `Office | clubSENsational`
  );
}

function firstName(parentName: string): string {
  const p = clean(parentName, 80);
  if (!p) return "there";
  return p.split(/\s+/)[0] || "there";
}

/**
 * Mint a finish-booking link locked to TERM (not trial).
 * Booking Portal cannot be used for the same slot — soft-hold already occupies it.
 */
async function mintPostTrialTermFinishLink(
  admin: SupabaseClient,
  offer: Record<string, unknown>,
): Promise<{ url: string; tokenId: string; softHoldId: string } | { error: string }> {
  const documentId = clean(offer.document_id, 80);
  const softHoldId = clean(offer.soft_hold_reservation_id, 80);
  if (!documentId) return { error: "no_document" };
  if (!softHoldId) return { error: "no_soft_hold" };

  const now = new Date().toISOString();
  const { error: holdErr } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      notes:
        "post_trial_term_soft_hold|booking_kind=term|awaits_parent_term_or_free|finish_link_minted",
      updated_at: now,
      released_at: null,
    })
    .eq("id", softHoldId);
  if (holdErr) return { error: holdErr.message };

  // Dynamic import avoids circular dependency with portal_booking_finish.ts
  const { mintFinishBookingToken, finishBookingUrl } = await import(
    "./portal_booking_finish.ts"
  );
  let minted: { tokenId: string; rawToken: string };
  try {
    minted = await mintFinishBookingToken(admin, {
      leadId: null,
      documentId,
      reservationId: softHoldId,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "mint_failed" };
  }

  const choices = {
    booking_scope: "this_term_only",
    booking_kind: "term",
    post_trial_convert: true,
    funding_code: "privately_funded",
  };
  const { error: tokErr } = await admin
    .from("portal_booking_completion_tokens")
    .update({
      choices_json: choices,
      funding_code: "privately_funded",
      // DB check allows choices_saved (not scope_saved) on Portal today.
      status: "choices_saved",
      reservation_id: softHoldId,
      updated_at: now,
    })
    .eq("id", minted.tokenId);
  if (tokErr) return { error: tokErr.message };

  // Confirm choices stuck (service-role update must not silently no-op).
  const { data: check } = await admin
    .from("portal_booking_completion_tokens")
    .select("status, choices_json, funding_code")
    .eq("id", minted.tokenId)
    .maybeSingle();
  const cj = (check?.choices_json || {}) as Record<string, unknown>;
  if (
    String(check?.status || "") !== "choices_saved" ||
    String(cj.booking_scope || "") !== "this_term_only"
  ) {
    return { error: "token_choices_not_saved" };
  }

  return {
    url: finishBookingUrl(minted.rawToken),
    tokenId: minted.tokenId,
    softHoldId,
  };
}

/**
 * Offer rows snapshot time/slot at pay time. Office moves (e.g. Muhammad 3-4 → 12-1)
 * update the reservation but not the offer — refresh before end-time checks / WhatsApp.
 */
async function refreshOfferSlotFromReservation(
  admin: SupabaseClient,
  offer: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reservationId = clean(offer.reservation_id, 80);
  if (!reservationId) return offer;

  const { data: res } = await admin
    .from("portal_booking_slot_reservations")
    .select("time_label, venue, service_name, slot_id, date_iso")
    .eq("id", reservationId)
    .maybeSingle();
  if (!res) return offer;

  const nextTime = clean(res.time_label, 80);
  const nextVenue = clean(res.venue, 80);
  const nextService = clean(res.service_name, 80);
  const nextSlot = clean(res.slot_id, 160);
  const nextDate = clean(String(res.date_iso || ""), 12);

  const patch: Record<string, unknown> = {};
  if (nextTime && nextTime !== clean(offer.trial_time_label, 80)) {
    patch.trial_time_label = nextTime;
  }
  if (nextVenue && nextVenue !== clean(offer.trial_venue, 80)) {
    patch.trial_venue = nextVenue;
  }
  if (nextService && nextService !== clean(offer.trial_service, 80)) {
    patch.trial_service = nextService;
  }
  if (nextSlot && nextSlot !== clean(offer.slot_id, 160)) {
    patch.slot_id = nextSlot;
  }
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(nextDate) &&
    nextDate !== clean(String(offer.trial_session_date || ""), 12)
  ) {
    patch.trial_session_date = nextDate;
  }

  if (!Object.keys(patch).length) return offer;

  patch.updated_at = new Date().toISOString();
  const { error } = await admin
    .from("portal_post_trial_offers")
    .update(patch)
    .eq("id", offer.id);
  if (error) {
    console.warn("[post-trial] refresh offer from reservation", error.message);
    return offer;
  }
  return { ...offer, ...patch };
}

async function sendOfferWhatsapp(
  admin: SupabaseClient,
  offer: Record<string, unknown>,
  wave: 1 | 2,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const phone = normalizeParentPhoneE164(String(offer.parent_phone || ""));
  if (!phone) return { ok: false, error: "bad_phone" };

  const minted = await mintPostTrialTermFinishLink(admin, offer);
  if ("error" in minted) {
    console.warn("[post-trial] finish mint", offer.id, minted.error);
    return { ok: false, error: minted.error };
  }

  const child = clean(offer.participant_name, 80) || "your child";
  const trialLabel = [
    clean(offer.trial_venue, 40),
    clean(offer.trial_service, 40),
    clean(offer.trial_time_label, 40),
    clean(String(offer.trial_session_date || ""), 12),
  ]
    .filter(Boolean)
    .join(" · ");
  const slotLabel = [
    clean(offer.trial_venue, 40),
    clean(offer.trial_service, 40),
    clean(offer.trial_time_label, 40),
  ]
    .filter(Boolean)
    .join(" · ");
  const sessionDate = clean(String(offer.trial_session_date || ""), 12);
  const body = buildOfferBody({
    first: firstName(String(offer.parent_name || "")),
    child: child.split(/\s+/)[0] || child,
    trialLabel,
    slotLabel: slotLabel || trialLabel,
    deadlineLabel: `tonight (${sessionDate}, end of day)`,
    finishUrl: minted.url,
    wave,
  });
  const flat = flattenWhatsappTemplateBody(body);
  if (flat.length > 700) {
    return { ok: false, error: "wa_too_long:" + flat.length };
  }
  const result = await sendParentMessageViaWhatsapp(phone, flat, {
    kind: "contact_update",
  });
  const kind = wave === 1 ? "post_trial_offer_wave1" : "post_trial_offer_wave2";
  await admin.from("portal_parent_notify_log").insert({
    sent_by_email: "system@clubsensational.org",
    kind,
    channel: "whatsapp",
    parent_phone: phone,
    parent_email: clean(offer.parent_email, 120) || null,
    parent_name: clean(offer.parent_name, 120) || null,
    subject: `Post-trial term finish · ${child} · wave ${wave}`,
    body_text: body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: kind,
      offer_id: offer.id,
      reservation_id: offer.reservation_id,
      soft_hold_reservation_id: minted.softHoldId,
      finish_token_id: minted.tokenId,
      finish_url: minted.url,
      wave,
      // Kept for older log readers — do not send parents here for same-slot convert.
      booking_portal_fallback: BOOKING_PORTAL_FALLBACK,
    },
  });

  const prevMeta =
    offer.meta && typeof offer.meta === "object" && !Array.isArray(offer.meta)
      ? (offer.meta as Record<string, unknown>)
      : {};
  await admin
    .from("portal_post_trial_offers")
    .update({
      meta: {
        ...prevMeta,
        finish_url: minted.url,
        finish_token_id: minted.tokenId,
        last_wave: wave,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", offer.id);

  return result.ok
    ? { ok: true, id: result.id }
    : { ok: false, error: result.error || "wa_failed" };
}

async function notifyOfficeNoDecision(
  offer: Record<string, unknown>,
): Promise<void> {
  const child = clean(offer.participant_name, 80) || "Participant";
  const parent = clean(offer.parent_name, 80) || "Parent";
  const subject = `Post-trial: no decision · ${child} · released EOD`;
  const bodyText =
    `Post-trial offer expired with no term booking / FREE reply.\n\n` +
    `Participant: ${child}\n` +
    `Parent: ${parent}\n` +
    `Phone: ${clean(offer.parent_phone, 40)}\n` +
    `Trial date: ${clean(String(offer.trial_session_date || ""), 12)}\n` +
    `Slot: ${clean(offer.slot_id, 120)}\n` +
    `Soft hold released. Place is public again.\n` +
    `— clubSENsational portal`;
  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  if (smtp && tos.length) {
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
      });
      if (!mail.ok) console.warn("[post-trial-office] email", to, mail.error);
    }
  } else {
    console.log(`[post-trial-office] ${subject}`);
  }
}

/** Create offer + soft hold when a trial is paid (idempotent). */
export async function ensurePostTrialOfferAfterPaid(
  admin: SupabaseClient,
  reservation: Record<string, unknown>,
): Promise<string> {
  const reservationId = clean(reservation.id, 80);
  if (!reservationId) return "post_trial_skip_no_id";

  const { data: existing } = await admin
    .from("portal_post_trial_offers")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (existing?.id) return "post_trial_exists";

  const sessionDate = clean(reservation.date_iso, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return "post_trial_bad_date";

  const deadlineAt = trialDeadlineUtcIso(sessionDate);
  const slotId = clean(reservation.slot_id, 160);
  const participant = clean(reservation.participant_name, 120) || "Participant";
  const parent = clean(reservation.parent_name, 120);
  const phone = clean(reservation.parent_phone, 40);
  const email = clean(reservation.parent_email, 120);

  // Soft-hold: same slot blocked until EOD. Drop trial hold from capacity first
  // so the parent is not blocked by their own trial + soft hold (= FULL).
  const trialHoldCut = new Date().toISOString();
  await admin
    .from("portal_booking_slot_reservations")
    .update({
      hold_expires_at: trialHoldCut,
      updated_at: trialHoldCut,
    })
    .eq("id", reservationId)
    .ilike("notes", "%booking_kind=trial%");

  let softHoldId: string | null = null;
  if (slotId) {
    const { data: hold, error: holdErr } = await admin
      .from("portal_booking_slot_reservations")
      .insert({
        slot_id: slotId,
        service_id: reservation.service_id || null,
        service_name: reservation.service_name || null,
        venue: reservation.venue || null,
        day_label: reservation.day_label || null,
        time_label: reservation.time_label || null,
        date_iso: sessionDate,
        document_id: reservation.document_id || null,
        participant_name: participant,
        parent_name: parent,
        parent_email: email || null,
        parent_phone: phone || null,
        status: "validated",
        hold_expires_at: deadlineAt,
        validated_at: new Date().toISOString(),
        notes:
          "post_trial_term_soft_hold|booking_kind=term|awaits_parent_term_or_free",
      })
      .select("id")
      .maybeSingle();
    if (holdErr) {
      console.warn("[post-trial] soft hold", holdErr.message);
    } else {
      softHoldId = hold?.id ? String(hold.id) : null;
    }
  }

  const { error } = await admin.from("portal_post_trial_offers").insert({
    reservation_id: reservationId,
    document_id: reservation.document_id || null,
    participant_name: participant,
    parent_name: parent,
    parent_phone: phone,
    parent_email: email,
    trial_session_date: sessionDate,
    trial_time_label: clean(reservation.time_label, 80),
    trial_venue: clean(reservation.venue, 80),
    trial_service: clean(reservation.service_name, 80),
    slot_id: slotId,
    soft_hold_reservation_id: softHoldId,
    status: "pending",
    deadline_at: deadlineAt,
    meta: { soft_hold: true, convert_via: "finish_booking" },
  });
  if (error) {
    console.warn("[post-trial] insert offer", error.message);
    return `post_trial_insert_fail:${error.message}`;
  }
  return softHoldId ? "post_trial_offer_created_with_hold" : "post_trial_offer_created";
}

async function parentTookTermAction(
  admin: SupabaseClient,
  offer: Record<string, unknown>,
): Promise<boolean> {
  const phone = normalizeParentPhoneE164(String(offer.parent_phone || ""));
  const participant = clean(offer.participant_name, 120).toLowerCase();
  const since = clean(String(offer.trial_session_date || ""), 12);
  if (!phone && !participant) return false;

  let q = admin
    .from("portal_booking_slot_reservations")
    .select("id, notes, status, participant_name, parent_phone")
    .ilike("notes", "%booking_kind=term%")
    .gte("created_at", `${since}T00:00:00Z`)
    .in("status", ["pending", "validated", "awaiting_payment"])
    .limit(20);
  const { data } = await q;
  const rows = data || [];
  return rows.some((r) => {
    if (/post_trial_term_soft_hold/i.test(String(r.notes || ""))) return false;
    const samePhone =
      phone &&
      normalizeParentPhoneE164(String(r.parent_phone || "")) === phone;
    const sameChild =
      participant &&
      clean(r.participant_name, 120).toLowerCase().includes(participant.split(/\s+/)[0] || "");
    return !!(samePhone || sameChild);
  });
}

async function releaseSoftHold(
  admin: SupabaseClient,
  offer: Record<string, unknown>,
  note: string,
): Promise<void> {
  const holdId = clean(offer.soft_hold_reservation_id, 80);
  if (!holdId) return;
  const now = new Date().toISOString();
  await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "released",
      released_at: now,
      hold_expires_at: now,
      notes: `${clean(note, 80)}|released_post_trial`,
      updated_at: now,
    })
    .eq("id", holdId)
    .neq("status", "released");
}

/** Cron tick: wave1 after session end, wave2 at 20:00, EOD release. */
export async function runPostTrialOffersMaintenance(
  admin: SupabaseClient,
): Promise<Record<string, number>> {
  const stats = {
    pending: 0,
    wave1: 0,
    wave2: 0,
    term_booked: 0,
    eod_released: 0,
    errors: 0,
  };
  const now = new Date();
  const london = londonParts(now);

  const { data: offers, error } = await admin
    .from("portal_post_trial_offers")
    .select("*")
    .eq("status", "pending")
    .limit(100);
  if (error) {
    console.warn("[post-trial] list", error.message);
    return { ...stats, errors: 1 };
  }

  for (const rawOffer of offers || []) {
    stats.pending += 1;
    try {
      const offer = await refreshOfferSlotFromReservation(admin, rawOffer);

      if (await parentTookTermAction(admin, offer)) {
        await releaseSoftHold(admin, offer, "term_booked");
        await admin
          .from("portal_post_trial_offers")
          .update({
            status: "term_booked",
            resolved_at: now.toISOString(),
            resolve_note: "detected_term_reservation",
            updated_at: now.toISOString(),
          })
          .eq("id", offer.id);
        stats.term_booked += 1;
        continue;
      }

      const sessionDate = clean(String(offer.trial_session_date || ""), 12);
      const endMin = parseTrialEndMinutes(String(offer.trial_time_label || "")) ?? 12 * 60;
      const sessionEnded =
        london.isoDate > sessionDate ||
        (london.isoDate === sessionDate &&
          london.hour * 60 + london.minute >= endMin + 5);

      if (!offer.wave1_sent_at && sessionEnded) {
        const sent = await sendOfferWhatsapp(admin, offer, 1);
        if (sent.ok) {
          await admin
            .from("portal_post_trial_offers")
            .update({ wave1_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", offer.id);
          stats.wave1 += 1;
        } else {
          stats.errors += 1;
          console.warn("[post-trial] wave1", offer.id, sent.error);
        }
      }

      const after20 =
        london.isoDate > sessionDate ||
        (london.isoDate === sessionDate && london.hour >= 20);
      if (
        offer.wave1_sent_at &&
        !offer.wave2_sent_at &&
        after20 &&
        sessionDate <= london.isoDate
      ) {
        const sent = await sendOfferWhatsapp(admin, offer, 2);
        if (sent.ok) {
          await admin
            .from("portal_post_trial_offers")
            .update({ wave2_sent_at: now.toISOString(), updated_at: now.toISOString() })
            .eq("id", offer.id);
          stats.wave2 += 1;
        } else {
          stats.errors += 1;
          console.warn("[post-trial] wave2", offer.id, sent.error);
        }
      }

      const deadline = new Date(String(offer.deadline_at || ""));
      if (Number.isFinite(deadline.getTime()) && now >= deadline) {
        await releaseSoftHold(admin, offer, "eod_no_decision");
        await admin
          .from("portal_post_trial_offers")
          .update({
            status: "released_eod",
            resolved_at: now.toISOString(),
            resolve_note: "auto_eod",
            updated_at: now.toISOString(),
          })
          .eq("id", offer.id);
        await notifyOfficeNoDecision(offer);
        stats.eod_released += 1;
      }
    } catch (e) {
      stats.errors += 1;
      console.warn("[post-trial] offer", offer.id, e);
    }
  }
  return stats;
}
