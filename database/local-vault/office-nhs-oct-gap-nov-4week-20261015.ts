/**
 * NHS Day Centre after CLCH 14 Oct 2026 (September calendar month, 4-week blocks from 5 Oct):
 *  1. Thu 1 + Fri 2 Oct 2026 sit between the September invoice (ends 30 Sep) and the
 *     first 4-week block (starts Mon 5 Oct). Victor: NHS must pay them. One small
 *     INV-P per child, per session at the same uplifted rate as September.
 *  2. November INV-Ps move from calendar month (1-30 Nov) to the 4-week block
 *     2 Nov - 29 Nov 2026 (4 x weekly package). Mon 30 Nov goes to the next block.
 *
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write --allow-sys \
 *     database/local-vault/office-nhs-oct-gap-nov-4week-20261015.ts
 *   APPLY=1 ... (same)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const GAP_DATES = "Before 4-week block · 1 Oct 2026 to 2 Oct 2026";
const NOV_DATES = "4 weeks · 2 Nov 2026 to 29 Nov 2026";
const NOV_MARKER = "nhs_4week_02nov_29nov_2026";
const GAP_OUT = "docs/finance/nhs-oct-2026-gap-1-2oct";
const NOV_OUT = "docs/finance/nhs-nov-2026-4week";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100 + 1e-6) / 100;
}

function line(input: {
  serviceKey: string;
  description: string;
  detail: string;
  dates: string;
  quantity: number;
  unit: number;
}): PortalInvoiceLineItem {
  return {
    service_key: input.serviceKey,
    description: input.description,
    detail: input.detail,
    dates: input.dates,
    quantity: input.quantity,
    unit_price_gbp: input.unit,
    amount_gbp: round2(input.quantity * input.unit),
    xero_item_code: null,
  };
}

const FADI = { key: "DAY_CENTRE_150", detail: "Mon-Fri · SwimFarm · 2:1 Bespoke 2h30'" };
const IKRAM = { key: "DAY_CENTRE_300", detail: "Mon/Tue/Wed/Fri · SwimFarm · 11:00-16:00 · 2:1" };
const IKRAM_CAB = { key: "CAB_TRAVEL", detail: "Mon/Tue/Wed/Fri · SwimFarm · CAB" };
const EMANUEL = { key: "DAY_CENTRE_300", detail: "Mon/Wed/Fri · SwimFarm · 11:00-16:00 · 1:1" };
const TIMI = { key: "DAY_CENTRE_120", detail: "Mon/Fri · SwimFarm · 11:00-13:00 · 2:1" };

type GapPlan = { contactId: string; slug: string; who: string; expect: number; lines: PortalInvoiceLineItem[] };

const gapPlans: GapPlan[] = [
  {
    contactId: "101", slug: "fadi", who: "Fadi", expect: 1321.28,
    lines: [line({ serviceKey: FADI.key, description: "Day Centre / Bespoke 2h30' (2:1)", detail: FADI.detail, dates: GAP_DATES, quantity: 2, unit: 660.64 })],
  },
  {
    contactId: "gap-ikram-omar", slug: "ikram-omar", who: "Ikram", expect: 765.23,
    lines: [
      line({ serviceKey: IKRAM.key, description: "Day Centre 5h (2:1)", detail: IKRAM.detail, dates: GAP_DATES, quantity: 1, unit: 663.195 }),
      line({ serviceKey: IKRAM_CAB.key, description: "CAB (travel)", detail: IKRAM_CAB.detail, dates: GAP_DATES, quantity: 1, unit: 102.03 }),
    ],
  },
  {
    contactId: "gap-emanuel-dodson", slug: "emanuel", who: "Emanuel", expect: 510.15,
    lines: [line({ serviceKey: EMANUEL.key, description: "Day Centre 5h (1:1)", detail: EMANUEL.detail, dates: GAP_DATES, quantity: 1, unit: 510.15 })],
  },
  {
    contactId: "gap-timi-dairo", slug: "timi", who: "Timi", expect: 357.11,
    lines: [line({ serviceKey: TIMI.key, description: "Day Centre 2h (2:1)", detail: TIMI.detail, dates: GAP_DATES, quantity: 1, unit: 357.105 })],
  },
];

type NovPlan = { invoice: string; who: string; expect: number; lines: PortalInvoiceLineItem[] };

const novPlans: NovPlan[] = [
  {
    invoice: "INV-P-0237", who: "Fadi", expect: 13212.8,
    lines: [line({ serviceKey: FADI.key, description: "Day Centre / Bespoke 2h30' (2:1) · weekly package", detail: FADI.detail, dates: NOV_DATES, quantity: 4, unit: 3303.2 })],
  },
  {
    invoice: "INV-P-0273", who: "Ikram", expect: 12243.6,
    lines: [
      line({ serviceKey: IKRAM.key, description: "Day Centre 5h (2:1) · weekly package", detail: IKRAM.detail, dates: NOV_DATES, quantity: 4, unit: 2652.78 }),
      line({ serviceKey: IKRAM_CAB.key, description: "CAB (travel) · weekly package", detail: IKRAM_CAB.detail, dates: NOV_DATES, quantity: 4, unit: 408.12 }),
    ],
  },
  {
    invoice: "INV-P-0262", who: "Emanuel", expect: 6121.8,
    lines: [line({ serviceKey: EMANUEL.key, description: "Day Centre 5h (1:1) · weekly package", detail: EMANUEL.detail, dates: NOV_DATES, quantity: 4, unit: 1530.45 })],
  },
  {
    invoice: "INV-P-0170", who: "Timi", expect: 2856.84,
    lines: [line({ serviceKey: TIMI.key, description: "Day Centre 2h (2:1) · weekly package", detail: TIMI.detail, dates: NOV_DATES, quantity: 4, unit: 714.21 })],
  },
];

async function writeLocalPdf(shareId: string, outDir: string, invoice: string, total: number) {
  const bytes = await regeneratePortalInvoiceSharePdf(admin, shareId, { mode: "bytes" });
  if (!bytes.ok || !("pdfBytes" in bytes)) {
    throw new Error(`${invoice} bytes ${"error" in bytes ? bytes.error : "missing"}`);
  }
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}/${invoice}.pdf`;
  writeFileSync(file, bytes.pdfBytes);
  console.log("WROTE", file, "£" + total.toFixed(2));
}

console.log(`\nNHS 1-2 Oct gap + November 2-29 Nov  (${APPLY ? "APPLY" : "DRY"})\n`);

const gapTodo: { plan: GapPlan; total: number; readyBy: string }[] = [];
for (const p of gapPlans) {
  const total = round2(p.lines.reduce((s, l) => s + l.amount_gbp, 0));
  if (Math.abs(total - p.expect) > 0.009) throw new Error(`${p.who} gap total ${total} != ${p.expect}`);
  const readyBy = `office_funder_2627_nhs_gap_2026-10-01_02_${p.slug}`;
  const { data: existing, error } = await admin
    .from("portal_parent_invoice_share")
    .select("invoice_number, amount_gbp")
    .eq("contact_id", p.contactId)
    .eq("ready_by", readyBy)
    .neq("payment_status", "void");
  if (error) throw error;
  if (existing?.length) {
    console.log(`GAP ${p.who}: already ${existing.map((r) => r.invoice_number).join(", ")} · skip`);
    continue;
  }
  console.log(`GAP ${p.who} (new INV-P) 1-2 Oct 2026: £${total.toFixed(2)}`);
  for (const l of p.lines) console.log(`    ${l.quantity} x £${l.unit_price_gbp} = £${l.amount_gbp}  ${l.description}`);
  gapTodo.push({ plan: p, total, readyBy });
}

const novTodo: { plan: NovPlan; total: number; share: Record<string, unknown> }[] = [];
for (const p of novPlans) {
  const total = round2(p.lines.reduce((s, l) => s + l.amount_gbp, 0));
  if (Math.abs(total - p.expect) > 0.009) throw new Error(`${p.invoice} total ${total} != ${p.expect}`);
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, notes, due_date, payment_status, amount_gbp, amount_paid_gbp, reference_text")
    .eq("invoice_number", p.invoice)
    .neq("payment_status", "void")
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) throw new Error(`${p.invoice} not found`);
  if (String(share.reference_text) !== "November 2026") throw new Error(`${p.invoice} is ${share.reference_text}`);
  console.log(
    `NOV ${p.invoice} ${p.who}: £${Number(share.amount_gbp).toFixed(2)} → £${total.toFixed(2)} · ${share.payment_status}` +
      ` · paid £${Number(share.amount_paid_gbp || 0).toFixed(2)} · due ${share.due_date}`,
  );
  novTodo.push({ plan: p, total, share: share as Record<string, unknown> });
}

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner user id");

for (const { plan: p, total, readyBy } of gapTodo) {
  const created = await createPortalFamilyInvoice(admin, {
    contactId: p.contactId,
    amountGbp: total,
    dueDateIso: "2026-11-01",
    invoiceDateIso: "2026-10-02",
    vatMode: "exempt",
    lineDescription: lineItemsToDescription(p.lines, { fundedProvision: true }),
    reference: "1-2 October 2026",
    service: "Day Centre · NHS",
    notes:
      `${readyBy} · NHS Day Centre ${p.who} · Thu 1 + Fri 2 Oct 2026, between the September ` +
      `calendar-month invoice and the 4-week block from 5 Oct (CLCH 14 Oct 2026) · ` +
      `nhs_service_uplift_2.03pct_from_sep2026`,
    title: `Invoice — ${p.who} · 1-2 October 2026`,
    shareStatus: "ready",
    paymentMethodHint: "la_funded",
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy,
    billingTerm: "autumn",
    quantity: p.lines[0].quantity,
    paymentSchedule: [
      {
        seq: 1,
        label: "1-2 October 2026 · NHS invoice",
        due_date: "2026-11-01",
        amount_gbp: total,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems: p.lines,
  });
  if (!created.ok) throw new Error(`${p.who} gap create ${JSON.stringify(created)}`);
  const shareId = String(created.invoice?.id || "");
  console.log("CREATED", created.invoiceNumber, p.who, "£" + total.toFixed(2));
  if (shareId) await writeLocalPdf(shareId, GAP_OUT, String(created.invoiceNumber), total);
}

for (const { plan: p, total, share } of novTodo) {
  if (String(share.payment_status) === "paid" || Number(share.amount_paid_gbp || 0) > 0) {
    console.log("SKIP has payment", p.invoice);
    continue;
  }
  const due = String(share.due_date || "").slice(0, 10);
  const qty = p.lines[0].quantity;
  const notes = String(share.notes || "")
    .replace(/\s· rebuilt sheet days×uplift[\s\S]*$/, "")
    .replace(/\s· nhs_4week_[\s\S]*$/, "") + ` · ${NOV_MARKER} · total £${total.toFixed(2)}`;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: total,
      amount_paid_gbp: 0,
      quantity: qty,
      unit_price_gbp: round2(total / qty),
      line_items: p.lines,
      line_description: lineItemsToDescription(p.lines, { fundedProvision: true }),
      reference_text: "November 2026",
      payment_schedule: [
        {
          seq: 1,
          label: "November 2026 · NHS invoice",
          due_date: due,
          amount_gbp: total,
          status: "pending",
          paid_at: null,
          paid_via: null,
        },
      ],
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(share.id));
  if (upErr) throw upErr;
  const stored = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  if (!stored.ok) throw new Error(`${p.invoice} pdf ${stored.error}`);
  await writeLocalPdf(String(share.id), NOV_OUT, p.invoice, total);
}

console.log("\nDone.");
