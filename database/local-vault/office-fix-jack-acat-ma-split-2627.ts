/**
 * Jack Stratton: void ACAT autumn INV-P (keep MA paid INV-P-0115 only).
 * Jack Walker: split paid INV-P-0342 (£2260) → MA £1560 on same INV-P + new ACAT
 * £700 paid (for Xero credit note / refund). Void old combined Xero ACCREC first.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-fix-jack-acat-ma-split-2627.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-fix-jack-acat-ma-split-2627.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import type { ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import { xeroConfigured, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const XERO_API = "https://api.xero.com/api.xro/2.0";

const JACK_S = {
  contactId: "170",
  name: "Jack Stratton",
  multiInv: "INV-P-0115",
  acatInv: "INV-P-0445",
  acatMarker: "office_jack_stratton_autumn_acat_2627",
};
const JACK_W = {
  contactId: "gap-jack-walker",
  name: "Jack Walker",
  combinedInv: "INV-P-0342",
  acatMarker: "office_jack_walker_autumn_acat_2627_refund",
  maAmount: 1560,
  acatAmount: 700,
};

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");
loadEnvFile("database/local-vault/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function voidXeroInvoice(xeroInvoiceId: string): Promise<{ ok: boolean; detail?: string }> {
  if (!xeroConfigured()) return { ok: false, detail: "xero_not_configured" };
  const token = await xeroAccessToken();
  if (!token) return { ok: false, detail: "xero_auth_failed" };
  const res = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(xeroInvoiceId)}`, {
    method: "POST",
    headers: xeroAuthHeaders(token),
    body: JSON.stringify({ InvoiceID: xeroInvoiceId, Status: "VOIDED" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = JSON.stringify(json?.Elements?.[0]?.ValidationErrors || json).slice(0, 400);
    return { ok: false, detail: `${res.status} ${msg}` };
  }
  return { ok: true };
}

async function clearXeroLink(shareId: string, note: string) {
  await admin
    .from("portal_parent_invoice_share")
    .update({
      xero_invoice_id: null,
      xero_payment_id: null,
      xero_push_status: null,
      xero_push_error: note.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shareId);
}

function recalcTermTotals(slots: ParsedSlot[], weeklyChoices: Record<string, { choice?: string }>) {
  const totals = { autumn: 0, spring: 0, summer: 0, annual: 0 };
  for (const slot of slots || []) {
    if (!slot || slot.isDayCentre) continue;
    const id = String(slot.id || "");
    const choice = id && weeklyChoices[id]
      ? String(weeklyChoices[id].choice || "keep").toLowerCase()
      : "keep";
    if (choice === "withdraw") continue;
    totals.autumn = round2(totals.autumn + Number(slot.termTotals?.autumn || 0));
    totals.spring = round2(totals.spring + Number(slot.termTotals?.spring || 0));
    totals.summer = round2(totals.summer + Number(slot.termTotals?.summer || 0));
    totals.annual = round2(totals.annual + Number(slot.termTotals?.annual || 0));
  }
  return totals;
}

async function withdrawAcatFromSubmission(contactId: string, label: string) {
  const { data: subs, error } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, payload")
    .eq("participant_contact_id", contactId)
    .order("submitted_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`${label} submission: ${error.message}`);
  const row = subs?.[0];
  if (!row?.id) {
    console.log(`${label}: no re-enrol submission — skip payload update`);
    return;
  }
  const payload = structuredClone(row.payload || {}) as Record<string, unknown>;
  const choices = (payload.choices && typeof payload.choices === "object")
    ? (payload.choices as Record<string, unknown>)
    : {};
  const weekly = (choices.weekly && typeof choices.weekly === "object")
    ? (choices.weekly as Record<string, { choice?: string; alternative?: unknown }>)
    : {};
  weekly["pub-0"] = { choice: "withdraw", alternative: null };
  choices.weekly = weekly;
  payload.choices = choices;
  const slots = Array.isArray(payload.weekly_slots_snapshot)
    ? (payload.weekly_slots_snapshot as ParsedSlot[])
    : [];
  payload.term_totals = recalcTermTotals(slots, weekly);
  payload.office_note =
    `${clean(payload.office_note, 200)} · Office 27 Aug 2026: ACAT Mon aquatic withdrawn — Multi-Activity only.`.trim();
  console.log(`${label} submission term_totals →`, payload.term_totals);
  if (!APPLY) return;
  const { error: upErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", row.id);
  if (upErr) throw new Error(`${label} submission update: ${upErr.message}`);
  console.log(`${label}: submission updated (${row.id})`);
}

async function voidPortalInvoice(where: {
  invoice_number?: string;
  ready_by?: string;
  contact_id: string;
}, reason: string) {
  let q = admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, payment_status, amount_gbp, xero_invoice_id")
    .eq("contact_id", where.contact_id)
    .neq("payment_status", "void");
  if (where.invoice_number) q = q.eq("invoice_number", where.invoice_number);
  if (where.ready_by) q = q.eq("ready_by", where.ready_by);
  const { data: row, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.id) {
    console.log(`No live invoice to void (${reason})`);
    return null;
  }
  console.log(`Void ${row.invoice_number} £${row.amount_gbp} (${row.payment_status}) — ${reason}`);
  if (!APPLY) return row;
  if (row.xero_invoice_id && xeroConfigured()) {
    await xeroHydrateRefreshFromDb(admin);
    const voided = await voidXeroInvoice(String(row.xero_invoice_id));
    await xeroPersistRefreshToDb(admin);
    console.log(`  Xero void ${row.xero_invoice_id}:`, voided.ok ? "ok" : voided.detail);
  }
  await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "void",
      updated_at: new Date().toISOString(),
      notes: clean(
        `Voided 2026-08-27 — ${reason}`,
        800,
      ),
    })
    .eq("id", row.id);
  return row;
}

// --- Jack Stratton: drop ACAT invoice ---
console.log("\n=== Jack Stratton ===");
const { data: jackSMa } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, amount_gbp, amount_paid_gbp, line_items")
  .eq("invoice_number", JACK_S.multiInv)
  .eq("contact_id", JACK_S.contactId)
  .maybeSingle();
if (!jackSMa?.id) throw new Error(`${JACK_S.multiInv} not found`);
const maLines = (Array.isArray(jackSMa.line_items) ? jackSMa.line_items : []) as PortalInvoiceLineItem[];
console.log(
  `${JACK_S.multiInv}: ${jackSMa.payment_status} £${jackSMa.amount_gbp} paid £${jackSMa.amount_paid_gbp}`,
  maLines.map((l) => l.description).join(" | "),
);
if (Number(jackSMa.amount_gbp) !== 1560) {
  console.warn("WARN: expected MA invoice £1560");
}

await voidPortalInvoice(
  { contact_id: JACK_S.contactId, invoice_number: JACK_S.acatInv },
  "Jack Stratton ACAT removed — MA only (INV-P-0115)",
);
await voidPortalInvoice(
  { contact_id: JACK_S.contactId, ready_by: JACK_S.acatMarker },
  "Jack Stratton ACAT sibling by marker",
);
await withdrawAcatFromSubmission(JACK_S.contactId, JACK_S.name);

if (APPLY && jackSMa.id) {
  const note =
    "Office 2026-08-27: Multi-Activity Autumn £1560 only. ACAT Mon aquatic withdrawn — no separate ACAT invoice.";
  await admin.from("portal_parent_invoice_share").update({
    notes: note,
    updated_at: new Date().toISOString(),
  }).eq("id", jackSMa.id);
}

// --- Jack Walker: split combined paid invoice ---
console.log("\n=== Jack Walker ===");
const { data: combined, error: combErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, line_items, line_description, reference_text, due_date, vat_mode, xero_invoice_id, notes, payment_method_hint, share_status, billing_term, created_via",
  )
  .eq("invoice_number", JACK_W.combinedInv)
  .eq("contact_id", JACK_W.contactId)
  .maybeSingle();
if (combErr || !combined?.id) throw new Error(combErr?.message || `${JACK_W.combinedInv} missing`);

const allLines = (Array.isArray(combined.line_items) ? combined.line_items : []) as PortalInvoiceLineItem[];
const acatLine = allLines.find((l) => /aquatic/i.test(`${l.description} ${l.service_key}`));
const maLine = allLines.find((l) => /multi/i.test(`${l.description} ${l.service_key}`));
if (!acatLine || !maLine) throw new Error("INV-P-0342 missing ACAT or MA line");
const acatAmt = round2(Number(acatLine.amount_gbp || 0));
const maAmt = round2(Number(maLine.amount_gbp || 0));
console.log(
  `${JACK_W.combinedInv}: paid £${combined.amount_paid_gbp} — ACAT £${acatAmt} + MA £${maAmt}`,
);

const oldSchedule = Array.isArray(combined.payment_schedule)
  ? combined.payment_schedule as Array<Record<string, unknown>>
  : [];
const paidAt = String(oldSchedule[0]?.paid_at || new Date().toISOString());
const paidVia = String(oldSchedule[0]?.paid_via || "admin");
const maDescription = lineItemsToDescription([maLine], { fundedProvision: true });
const acatDescription = lineItemsToDescription([acatLine], { fundedProvision: true });
const maQty = Number(maLine.quantity) || 1;

console.log("Plan:");
console.log(`  ${JACK_W.combinedInv} → MA only £${maAmt} paid`);
console.log(`  NEW INV-P → ACAT only £${acatAmt} paid (credit note / refund)`);
console.log(`  Xero void ${combined.xero_invoice_id || "—"} then re-push MA + push ACAT`);

await withdrawAcatFromSubmission(JACK_W.contactId, JACK_W.name);

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
  Deno.exit(0);
}

// Void combined invoice in Xero before reshaping same INV-P number.
if (combined.xero_invoice_id && xeroConfigured()) {
  await xeroHydrateRefreshFromDb(admin);
  const voided = await voidXeroInvoice(String(combined.xero_invoice_id));
  await xeroPersistRefreshToDb(admin);
  if (!voided.ok) {
    console.warn("Xero void combined failed — clear link manually if needed:", voided.detail);
  } else {
    console.log("Xero voided combined", combined.xero_invoice_id);
  }
}
await clearXeroLink(String(combined.id), "repush_ma_only_after_acat_split");

const { error: maUpErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: maAmt,
    amount_paid_gbp: maAmt,
    unit_price_gbp: maLine.unit_price_gbp ?? round2(maAmt / maQty),
    quantity: maQty,
    line_items: [maLine],
    line_description: maDescription,
    payment_status: "paid",
    payment_schedule: [{
      seq: 1,
      label: "Multi-Activity · Autumn 26/27",
      due_date: String(combined.due_date || "2026-08-15").slice(0, 10),
      amount_gbp: maAmt,
      status: "paid",
      paid_at: paidAt,
      paid_via: paidVia,
    }],
    notes: clean(
      `${String(combined.notes || "").trim()}\nOffice 2026-08-27: ACAT split to separate INV-P for credit note. This invoice is Multi-Activity Autumn £${maAmt} only (was combined £${combined.amount_gbp}).`,
      800,
    ),
    updated_at: new Date().toISOString(),
  })
  .eq("id", combined.id);
if (maUpErr) throw new Error(`MA update: ${maUpErr.message}`);

const maPdf = await regeneratePortalInvoiceSharePdf(admin, String(combined.id));
if (!maPdf.ok) throw new Error(`MA PDF: ${maPdf.error}`);
console.log(`${JACK_W.combinedInv} → MA £${maAmt} + PDF ok`);

await xeroHydrateRefreshFromDb(admin);
const maXero = await pushPortalInvoiceShareToXero(admin, String(combined.id));
await xeroPersistRefreshToDb(admin);
console.log("MA Xero push:", maXero);

// New ACAT-only paid invoice for credit note.
const { data: existingAcat } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status")
  .eq("contact_id", JACK_W.contactId)
  .eq("ready_by", JACK_W.acatMarker)
  .neq("payment_status", "void")
  .maybeSingle();

let acatShareId = existingAcat?.id ? String(existingAcat.id) : "";
let acatInvNo = existingAcat?.invoice_number ? String(existingAcat.invoice_number) : "";

if (!acatShareId) {
  const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
  if (!ownerId) throw new Error("no invoice owner");
  const created = await createPortalFamilyInvoice(admin, {
    contactId: JACK_W.contactId,
    amountGbp: acatAmt,
    dueDateIso: String(combined.due_date || "2026-08-15").slice(0, 10),
    invoiceDateIso: "2026-08-14",
    vatMode: (String(combined.vat_mode || "exempt") as "exempt"),
    lineDescription: acatDescription,
    reference: "Autumn term 26/27 · ACAT Monday aquatic (refund)",
    notes:
      "Office 2026-08-27: ACAT Mon aquatic only — split from INV-P-0342 for Xero credit note / refund (participant not continuing ACAT). Marked paid (was part of original £2260 bank payment).",
    title: `Invoice — Jack Walker · ACAT Autumn aquatic 26/27 (refund)`,
    shareStatus: "ready",
    paymentMethodHint: String(combined.payment_method_hint || "bank_transfer"),
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: JACK_W.acatMarker,
    billingTerm: "autumn",
    paymentSchedule: [{
      seq: 1,
      label: "ACAT Monday aquatic · Autumn 26/27",
      due_date: String(combined.due_date || "2026-08-15").slice(0, 10),
      amount_gbp: acatAmt,
      status: "paid",
      paid_at: paidAt,
      paid_via: paidVia,
    }],
    lineItems: [acatLine],
  });
  if (!created.ok) throw new Error(String(created.error));
  acatShareId = String((created.invoice as Record<string, unknown>).id || "");
  acatInvNo = String(created.invoiceNumber || "");
  console.log("CREATED ACAT", acatInvNo, `£${acatAmt}`);
}

if (acatShareId) {
  await admin.from("portal_parent_invoice_share").update({
    amount_gbp: acatAmt,
    amount_paid_gbp: acatAmt,
    payment_status: "paid",
    payment_schedule: [{
      seq: 1,
      label: "ACAT Monday aquatic · Autumn 26/27",
      due_date: String(combined.due_date || "2026-08-15").slice(0, 10),
      amount_gbp: acatAmt,
      status: "paid",
      paid_at: paidAt,
      paid_via: paidVia,
    }],
    line_items: [acatLine],
    line_description: acatDescription,
    updated_at: new Date().toISOString(),
  }).eq("id", acatShareId);

  const acatPdf = await regeneratePortalInvoiceSharePdf(admin, acatShareId, {
    invoiceDateIso: "2026-08-14",
  });
  if (!acatPdf.ok) throw new Error(`ACAT PDF: ${acatPdf.error}`);

  await xeroHydrateRefreshFromDb(admin);
  const acatXero = await pushPortalInvoiceShareToXero(admin, acatShareId);
  await xeroPersistRefreshToDb(admin);
  console.log("ACAT Xero push:", acatXero);
}

console.log("\nDone.");
console.log(`Jack Stratton: ${JACK_S.multiInv} MA only · ACAT voided`);
console.log(`Jack Walker: ${JACK_W.combinedInv} MA £${maAmt} · ${acatInvNo || "ACAT"} £${acatAmt} paid for credit note`);
console.log("In Xero: void/delete old combined if still visible; credit note against new ACAT invoice.");
