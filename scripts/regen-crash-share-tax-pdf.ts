/**
 * Rebuild a crash-course portal invoice PDF as the standard TAX INVOICE layout
 * (same template as Admin Create in Portal / Xero-style INV-P).
 *
 * Usage:
 *   npx --yes deno run -A scripts/regen-crash-share-tax-pdf.ts INV-P-CRASH-MRMCPDUG
 *
 * Loads secrets from local-secrets/secrets.env (SUPABASE_URL + SERVICE_ROLE).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildCrashSummerInvoiceDescription,
  CRASH_SUMMER_INVOICE_TERM_REFERENCE,
  crashInvoiceServiceLabel,
  type CrashActivity,
} from "../supabase/functions/_shared/crash_summer_2026.ts";
import { buildPortalTaxInvoicePdf } from "../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = Deno.readTextFileSync(path);
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* optional */
  }
  return out;
}

const rootEnv = {
  ...loadEnv(new URL("../local-secrets/secrets.env", import.meta.url).pathname),
  ...loadEnv(new URL("../database/local-vault/.env", import.meta.url).pathname),
};
const url = Deno.env.get("SUPABASE_URL") || rootEnv.SUPABASE_URL || "";
const service =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || rootEnv.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !service) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const invoiceNumber = String(Deno.args[0] || "").trim();
if (!invoiceNumber) {
  console.error("Pass invoice number, e.g. INV-P-CRASH-MRMCPDUG");
  Deno.exit(1);
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: share, error: shareErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, contact_id, document_id, invoice_number, amount_gbp, due_date, vat_mode, quantity, created_at, payment_status",
  )
  .eq("invoice_number", invoiceNumber)
  .maybeSingle();

if (shareErr || !share) {
  console.error("share not found", shareErr?.message || invoiceNumber);
  Deno.exit(1);
}

const contactId = String(share.contact_id);
const { data: booking } = await admin
  .from("portal_crash_summer_bookings")
  .select("id, week_id, booking_mode, activities, invoice_share_id")
  .eq("invoice_share_id", share.id)
  .maybeSingle();

if (!booking?.id) {
  console.error("No crash booking linked to this invoice share");
  Deno.exit(1);
}

const { data: lines } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("activity, session_date, slot_id, slot_label")
  .eq("booking_id", booking.id);

const activities = (Array.isArray(booking.activities) ? booking.activities : [])
  .filter((a): a is CrashActivity => a === "climbing" || a === "swimming");

const { data: participant } = await admin
  .from("portal_participants")
  .select("display_name, first_name, last_name")
  .eq("contact_id", contactId)
  .maybeSingle();

const displayName =
  String(participant?.display_name || "").trim() ||
  [participant?.first_name, participant?.last_name].filter(Boolean).join(" ").trim() ||
  contactId;

const { data: parentContact } = await admin
  .from("portal_parent_contacts")
  .select(
    "parent_display, parent_first_name, parent_last_name, address_line1, address_line2, city, postcode",
  )
  .eq("contact_id", contactId)
  .maybeSingle();

const billToName =
  String(parentContact?.parent_display || "").trim() ||
  [parentContact?.parent_first_name, parentContact?.parent_last_name]
    .filter(Boolean)
    .join(" ")
    .trim() ||
  "Parent / carer";
const billToLines = [
  parentContact?.address_line1,
  parentContact?.address_line2,
  parentContact?.city,
  parentContact?.postcode,
  "UNITED KINGDOM",
]
  .map((x) => String(x || "").trim())
  .filter(Boolean);

const vatMode = share.vat_mode === "exempt" ? "exempt" : "vat_20";
const weekId = booking.week_id === "w2" ? "w2" : "w1";
const mode = booking.booking_mode === "individual" ? "individual" : "weekly_pack";
const lineDescription = buildCrashSummerInvoiceDescription({
  vatMode,
  weekId,
  mode,
  activities,
  lines: (lines || []).map((l) => ({
    activity: l.activity as CrashActivity,
    session_date: String(l.session_date),
    slot_id: String(l.slot_id),
    slot_label: String(l.slot_label || ""),
  })),
  participantName: displayName,
});

const serviceLabel = crashInvoiceServiceLabel(activities);
const amountGbp = Number(share.amount_gbp);
const dueDate = share.due_date
  ? String(share.due_date).slice(0, 10)
  : new Date().toISOString().slice(0, 10);
const invoiceDate = String(share.created_at || "").slice(0, 10) || dueDate;

const pdfBytes = await buildPortalTaxInvoicePdf({
  invoiceNumber: String(share.invoice_number),
  invoiceDateIso: invoiceDate,
  dueDateIso: dueDate,
  reference: CRASH_SUMMER_INVOICE_TERM_REFERENCE,
  service: serviceLabel,
  vatMode,
  totalGbp: amountGbp,
  quantity: Number(share.quantity) || 1,
  descriptionLines: lineDescription.split("\n"),
  billToName,
  billToLines,
  participantName: displayName,
  paid: String(share.payment_status) === "paid",
});

const { data: doc } = await admin
  .from("documents")
  .select("id, user_id, file_url")
  .eq("id", share.document_id)
  .maybeSingle();

if (!doc?.id || !doc.user_id) {
  console.error("document missing for share");
  Deno.exit(1);
}

const stamp = Date.now();
const storagePath = `${doc.user_id}/billing/client_invoice_${contactId}_${stamp}.pdf`;
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdfBytes, {
  contentType: "application/pdf",
  upsert: false,
});
if (upErr) {
  console.error("upload failed", upErr.message);
  Deno.exit(1);
}

const oldPath = String(doc.file_url || "").trim();
const { error: docUpErr } = await admin
  .from("documents")
  .update({
    file_url: storagePath,
    title: `Invoice ${share.invoice_number} — ${displayName}`,
    source_page: "crash_summer_tax_invoice",
  })
  .eq("id", doc.id);
if (docUpErr) {
  console.error("document update failed", docUpErr.message);
  Deno.exit(1);
}

const now = new Date().toISOString();
const { error: shareUpErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    line_description: lineDescription,
    reference_text: CRASH_SUMMER_INVOICE_TERM_REFERENCE,
    payment_method_hint: "bank_transfer",
    notes: `Summer crash course Jul 2026 · booking ${booking.id} · TAX INVOICE regenerated`,
    updated_at: now,
  })
  .eq("id", share.id);
if (shareUpErr) {
  console.error("share update failed", shareUpErr.message);
  Deno.exit(1);
}

if (oldPath && oldPath !== storagePath) {
  await admin.storage.from("documents").remove([oldPath]).catch(() => null);
}

const { data: signed } = await admin.storage
  .from("documents")
  .createSignedUrl(storagePath, 60 * 60);

console.log(
  JSON.stringify(
    {
      ok: true,
      invoice_number: share.invoice_number,
      share_id: share.id,
      storage_path: storagePath,
      bytes: pdfBytes.length,
      service: serviceLabel,
      reference: CRASH_SUMMER_INVOICE_TERM_REFERENCE,
      signed_url: signed?.signedUrl || null,
      next: "In Admin → Family invoices, open PDF to verify, then Push to Xero if still unsynced.",
    },
    null,
    2,
  ),
);
