// @ts-nocheck — Edge Function (Deno).
//
// portal-crash-summer-book
// Reserve Summer Jul 2026 crash slots + create full-amount invoice.
// Place is only confirmed after the invoice is paid (Stripe webhook / office mark paid).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../_shared/portal_create_family_invoice.ts";
import {
  CRASH_HOLD_MINUTES,
  CRASH_SUMMER_INVOICE_TERM_REFERENCE,
  buildCrashSummerInvoiceDescription,
  crashBankTransferReference,
  crashInvoiceServiceLabel,
  crashIndividualDaysOpenForWeek,
  crashIndividualRulesCopy,
  crashIndividualWindowFor,
  crashIsBookingWeekOpen,
  crashWeekFillSnapshot,
  quoteCrashSummerBooking,
  type CrashActivity,
  type CrashBookingMode,
  type CrashWeekId,
} from "../_shared/crash_summer_2026.ts";
import { tideBankDetailsFromEnv } from "../_shared/tide_bank_details.ts";
import {
  stripeConfigured,
  stripeGrossUpFromGbp,
} from "../_shared/stripe_checkout.ts";
import { pushPortalInvoiceShareToXero } from "../_shared/portal_xero_invoice_push.ts";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../_shared/portal_parent_messaging.ts";
import { resolveParticipantInvoiceFunding } from "../_shared/portal_invoice_funding.ts";
import {
  NO_EXTRA_BOOKING_NOTE,
  participantBlocksExtraBooking,
} from "../_shared/participant_identity.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

