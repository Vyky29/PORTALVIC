// portal-booking-finish — public finish-booking after Accept (magic token).
// Actions: load | save_choices | create_invoice | create_stripe_checkout |
// notify_office_paid (unlocks GoCardless after WhatsApp/email Step 1)
// (confirm_paid disabled — parent messages/emails office after bank transfer)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  familyBookingPaymentMethodLabel,
  resolvePortalInvoiceOwnerUserId,
} from "../_shared/portal_create_family_invoice.ts";
import { bookingPortalServiceLabel, gcNeedsBankRemainderForCurrentMonth } from "../_shared/booking_portal_term_invoices.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";
import {
  suggestedTransferReference,
  tideBankDetailsFromEnv,
} from "../_shared/tide_bank_details.ts";
import {
  bookingTermDisplayLabel,
  clientKeyFromName,
  createFinishBookingStripeCheckout,
  inferBillingTerm,
  inferServiceKey,
  inferServiceTypeLabel,
  inferUnitPriceGbp,
  loadCompletionByRawToken,
  parseBookingScope,
  parseFundingCode,
  parseNewClientPayPlan,
  quoteNewClientMidTermInvoice,
  quoteNewClientTrialInvoice,
  type CompletionTokenRow,
} from "../_shared/portal_booking_finish.ts";
import { SESSION_COUNTS } from "../_shared/reenrolment_catalog.ts";
import {
  gocardlessConfigured,
  gocardlessCreateBillingRequest,
  gocardlessCreateBillingRequestFlow,
} from "../_shared/gocardless.ts";
import {
  extractBookingRequest,
  reservationFieldsFromBookingRequest,
  resolveSessionDateIso,
} from "../_shared/portal_booking_context.ts";
import {
  BOOKING_PAY_HOLD_MINUTES,
  BOOKING_SLOT_HOLD_STATUSES,
  bookingPayHoldExpiresAt,
  runBookingPayHoldMaintenance,
} from "../_shared/portal_booking_pay_hold.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** First instalment collected by bank (mid-month GoCardless join). */
function paymentScheduleBankFirst(schedule: unknown): boolean {
  const rows = Array.isArray(schedule) ? schedule : [];
  const first = rows[0] as Record<string, unknown> | undefined;
  if (!first) return false;
  const via = String(first.collect_via || "").toLowerCase();
  if (via === "bank_transfer" || via === "bank") return true;
  return /bank transfer/i.test(String(first.label || ""));
}

function officePaidNotified(choices: Record<string, unknown>): boolean {
  return Boolean(String(choices.office_paid_notified_at || "").trim());
}

/** Hide GC authorisation URL until parent taps WhatsApp/Email (Step 1). */
function redactGcUntilOfficeNotify(
  invoice: Record<string, unknown> | null,
  choices: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!invoice) return null;
  if (
    paymentScheduleBankFirst(invoice.payment_schedule) &&
    !officePaidNotified(choices)
  ) {
    return { ...invoice, gocardless_url: null };
  }
  return invoice;
}

async function mintFinishBookingGocardlessUrl(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    contactId: string;
    parentPersonId: string | null;
    participantName: string;
    invoiceId: string;
    invoiceNumber: string | null;
    rawToken: string;
    paymentSchedule: unknown;
  },
): Promise<string | null> {
  if (!gocardlessConfigured() || !opts.invoiceId) return null;
  const rows = Array.isArray(opts.paymentSchedule) ? opts.paymentSchedule : [];
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  const bankFirst = paymentScheduleBankFirst(opts.paymentSchedule);
  const firstGbp = Number(firstRow?.amount_gbp) || 0;
  const firstDue = String(firstRow?.due_date || "").slice(0, 10);
  const asOf = new Date().toISOString().slice(0, 10);
  // Charge via Billing Request only when first GC instalment is due today (the shared 1st).
  const chargeGcNow =
    !bankFirst &&
    String(firstRow?.collect_via || "").toLowerCase() === "gocardless" &&
    firstDue === asOf &&
    firstGbp > 0;
  const br = await gocardlessCreateBillingRequest({
    contactId: opts.contactId,
    parentPersonId: opts.parentPersonId,
    description: `clubSENsational · ${clean(opts.participantName, 80)}`,
    paymentAmountPence: chargeGcNow ? Math.round(firstGbp * 100) : null,
    paymentDescription: chargeGcNow
      ? `Payment due ${firstDue} · ${clean(opts.invoiceNumber, 40) || opts.invoiceId}`
      : `Monthly on the 1st · ${clean(opts.invoiceNumber, 40) || opts.invoiceId}`,
    invoiceShareId: opts.invoiceId,
    invoiceNumber: clean(opts.invoiceNumber, 40) || null,
  });
  if (!br.ok) {
    console.warn("[portal-booking-finish] gocardless br", br.error, br.detail);
    return null;
  }
  const origin = (
    Deno.env.get("PORTAL_PUBLIC_ORIGIN") ||
    Deno.env.get("PARENT_PORTAL_PUBLIC_ORIGIN") ||
    "https://www.clubsensational.org"
  ).replace(/\/$/, "");
  const flow = await gocardlessCreateBillingRequestFlow({
    billingRequestId: br.data.id,
    redirectUri:
      `${origin}/parent/finish-booking?t=${encodeURIComponent(opts.rawToken)}&gc=1`,
    exitUri: `${origin}/parent/finish-booking?t=${encodeURIComponent(opts.rawToken)}`,
  });
  if (!flow.ok || !flow.data.authorisation_url) return null;
  const url = flow.data.authorisation_url;
  await admin
    .from("portal_parent_invoice_share")
    .update({ gocardless_url: url, updated_at: new Date().toISOString() })
    .eq("id", opts.invoiceId);
  return url;
}

