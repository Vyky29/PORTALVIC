/**
 * CLCH (Ikhlat Matharu) 14 Oct 2026:
 *  - Released the calendar-month September invoices: P0235 £14,534.08, P0271 £13,774.05,
 *    P0260 £6,631.95 (dated 01/09/2026). Undo the 8 Oct 4-week reissue so ours match.
 *    Timi P0168 is the same £2,856.84 either way; it goes back to the calendar month too.
 *  - Next period 05/10/2026 to 01/11/2026, then every 4 weeks. October INV-Ps move
 *    from 28 Sep-25 Oct to 5 Oct-1 Nov (same 4 x weekly package).
 *
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-nhs-sep-released-oct-5oct-20261015.ts
 *   APPLY=1 ... (same)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const SEP_DATES = "Calendar month · 1 Sep 2026 to 30 Sep 2026";
const OCT_DATES = "4 weeks · 5 Oct 2026 to 1 Nov 2026";
const SEP_MARKER = "nhs_sep2026_calendar_released_clch_14oct";
const OCT_MARKER = "nhs_4week_05oct_01nov_2026";

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

type Plan = {
  invoice: string;
  who: string;
  reference: string;
  marker: string;
  out: string;
  expect: number;
  lines: PortalInvoiceLineItem[];
};

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

const SEP_OUT = "docs/finance/nhs-sep-2026-released";
const OCT_OUT = "docs/finance/nhs-oct-2026-4week";

const plans: Plan[] = [
  {
    invoice: "INV-P-0235", who: "Fadi", reference: "September 2026", marker: SEP_MARKER, out: SEP_OUT, expect: 14534.08,
    lines: [line({ serviceKey: FADI.key, description: "Day Centre / Bespoke 2h30' (2:1)", detail: FADI.detail, dates: SEP_DATES, quantity: 22, unit: 660.64 })],
  },
  {
    invoice: "INV-P-0271", who: "Ikram", reference: "September 2026", marker: SEP_MARKER, out: SEP_OUT, expect: 13774.05,
    lines: [
      line({ serviceKey: IKRAM.key, description: "Day Centre 5h (2:1)", detail: IKRAM.detail, dates: SEP_DATES, quantity: 18, unit: 663.195 }),
      line({ serviceKey: IKRAM_CAB.key, description: "CAB (travel)", detail: IKRAM_CAB.detail, dates: SEP_DATES, quantity: 18, unit: 102.03 }),
    ],
  },
  {
    invoice: "INV-P-0260", who: "Emanuel", reference: "September 2026", marker: SEP_MARKER, out: SEP_OUT, expect: 6631.95,
    lines: [line({ serviceKey: EMANUEL.key, description: "Day Centre 5h (1:1)", detail: EMANUEL.detail, dates: SEP_DATES, quantity: 13, unit: 510.15 })],
  },
  {
    invoice: "INV-P-0168", who: "Timi", reference: "September 2026", marker: SEP_MARKER, out: SEP_OUT, expect: 2856.84,
    lines: [line({ serviceKey: TIMI.key, description: "Day Centre 2h (2:1)", detail: TIMI.detail, dates: SEP_DATES, quantity: 8, unit: 357.105 })],
  },
  {
    invoice: "INV-P-0236", who: "Fadi", reference: "October 2026", marker: OCT_MARKER, out: OCT_OUT, expect: 13212.8,
    lines: [line({ serviceKey: FADI.key, description: "Day Centre / Bespoke 2h30' (2:1) · weekly package", detail: FADI.detail, dates: OCT_DATES, quantity: 4, unit: 3303.2 })],
  },
  {
    invoice: "INV-P-0272", who: "Ikram", reference: "October 2026", marker: OCT_MARKER, out: OCT_OUT, expect: 12243.6,
    lines: [
      line({ serviceKey: IKRAM.key, description: "Day Centre 5h (2:1) · weekly package", detail: IKRAM.detail, dates: OCT_DATES, quantity: 4, unit: 2652.78 }),
      line({ serviceKey: IKRAM_CAB.key, description: "CAB (travel) · weekly package", detail: IKRAM_CAB.detail, dates: OCT_DATES, quantity: 4, unit: 408.12 }),
    ],
  },
  {
    invoice: "INV-P-0261", who: "Emanuel", reference: "October 2026", marker: OCT_MARKER, out: OCT_OUT, expect: 6121.8,
    lines: [line({ serviceKey: EMANUEL.key, description: "Day Centre 5h (1:1) · weekly package", detail: EMANUEL.detail, dates: OCT_DATES, quantity: 4, unit: 1530.45 })],
  },
  {
    invoice: "INV-P-0169", who: "Timi", reference: "October 2026", marker: OCT_MARKER, out: OCT_OUT, expect: 2856.84,
    lines: [line({ serviceKey: TIMI.key, description: "Day Centre 2h (2:1) · weekly package", detail: TIMI.detail, dates: OCT_DATES, quantity: 4, unit: 714.21 })],
  },
];

console.log(`\nNHS Sep released + Oct 5 Oct-1 Nov  (${APPLY ? "APPLY" : "DRY"})\n`);

const loaded: { plan: Plan; total: number; share: Record<string, unknown> }[] = [];
for (const p of plans) {
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
  console.log(
    `${p.invoice} ${p.who} ${p.reference}: £${Number(share.amount_gbp).toFixed(2)} → £${total.toFixed(2)} · ${share.payment_status}` +
      ` · paid £${Number(share.amount_paid_gbp || 0).toFixed(2)} · due ${share.due_date}`,
  );
  for (const l of p.lines) console.log(`    ${l.quantity} x £${l.unit_price_gbp} = £${l.amount_gbp}  ${l.description} · ${l.dates}`);
  loaded.push({ plan: p, total, share: share as Record<string, unknown> });
}

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
  Deno.exit(0);
}

for (const { plan: p, total, share } of loaded) {
  if (String(share.payment_status) === "paid" || Number(share.amount_paid_gbp || 0) > 0) {
    console.log("SKIP has payment", p.invoice);
    continue;
  }
  const description = lineItemsToDescription(p.lines, { fundedProvision: true });
  const due = String(share.due_date || "").slice(0, 10);
  const qty = p.lines[0].quantity;
  const noteExtra = ` · ${p.marker} · total £${total.toFixed(2)}`;
  const notes = String(share.notes || "")
    .replace(/\s· rebuilt sheet days×uplift[\s\S]*$/, "")
    .replace(/\s· nhs_4week_[\s\S]*$/, "")
    .replace(/\s· nhs_sep2026_calendar_released[\s\S]*$/, "") + noteExtra;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: total,
      amount_paid_gbp: 0,
      quantity: qty,
      unit_price_gbp: round2(total / qty),
      line_items: p.lines,
      line_description: description,
      reference_text: p.reference,
      payment_schedule: [
        {
          seq: 1,
          label: `${p.reference} · NHS invoice`,
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
  const bytes = await regeneratePortalInvoiceSharePdf(admin, String(share.id), { mode: "bytes" });
  if (!bytes.ok || !("pdfBytes" in bytes)) {
    throw new Error(`${p.invoice} bytes ${"error" in bytes ? bytes.error : "missing"}`);
  }
  mkdirSync(p.out, { recursive: true });
  const file = `${p.out}/${p.invoice}.pdf`;
  writeFileSync(file, bytes.pdfBytes);
  console.log("WROTE", file, "£" + total.toFixed(2));
}

console.log("\nDone.");