async function expireStaleHolds(admin: ReturnType<typeof createClient>) {
  const now = new Date().toISOString();
  await admin
    .from("portal_crash_summer_booking_lines")
    .update({ status: "expired" })
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now);

  await admin
    .from("portal_crash_summer_bookings")
    .update({ status: "expired", updated_at: now })
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: parentPortalCorsHeaders });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  const weekId = clean(body.week_id, 8) as CrashWeekId;
  const mode = clean(body.booking_mode, 40) as CrashBookingMode;
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });
  if (weekId !== "w1" && weekId !== "w2") {
    return json(400, { ok: false, error: "invalid_week" });
  }
  if (mode !== "weekly_pack" && mode !== "individual_days") {
    return json(400, { ok: false, error: "invalid_mode" });
  }

  await expireStaleHolds(supabase);

  const forceWeek2 =
    String(Deno.env.get("CRASH_WEEK2_FORCE_OPEN") || "").trim() === "1";
  const { data: w1Lines } = await supabase
    .from("portal_crash_summer_booking_lines")
    .select("session_date")
    .in("session_date", [
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ])
    .in("status", ["awaiting_payment", "confirmed"]);
  const fill = crashWeekFillSnapshot(w1Lines || [], forceWeek2);
  if (!crashIsBookingWeekOpen(weekId, fill.week1_fill, forceWeek2)) {
    return json(403, {
      ok: false,
      error: "week_not_open",
      message:
        "Week 2 opens when Week 1 reaches 80% of places. Only Week 1 is open right now (climbing Mon–Thu 20–23 July; swimming Tue–Fri 21–24 July).",
      week1_fill_pct: fill.week1_fill_pct,
      week2_open_at_fill: fill.week2_open_at_fill,
      rules: crashIndividualRulesCopy(false),
    });
  }

  if (mode === "individual_days" && !crashIndividualDaysOpenForWeek(weekId)) {
    const win = crashIndividualWindowFor(weekId);
    return json(403, {
      ok: false,
      error: "individual_days_not_open",
      message:
        weekId === "w2"
          ? `Week 2 individual hours open ${win.label}. Until Thursday 23 July only four-day weekly packs can be booked for 28–31 July.`
          : `Week 1 individual hours open ${win.label}. Until then only four-day weekly packs (Tue–Fri) can be booked.`,
      rules: crashIndividualRulesCopy(),
    });
  }

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, parent_person_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (!participant) {
    const { data: fallback } = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback) return parentPortalJsonInvalid(403);
  }

  const displayName =
    clean(participant?.display_name, 120) ||
    [participant?.first_name, participant?.last_name].filter(Boolean).join(" ").trim() ||
    contactId;

  if (
    participantBlocksExtraBooking({
      contactId,
      displayName,
      firstName: clean(participant?.first_name, 80),
      lastName: clean(participant?.last_name, 80),
    })
  ) {
    return json(403, {
      ok: false,
      error: "extras_not_available",
      message: NO_EXTRA_BOOKING_NOTE,
    });
  }

  const rawActs = Array.isArray(body.activities) ? body.activities : [];
  const activities = Array.from(
    new Set(
      rawActs
        .map((a) => clean(a, 20))
        .filter((a): a is CrashActivity => a === "climbing" || a === "swimming"),
    ),
  );
  if (!activities.length) return json(400, { ok: false, error: "activity_required" });

  const slotByActivity: Partial<
    Record<CrashActivity, string | string[] | Record<string, string | string[]>>
  > = {};
  const rawSlots =
    body.slots && typeof body.slots === "object" && !Array.isArray(body.slots)
      ? (body.slots as Record<string, unknown>)
      : {};

  for (const activity of activities) {
    const sel = rawSlots[activity];
    if (mode === "weekly_pack") {
      if (Array.isArray(sel)) {
        slotByActivity[activity] = sel.map((x) => clean(x, 20)).filter(Boolean);
      } else {
        slotByActivity[activity] = clean(sel, 20);
      }
    } else if (sel && typeof sel === "object" && !Array.isArray(sel)) {
      const map: Record<string, string | string[]> = {};
      for (const [date, slotVal] of Object.entries(sel as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (Array.isArray(slotVal)) {
          map[date] = slotVal.map((x) => clean(x, 20)).filter(Boolean);
        } else {
          map[date] = clean(slotVal, 20);
        }
      }
      slotByActivity[activity] = map;
    }
  }

  const quote = quoteCrashSummerBooking({
    weekId,
    mode,
    activities,
    slotByActivity,
  });
  if (!quote.ok) return json(400, { ok: false, error: quote.error });

  await expireStaleHolds(supabase);

  const holdExpires = new Date(Date.now() + CRASH_HOLD_MINUTES * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: booking, error: bookErr } = await supabase
    .from("portal_crash_summer_bookings")
    .insert({
      contact_id: contactId,
      parent_person_id: session.parent_person_id,
      week_id: weekId,
      booking_mode: mode,
      activities,
      amount_gbp: quote.amountGbp,
      status: "awaiting_payment",
      hold_expires_at: holdExpires,
      notes: `Summer crash ${weekId} · ${displayName}`,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (bookErr || !booking?.id) {
    console.error("[portal-crash-summer-book] booking", bookErr?.message);
    return json(500, { ok: false, error: "booking_create_failed" });
  }

  const lineRows = quote.lines.map((line) => ({
    booking_id: booking.id,
    activity: line.activity,
    session_date: line.session_date,
    slot_id: line.slot_id,
    slot_label: line.slot_label,
    unit_price_gbp: line.unit_price_gbp,
    status: "awaiting_payment",
    hold_expires_at: holdExpires,
  }));

  const { error: lineErr } = await supabase
    .from("portal_crash_summer_booking_lines")
    .insert(lineRows);

  if (lineErr) {
    console.error("[portal-crash-summer-book] lines", lineErr.message);
    await supabase.from("portal_crash_summer_bookings").delete().eq("id", booking.id);
    const conflict =
      String(lineErr.message || "").toLowerCase().includes("duplicate") ||
      String(lineErr.code || "") === "23505";
    return json(conflict ? 409 : 500, {
      ok: false,
      error: conflict ? "slot_unavailable" : "booking_lines_failed",
      message: conflict
        ? "One or more selected slots were just taken. Please pick another time."
        : "Could not reserve slots. Please try again.",
    });
  }

  const ownerId = await resolvePortalInvoiceOwnerUserId(supabase);
  if (!ownerId) {
    await supabase
      .from("portal_crash_summer_bookings")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", booking.id);
    await supabase
      .from("portal_crash_summer_booking_lines")
      .update({ status: "cancelled" })
      .eq("booking_id", booking.id);
    return json(500, { ok: false, error: "invoice_owner_missing" });
  }

  const dueDate = new Date().toISOString().slice(0, 10);
  const bankRef = crashBankTransferReference(displayName);
  const serviceLabel = crashInvoiceServiceLabel(activities);
  const funding = await resolveParticipantInvoiceFunding(supabase, {
    contactId,
    displayName,
  });
  const lineDescription = buildCrashSummerInvoiceDescription({
    vatMode: funding.vatMode,
    weekId,
    mode,
    activities,
    lines: quote.lines,
    participantName: displayName,
    clientId: funding.clientId,
    po: funding.po,
  });
  const created = await createPortalFamilyInvoice(supabase, {
    contactId,
    amountGbp: quote.amountGbp,
    dueDateIso: dueDate,
    vatMode: funding.vatMode,
    lineDescription,
    descriptionComplete: true,
    // PDF / Xero Reference = term label; name + service live in description / Service.
    reference: CRASH_SUMMER_INVOICE_TERM_REFERENCE,
    service: serviceLabel,
    notes: null,
    title: `Summer crash course — ${displayName}`,
    shareStatus: "ready",
    paymentMethodHint: "bank_transfer",
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy: "crash_summer_book",
  });

  if (!created.ok) {
    console.error("[portal-crash-summer-book] invoice", created.error);
    await supabase
      .from("portal_crash_summer_bookings")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", booking.id);
    await supabase
      .from("portal_crash_summer_booking_lines")
      .update({ status: "cancelled" })
      .eq("booking_id", booking.id);
    return json(500, {
      ok: false,
      error: "invoice_create_failed",
      detail: created.error,
    });
  }

  const invoiceId = String((created.invoice as { id?: string })?.id || "");
  await supabase
    .from("portal_crash_summer_bookings")
    .update({
      invoice_share_id: invoiceId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", booking.id);

  // Signed PDF URL for pay screen (7 days).
  let pdfUrl: string | null = null;
  if (created.pdfStoragePath) {
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(created.pdfStoragePath, 60 * 60 * 24 * 7);
    pdfUrl = signed?.signedUrl || null;
  }

  // Best-effort: email invoice PDF to family.
  let emailSent = false;
  try {
    const smtp = readParentNotifySmtpConfig();
    const { data: parentRow } = await supabase
      .from("portal_parent_contacts")
      .select("email, parent_display, parent_first_name, parent_last_name")
      .eq("contact_id", contactId)
      .maybeSingle();
    const toEmail = clean(parentRow?.email, 200);
    if (smtp && toEmail && created.pdfStoragePath) {
      const { data: pdfBlob, error: dlErr } = await supabase.storage
        .from("documents")
        .download(created.pdfStoragePath);
      if (!dlErr && pdfBlob) {
        const buf = new Uint8Array(await pdfBlob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
        const contentBase64 = btoa(binary);
        const parentLabel =
          clean(parentRow?.parent_display, 80) ||
          [parentRow?.parent_first_name, parentRow?.parent_last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          "there";
        const html = [
          `<p>Hi ${parentLabel},</p>`,
          `<p>Thanks for reserving <strong>${displayName}</strong> on the Summer crash course.</p>`,
          `<p>Invoice <strong>${created.invoiceNumber}</strong> for <strong>£${Number(quote.amountGbp).toFixed(2)}</strong> is attached.</p>`,
          `<p>Pay in full within 2 hours to confirm the place. Use bank reference:</p>`,
          `<p style="font-size:18px;font-weight:700">${bankRef}</p>`,
          pdfUrl
            ? `<p><a href="${pdfUrl}">View invoice PDF</a></p>`
            : "",
          `<p>ClubSENsational</p>`,
        ]
          .filter(Boolean)
          .join("\n");
        const mail = await sendEmailWithAttachmentViaSmtp({
          config: smtp,
          to: [toEmail],
          subject: `Invoice ${created.invoiceNumber} — Summer crash · ${displayName}`,
          html,
          attachment: {
            filename: `${created.invoiceNumber}.pdf`,
            contentBase64,
            mimeType: "application/pdf",
          },
        });
        emailSent = !!mail.ok;
        if (!mail.ok) {
          console.error("[portal-crash-summer-book] email", mail.error);
        }
      }
    }
  } catch (err) {
    console.error("[portal-crash-summer-book] email_throw", err);
  }

  // Best-effort Xero ACCREC — booking still succeeds if Xero fails.
  let xero: Record<string, unknown> | null = null;
  if (invoiceId) {
    try {
      const pushed = await pushPortalInvoiceShareToXero(supabase, invoiceId);
      xero = pushed.ok
        ? { ok: true, xero_invoice_id: pushed.xero_invoice_id, skipped: !!pushed.skipped }
        : { ok: false, error: pushed.error, detail: pushed.detail || null };
      if (!pushed.ok) {
        console.error("[portal-crash-summer-book] xero", pushed.error, pushed.detail);
      }
    } catch (err) {
      console.error("[portal-crash-summer-book] xero_throw", err);
      xero = { ok: false, error: "xero_throw" };
    }
  }

  const tide = tideBankDetailsFromEnv();
  const card = stripeConfigured()
    ? (() => {
      const g = stripeGrossUpFromGbp(quote.amountGbp);
      return {
        available: true,
        invoice_gbp: g.net_gbp,
        charge_gbp: g.charge_gbp,
        fee_gbp: g.fee_gbp,
        note:
          "Card / Apple Pay includes a small processing fee so we receive the booking amount in full. Bank transfer has no fee.",
      };
    })()
    : { available: false, note: "Card / Apple Pay is not available right now — please use bank transfer." };

  return json(200, {
    ok: true,
    booking_id: booking.id,
    invoice_id: invoiceId,
    invoice_number: created.invoiceNumber,
    amount_gbp: quote.amountGbp,
    hold_expires_at: holdExpires,
    status: "awaiting_payment",
    pay_in_full_required: true,
    pdf_url: pdfUrl,
    invoice_emailed: emailSent,
    xero,
    bank_transfer: {
      available: tide.available,
      payee_name: tide.payee_name,
      sort_code: tide.sort_code,
      account_number: tide.account_number,
      // Tide pay reference = participant name only (invoice Reference is the term label).
      reference_hint: bankRef,
      message: tide.available
        ? null
        : "Contact the office for bank transfer details.",
    },
    card_checkout: card,
    message:
      "Slots held for 2 hours. Pay in full by bank transfer or Card / Apple Pay to confirm — unpaid holds are released automatically.",
  });
});
