/**
 * After finish-booking creates an invoice (bank / card / GC setup),
 * the seat stays held only for this short pay window — then returns live.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";

export const BOOKING_PAY_HOLD_MINUTES = 30;
/** After parent taps WhatsApp/Email (says paid), office gets this window to confirm Tide. */
export const BOOKING_OFFICE_CONFIRM_HOLD_MINUTES = 30;
/** Reminder when this many minutes remain before hold_expires_at (30' - 5' = minute 25). */
export const BOOKING_PAY_HOLD_NUDGE_BEFORE_EXPIRY_MINUTES = 5;
const NUDGE_NOTE_TAG = "pay_hold_nudge_25m";

export function bookingPayHoldExpiresAt(fromMs = Date.now()): string {
  return new Date(fromMs + BOOKING_PAY_HOLD_MINUTES * 60 * 1000).toISOString();
}

export function bookingOfficeConfirmHoldExpiresAt(fromMs = Date.now()): string {
  return new Date(fromMs + BOOKING_OFFICE_CONFIRM_HOLD_MINUTES * 60 * 1000).toISOString();
}

/** Active reservation statuses that occupy a Booking Portal seat. */
export const BOOKING_SLOT_HOLD_STATUSES = [
  "pending",
  "validated",
  "awaiting_payment",
] as const;

/** Timed pay holds stop occupying the seat when the clock ends (even before cron flips status). */
export function bookingHoldStillActive(
  holdExpiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (holdExpiresAt == null || String(holdExpiresAt).trim() === "") return true;
  const t = new Date(String(holdExpiresAt)).getTime();
  if (!Number.isFinite(t)) return true;
  return t > nowMs;
}

export function filterActiveBookingHolds<T extends { hold_expires_at?: unknown }>(
  holds: T[] | null | undefined,
  nowMs = Date.now(),
): T[] {
  return (holds || []).filter((h) =>
    bookingHoldStillActive(
      h.hold_expires_at == null ? null : String(h.hold_expires_at),
      nowMs,
    )
  );
}

/** PostgREST filter: soft holds with no clock, or clock still open. */
export function bookingActiveHoldExpiresFilter(nowIso = new Date().toISOString()): string {
  return `hold_expires_at.is.null,hold_expires_at.gt.${nowIso}`;
}

function portalPublicOrigin(): string {
  return (
    String(Deno.env.get("PORTAL_PUBLIC_ORIGIN") || "").trim() ||
    String(Deno.env.get("PARENT_PORTAL_PUBLIC_ORIGIN") || "").trim() ||
    "https://www.clubsensational.org"
  ).replace(/\/$/, "");
}

function extractFinishBookingLink(body: string): string {
  const m = String(body || "").match(
    /https?:\/\/[^\s]+\/parent\/finish-booking\?t=[a-f0-9]+/i,
  );
  return m ? m[0].replace(/[).,;]+$/, "") : "";
}

