/**
 * Office: crash-course invoices · week of 27–31 Jul 2026 (SwimFarm aquatic).
 *
 *  - Obah Yusuf / Yaqoub (169): 3× 60' aquatic Mon/Tue/Wed 1–2pm @ £125
 *  - Pat Nekati / Tinashe (gap-tinashe-icloud): 3× 30' aquatic 1–1.30pm @ £62.50
 *  - Catarina da Silva / Zakariya (42): CANCELLED (not attending) — void INV-P-0120
 *    was 3× 60' aquatic 1–2pm @ £100 + 5× climb Mon–Fri @ £75
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-crash-obah-pat-catarina-jul27-31.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-crash-obah-pat-catarina-jul27-31.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  loadProductMap,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";
import type { PortalInvoiceVatMode } from "../../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DUE = "2026-07-24";
const READY_BY = "office_crash_obah_pat_catarina_jul27_31";

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
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type Job = {
  contactId: string;
  child: string;
  parent: string;
  vatMode: PortalInvoiceVatMode;
  paymentMethodHint: "bank_transfer" | "la_funded";
  fundedProvision: boolean;
  notes: string;
  lines: Array<{
    service_key: string;
    description: string;
    detail: string;
    dates: string;
    quantity: number;
    unit_price_gbp: number;
  }>;
};

const jobs: Job[] = [
  {
    contactId: "169",
    child: "Yaqoub Ismail",
    parent: "Obah Yusuf",
    vatMode: "exempt",
    paymentMethodHint: "bank_transfer",
    fundedProvision: true,
    notes:
      "Office crash course · SwimFarm aquatic 60' · Mon 27 / Tue 28 / Wed 29 Jul 2026 · 1pm–2pm · £125/session · EXEMPT VAT.",
    lines: [
      {
        service_key: "AQUATIC_60",
        description: "Aquatic Activity 60' (1to1)",
        detail: "Summer crash course Jul 2026 — Mon 27th, Tue 28th, Wed 29th",
        dates: "1pm to 2pm · SwimFarm",
        quantity: 3,
        unit_price_gbp: 125,
      },
    ],
  },
  {
    contactId: "gap-tinashe-icloud",
    child: "Tinashe Nekati",
    parent: "Pat Nekati",
    vatMode: "exempt",
    // Crash billed to mother (home address) — not LA Ealing / NHS.
    paymentMethodHint: "bank_transfer",
    fundedProvision: true,
    notes:
      "Office crash course · SwimFarm aquatic 30' · Mon 27 / Wed 29 / Fri 31 Jul 2026 · 1pm–1.30pm · £62.50/session · Bill-to: Pat Nekati (parent address).",
    lines: [
      {
        service_key: "AQUATIC_30",
        description: "Aquatic Activity 30' (1to1)",
        detail: "Summer crash course Jul 2026 — Mon 27th, Wed 29th, Fri 31st",
        dates: "1pm to 1.30pm · SwimFarm",
        quantity: 3,
        unit_price_gbp: 62.5,
      },
    ],
  },
  {
    contactId: "42",
    child: "Zakariya Warsame",
    parent: "Catarina da Silva",
    vatMode: "vat_20",
    paymentMethodHint: "bank_transfer",
    fundedProvision: false,
    notes:
      "Office crash course · SwimFarm aquatic 60' Mon/Wed/Fri 1–2pm @ £100 + Climbing 60' Mon–Fri 12–1pm Westway @ £75 · week 27–31 Jul 2026.",
    lines: [
      {
        service_key: "AQUATIC_60",
        description: "Aquatic Activity 60' (1to1)",
        detail: "Summer crash course Jul 2026 — Mon 27th, Wed 29th, Fri 31st",
        dates: "1pm to 2pm · SwimFarm",
        quantity: 3,
        unit_price_gbp: 100,
      },
      {
        service_key: "CLIMBING_60",
        description: "Climbing Activity 60' (1to1)",
        detail: "Summer crash course Jul 2026 — Mon 27th to Fri 31st",
        dates: "12pm to 1pm · Westway",
        quantity: 5,
        unit_price_gbp: 75,
      },
    ],
  },
];

const productMap = await loadProductMap(admin);

function buildLineItems(job: Job): PortalInvoiceLineItem[] {
  return job.lines.map((l) => {
    const amount = round2(l.quantity * l.unit_price_gbp);
    const mapRow = productMap.get(l.service_key);
    return {
      service_key: l.service_key,
      description: l.description,
      detail: l.detail,
      dates: l.dates,
      quantity: l.quantity,
      unit_price_gbp: l.unit_price_gbp,
      amount_gbp: amount,
      xero_item_code: xeroItemCodeForService(mapRow, job.vatMode),
    };
  });
}

type Plan = {
  job: Job;
  lineItems: PortalInvoiceLineItem[];
  amount: number;
  description: string;
};

const plans: Plan[] = jobs.map((job) => {
  const lineItems = buildLineItems(job);
  const amount = round2(lineItems.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
  const description = lineItemsToDescription(lineItems, {
    fundedProvision: job.fundedProvision,
  });
  return { job, lineItems, amount, description };
});

for (const p of plans) {
  console.log(`\n${p.job.parent} → ${p.job.child} (${p.job.contactId})`);
  console.log(`  Total £${p.amount.toFixed(2)} · ${p.job.vatMode} · due ${DUE}`);
  for (const l of p.lineItems) {
    console.log(
      `  · ${l.description} ×${l.quantity} @ £${l.unit_price_gbp} = £${l.amount_gbp} (${l.dates})`,
    );
  }
}

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to create invoices + Xero push.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner user id");

await xeroHydrateRefreshFromDb(admin);

for (const p of plans) {
  const marker = `office crash Jul27-31 2026 ${p.job.contactId}`;
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, amount_gbp, payment_status")
    .eq("contact_id", p.job.contactId)
    .eq("ready_by", READY_BY)
    .neq("payment_status", "void");
  if (existing?.length) {
    console.log(
      `\nSKIP ${p.job.child}: already created`,
      existing.map((r) => `${r.invoice_number} £${r.amount_gbp}`).join(", "),
    );
    continue;
  }

  const created = await createPortalFamilyInvoice(admin, {
    contactId: p.job.contactId,
    amountGbp: p.amount,
    dueDateIso: DUE,
    vatMode: p.job.vatMode,
    lineDescription: p.description,
    reference: "Summer crash course Jul 2026",
    service: "Crash course · SwimFarm / Climbing",
    notes: `${p.job.notes} · ${marker}`,
    title: `Invoice — ${p.job.child} · Summer crash course Jul 2026`,
    shareStatus: "ready",
    paymentMethodHint: p.job.paymentMethodHint,
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy: READY_BY,
    billingTerm: null,
    paymentSchedule: [
      {
        seq: 1,
        label: "Crash course · one payment",
        due_date: DUE,
        amount_gbp: p.amount,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems: p.lineItems,
  });
  if (!created.ok) throw new Error(`${p.job.child}: ${created.error}`);
  const shareId = String(created.invoice?.id || "");
  console.log(`\nCREATED ${created.invoiceNumber} · ${p.job.child} · £${p.amount.toFixed(2)} · ${shareId}`);

  if (shareId) {
    const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
    console.log("  Xero push", pushed);
  }
}

await xeroPersistRefreshToDb(admin);
console.log("\nDone.");
