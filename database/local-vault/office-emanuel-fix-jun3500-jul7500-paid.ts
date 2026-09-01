/**
 * Emanuel Dodson · INV-P-0128 / INV-P-0129
 * Office correction: June £3,500 · July £7,500 (July paid).
 * Total still £11,000 (redistribute £500 Jun → Jul).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-emanuel-fix-jun3500-jul7500-paid.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const RATE = 500;
const JUNE_AMT = 3500;
const JULY_AMT = 7500;
const JUNE_QTY = 7; // £3,500 @ £500
const JULY_QTY = 15; // £7,500 @ £500
const CONTACT_ID = "gap-emanuel-dodson";

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

const paidAt = new Date().toISOString();

const plans: Record<
  string,
  {
    amount: number;
    qty: number;
    paid: boolean;
    label: string;
    dates: string;
    detail: string;
    dueDate: string;
  }
> = {
  "INV-P-0128": {
    amount: JUNE_AMT,
    qty: JUNE_QTY,
    paid: false,
    label: "June 2026",
    dates:
      "7 sessions · 15, 17, 19, 22, 24, 26 & 29 Jun 2026 · 11:00–16:00 SwimFarm",
    detail: "June 2026 · SwimFarm Hub · billed £3,500 (7 × £500)",
    dueDate: "2026-07-14",
  },
  "INV-P-0129": {
    amount: JULY_AMT,
    qty: JULY_QTY,
    paid: true,
    label: "July 2026",
    dates:
      "15 sessions · Jul 2026 Day Centre 5h (1:1) M/W/F · 11:00–16:00 SwimFarm (incl. £500 from Jun start week)",
    detail: "July 2026 · SwimFarm Hub · billed £7,500 (paid)",
    dueDate: "2026-08-14",
  },
};

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, line_items, quantity, unit_price_gbp, notes, share_status",
  )
  .in("invoice_number", Object.keys(plans));
if (error) throw error;
if (!shares?.length) throw new Error("Emanuel Jun/Jul INV-Ps not found");

for (const share of shares) {
  const num = String(share.invoice_number);
  const p = plans[num];
  if (!p) continue;

  const lineItems: PortalInvoiceLineItem[] = [
    {
      service_key: "DAY_CENTRE_300",
      description: "Day Centre 5h (1:1) · Mon/Wed/Fri 11:00–16:00",
      detail: p.detail,
      dates: p.dates,
      quantity: p.qty,
      unit_price_gbp: RATE,
      amount_gbp: p.amount,
      xero_item_code: null,
    },
  ];
  const description = lineItemsToDescription(lineItems, { fundedProvision: true });
  const schedule = [
    {
      seq: 1,
      label: `${p.label} · NHS invoice`,
      due_date: p.dueDate,
      amount_gbp: p.amount,
      status: p.paid ? "paid" : "pending",
      paid_at: p.paid ? paidAt : null,
      paid_via: p.paid ? "office" : null,
    },
  ];
  const patch = {
    amount_gbp: p.amount,
    amount_paid_gbp: p.paid ? p.amount : 0,
    payment_status: p.paid ? "paid" : "unpaid",
    quantity: p.qty,
    unit_price_gbp: RATE,
    line_items: lineItems,
    line_description: description,
    payment_schedule: schedule,
    notes:
      `Office NHS invoice · Emanuel Dodson · ${p.label} · ` +
      `${p.qty}× Day Centre 5h @ £${RATE} = £${p.amount}` +
      (p.paid ? " · PAID (office 12 Aug 2026)" : " · unpaid") +
      ` · office_emanuel_fix_jun3500_jul7500`,
    updated_at: paidAt,
  };

  console.log(
    `${num}: £${share.amount_gbp} ${share.payment_status} → £${p.amount} ${patch.payment_status}`,
  );
  if (!APPLY) continue;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update(patch)
    .eq("id", share.id);
  if (upErr) throw upErr;

  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log("  PDF", pdf);
}

/* Ledger: Jun/Jul amounts + July paid */
const { data: payRow, error: payErr } = await admin
  .from("client_payments")
  .select("id, amount, data")
  .eq("client_key", "emanuel")
  .ilike("data->>Term", "%summer%")
  .maybeSingle();
if (payErr) throw payErr;

if (payRow?.id) {
  const prev = (payRow.data && typeof payRow.data === "object"
    ? payRow.data
    : {}) as Record<string, unknown>;
  const total = JUNE_AMT + JULY_AMT;
  const data = {
    ...prev,
    "June invoice (25/26)": JUNE_AMT,
    "July invoice (25/26)": JULY_AMT,
    "June invoice no": "INV-P-0128",
    "July invoice no": "INV-P-0129",
    "Summer basis":
      `Jun £${JUNE_AMT.toLocaleString("en-GB")} (7×£500) + Jul £${JULY_AMT.toLocaleString("en-GB")} (15×£500, paid) = £${total.toLocaleString("en-GB")}`,
    "NHS due months":
      `Jun £${JUNE_AMT.toLocaleString("en-GB")} unpaid + Jul £${JULY_AMT.toLocaleString("en-GB")} PAID`,
    "Year billed (25/26)": `£${total.toLocaleString("en-GB")}`,
    "Year received (25/26)": `£${JULY_AMT.toLocaleString("en-GB")}`,
    "Year outstanding": `£${JUNE_AMT.toLocaleString("en-GB")}`,
    "Payment status": "Partial",
    Next:
      `Summer 25/26 NHS: Jul INV-P-0129 £${JULY_AMT} paid · Jun INV-P-0128 £${JUNE_AMT} still due`,
  };
  console.log(
    `Ledger: outstanding £${JUNE_AMT} · received £${JULY_AMT} · billed £${total}`,
  );
  if (APPLY) {
    const { error: upPay } = await admin
      .from("client_payments")
      .update({
        amount: total,
        payment_status: "Partial",
        data,
      })
      .eq("id", payRow.id);
    if (upPay) throw upPay;
  }
} else {
  console.log("WARN: client_payments summer row not found — invoices still patched");
}

console.log(APPLY ? "\nDone." : "\nDry run only — re-run with APPLY=1");