async function shouldSkipTermPayHoldExpiry(
  admin: SupabaseClient,
  documentId: string,
): Promise<boolean> {
  const { data: toks } = await admin
    .from("portal_booking_completion_tokens")
    .select("invoice_share_id, choices_json, status, pay_plan")
    .eq("document_id", documentId)
    .not("invoice_share_id", "is", null);
  if (!toks?.length) return false;

  // Parent already told the office they paid — keep seat until Mark paid / Tide.
  if (
    toks.some((t) => {
      const st = String(t.status || "").toLowerCase();
      if (st === "awaiting_office_payment") return true;
      const c =
        t.choices_json && typeof t.choices_json === "object"
          ? (t.choices_json as Record<string, unknown>)
          : {};
      return Boolean(String(c.office_paid_notified_at || "").trim());
    })
  ) {
    return true;
  }

  const isTrial = toks.some((t) => {
    const c =
      t.choices_json && typeof t.choices_json === "object"
        ? (t.choices_json as Record<string, unknown>)
        : {};
    return String(c.booking_scope || "") === "trial_session";
  });

  const invIds = [
    ...new Set(
      toks.map((t) => String(t.invoice_share_id || "").trim()).filter(Boolean),
    ),
  ];
  if (!invIds.length) return false;

  const { data: invRows } = await admin
    .from("portal_parent_invoice_share")
    .select("payment_status, parent_reported_paid_at, payment_method_hint, contact_id")
    .in("id", invIds);

  // Parent reported bank payment (trial or term) — keep seat until office confirms.
  if (
    (invRows || []).some((inv) => {
      const pay = String(inv.payment_status || "").toLowerCase();
      return pay === "pending_confirmation" || !!inv.parent_reported_paid_at;
    })
  ) {
    return true;
  }

  // Unpaid trials always expire when the 30' window ends.
  if (isTrial) return false;

  /* GoCardless mandate already set up — seat stays until DD clears (PIN already sent). */
  const { data: completedTok } = await admin
    .from("portal_booking_completion_tokens")
    .select("id")
    .eq("document_id", documentId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  if (completedTok?.id) return true;

  const thisBookingIsGocardless = toks.some((t) => {
    const plan = String(t.pay_plan || "").toLowerCase();
    const c =
      t.choices_json && typeof t.choices_json === "object"
        ? (t.choices_json as Record<string, unknown>)
        : {};
    const cjPlan = String(c.pay_plan || "").toLowerCase();
    return plan.includes("gocardless") || cjPlan.includes("gocardless");
  }) ||
    (invRows || []).some(
      (inv) => String(inv.payment_method_hint || "").toLowerCase() === "gocardless",
    );

  // Bank / card unpaid term holds must expire — do not keep them because the family
  // has an unrelated GoCardless mandate on another invoice.
  if (!thisBookingIsGocardless) return false;

  const contactIds = [
    ...new Set(
      (invRows || [])
        .map((inv) => String(inv.contact_id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (contactIds.length) {
    const { data: mandates } = await admin
      .from("portal_parent_gocardless_mandates")
      .select("contact_id, mandate_status")
      .in("contact_id", contactIds);
    const active = (mandates || []).some((m) => {
      const st = String(m.mandate_status || "").toLowerCase();
      return st === "active" || st === "pending_submission" || st === "submitted";
    });
    if (active) return true;
  }

  return (invRows || []).some((inv) => {
    return (
      String(inv.payment_method_hint || "").toLowerCase() === "gocardless" &&
      String(inv.payment_status || "").toLowerCase() !== "unpaid"
    );
  });
}

/**
 * At ~25' into the 30' pay window: one WhatsApp/email nudge if still unpaid.
 * Safe to call often (offer/finish traffic + cron) — anti-dupe via reservation notes.
 */
export async function nudgeUnpaidBookingPayHolds(
  admin: SupabaseClient,
): Promise<{ nudged: number }> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const windowEnd = new Date(
    nowMs + BOOKING_PAY_HOLD_NUDGE_BEFORE_EXPIRY_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: candidates, error } = await admin
    .from("portal_booking_slot_reservations")
    .select(
      "id, document_id, participant_name, parent_name, parent_email, parent_phone, service_name, venue, day_label, time_label, hold_expires_at, notes, status",
    )
    .eq("status", "awaiting_payment")
    .gt("hold_expires_at", now)
    .lte("hold_expires_at", windowEnd)
    .not("notes", "ilike", `%${NUDGE_NOTE_TAG}%`)
    .limit(40);

  if (error) {
    console.warn("[nudgeUnpaidBookingPayHolds] select", error.message);
    return { nudged: 0 };
  }

  let nudged = 0;
  for (const row of candidates || []) {
    const docId = String(row.document_id || "").trim();
    if (docId && (await shouldSkipTermPayHoldExpiry(admin, docId))) {
      continue;
    }

    const notes = String(row.notes || "");
    if (notes.toLowerCase().includes(NUDGE_NOTE_TAG)) continue;

    const participant = String(row.participant_name || "").trim() || "your child";
    const parent = String(row.parent_name || "").trim() || "Parent / carer";
    const email = String(row.parent_email || "").trim() || null;
    const phone = String(row.parent_phone || "").trim() || null;
    const slotBits = [row.service_name, row.venue, row.day_label, row.time_label]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    const slot = slotBits.join(" · ");

    let finishLink = "";
    try {
      const orParts = [
        phone ? `parent_phone.eq.${phone}` : "",
        email ? `parent_email.eq.${email}` : "",
        participant ? `client_display.ilike.*${participant.replace(/,/g, " ")}*` : "",
      ].filter(Boolean);
      if (orParts.length) {
        const { data: logs } = await admin
          .from("portal_parent_notify_log")
          .select("body_text")
          .or(orParts.join(","))
          .order("created_at", { ascending: false })
          .limit(12);
        for (const log of logs || []) {
          finishLink = extractFinishBookingLink(String(log.body_text || ""));
          if (finishLink) break;
        }
      }
    } catch (_e) {
      /* ignore */
    }
    if (!finishLink) {
      finishLink = `${portalPublicOrigin()}/parent/finish-booking`;
    }

    const minsLeft = Math.max(
      1,
      Math.ceil(
        (new Date(String(row.hold_expires_at)).getTime() - nowMs) / 60000,
      ),
    );

    const bodyText =
      `Reminder: ${participant}'s place is held for about ${minsLeft} more minute` +
      (minsLeft === 1 ? "" : "s") +
      `. Pay now or the seat goes live again` +
      (slot ? ` (${slot})` : "") +
      `: ${finishLink}`;

    let emailOk = false;
    let wa: { ok: boolean; id?: string; channel?: string; error?: string } = {
      ok: false,
    };

    const smtp = readParentNotifySmtpConfig();
    if (smtp && email) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to: email,
        subject: `Pay within ${minsLeft} min · ${participant}`,
        bodyText,
      });
      emailOk = !!mail.ok;
      if (!mail.ok) {
        console.warn("[nudgeUnpaidBookingPayHolds] email", mail.error);
      }
    }

    if (phone) {
      wa = await sendParentMobileMessage(phone, bodyText, {
        kind: "contact_update",
      });
      if (!wa.ok) {
        console.warn("[nudgeUnpaidBookingPayHolds] wa", wa.error);
      }
    }

    if (!emailOk && !wa.ok) {
      console.log(
        `[nudgeUnpaidBookingPayHolds] skipped (no channel) reservation=${row.id} participant=${participant}`,
      );
      if (!phone && !email) {
        await admin
          .from("portal_booking_slot_reservations")
          .update({
            notes: `${notes}|${NUDGE_NOTE_TAG}_no_channel`.replace(/^\|/, "").slice(0, 500),
            updated_at: now,
          })
          .eq("id", String(row.id));
      }
      continue;
    }

    await admin
      .from("portal_booking_slot_reservations")
      .update({
        notes: `${notes}|${NUDGE_NOTE_TAG}`.replace(/^\|/, "").slice(0, 500),
        updated_at: now,
      })
      .eq("id", String(row.id));

    try {
      const waStatus = wa.ok
        ? wa.channel === "sms"
          ? "sent_sms"
          : "sent"
        : phone
          ? "failed"
          : "skipped";
      await admin.from("portal_parent_notify_log").insert({
        sent_by_user_id: null,
        sent_by_email: "system@finish-booking",
        kind: "booking_pay_hold_nudge_25m",
        channel:
          emailOk && wa.ok ? "both" : wa.ok ? "whatsapp" : emailOk ? "email" : "whatsapp",
        client_display: participant,
        parent_name: parent,
        parent_email: email,
        parent_phone: phone,
        subject: `Pay within ${minsLeft} min · ${participant}`,
        body_text: bodyText,
        message_type: "text",
        email_status: emailOk ? "sent" : email ? "failed" : "skipped",
        whatsapp_status: waStatus,
        whatsapp_message_id: wa.ok ? wa.id || null : null,
        error_detail: wa.ok ? null : wa.error || null,
        meta: {
          source: "pay_hold_nudge",
          reservation_id: String(row.id),
          hold_expires_at: row.hold_expires_at,
          mins_left: minsLeft,
        },
      });
    } catch (e) {
      console.warn("[nudgeUnpaidBookingPayHolds] log", e);
    }

    nudged += 1;
  }

  return { nudged };
}

/**
 * Expire unpaid pay-window holds and free the seat on the live offer.
 * Term bookings with parent-reported payment stay held until admin confirms.
 */
export async function expireUnpaidBookingPayHolds(
  admin: SupabaseClient,
): Promise<{ expired: number }> {
  const now = new Date().toISOString();

  const { data: awaitingCandidates, error: selAwaitingErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, document_id")
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now);

  if (selAwaitingErr) {
    console.warn("[expireUnpaidBookingPayHolds] select awaiting", selAwaitingErr.message);
  }

  const { data: taggedCandidates, error: selTaggedErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, document_id")
    .eq("status", "validated")
    .or(
      "notes.ilike.%pay_hold_30m%,notes.ilike.%auto_finish_link%,notes.ilike.%existing_client_confirm%",
    )
    .lt("hold_expires_at", now)
    .not("notes", "ilike", "%booking_paid%")
    .not("notes", "ilike", "%ops_synced%")
    .not("notes", "ilike", "%trial_paid%");

  if (selTaggedErr) {
    console.warn("[expireUnpaidBookingPayHolds] select tagged", selTaggedErr.message);
  }

  const candidateIds: string[] = [];
  for (const row of [...(awaitingCandidates || []), ...(taggedCandidates || [])]) {
    const docId = String(row.document_id || "").trim();
    if (docId && (await shouldSkipTermPayHoldExpiry(admin, docId))) {
      continue;
    }
    candidateIds.push(String(row.id));
  }

  if (!candidateIds.length) return { expired: 0 };

  const { data: awaitingRows, error: awaitingErr } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "expired",
      released_at: now,
      updated_at: now,
      notes: "expired_unpaid_pay_hold_30m",
    })
    .in("id", candidateIds)
    .select("id, document_id");

  if (awaitingErr) {
    console.warn("[expireUnpaidBookingPayHolds] awaiting", awaitingErr.message);
  }

  const rows = awaitingRows || [];
  let expired = 0;
  for (const row of rows) {
    const docId = String(row.document_id || "").trim();
    if (!docId) continue;
    expired += 1;

    // DB check allows `expired` (not `expired_unpaid`) — parent finish-booking treats that as released.
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        status: "expired",
        updated_at: now,
      })
      .eq("document_id", docId)
      .in("status", ["awaiting_payment", "awaiting_office_payment", "choices_saved", "pending"]);

    const { data: toks } = await admin
      .from("portal_booking_completion_tokens")
      .select("invoice_share_id")
      .eq("document_id", docId)
      .not("invoice_share_id", "is", null);
    const invIds = [
      ...new Set(
        (toks || [])
          .map((t) => String(t.invoice_share_id || "").trim())
          .filter(Boolean),
      ),
    ];
    if (invIds.length) {
      await admin
        .from("portal_parent_invoice_share")
        .update({
          share_status: "hidden",
          notes: "Auto-hidden · unpaid 30-minute booking pay window expired",
          updated_at: now,
        })
        .in("id", invIds)
        .eq("payment_status", "unpaid");
    }
  }

  return { expired };
}

/** Nudge at 25' then expire unpaid holds past 30'. */
export async function runBookingPayHoldMaintenance(
  admin: SupabaseClient,
): Promise<{ nudged: number; expired: number }> {
  const nudge = await nudgeUnpaidBookingPayHolds(admin);
  const exp = await expireUnpaidBookingPayHolds(admin);
  return { nudged: nudge.nudged, expired: exp.expired };
}
