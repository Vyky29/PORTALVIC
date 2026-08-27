/**
 * Linda summer INV-P-0357: monthly was 3 (Apr–Jun); should be 4 (Apr–Jul) = 11/year.
 * Cancel existing summer GC PMs, rewrite schedule to 4× £164, add July tracker, recreate PMs.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-linda-fix-summer-11th-month.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  gocardlessChargeDate,
  gocardlessCreatePayment,
  gocardlessRequest,
  gocardlessConfigured,
} from "../../supabase/functions/_shared/gocardless.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "338";
const MANDATE_ID = "MD0040WYTJ3CXM";
const KEEPER = "INV-P-0357";
const TRACKERS = ["INV-P-0358", "INV-P-0359"];
const MARKER_PREFIX = "Consolidated payment tracker:";
const READY_BY = "office_linda_summer_11th_20260814";

const MONTHS = [
  { label: "Payment · April 2027", due_date: "2027-04-01", amount_gbp: 164 },
  { label: "Payment · May 2027", due_date: "2027-05-01", amount_gbp: 164 },
  { label: "Payment · June 2027", due_date: "2027-06-01", amount_gbp: 164 },
  { label: "Payment · July 2027", due_date: "2027-07-01", amount_gbp: 164 },
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
loadEnv("local-secrets/edge-secrets.env");

function appendMarker(notes: unknown, targetId: string): string {
  const clean = String(notes || "")
    .replace(
      new RegExp(
        `\\n?${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[0-9a-f-]+`,
        "ig",
      ),
      "",
    )
    .trim();
  return [clean, `${MARKER_PREFIX} ${targetId}`].filter(Boolean).join("\n\n").slice(0, 800);
}

async function cancelPm(paymentId: string) {
  return gocardlessRequest(
    "POST",
    `/payments/${encodeURIComponent(paymentId)}/actions/cancel`,
    {},
    `cancel-${paymentId}`,
  );
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const nos = [KEEPER, ...TRACKERS];
const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, due_date, gocardless_payment_id, notes, share_status, payment_status",
  )
  .eq("contact_id", CONTACT_ID)
  .in("invoice_number", nos);
if (error) throw error;
const byNo = new Map((shares || []).map((r) => [String(r.invoice_number), r]));
const keeper = byNo.get(KEEPER);
if (!keeper) throw new Error(`missing ${KEEPER}`);

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("Linda summer → 4 months Apr–Jul @ £164 (programme £650 + 4×£1.50 = £656)");
for (const n of nos) {
  const r = byNo.get(n);
  console.log(
    `  ${n} £${r?.amount_gbp} ${r?.due_date} ${r?.share_status} PM=${r?.gocardless_payment_id || "—"}`,
  );
}

if (!APPLY) {
  console.log("\nRe-run with APPLY=1");
  Deno.exit(0);
}
if (!gocardlessConfigured()) throw new Error("GOCARDLESS_ACCESS_TOKEN missing");

const report: Record<string, unknown> = { cancelled: [], created_pms: [], july_tracker: null };

/* 1) Cancel existing summer PMs */
for (const n of nos) {
  const r = byNo.get(n);
  const pmid = r?.gocardless_payment_id;
  if (!pmid) continue;
  const can = await cancelPm(String(pmid));
  report.cancelled = [
    ...(report.cancelled as unknown[]),
    { inv: n, pm: pmid, ok: can.ok, err: can.ok ? null : can.error, detail: can.detail },
  ];
  console.log(can.ok ? "CANCELLED" : "CANCEL FAIL", n, pmid, can.ok ? "" : can.detail);
  await admin
    .from("portal_parent_invoice_share")
    .update({ gocardless_payment_id: null, updated_at: new Date().toISOString() })
    .eq("id", r!.id);
}

/* 2) Update keeper schedule + amount */
const schedule = MONTHS.map((m, i) => ({
  seq: i + 1,
  label: m.label,
  due_date: m.due_date,
  amount_gbp: m.amount_gbp,
  status: "pending" as const,
  paid_at: null as string | null,
  paid_via: null as string | null,
}));
const termAmount = 656;
const { error: kErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: termAmount,
    unit_price_gbp: termAmount,
    amount_paid_gbp: 0,
    payment_status: "unpaid",
    due_date: MONTHS[0].due_date,
    next_instalment_due: MONTHS[0].due_date,
    payment_schedule: schedule,
    notes: appendMarker(
      "Office 14 Aug 2026 · Linda summer monthly fixed to 4 instalments (incl July) · 11/year",
      keeper.id,
    ),
    updated_at: new Date().toISOString(),
  })
  .eq("id", keeper.id);
if (kErr) throw kErr;

