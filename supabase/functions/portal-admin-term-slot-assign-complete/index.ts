// @ts-nocheck — Edge Function (Deno).
//
// After office Assign (Edit term slot) places a named participant on an open band:
// ensure an autumn INV-P unpaid share exists so Parent Portal shows the green pay button.
// Does not issue PIN (payment confirmation still required).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../_shared/portal_create_family_invoice.ts";
import {
  parseBookingTermKey,
  parseNewClientPayPlan,
  quoteNewClientMidTermInvoice,
} from "../_shared/booking_portal_term_invoices.ts";
import {
  inferServiceKey,
  inferUnitPriceGbp,
} from "../_shared/portal_booking_finish.ts";
import { normalizeParticipantLookupName } from "../_shared/participant_avatar.ts";
import { loadProductMap } from "../_shared/portal_xero_product_catalog.ts";
import type { PortalInvoiceVatMode } from "../_shared/portal_tax_invoice_pdf.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function inferTermFromAnchor(anchor: string): "autumn" | "spring" | "summer" {
  const iso = clean(anchor, 12).slice(0, 10);
  if (iso >= "2026-09-01" && iso <= "2026-12-31") return "autumn";
  if (iso >= "2027-01-01" && iso <= "2027-04-15") return "spring";
  if (iso >= "2026-04-01" && iso < "2026-09-01") return "summer";
  const parsed = parseBookingTermKey(iso);
  if (parsed) return parsed;
  return "autumn";
}

async function resolveContactIdByName(
  admin: ReturnType<typeof createClient>,
  clientName: string,
): Promise<string | null> {
  const want = normalizeParticipantLookupName(clientName);
  if (!want) return null;
  const { data: parts } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name");
  const matches = (parts || []).filter((p) => {
    const dn =
      normalizeParticipantLookupName(String(p.display_name || "")) ||
      normalizeParticipantLookupName(
        [p.first_name, p.last_name].filter(Boolean).join(" "),
      );
    return dn === want;
  });
  if (matches.length === 1) return String(matches[0].contact_id);
  if (matches.length > 1) {
    // Prefer exact display_name length match; still ambiguous → null
    return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const clientName = clean(body.client_name || body.participant_name, 120);
  const day = clean(body.day || body.weekday, 40);
  const timeSlot = clean(body.time_slot || body.time_label, 80);
  const venue = clean(body.venue, 80);
  const instructors = clean(body.instructors, 120);
  const service = clean(body.service || body.service_label, 120);
  const anchorDate =
    clean(body.anchor_date || body.as_of || body.start_date, 12).slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const payPlan =
    parseNewClientPayPlan(body.pay_plan || body.payment_schedule_code) ||
    "flexi_bank";

  if (!clientName) {
    return portalAdminJson(400, { ok: false, error: "client_name_required" });
  }
  if (!day) {
    return portalAdminJson(400, { ok: false, error: "day_required" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const contactId =
    clean(body.contact_id, 120) ||
    (await resolveContactIdByName(admin, clientName));
  if (!contactId) {
    return portalAdminJson(404, {
      ok: false,
      error: "participant_not_found",
      hint: "Match portal_participants.display_name to the Assign name",
    });
  }

  const term =
    parseBookingTermKey(body.billing_term || body.term) ||
    inferTermFromAnchor(anchorDate);

  // Reuse existing unpaid autumn INV-P for this contact when already mounted.
  const { data: existingRows } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, payment_status, share_status, billing_term, service, notes, line_description, amount_gbp, created_at",
    )
    .eq("contact_id", contactId)
    .in("payment_status", [
      "unpaid",
      "partial",
      "pending_confirmation",
      "awaiting_office_payment",
    ])
    .order("created_at", { ascending: false })
    .limit(20);

  const existing = (existingRows || []).find((row) => {
    const invNo = String(row.invoice_number || "").toUpperCase();
    // Never treat summer crash / one-off packs as the Autumn Assign invoice.
    if (invNo.includes("CRASH")) return false;
    const blob = `${row.notes || ""} ${row.service || ""} ${row.line_description || ""}`.toLowerCase();
    if (/\bcrash\b/.test(blob)) return false;

    const bt = String(row.billing_term || "").toLowerCase();
    if (bt && bt !== term) return false;
    const st = String(row.payment_status || "").toLowerCase();
    if (st === "paid" || st === "void") return false;
    if (!bt) {
      // Require a normal INV-P-#### share for this term; do not reuse unlabeled packs.
      if (!/^INV-P-\d{3,}$/i.test(invNo)) return false;
      if (term === "autumn") {
        if (service && blob && !blob.includes(service.toLowerCase().slice(0, 8))) {
          return false;
        }
      }
    }
    return true;
  });

  if (existing) {
    return portalAdminJson(200, {
      ok: true,
      skipped: "existing",
      invoice_id: existing.id,
      invoice_number: existing.invoice_number,
      payment_status: existing.payment_status,
      contact_id: contactId,
    });
  }

  const unit =
    Number(body.unit_price_gbp) > 0
      ? Number(body.unit_price_gbp)
      : inferUnitPriceGbp({
          serviceName: service,
          timeLabel: timeSlot,
          venue,
        });
  const serviceKey =
    clean(body.service_key, 40) || inferServiceKey(service, timeSlot);
  const detailLine = [day, timeSlot, venue, instructors].filter(Boolean).join(" · ");

  let productMap = null;
  try {
    productMap = await loadProductMap(admin);
  } catch {
    productMap = null;
  }

  const quote = quoteNewClientMidTermInvoice({
    term,
    day,
    unitPriceGbp: unit,
    plan: payPlan,
    asOfIso: anchorDate,
    serviceKey,
    serviceLabel: service || "Activity",
    detail: detailLine,
    vatMode: "vat_20",
    productMap,
  });
  if ("error" in quote) {
    return portalAdminJson(400, { ok: false, error: quote.error });
  }

  const ownerId =
    verified.userId || (await resolvePortalInvoiceOwnerUserId(admin));
  if (!ownerId) {
    return portalAdminJson(500, { ok: false, error: "no_invoice_owner" });
  }

  const vatMode: PortalInvoiceVatMode = "vat_20";
  const created = await createPortalFamilyInvoice(admin, {
    contactId,
    amountGbp: quote.invoiceTotalGbp,
    dueDateIso: quote.paymentSchedule[0]?.due_date || anchorDate,
    invoiceDateIso: anchorDate,
    vatMode,
    lineDescription: quote.lineDescription,
    reference: quote.reference,
    service: service || null,
    notes:
      `Office Assign · Edit term slot · ${detailLine} · ${payPlan} · ${quote.remainingSessions} session(s) from ${anchorDate}`,
    title: `Invoice — ${clientName} · ${term}`,
    quantity: quote.remainingSessions,
    shareStatus: "ready",
    paymentMethodHint: quote.paymentMethodHint,
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy: "office_term_slot_assign",
    clientIdLabel: contactId,
    paymentSchedule: quote.paymentSchedule,
    billingTerm: quote.term,
    lineItems: quote.lineItems,
    descriptionComplete: false,
  });

  if (!created.ok) {
    return portalAdminJson(500, { ok: false, error: created.error });
  }

  return portalAdminJson(200, {
    ok: true,
    created: true,
    invoice_id: created.invoice?.id,
    invoice_number: created.invoiceNumber,
    payment_status: "unpaid",
    contact_id: contactId,
    quote: {
      remaining_sessions: quote.remainingSessions,
      invoice_total_gbp: quote.invoiceTotalGbp,
      term: quote.term,
      plan: payPlan,
    },
  });
});
