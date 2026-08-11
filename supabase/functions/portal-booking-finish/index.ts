// portal-booking-finish — public finish-booking after Accept (magic token).
// Actions: load | save_choices | create_invoice | confirm_paid

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  recordInvoiceInstalmentPayment,
  resolvePortalInvoiceOwnerUserId,
} from "../_shared/portal_create_family_invoice.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";
import {
  suggestedTransferReference,
  tideBankDetailsFromEnv,
} from "../_shared/tide_bank_details.ts";
import {
  bookingTermDisplayLabel,
  clientKeyFromName,
  inferBillingTerm,
  inferServiceKey,
  inferUnitPriceGbp,
  loadCompletionByRawToken,
  parseBookingScope,
  parseFundingCode,
  parseNewClientPayPlan,
  quoteNewClientMidTermInvoice,
  quoteNewClientTrialInvoice,
  tryCompleteBookingAfterInvoicePayment,
  type CompletionTokenRow,
} from "../_shared/portal_booking_finish.ts";
import { SESSION_COUNTS } from "../_shared/reenrolment_catalog.ts";
import {
  gocardlessConfigured,
  gocardlessCreateBillingRequest,
  gocardlessCreateBillingRequestFlow,
} from "../_shared/gocardless.ts";

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
        "id, participant_name, participant_dob, parent_name, parent_email, parent_phone, payload_json, status",
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
      .in("status", ["validated", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reservation = data;
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

async function ensureContact(
  admin: ReturnType<typeof createClient>,
  token: CompletionTokenRow,
  doc: Record<string, unknown>,
  fundingLabel: string,
  paymentLabel: string,
): Promise<{ contactId: string; parentPersonId: string } | { error: string }> {
  if (token.contact_id && token.parent_person_id) {
    await admin
      .from("portal_parent_contacts")
      .update({
        funding_label: fundingLabel,
        payment_method_label: paymentLabel,
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", token.contact_id);
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
  const serviceName = clean(reservation?.service_name, 120) || "Aquatic Activity";
  const timeLabel = clean(reservation?.time_label, 80);
  const venue = clean(reservation?.venue, 80);
  const unit = inferUnitPriceGbp({
    serviceName,
    timeLabel,
    activity: clean(reservation?.activity, 80),
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
      };
    }
  }
  const trialQ = quoteNewClientTrialInvoice({
    unitPriceGbp: unit,
    serviceKey,
    serviceLabel: serviceName,
    detail: detailLine,
    day,
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
      bank: tideBankDetailsFromEnv(),
      completed: token.status === "completed",
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
      quote: quotes[plan] || null,
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
      plan = "one_off_bank";
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
      return json(200, {
        ok: true,
        already: true,
        invoice: existing,
        bank: tideBankDetailsFromEnv(),
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
    const paymentLabel =
      scope === "trial_session"
        ? "Trial session · pay now"
        : plan === "gocardless_monthly"
          ? "GoCardless (monthly)"
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
        })
        : quoteNewClientMidTermInvoice({
          term,
          day,
          unitPriceGbp: unit,
          plan,
          serviceKey,
          serviceLabel: serviceName,
          detail: detailLine,
        });
    if ("error" in quote) return json(400, { ok: false, error: quote.error });

    const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
    if (!ownerId) return json(500, { ok: false, error: "invoice_owner_missing" });

    const asOf = new Date().toISOString().slice(0, 10);
    const created = await createPortalFamilyInvoice(admin, {
      contactId: ensured.contactId,
      amountGbp: quote.invoiceTotalGbp,
      dueDateIso: quote.paymentSchedule[0]?.due_date || asOf,
      invoiceDateIso: asOf,
      vatMode: "vat_20",
      lineDescription: quote.lineDescription,
      reference: quote.reference,
      service: serviceName,
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
    });
    if (!created.ok) {
      return json(500, { ok: false, error: created.error || "invoice_failed" });
    }

    const invoiceId = String(created.invoice?.id || "");
    let gocardlessUrl: string | null = null;
    if (plan === "gocardless_monthly" && gocardlessConfigured() && invoiceId) {
      try {
        const firstGbp = Number(quote.paymentSchedule[0]?.amount_gbp) || 0;
        const br = await gocardlessCreateBillingRequest({
          contactId: ensured.contactId,
          parentPersonId: ensured.parentPersonId,
          description: `clubSENsational · ${clean(doc.participant_name, 80)}`,
          paymentAmountPence: firstGbp > 0 ? Math.round(firstGbp * 100) : null,
          paymentDescription: `First instalment · ${clean(created.invoice?.invoice_number, 40) || invoiceId}`,
          invoiceShareId: invoiceId,
          invoiceNumber: clean(created.invoice?.invoice_number, 40) || null,
        });
        if (br.ok) {
          const origin = (
            Deno.env.get("PORTAL_PUBLIC_ORIGIN") ||
            "https://portalvic.vercel.app"
          ).replace(/\/$/, "");
          const flow = await gocardlessCreateBillingRequestFlow({
            billingRequestId: br.data.id,
            redirectUri: `${origin}/parent/finish-booking?t=${encodeURIComponent(rawToken)}&gc=1`,
            exitUri: `${origin}/parent/finish-booking?t=${encodeURIComponent(rawToken)}`,
          });
          if (flow.ok && flow.data.authorisation_url) {
            gocardlessUrl = flow.data.authorisation_url;
            await admin
              .from("portal_parent_invoice_share")
              .update({ gocardless_url: gocardlessUrl, updated_at: new Date().toISOString() })
              .eq("id", invoiceId);
          }
        } else {
          console.warn("[portal-booking-finish] gocardless br", br.error, br.detail);
        }
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
        },
        updated_at: now,
      })
      .eq("id", token.id);

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

    return json(200, {
      ok: true,
      invoice: invOut,
      gocardless_url: gocardlessUrl || invOut?.gocardless_url || null,
      bank,
      transfer_reference: transferRef,
      quote: {
        remaining_sessions: quote.remainingSessions,
        first_due_gbp: quote.paymentSchedule[0]?.amount_gbp ?? null,
        first_due_date: quote.paymentSchedule[0]?.due_date ?? null,
        invoice_total_gbp: quote.invoiceTotalGbp,
      },
      status: "awaiting_payment",
    });
  }

  if (action === "confirm_paid") {
    if (token.status === "completed") {
      return json(200, {
        ok: true,
        completed: true,
        message: "Already completed. Check email / WhatsApp for your PIN.",
      });
    }
    if (!token.invoice_share_id) {
      return json(400, { ok: false, error: "invoice_required" });
    }
    const { data: inv } = await admin
      .from("portal_parent_invoice_share")
      .select("id, payment_status, amount_paid_gbp, payment_schedule, invoice_number")
      .eq("id", token.invoice_share_id)
      .maybeSingle();
    if (!inv) return json(404, { ok: false, error: "invoice_not_found" });

    const schedule = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
    const firstPending = schedule.find(
      (r: { status?: string }) => String(r?.status || "pending").toLowerCase() !== "paid",
    ) as { amount_gbp?: number } | undefined;
    const amount =
      Number(firstPending?.amount_gbp) ||
      Number((schedule[0] as { amount_gbp?: number } | undefined)?.amount_gbp) ||
      0;

    if (amount > 0 && String(inv.payment_status).toLowerCase() !== "paid") {
      const rolled = await recordInvoiceInstalmentPayment(admin, String(inv.id), {
        amountGbp: amount,
        paidVia: "bank_transfer_parent_finish",
      });
      if (!rolled.ok) {
        return json(500, { ok: false, error: rolled.error || "payment_record_failed" });
      }
    }

    await admin
      .from("portal_parent_invoice_share")
      .update({
        parent_reported_paid_at: new Date().toISOString(),
        parent_reported_method: "bank_transfer",
        parent_reported_ref: clean(body.payment_ref, 80) || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", token.invoice_share_id);

    const done = await tryCompleteBookingAfterInvoicePayment(admin, token.invoice_share_id);
    if (!done.completed) {
      return json(500, { ok: false, error: done.reason || "complete_failed" });
    }

    return json(200, {
      ok: true,
      completed: true,
      message:
        "Payment recorded. Check your email / WhatsApp for your Parent Portal PIN.",
    });
  }

  return json(400, { ok: false, error: "unknown_action" });
});