/* 3) Update existing May/Jun trackers to £164 */
for (let i = 0; i < TRACKERS.length; i++) {
  const n = TRACKERS[i];
  const m = MONTHS[i + 1];
  const r = byNo.get(n)!;
  const { error: tErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: m.amount_gbp,
      unit_price_gbp: m.amount_gbp,
      due_date: m.due_date,
      payment_schedule: [
        {
          seq: 1,
          label: m.label,
          due_date: m.due_date,
          amount_gbp: m.amount_gbp,
          status: "pending",
        },
      ],
      reference_text: `Summer term · ${m.label}`,
      notes: appendMarker(r.notes, keeper.id),
      share_status: "hidden",
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
  if (tErr) throw tErr;
  console.log("TRACKER UPDATED", n, m.label, `£${m.amount_gbp}`);
}

/* 4) Create July tracker */
const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");
const july = MONTHS[3];
const julyInv = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: july.amount_gbp,
  dueDateIso: july.due_date,
  vatMode: "vat_20",
  lineDescription: `Summer term · ${july.label} · GC tracker`,
  reference: `Summer term · ${july.label}`,
  notes: appendMarker(
    `Office 14 Aug 2026 · Linda GC July tracker · mandate ${MANDATE_ID}`,
    keeper.id,
  ),
  title: `Tracker — Linda Kaheh · ${july.label}`,
  shareStatus: "hidden",
  paymentMethodHint: "gocardless",
  createdVia: "reenrolment",
  ownerUserId: ownerId,
  readyBy: READY_BY,
  paymentSchedule: [
    {
      seq: 1,
      label: july.label,
      due_date: july.due_date,
      amount_gbp: july.amount_gbp,
      status: "pending",
    },
  ],
  billingTerm: "summer",
  lineItems: [],
});
if (!julyInv.ok) throw new Error(`july tracker: ${julyInv.error}`);
const julyId = String(julyInv.invoice?.id || "");
const julyNo = String(julyInv.invoiceNumber || "");
report.july_tracker = { id: julyId, invoice_number: julyNo };
console.log("JULY TRACKER", julyNo, `£${july.amount_gbp}`);

/* 5) Recreate 4 GC payments: keeper Apr + trackers May/Jun/Jul */
const payRows = [
  { id: keeper.id, invoice_number: KEEPER, ...MONTHS[0] },
  { id: byNo.get(TRACKERS[0])!.id, invoice_number: TRACKERS[0], ...MONTHS[1] },
  { id: byNo.get(TRACKERS[1])!.id, invoice_number: TRACKERS[1], ...MONTHS[2] },
  { id: julyId, invoice_number: julyNo, ...MONTHS[3] },
];
for (const row of payRows) {
  const pay = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence: Math.round(row.amount_gbp * 100),
    description: `clubSENsational ${row.invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(row.due_date),
    invoiceShareId: row.id,
    contactId: CONTACT_ID,
    invoiceNumber: row.invoice_number,
    idempotencyKey: `linda-summer11-${row.id}`,
  });
  if (!pay.ok) {
    console.error("GC FAIL", row.invoice_number, pay.error, pay.detail);
    (report.created_pms as unknown[]).push({ inv: row.invoice_number, ok: false, error: pay.error });
    continue;
  }
  await admin
    .from("portal_parent_invoice_share")
    .update({
      gocardless_payment_id: pay.data.id,
      gocardless_mandate_id: MANDATE_ID,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  console.log("GC", row.invoice_number, pay.data.id, row.due_date, `£${row.amount_gbp}`);
  (report.created_pms as unknown[]).push({
    inv: row.invoice_number,
    pm: pay.data.id,
    due: row.due_date,
    amount: row.amount_gbp,
  });
}

const regen = await regeneratePortalInvoiceSharePdf(admin, keeper.id);
console.log("PDF", regen.ok ? "ok" : regen.error);

/* Update submission label if present */
await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("id", "ee096d84-345d-433b-be3f-60781fac4f66")
  .maybeSingle()
  .then(async ({ data }) => {
    if (!data?.payload || typeof data.payload !== "object") return;
    const payload = structuredClone(data.payload) as Record<string, unknown>;
    const funding = (payload.funding || {}) as Record<string, unknown>;
    const choices = (funding.choices_2627 || {}) as Record<string, unknown>;
    choices.payment_schedule_label = "Regular monthly — 11 payments (Sep–Jul)";
    funding.choices_2627 = choices;
    payload.funding = funding;
    await admin
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", data.id);
  });

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/linda-fix-summer-11th.json",
  JSON.stringify({ at: new Date().toISOString(), report }, null, 2),
);
console.log("\nDone → database/local-vault/tmp/linda-fix-summer-11th.json");
