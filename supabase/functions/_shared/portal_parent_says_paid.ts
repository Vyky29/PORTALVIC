/**
 * Parent says "I've paid" via WhatsApp / Parent Portal Messages / email-shaped text.
 * No in-app "I've paid" button — office gets email + push, then Mark paid → PIN.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { notifyOfficeBankPaymentReported } from "./portal_booking_lead_office_notify.ts";
import { normalizeParentPhoneE164 } from "./portal_parent_messaging.ts";
import { parentPhoneLast10 } from "./parent_portal_messages.ts";

export function looksLikeParentSaysPaid(text: string): boolean {
  const raw = String(text || "").toLowerCase();
  const t = raw.normalize("NFD").replace(/\p{M}/gu, "");
  const needles = [
    "i've paid",
    "i have paid",
    "ive paid",
    "paid by bank",
    "paid the invoice",
    "paid invoice",
    "paid the first",
    "paid instal",
    "paid install",
    "bank transfer",
    "transferred",
    "just paid",
    "payment made",
    "made the payment",
    "sent the payment",
    "sent payment",
    "he pagado",
    "hemos pagado",
    "ya pague",
    "pago hecho",
    "transferencia hecha",
    "acabo de pagar",
    "ya esta pagado",
    "ya esta el pago",
  ];
  return needles.some((n) => t.includes(n));
}

type SaysPaidOpts = {
  phone?: string | null;
  contactId?: string | null;
  bodyText: string;
  source: "whatsapp" | "parent_app" | "email";
  participantHint?: string | null;
};

/**
 * If the message looks like a payment report, mark the best-matching open invoice
 * as pending_confirmation (when found) and ping office (email + admin push).
 */
export async function handleParentSaysPaidMessage(
  admin: SupabaseClient,
  opts: SaysPaidOpts,
): Promise<{ matched: boolean; invoiceId?: string }> {
  if (!looksLikeParentSaysPaid(opts.bodyText)) {
    return { matched: false };
  }

  const phone = normalizeParentPhoneE164(String(opts.phone || "")) ||
    String(opts.phone || "").trim() ||
    null;
  let contactId = String(opts.contactId || "").trim() || null;

  if (!contactId && phone) {
    contactId = await findContactIdByPhone(admin, phone);
  }

  let invoice: {
    id: string;
    invoice_number: string | null;
    amount_gbp: number | null;
    contact_id: string | null;
    participant_display?: string | null;
  } | null = null;

  if (contactId) {
    invoice = await findOpenInvoiceForContact(admin, contactId);
  }

  const now = new Date().toISOString();
  if (invoice?.id) {
    await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "pending_confirmation",
        parent_reported_paid_at: now,
        parent_reported_method: "bank_transfer",
        parent_reported_notes: `Parent said paid via ${opts.source}`.slice(0, 500),
        updated_at: now,
      })
      .eq("id", invoice.id)
      .in("payment_status", ["unpaid", "partial"]);

    await markFinishBookingAwaitingOffice(admin, invoice.id, now);
  } else if (phone) {
    await markFinishBookingAwaitingOfficeByPhone(admin, phone, now);
  }

  const participant =
    String(opts.participantHint || "").trim() ||
    String(invoice?.participant_display || "").trim() ||
    "Participant";

  try {
    await notifyOfficeBankPaymentReported({
      invoiceShareId: String(invoice?.id || `msg-${Date.now()}`),
      invoiceNumber: invoice?.invoice_number || null,
      participantName: participant,
      parentName: null,
      parentEmail: null,
      amountGbp: Number(invoice?.amount_gbp) || 0,
      isTrial: false,
      paymentRef: phone || opts.source,
      viaParentMessage: true,
    });
  } catch (e) {
    console.warn("[parent-says-paid] office notify failed", e);
  }

  return { matched: true, invoiceId: invoice?.id };
}

async function findContactIdByPhone(
  admin: SupabaseClient,
  phone: string,
): Promise<string | null> {
  const last10 = parentPhoneLast10(phone);
  if (!last10) return null;
  const { data } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, mobile")
    .not("mobile", "is", null)
    .limit(800);
  for (const row of data || []) {
    if (parentPhoneLast10(String(row.mobile || "")) === last10) {
      return String(row.contact_id || "").trim() || null;
    }
  }
  return null;
}

async function findOpenInvoiceForContact(
  admin: SupabaseClient,
  contactId: string,
): Promise<{
  id: string;
  invoice_number: string | null;
  amount_gbp: number | null;
  contact_id: string | null;
  participant_display?: string | null;
} | null> {
  const { data } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, contact_id, participant_display, payment_status, created_at",
    )
    .eq("contact_id", contactId)
    .in("payment_status", ["unpaid", "partial", "pending_confirmation"])
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = data || [];
  const open = rows.find((r) =>
    ["unpaid", "partial"].includes(String(r.payment_status || ""))
  );
  return (open || rows[0] || null) as {
    id: string;
    invoice_number: string | null;
    amount_gbp: number | null;
    contact_id: string | null;
    participant_display?: string | null;
  } | null;
}

async function markFinishBookingAwaitingOffice(
  admin: SupabaseClient,
  invoiceShareId: string,
  now: string,
): Promise<void> {
  await admin
    .from("portal_booking_completion_tokens")
    .update({ status: "awaiting_office_payment", updated_at: now })
    .eq("invoice_share_id", invoiceShareId)
    .in("status", ["awaiting_payment", "choices_saved", "awaiting_office_payment"]);
}

async function markFinishBookingAwaitingOfficeByPhone(
  admin: SupabaseClient,
  phone: string,
  now: string,
): Promise<void> {
  const last10 = parentPhoneLast10(phone);
  if (!last10) return;
  const { data: tokens } = await admin
    .from("portal_booking_completion_tokens")
    .select("id, status, document_id")
    .in("status", ["awaiting_payment", "choices_saved"])
    .order("updated_at", { ascending: false })
    .limit(40);
  for (const tok of tokens || []) {
    const docId = String(tok.document_id || "").trim();
    if (!docId) continue;
    const { data: doc } = await admin
      .from("portal_participant_documents")
      .select("parent_phone")
      .eq("id", docId)
      .maybeSingle();
    if (parentPhoneLast10(String(doc?.parent_phone || "")) !== last10) continue;
    await admin
      .from("portal_booking_completion_tokens")
      .update({ status: "awaiting_office_payment", updated_at: now })
      .eq("id", tok.id);
    break;
  }
}
