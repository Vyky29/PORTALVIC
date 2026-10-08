/**
 * September 2026 NHS Day Centre INV-Ps → one 4-week block.
 * Monday 31 Aug 2026 to Sunday 27 Sep 2026 (service from 1 Sep).
 * Quantity 4. Unit price is the weekly package (uplift already in the day rate).
 * Not a calendar month counted in attendance days.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-nhs-sep2026-4week.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const PERIOD = "4 weeks · 31 Aug 2026 to 27 Sep 2026";
const REFERENCE = "September 2026";
const DATES = `${PERIOD} · service from 1 Sep`;
const OUT = "docs/finance/nhs-sep-2026-4week";

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
  lines: PortalInvoiceLineItem[];
};

function weekLine(input: {
  serviceKey: string;
  description: string;
  detail: string;
  weekly: number;
  dates?: string;
}): PortalInvoiceLineItem {
  const weekly = round2(input.weekly);
  return {
    service_key: input.serviceKey,
    description: input.description,
    detail: input.detail,
    dates: input.dates || DATES,
    quantity: 4,
    unit_price_gbp: weekly,
    amount_gbp: round2(weekly * 4),
    xero_item_code: null,
  };
}

const plans: Plan[] = [
  {
    invoice: "INV-P-0235",
    lines: [
      weekLine({
        serviceKey: "DAY_CENTRE_150",
        description: "Day Centre / Bespoke 2h30' (2:1) · weekly package",
        detail: "Mon-Fri · SwimFarm · 2:1 Bespoke 2h30'",
        weekly: round2(5 * 660.64),
      }),
    ],
  },
  {
    invoice: "INV-P-0271",
    lines: [
      weekLine({
        serviceKey: "DAY_CENTRE_300",
        description: "Day Centre 5h (2:1) · weekly package",
        detail: "Mon/Tue/Wed/Fri · SwimFarm · 11:00-16:00 · 2:1",
        weekly: round2(4 * 663.195),
      }),
      weekLine({
        serviceKey: "CAB_TRAVEL",
        description: "CAB (travel) · weekly package",
        detail: "Mon/Tue/Wed/Fri · SwimFarm · CAB",
        weekly: round2(4 * 102.03),
      }),
    ],
  },
  {
    invoice: "INV-P-0260",
    lines: [
      weekLine({
        serviceKey: "DAY_CENTRE_300",
        description: "Day Centre 5h (1:1) · weekly package",
        detail: "Mon/Wed/Fri · SwimFarm · 11:00-16:00 · 1:1",
        weekly: round2(3 * 510.15),
      }),
    ],
  },
  {
    invoice: "INV-P-0168",
    lines: [
      weekLine({
        serviceKey: "DAY_CENTRE_120",
        description: "Day Centre 2h (2:1) · weekly package",
        detail: "Mon/Fri · SwimFarm · 11:00-13:00 · 2:1",
        weekly: round2(2 * 357.105),
      }),
    ],
  },
  {
    invoice: "INV-P-0543",
    lines: [
      weekLine({
        serviceKey: "AQUATIC_60",
        description: "Aquatic Activity 1h (2:1) · weekly package",
        detail: "Thursday · Acton · 5.30-6.30 · 2:1",
        weekly: round2(200 * 1.0203),
        dates: PERIOD,
      }),
      weekLine({
        serviceKey: "CAB_TRAVEL",
        description: "CAB (travel) · weekly package",
        detail: "Thursday · Acton · 5.30-6.30 · CAB",
        weekly: round2(150 * 1.0203),
        dates: PERIOD,
      }),
    ],
  },
];

console.log(`\nNHS September → ${PERIOD}\n`);
for (const p of plans) {
  const total = round2(p.lines.reduce((s, l) => s + l.amount_gbp, 0));
  console.log(p.invoice, "£" + total.toFixed(2));
  for (const l of p.lines) {
    console.log(`  4 x £${l.unit_price_gbp} = £${l.amount_gbp}  ${l.description}`);
  }
}

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
  Deno.exit(0);
}

mkdirSync(OUT, { recursive: true });

for (const p of plans) {
  const total = round2(p.lines.reduce((s, l) => s + l.amount_gbp, 0));
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, notes, due_date, payment_status")
    .eq("invoice_number", p.invoice)
    .neq("payment_status", "void")
    .maybeSingle();
  if (error) throw error;
  if (!share?.id) throw new Error(`${p.invoice} not found`);
  if (String(share.payment_status) === "paid") {
    console.log("SKIP paid", p.invoice);
    continue;
  }

  const description = lineItemsToDescription(p.lines, { fundedProvision: true });
  const due = String(share.due_date || "2026-10-01").slice(0, 10);
  const noteExtra =
    ` · nhs_4week_31aug_27sep_2026 · qty 4 x weekly package · total £${total.toFixed(2)}`;
  const notes = String(share.notes || "")
    .replace(/\s· rebuilt sheet days×uplift[\s\S]*$/, "")
    .replace(/\s· nhs_4week_31aug_27sep_2026[\s\S]*$/, "") + noteExtra;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: total,
      amount_paid_gbp: 0,
      quantity: 4,
      unit_price_gbp: round2(total / 4),
      line_items: p.lines,
      line_description: description,
      reference_text: REFERENCE,
      payment_schedule: [
        {
          seq: 1,
          label: `${REFERENCE} · NHS invoice`,
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
    .eq("id", share.id);
  if (upErr) throw upErr;

  const stored = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  if (!stored.ok) throw new Error(`${p.invoice} pdf ${stored.error}`);
  const bytes = await regeneratePortalInvoiceSharePdf(admin, String(share.id), {
    mode: "bytes",
  });
  if (!bytes.ok || !("pdfBytes" in bytes)) {
    throw new Error(`${p.invoice} bytes ${"error" in bytes ? bytes.error : "missing"}`);
  }
  const file = `${OUT}/${p.invoice}.pdf`;
  writeFileSync(file, bytes.pdfBytes);
  console.log("WROTE", file, "£" + total.toFixed(2));
}

console.log("\nDone.", OUT);