function parseUkDateToIso(v: unknown): string | null {
  const s = clean(v, 20);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function splitParentName(display: string): { first: string; last: string } {
  const parts = clean(display, 200).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function normalizeMobileForStore(raw: unknown): string | null {
  const cleaned = clean(raw, 40);
  if (!cleaned) return null;
  return normalizeParentPhoneE164(cleaned) || cleaned;
}

function tokenExpired(token: CompletionTokenRow): boolean {
  if (token.status === "completed") return false;
  if (token.status === "expired") return true;
  return new Date(token.expires_at).getTime() < Date.now();
}

async function loadContext(
  admin: ReturnType<typeof createClient>,
  token: CompletionTokenRow,
) {
  let doc: Record<string, unknown> | null = null;
  if (token.document_id) {
    const { data } = await admin
      .from("portal_participant_documents")
      .select(
        "id, form_type, participant_name, participant_dob, parent_name, parent_email, parent_phone, payload_json, status",
      )
      .eq("id", token.document_id)
      .maybeSingle();
    doc = data;
  }
  let reservation: Record<string, unknown> | null = null;
  if (token.reservation_id) {
    const { data } = await admin
      .from("portal_booking_slot_reservations")
      .select("*")
      .eq("id", token.reservation_id)
      .maybeSingle();
    reservation = data;
  }
  if (!reservation && token.document_id) {
    const { data } = await admin
      .from("portal_booking_slot_reservations")
      .select("*")
      .eq("document_id", token.document_id)
      .in("status", ["validated", "pending", "awaiting_payment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reservation = data;
  }
  if (!reservation && doc?.payload_json) {
    const br = extractBookingRequest(
      doc.payload_json as Record<string, unknown>,
    );
    if (br) reservation = reservationFieldsFromBookingRequest(br);
  }
  return { doc, reservation };
}

function bookingKindFromContext(
  reservation: Record<string, unknown> | null,
  doc: Record<string, unknown> | null,
): "trial" | "term" {
  const notes = String(reservation?.notes || "");
  if (/booking_kind\s*=\s*trial/i.test(notes)) {
    return "trial";
  }
  const payload = doc?.payload_json;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const br = (payload as Record<string, unknown>).booking_request;
    if (br && typeof br === "object" && !Array.isArray(br)) {
      const kind = String((br as Record<string, unknown>).booking_kind || "")
        .trim()
        .toLowerCase();
      if (kind === "trial" || kind === "trial_session" || kind === "taster") {
        return "trial";
      }
    }
  }
  return "term";
}

function trialQuotePayload(q: {
  remainingSessions: number;
  programmeTotalGbp: number;
  invoiceTotalGbp: number;
  paymentSchedule: Array<{ amount_gbp: number; due_date: string | null }>;
  paymentMethodHint: string;
}) {
  return {
    remaining_sessions: q.remainingSessions,
    programme_total_gbp: q.programmeTotalGbp,
    invoice_total_gbp: q.invoiceTotalGbp,
    first_due_gbp: q.paymentSchedule[0]?.amount_gbp ?? null,
    first_due_date: q.paymentSchedule[0]?.due_date ?? null,
    schedule: q.paymentSchedule,
    payment_method_hint: q.paymentMethodHint,
    is_trial: true,
  };
}

/** Short hold while parent pays trial (Stripe or bank). */
const TRIAL_PAY_HOLD_MINUTES = BOOKING_PAY_HOLD_MINUTES;

async function holdTrialSlotForPayment(
  admin: ReturnType<typeof createClient>,
  reservation: Record<string, unknown> | null,
  documentId: string,
  holdExpiresIso: string,
  payPlan: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const slotId = clean(reservation?.slot_id, 160);
  const reservationId = clean(reservation?.id, 80);
  if (!slotId || !reservationId) return { ok: false, error: "reservation_missing" };

  const { count, error: countErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .in("status", [...BOOKING_SLOT_HOLD_STATUSES])
    .neq("document_id", documentId);
  if (countErr) {
    console.warn("[portal-booking-finish] trial slot count", countErr.message);
  } else if ((count || 0) >= 2) {
    return { ok: false, error: "slot_unavailable" };
  }

  const planTag = payPlan === "one_off_bank" ? "trial_bank" : "trial_stripe_checkout";
  const { error: updErr } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "awaiting_payment",
      hold_expires_at: holdExpiresIso,
      released_at: null,
      updated_at: new Date().toISOString(),
      notes: `${planTag}|booking_kind=trial|pay_hold_30m`,
    })
    .eq("id", reservationId)
    .eq("document_id", documentId);
  if (updErr) return { ok: false, error: "slot_hold_failed" };
  return { ok: true };
}

async function ensureContact(
  admin: ReturnType<typeof createClient>,
  token: CompletionTokenRow,
  doc: Record<string, unknown>,
  fundingLabel: string,
  paymentLabel: string,
): Promise<{ contactId: string; parentPersonId: string } | { error: string }> {
  if (token.contact_id && token.parent_person_id) {
    const parentDisplay = clean(doc.parent_name, 200);
    if (parentDisplay) {
      const parentNames = splitParentName(parentDisplay);
      await admin
        .from("portal_parent_contacts")
        .update({
          parent_display: parentDisplay,
          parent_first_name: parentNames.first || null,
          parent_last_name: parentNames.last || null,
          funding_label: fundingLabel,
          payment_method_label: paymentLabel,
          updated_at: new Date().toISOString(),
        })
        .eq("contact_id", token.contact_id);
    } else {
      await admin
        .from("portal_parent_contacts")
        .update({
          funding_label: fundingLabel,
          payment_method_label: paymentLabel,
          updated_at: new Date().toISOString(),
        })
        .eq("contact_id", token.contact_id);
    }
    return { contactId: token.contact_id, parentPersonId: token.parent_person_id };
  }

  const childDisplay = clean(doc.participant_name, 200);
  const parentDisplay = clean(doc.parent_name, 200) || "Parent";
  const mobile = normalizeMobileForStore(doc.parent_phone);
  if (!childDisplay) return { error: "child_required" };
  if (!mobile) return { error: "mobile_required" };

  const { data: existingByName } = await admin
    .from("portal_participants")
    .select("contact_id, parent_person_id, display_name")
    .ilike("display_name", childDisplay)
    .limit(1)
    .maybeSingle();
  if (existingByName?.contact_id) {
    const contactId = String(existingByName.contact_id);
    const { data: c } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id")
      .eq("contact_id", contactId)
      .maybeSingle();
    const parentPersonId = String(c?.parent_person_id || existingByName.parent_person_id || "");
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        contact_id: contactId,
        parent_person_id: parentPersonId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", token.id);
    await admin
      .from("portal_parent_contacts")
      .update({
        funding_label: fundingLabel,
        payment_method_label: paymentLabel,
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", contactId);
    return { contactId, parentPersonId };
  }

  const { data: idRows } = await admin.from("portal_parent_contacts").select("contact_id").limit(8000);
  let maxN = 396;
  for (const row of idRows || []) {
    const n = Number(String(row.contact_id || "").trim());
    if (Number.isFinite(n) && n > 0 && n < 10000 && n > maxN) maxN = n;
  }
  const contactId = String(maxN + 1);
  const parentPersonId = "portal-" + contactId;
  const parentNames = splitParentName(parentDisplay);
  const childParts = childDisplay.split(/\s+/).filter(Boolean);
  const childFirst = childParts[0] || childDisplay;
  const childLast = childParts.length > 1 ? childParts.slice(1).join(" ") : "";
  const dobIso = parseUkDateToIso(doc.participant_dob);
  const payload = (doc.payload_json && typeof doc.payload_json === "object"
    ? doc.payload_json
    : {}) as Record<string, unknown>;

  const { error: insErr } = await admin.from("portal_parent_contacts").insert({
    contact_id: contactId,
    parent_person_id: parentPersonId,
    child_display: childDisplay,
    child_first_name: childFirst || null,
    child_last_name: childLast || null,
    parent_display: parentDisplay,
    parent_first_name: parentNames.first || null,
    parent_last_name: parentNames.last || null,
    email: clean(doc.parent_email, 200) || null,
    mobile,
    address_line1: clean(payload.parent_address, 200) || null,
    postcode: clean(payload.parent_postcode, 40) || null,
    dob_iso: dobIso,
    in_class: true,
    on_waiting_list: false,
    registration_date: new Date().toISOString().slice(0, 10),
    funding_label: fundingLabel,
    payment_method_label: paymentLabel,
    updated_at: new Date().toISOString(),
  });
  if (insErr) {
    console.error("[portal-booking-finish] contact", insErr.message);
    return { error: "create_contact_failed" };
  }

  await admin.from("portal_participants").upsert(
    {
      contact_id: contactId,
      display_name: childDisplay,
      first_name: childFirst || null,
      last_name: childLast || null,
      parent_person_id: parentPersonId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contact_id" },
  );

  await admin
    .from("portal_booking_completion_tokens")
    .update({
      contact_id: contactId,
      parent_person_id: parentPersonId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", token.id);

  return { contactId, parentPersonId };
}

async function upsertServiceLineFromReservation(
  admin: ReturnType<typeof createClient>,
  contactId: string,
  childDisplay: string,
  reservation: Record<string, unknown> | null,
) {
  if (!reservation) return;
  const day = clean(reservation.day_label, 40);
  const service = clean(reservation.service_name, 120) || "Activity";
  const timeSlot = clean(reservation.time_label, 80);
  const venue = clean(reservation.venue, 80);
  if (!day || !timeSlot) return;
  const clientKey = clientKeyFromName(childDisplay);
  const session = {
    day,
    service,
    timeSlot,
    durationMin: 30,
    venue,
    instructor: "",
    area: "",
  };
  await admin.from("portal_participant_service_lines").upsert(
    {
      client_key: clientKey,
      client_name: childDisplay,
      client_name_norm: childDisplay.toLowerCase(),
      sessions: [session],
      services_count: 1,
      source: "booking_finish_" + contactId,
      term_label: "2026/27",
      validated: true,
    },
    { onConflict: "client_key" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return json(500, { ok: false, error: "server_misconfigured" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await runBookingPayHoldMaintenance(admin);
  } catch (e) {
    console.warn("[portal-booking-finish] pay hold maintenance", e);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 40).toLowerCase() || "load";
  const rawToken = clean(body.token, 128);
  const token = await loadCompletionByRawToken(admin, rawToken);
  if (!token) return json(404, { ok: false, error: "invalid_token" });
  if (tokenExpired(token) && token.status !== "completed") {
    return json(410, { ok: false, error: "token_expired" });
  }

  const { doc, reservation } = await loadContext(admin, token);
  if (!doc) return json(404, { ok: false, error: "document_missing" });

  const day = clean(reservation?.day_label, 40) || "Wednesday";
  const timeLabel = clean(reservation?.time_label, 80);
  const venue = clean(reservation?.venue, 80);
  const activity = clean(reservation?.activity, 80);
  const formType = clean(doc.form_type, 80);
  const serviceName = inferServiceTypeLabel({
    serviceName: clean(reservation?.service_name, 120),
    timeLabel,
    activity,
    venue,
    formType,
  });
  const todayIso = new Date().toISOString().slice(0, 10);
  const sessionDateIso = resolveSessionDateIso({
    dateIso: reservation?.date_iso ? String(reservation.date_iso).slice(0, 10) : null,
    day,
    asOfIso: todayIso,
  });
  // Pro-rata from first attended session (or today if they already missed that date).
  const proRataAsOf =
    sessionDateIso && sessionDateIso > todayIso ? sessionDateIso : todayIso;
  // Trial and term quotes: one session at that service's catalogue rate
  // (climbing £75 / 60', aquatic £50 / 30', …) — never a blind £50 default.
  const unit = inferUnitPriceGbp({
    serviceName,
    timeLabel,
    activity,
    venue,
    formType,
  });
  const term = inferBillingTerm();
  const serviceKey = inferServiceKey(serviceName, timeLabel);
  const portalBookingKind = bookingKindFromContext(reservation, doc);
  const detailLine = [day, timeLabel, venue].filter(Boolean).join(" · ");

  const quotePlans = [
    "gocardless_monthly",
    "flexi_bank",
    "one_off_bank",
    "own_way",
  ] as const;
  const quotes: Record<string, unknown> = {};
  for (const plan of quotePlans) {
    const q = quoteNewClientMidTermInvoice({
      term,
      day,
      unitPriceGbp: unit,
      plan,
      asOfIso: proRataAsOf,
      payAsOfIso: todayIso,
      serviceKey,
      serviceLabel: serviceName,
      detail: detailLine,
    });
    if (!("error" in q)) {
      quotes[plan] = {
        remaining_sessions: q.remainingSessions,
        programme_total_gbp: q.programmeTotalGbp,
        invoice_total_gbp: q.invoiceTotalGbp,
        first_due_gbp: q.paymentSchedule[0]?.amount_gbp ?? null,
        first_due_date: q.paymentSchedule[0]?.due_date ?? null,
        schedule: q.paymentSchedule,
        payment_method_hint: q.paymentMethodHint,
        pro_rata_from: q.asOfIso,
      };
    }
  }
  const trialQ = quoteNewClientTrialInvoice({
    unitPriceGbp: unit,
    serviceKey,
    serviceLabel: serviceName,
    detail: detailLine,
    day,
    timeLabel,
    sessionDateIso,
  });
  if (!("error" in trialQ)) {
    quotes.trial_one_off = trialQuotePayload(trialQ);
  }

  const weekend = /saturday|sunday/i.test(day);
  const termCounts = weekend ? SESSION_COUNTS.weekend : SESSION_COUNTS.weekday;
  const termSessionsFull = Number(termCounts[term] || 0) || 0;
  const baseQuote = quotes.one_off_bank as
    | { remaining_sessions?: number; programme_total_gbp?: number }
    | undefined;
  const remainingSessions =
    Number(baseQuote?.remaining_sessions) || termSessionsFull;
  const termTotalPayable =
    Number(baseQuote?.programme_total_gbp) ||
    Math.round(unit * remainingSessions * 100) / 100;
  const termTotalFull = Math.round(unit * termSessionsFull * 100) / 100;
  const termLabel = bookingTermDisplayLabel(term);
  const savedChoices =
    token.choices_json && typeof token.choices_json === "object"
      ? token.choices_json as Record<string, unknown>
      : {};
  const savedScope = parseBookingScope(savedChoices.booking_scope) ||
    (portalBookingKind === "trial" ? "trial_session" : null);

  if (action === "load") {
    let invoice: Record<string, unknown> | null = null;
    if (token.invoice_share_id) {
      const { data: inv } = await admin
        .from("portal_parent_invoice_share")
        .select(
          "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, payment_method_hint, gocardless_url, due_date",
        )
        .eq("id", token.invoice_share_id)
        .maybeSingle();
      invoice = inv;
    }
    invoice = redactGcUntilOfficeNotify(invoice, savedChoices);
    return json(200, {
      ok: true,
      status: token.status,
      funding_code: token.funding_code,
      pay_plan: token.pay_plan,
      booking_scope: savedScope,
      booking_kind: portalBookingKind,
      is_trial_intent: portalBookingKind === "trial",
      participant_name: doc.participant_name,
      parent_name: doc.parent_name,
      slot: {
        service_name: serviceName,
        venue,
        day,
        time: timeLabel,
        slot_id: reservation?.slot_id || null,
        reservation_status: reservation?.status || null,
      },
      term,
      term_label: termLabel,
      unit_price_gbp: unit,
      pricing: {
        unit_price_gbp: unit,
        term,
        term_label: termLabel,
        term_sessions: termSessionsFull,
        term_total_gbp: termTotalFull,
        remaining_sessions: remainingSessions,
        payable_term_gbp: termTotalPayable,
        trial_session_gbp: unit,
      },
      quotes,
      invoice,
      gocardless_url: invoice?.gocardless_url || null,
      bank: tideBankDetailsFromEnv(),
      pay_hold_minutes: Number(savedChoices.pay_hold_minutes) || BOOKING_PAY_HOLD_MINUTES,
      pay_hold_expires_at:
        savedChoices.pay_hold_expires_at ||
        reservation?.hold_expires_at ||
        null,
      choices_json: savedChoices,
      gc_step2_unlocked: officePaidNotified(savedChoices),
      completed: token.status === "completed",
      place_released:
        token.status === "expired_unpaid" ||
        String(reservation?.status || "") === "expired",
    });
  }

  if (action === "save_choices") {
    if (token.status === "completed") {
      return json(200, { ok: true, status: "completed", completed: true });
    }
    const funding = parseFundingCode(body.funding_code);
    if (!funding) return json(400, { ok: false, error: "funding_required" });

    const scope = parseBookingScope(body.booking_scope) || savedScope;
    const planOnly = parseNewClientPayPlan(body.pay_plan);

    // Funding only (step 1) — continue to booking scope.
    if (!scope && !planOnly) {
      const now = new Date().toISOString();
      await admin
        .from("portal_booking_completion_tokens")
        .update({
          funding_code: funding,
          pay_plan: null,
          status: "funding_saved",
          choices_json: { funding_code: funding, saved_at: now },
          updated_at: now,
        })
        .eq("id", token.id);
      return json(200, {
        ok: true,
        status: "funding_saved",
        funding_code: funding,
      });
    }

    // Funding + scope (step 2) — continue to payment method.
    if (scope && !planOnly) {
      const now = new Date().toISOString();
      await admin
        .from("portal_booking_completion_tokens")
        .update({
          funding_code: funding,
          pay_plan: null,
          status: "scope_saved",
          choices_json: {
            funding_code: funding,
            booking_scope: scope,
            saved_at: now,
          },
          updated_at: now,
        })
        .eq("id", token.id);
      return json(200, {
        ok: true,
        status: "scope_saved",
        funding_code: funding,
        booking_scope: scope,
      });
    }

    if (!planOnly) {
      return json(400, { ok: false, error: "pay_plan_required" });
    }
    if (!scope) {
      return json(400, { ok: false, error: "booking_scope_required" });
    }
    if (
      scope === "trial_session" &&
      planOnly !== "stripe_instant" &&
      planOnly !== "one_off_bank"
    ) {
      return json(400, {
        ok: false,
        error: "trial_pay_plan_required",
        message: "Trial sessions: pay by card / Apple Pay or bank transfer.",
      });
    }

    const plan = planOnly;
    const now = new Date().toISOString();
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        funding_code: funding,
        pay_plan: plan,
        status: "choices_saved",
        choices_json: {
          funding_code: funding,
          booking_scope: scope,
          pay_plan: plan,
          saved_at: now,
        },
        updated_at: now,
      })
      .eq("id", token.id);

    return json(200, {
      ok: true,
      status: "choices_saved",
      funding_code: funding,
      booking_scope: scope,
      pay_plan: plan,
      quote:
        scope === "trial_session"
          ? quotes.trial_one_off || null
          : quotes[plan] || null,
    });
  }

  if (action === "create_invoice") {
    if (token.status === "completed") {
      return json(200, { ok: true, status: "completed", completed: true });
    }
    const funding = parseFundingCode(body.funding_code) ||
      parseFundingCode(token.funding_code);
    if (!funding) {
      return json(400, { ok: false, error: "funding_required" });
    }
    let plan = parseNewClientPayPlan(body.pay_plan) ||
      parseNewClientPayPlan(token.pay_plan);
    const scope = parseBookingScope(body.booking_scope) || savedScope;
    if (!scope) return json(400, { ok: false, error: "booking_scope_required" });
    if (scope === "trial_session") {
      if (plan !== "stripe_instant" && plan !== "one_off_bank") {
        return json(400, {
          ok: false,
          error: "trial_pay_plan_required",
          message: "Trial sessions: pay by card / Apple Pay or bank transfer.",
        });
      }
    }
    if (!plan) return json(400, { ok: false, error: "pay_plan_required" });
    if (plan === "own_way" && funding === "la_direct_payments") {
      return json(400, { ok: false, error: "own_way_not_for_la" });
    }

    if (token.invoice_share_id) {
      const { data: existing } = await admin
        .from("portal_parent_invoice_share")
        .select(
          "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, payment_method_hint, gocardless_url, due_date",
        )
        .eq("id", token.invoice_share_id)
        .maybeSingle();
      const invSafe = redactGcUntilOfficeNotify(
        existing as Record<string, unknown> | null,
        savedChoices,
      );
      return json(200, {
        ok: true,
        already: true,
        invoice: invSafe,
        gocardless_url: invSafe?.gocardless_url || null,
        bank: tideBankDetailsFromEnv(),
        gc_step2_unlocked: officePaidNotified(savedChoices),
        choices_json: savedChoices,
        quote:
          scope === "trial_session"
            ? quotes.trial_one_off || null
            : quotes[plan] || null,
      });
    }

    const fundingLabel =
      funding === "la_direct_payments"
        ? "Using LA money (Participant EHCP funds)"
        : "Using Own money (private family funds)";
    const asOfForLabel = new Date().toISOString().slice(0, 10);
    const gcBankFirstLabel =
      plan === "gocardless_monthly" &&
      gcNeedsBankRemainderForCurrentMonth(term, asOfForLabel);
    const paymentLabel =
      scope === "trial_session"
        ? plan === "one_off_bank"
          ? "Trial session · Bank transfer (30 min hold)"
          : "Trial session · Card / Apple Pay (pay now)"
        : plan === "gocardless_monthly"
          ? gcBankFirstLabel
            ? "GoCardless (monthly) · first month bank transfer"
            : "GoCardless (monthly)"
          : plan === "flexi_bank"
            ? "Bank transfer · Flexi (2 per term)"
            : plan === "own_way"
              ? "Own way — 2 sessions prepaid + £50 / term"
              : "Bank transfer · One-off payment";
    const scopeLabel =
      scope === "trial_session"
        ? "Trial session (pay now)"
        : scope === "auto_reenroll_year"
          ? "Auto re-enrol by term (all year)"
          : "This term only";

    const ensured = await ensureContact(admin, token, doc, fundingLabel, paymentLabel);
    if ("error" in ensured) return json(400, { ok: false, error: ensured.error });

    const quote =
      scope === "trial_session"
        ? quoteNewClientTrialInvoice({
          unitPriceGbp: unit,
          serviceKey,
          serviceLabel: serviceName,
          detail: detailLine,
          day,
          timeLabel,
          sessionDateIso,
          payPlan: plan,
        })
        : quoteNewClientMidTermInvoice({
          term,
          day,
          unitPriceGbp: unit,
          plan,
          asOfIso: proRataAsOf,
          payAsOfIso: todayIso,
          serviceKey,
          serviceLabel: serviceName,
          detail: detailLine,
        });
    if ("error" in quote) return json(400, { ok: false, error: quote.error });

    const isTrial = scope === "trial_session";
    const isTrialStripe = isTrial && plan === "stripe_instant";
    const bookingService = bookingPortalServiceLabel(serviceKey, serviceName, { isTrial });
    const bookingSlot = [day, timeLabel].filter(Boolean).join(" ");
    const familyPaymentLabel = familyBookingPaymentMethodLabel(
      quote.paymentMethodHint,
      quote.paymentSchedule,
      { isTrial, notes: `Finish booking · ${funding} · ${scope} · ${plan}` },
    );

    const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
    if (!ownerId) return json(500, { ok: false, error: "invoice_owner_missing" });

    const asOf = new Date().toISOString().slice(0, 10);
    const payHoldExpires = bookingPayHoldExpiresAt(Date.now());

    if (isTrial && reservation?.id) {
      const held = await holdTrialSlotForPayment(
        admin,
        reservation as Record<string, unknown>,
        String(doc.id),
        payHoldExpires,
        plan,
      );
      if (!held.ok) {
        return json(409, {
          ok: false,
          error: held.error,
          message: held.error === "slot_unavailable"
            ? "That trial slot was just taken. Choose another time or ask the office."
            : "Could not hold the trial slot.",
        });
      }
    }

    const created = await createPortalFamilyInvoice(admin, {
      contactId: ensured.contactId,
      amountGbp: quote.invoiceTotalGbp,
      dueDateIso: quote.paymentSchedule[0]?.due_date || asOf,
      invoiceDateIso: asOf,
      vatMode: "vat_20",
      lineDescription: quote.lineDescription,
      reference: quote.reference,
      notes: `Finish booking · ${funding} · ${scope} · ${plan} · token ${token.id}`,
      quantity: quote.remainingSessions,
      shareStatus: "ready",
      paymentMethodHint: quote.paymentMethodHint,
      createdVia: "portal",
      ownerUserId: ownerId,
      readyBy: "finish_booking",
      clientIdLabel: ensured.contactId,
      paymentSchedule: quote.paymentSchedule,
      billingTerm: quote.term,
      lineItems: quote.lineItems,
      descriptionComplete: false,
      bookingService,
      bookingSlot,
      bookingVenue: venue || null,
      familyPaymentLabel,
    });
    if (!created.ok) {
      return json(500, { ok: false, error: created.error || "invoice_failed" });
    }

    const invoiceId = String(created.invoice?.id || "");
    let gocardlessUrl: string | null = null;
    const firstRow = quote.paymentSchedule[0];
    const bankFirst = firstRow?.collect_via === "bank_transfer";
    // Mid-month GC: mandate only after parent taps WhatsApp/Email (Step 1).
    if (
      plan === "gocardless_monthly" &&
      gocardlessConfigured() &&
      invoiceId &&
      !bankFirst
    ) {
      try {
        gocardlessUrl = await mintFinishBookingGocardlessUrl(admin, {
          contactId: ensured.contactId,
          parentPersonId: ensured.parentPersonId,
          participantName: String(doc.participant_name || ""),
          invoiceId,
          invoiceNumber: clean(created.invoice?.invoice_number, 40) || null,
          rawToken,
          paymentSchedule: quote.paymentSchedule,
        });
      } catch (e) {
        console.warn("[portal-booking-finish] gocardless", e);
      }
    }

    const now = new Date().toISOString();
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        funding_code: funding,
        pay_plan: plan,
        invoice_share_id: invoiceId || null,
        contact_id: ensured.contactId,
        parent_person_id: ensured.parentPersonId,
        status: "awaiting_payment",
        choices_json: {
          funding_code: funding,
          booking_scope: scope,
          pay_plan: plan,
          scope_label: scopeLabel,
          saved_at: now,
          pay_hold_minutes: BOOKING_PAY_HOLD_MINUTES,
          pay_hold_expires_at: payHoldExpires,
          gc_requires_office_notify: plan === "gocardless_monthly" && bankFirst,
        },
        updated_at: now,
      })
      .eq("id", token.id);

    // Bank / GC / trial: short 30' pay window. Seat frees if unpaid (unless parent reported).
    if (reservation?.id && !isTrial) {
      const prevNotes = String(reservation.notes || "").trim();
      await admin
        .from("portal_booking_slot_reservations")
        .update({
          status: "awaiting_payment",
          hold_expires_at: payHoldExpires,
          updated_at: now,
          notes: [prevNotes, "pay_hold_30m"].filter(Boolean).join("|").slice(0, 500),
        })
        .eq("id", String(reservation.id));
    }

    await upsertServiceLineFromReservation(
      admin,
      ensured.contactId,
      String(doc.participant_name || ""),
      reservation,
    );

    const { data: invOut } = await admin
      .from("portal_parent_invoice_share")
      .select(
        "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, payment_method_hint, gocardless_url, due_date",
      )
      .eq("id", invoiceId)
      .maybeSingle();

    const bank = tideBankDetailsFromEnv();
    const transferRef = suggestedTransferReference(
      invOut?.invoice_number,
      String(doc.participant_name || ""),
    );

    let stripeCheckout: Record<string, unknown> | null = null;
    if (isTrialStripe && invoiceId) {
      const stripe = await createFinishBookingStripeCheckout(admin, {
        invoiceShareId: invoiceId,
        contactId: ensured.contactId,
        invoiceNumber: clean(invOut?.invoice_number, 40),
        participantName: String(doc.participant_name || ""),
        amountGbp: quote.invoiceTotalGbp,
        rawFinishToken: rawToken,
      });
      if (!stripe.ok) {
        if (reservation?.id) {
          await admin
            .from("portal_booking_slot_reservations")
            .update({
              status: "released",
              released_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              notes: "trial_stripe_failed|booking_kind=trial",
            })
            .eq("id", String(reservation.id));
        }
        return json(stripe.error === "stripe_not_configured" ? 503 : 502, {
          ok: false,
          error: stripe.error,
          message: stripe.message || "Could not start card payment.",
        });
      }
      stripeCheckout = {
        checkout_url: stripe.checkout_url,
        session_id: stripe.session_id,
        charge_gbp: stripe.charge_gbp,
        fee_gbp: stripe.fee_gbp,
      };
    }

    return json(200, {
      ok: true,
      invoice:
        bankFirst && invOut
          ? { ...invOut, gocardless_url: null }
          : invOut,
      gocardless_url: bankFirst ? null : (gocardlessUrl || invOut?.gocardless_url || null),
      bank: isTrialStripe ? null : bank,
      transfer_reference: isTrialStripe ? null : transferRef,
      stripe_checkout: stripeCheckout,
      checkout_url: stripeCheckout?.checkout_url || null,
      pay_hold_minutes: isTrial ? TRIAL_PAY_HOLD_MINUTES : BOOKING_PAY_HOLD_MINUTES,
      pay_hold_expires_at: payHoldExpires,
      gc_step2_unlocked: false,
      choices_json: {
        funding_code: funding,
        booking_scope: scope,
        pay_plan: plan,
        scope_label: scopeLabel,
        saved_at: now,
        pay_hold_minutes: BOOKING_PAY_HOLD_MINUTES,
        pay_hold_expires_at: payHoldExpires,
        gc_requires_office_notify: plan === "gocardless_monthly" && bankFirst,
      },
      quote: {
        remaining_sessions: quote.remainingSessions,
        first_due_gbp: quote.paymentSchedule[0]?.amount_gbp ?? null,
        first_due_date: quote.paymentSchedule[0]?.due_date ?? null,
        invoice_total_gbp: quote.invoiceTotalGbp,
      },
      status: "awaiting_payment",
    });
  }

  if (action === "create_stripe_checkout") {
    if (token.status === "completed") {
      return json(200, { ok: true, status: "completed", completed: true });
    }
    if (!token.invoice_share_id) {
      return json(400, { ok: false, error: "invoice_required" });
    }
    const scope = parseBookingScope(body.booking_scope) || savedScope;
    if (scope !== "trial_session") {
      return json(400, { ok: false, error: "trial_stripe_only" });
    }
    const { data: invRow } = await admin
      .from("portal_parent_invoice_share")
      .select("id, invoice_number, amount_gbp, payment_status, contact_id")
      .eq("id", token.invoice_share_id)
      .maybeSingle();
    if (!invRow || invRow.payment_status === "paid") {
      return json(409, { ok: false, error: "invoice_not_payable" });
    }
    if (reservation?.id) {
      const held = await holdTrialSlotForPayment(
        admin,
        reservation as Record<string, unknown>,
        String(doc.id),
        bookingPayHoldExpiresAt(),
        "stripe_instant",
      );
      if (!held.ok) {
        return json(409, { ok: false, error: held.error });
      }
    }
    const stripe = await createFinishBookingStripeCheckout(admin, {
      invoiceShareId: String(invRow.id),
      contactId: String(invRow.contact_id || token.contact_id || ""),
      invoiceNumber: clean(invRow.invoice_number, 40),
      participantName: String(doc.participant_name || ""),
      amountGbp: Number(invRow.amount_gbp) || 0,
      rawFinishToken: rawToken,
    });
    if (!stripe.ok) {
      return json(502, { ok: false, error: stripe.error, message: stripe.message });
    }
    return json(200, {
      ok: true,
      checkout_url: stripe.checkout_url,
      stripe_checkout: stripe,
    });
  }

  if (action === "notify_office_paid") {
    // Step 1 gate: parent tapped WhatsApp or Email → unlock Step 2 GoCardless.
    if (token.status === "completed") {
      return json(200, { ok: true, status: "completed", completed: true });
    }
    if (!token.invoice_share_id) {
      return json(400, { ok: false, error: "invoice_required" });
    }
    const { data: inv } = await admin
      .from("portal_parent_invoice_share")
      .select(
        "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, payment_method_hint, gocardless_url, due_date",
      )
      .eq("id", token.invoice_share_id)
      .maybeSingle();
    if (!inv) return json(404, { ok: false, error: "invoice_not_found" });

    const bankFirst = paymentScheduleBankFirst(inv.payment_schedule);
    if (!bankFirst) {
      return json(400, {
        ok: false,
        error: "notify_not_required",
        message: "This payment plan does not require the bank-notify step.",
      });
    }

    const channelRaw = clean(body.channel, 20).toLowerCase();
    const channel =
      channelRaw === "whatsapp" || channelRaw === "email" ? channelRaw : "unknown";
    const now = new Date().toISOString();
    const nextChoices = {
      ...savedChoices,
      office_paid_notified_at:
        String(savedChoices.office_paid_notified_at || "").trim() || now,
      office_paid_notify_channel: channel,
      office_paid_notify_at: now,
      gc_requires_office_notify: true,
    };

    await admin
      .from("portal_booking_completion_tokens")
      .update({
        choices_json: nextChoices,
        updated_at: now,
      })
      .eq("id", token.id);

    let gocardlessUrl = clean(inv.gocardless_url, 2000) || null;
    if (!gocardlessUrl) {
      const contactId = clean(token.contact_id, 80);
      if (!contactId) {
        return json(400, { ok: false, error: "contact_required" });
      }
      try {
        gocardlessUrl = await mintFinishBookingGocardlessUrl(admin, {
          contactId,
          parentPersonId: clean(token.parent_person_id, 80) || null,
          participantName: String(doc.participant_name || ""),
          invoiceId: String(inv.id),
          invoiceNumber: clean(inv.invoice_number, 40) || null,
          rawToken,
          paymentSchedule: inv.payment_schedule,
        });
      } catch (e) {
        console.warn("[portal-booking-finish] notify_office_paid gc", e);
      }
    }

    if (!gocardlessUrl) {
      return json(502, {
        ok: false,
        error: "gocardless_unavailable",
        message:
          "Thanks — we recorded that you contacted the office. GoCardless setup is not ready yet; try again in a moment or ask the office.",
        office_paid_notified_at: nextChoices.office_paid_notified_at,
        gc_step2_unlocked: true,
      });
    }

    return json(200, {
      ok: true,
      gocardless_url: gocardlessUrl,
      office_paid_notified_at: nextChoices.office_paid_notified_at,
      gc_step2_unlocked: true,
      choices_json: nextChoices,
      status: token.status,
    });
  }

  if (action === "confirm_paid") {
    // No in-app "I've paid" button — parent WhatsApps / emails / Messages the office.
    return json(410, {
      ok: false,
      error: "confirm_paid_disabled",
      message:
        "After you transfer, WhatsApp or email the office that you have paid (photo optional). The office will confirm and then send your Parent Portal PIN.",
    });
  }

  return json(400, { ok: false, error: "unknown_action" });
});
