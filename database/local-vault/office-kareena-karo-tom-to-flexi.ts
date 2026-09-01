/**
 * Office: Kareena, Karo, Tom — switch yearly_1off → term_flexi.
 * Void unpaid year invoices; update reenrol payload; create Autumn flexi INV-P
 * (£700 = 14×£50, halves £350 on 15 Aug + £350 on 26 Oct).
 *
 * Dry:  npx -y deno run --allow-env --allow-read --allow-net \
 *         database/local-vault/office-kareena-karo-tom-to-flexi.ts
 * Apply: APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *         database/local-vault/office-kareena-karo-tom-to-flexi.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DUE1 = "2026-08-15";
const DUE2 = "2026-10-26";
const READY_BY = "office_kareena_karo_tom_to_flexi_20260812";
const AUTUMN = 700;
const HALF = 350;

type Target = {
  contactId: string;
  name: string;
  voidInvoice: string;
};

const TARGETS: Target[] = [
  { contactId: "290", name: "Kareena Al hassani", voidInvoice: "INV-P-0134" },
  { contactId: "gap-karo-alhassani", name: "Karo", voidInvoice: "INV-P-0135" },
  { contactId: "89", name: "Thomas (Tom) Eriksson", voidInvoice: "INV-P-0130" },
];

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function patchPayloadToFlexi(payload: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(payload) as Record<string, unknown>;
  const funding = (next.funding && typeof next.funding === "object"
    ? next.funding
    : {}) as Record<string, unknown>;
  const choices = (funding.choices_2627 && typeof funding.choices_2627 === "object"
    ? funding.choices_2627
    : {}) as Record<string, unknown>;
  choices.payment_schedule_code = "term_flexi";
  choices.payment_schedule_label = "Per term — two instalments (flexi)";
  choices.billing_schedule = "term_flexi";
  funding.choices_2627 = choices;
  next.funding = funding;
  const note = String(next.office_note || "");
  next.office_note =
    `${note} · ${new Date().toISOString().slice(0, 10)}: switched yearly_1off → term_flexi (office); Autumn invoice regenerated.`.trim();
  return next;
}

const productMap = await loadProductMap(admin);
const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const report: Array<Record<string, unknown>> = [];

for (const t of TARGETS) {
  console.log(`\n=== ${t.name} (${t.contactId}) ===`);

  const { data: inv, error: invErr } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, payment_status, payment_schedule, billing_term, xero_invoice_id, notes, created_via",
    )
    .eq("invoice_number", t.voidInvoice)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!inv) throw new Error(`Missing invoice ${t.voidInvoice}`);
  if (String(inv.payment_status).toLowerCase() === "paid") {
    throw new Error(`Refusing to void paid ${t.voidInvoice}`);
  }

  const { data: sub, error: subErr } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, payload, submitted_at")
    .eq("participant_contact_id", t.contactId)
    .eq("academic_year", REENROL_ACADEMIC_YEAR)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) throw subErr;
  if (!sub) throw new Error(`No reenrol submission for ${t.name}`);

  const payload = (sub.payload && typeof sub.payload === "object"
    ? sub.payload
    : {}) as Record<string, unknown>;
  const slots = Array.isArray(payload.weekly_slots_snapshot)
    ? payload.weekly_slots_snapshot
    : [];
  const weeklyChoicesRaw = (payload.choices && typeof payload.choices === "object"
    ? (payload.choices as Record<string, unknown>).weekly
    : null) as Record<string, { choice: string; alternative: null }> | null;
  const weeklyChoices: Record<string, { choice: string; alternative: null }> =
    weeklyChoicesRaw || {};
  if (!Object.keys(weeklyChoices).length) {
    for (const s of slots as Array<{ id?: string }>) {
      if (s?.id) weeklyChoices[s.id] = { choice: "keep", alternative: null };
    }
  }

  const autumnLines = buildReenrolTermLineItems({
    slots: slots as never,
    weeklyChoices,
    term: "autumn",
    vatMode: "vat_20",
    productMap,
  });
  const lineSum = round2(autumnLines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
  const amount = lineSum > 0 ? lineSum : AUTUMN;
  const half1 = round2(amount / 2);
  const half2 = round2(amount - half1);
  const description = lineItemsToDescription(autumnLines, { fundedProvision: false });
  const patched = patchPayloadToFlexi(payload);

  console.log("  void", t.voidInvoice, `£${inv.amount_gbp}`, inv.payment_status, "xero=", inv.xero_invoice_id || "—");
  console.log("  autumn lines £", lineSum || AUTUMN, "→ flexi", half1, "+", half2);
  console.log("  desc:", description.slice(0, 120));

  report.push({
    name: t.name,
    contactId: t.contactId,
    void: t.voidInvoice,
    autumnAmount: amount,
    half1,
    half2,
    dry: !APPLY,
  });

  if (!APPLY) continue;

  const now = new Date().toISOString();
  const voidNote =
    `Voided ${now.slice(0, 10)} — office switch yearly_1off → term_flexi; replaced by Autumn flexi invoice.`;
  if (String(inv.payment_status).toLowerCase() !== "void") {
    const { error: voidErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        notes: `${String(inv.notes || "").trim()} · ${voidNote}`.trim(),
        updated_at: now,
      })
      .eq("id", inv.id);
    if (voidErr) throw voidErr;
    console.log("  voided", t.voidInvoice);
  }

  const { error: patchErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload: patched })
    .eq("id", sub.id);
  if (patchErr) throw patchErr;
  console.log("  submission patched → term_flexi");

  const created = await createPortalFamilyInvoice(admin, {
    contactId: t.contactId,
    amountGbp: amount,
    dueDateIso: DUE1,
    vatMode: "vat_20",
    lineDescription: description || `Autumn term 26/27 · ${t.name}`,
    reference: "Autumn term 26/27",
    notes:
      "Office re-enrolment · switched from yearly 1-off to term flexi (bank). Autumn · 2 instalments.",
    title: `Invoice — ${t.name} · Autumn term 26/27`,
    shareStatus: "ready",
    paymentMethodHint: "bank_transfer",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: READY_BY,
    billingTerm: "autumn",
    paymentSchedule: [
      {
        seq: 1,
        label: "Autumn term · 1st half",
        due_date: DUE1,
        amount_gbp: half1,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
      {
        seq: 2,
        label: "Autumn term · 2nd half",
        due_date: DUE2,
        amount_gbp: half2,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems: autumnLines,
  });
  if (!created.ok) throw new Error(`${t.name} invoice: ${created.error}`);
  const shareId = String(created.invoice?.id || "");
  console.log("  new invoice", created.invoiceNumber, `£${amount}`, shareId);

  try {
    await xeroHydrateRefreshFromDb(admin);
    const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
    console.log("  Xero", JSON.stringify(pushed));
    await xeroPersistRefreshToDb(admin);
  } catch (e) {
    console.warn("  Xero push skipped/failed:", e instanceof Error ? e.message : e);
  }

  report[report.length - 1] = {
    ...report[report.length - 1],
    dry: false,
    newInvoice: created.invoiceNumber,
    shareId,
  };
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(report, null, 2));
if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write.");
}
