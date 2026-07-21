/**
 * One-off: rebuild Zakariya Warsame's two paid invoices with Xero product
 * line items (description + qty/unit/VAT per service) and regenerate PDFs.
 *
 * - INV-P-0074 (re-enrolment Autumn 26/27, VAT 20%, paid £1625)
 *   → Aquatic Activity 30' (13 × £50) + Climbing Activity 60' (13 × £75)
 * - INV-P-CRASH-MRMCPDUG (summer crash Jul 2026, VAT 20%, paid £700)
 *   → Aquatic Activity 60' (8 × £50) + Climbing Activity 60' (4 × £75)
 *
 * Run: npx -y deno run --allow-env --allow-read --allow-net \
 *   database/local-vault/patch-zakariya-invoices-line-items.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const patches: Array<{
  invoice_number: string;
  patch: Record<string, unknown>;
}> = [
  {
    invoice_number: "INV-P-0074",
    patch: {
      billing_term: "autumn",
      payment_schedule: [
        {
          seq: 1,
          label: "Payment 1 · Autumn term",
          due_date: "2026-08-15",
          amount_gbp: 1625,
          status: "paid",
          paid_at: "2026-07-17T00:00:00.000Z",
          paid_via: "stripe",
        },
      ],
      line_items: [
        {
          service_key: "AQUATIC_30",
          description: "Aquatic Activity 30'",
          detail: "Sunday 2 to 2.30 pm · SwimFarm",
          quantity: 13,
          unit_price_gbp: 50,
          amount_gbp: 650,
          xero_item_code: "SW",
        },
        {
          service_key: "CLIMBING_60",
          description: "Climbing Activity 60'",
          detail: "Sunday 1 to 2 pm · Westway",
          quantity: 13,
          unit_price_gbp: 75,
          amount_gbp: 975,
          xero_item_code: "CL",
        },
      ],
    },
  },
  {
    invoice_number: "INV-P-CRASH-MRMCPDUG",
    patch: {
      line_items: [
        {
          service_key: "CLIMBING_60",
          description: "Climbing Activity 60' (1to1)",
          detail: "Summer crash Jul 2026 · 20th to 23rd July, 12 to 1 pm · Westway",
          dates: "July, 12 to 1 pm - Westway",
          quantity: 4,
          unit_price_gbp: 75,
          amount_gbp: 300,
          xero_item_code: "CL",
        },
        {
          service_key: "AQUATIC_60",
          description: "Aquatic Activity 60' (1to1)",
          detail: "Summer crash Jul 2026 · 20th to 23rd July, 1 to 2 pm · SwimFarm (back-to-back after climb)",
          dates: "July, 1 to 2 pm - SwimFarm",
          quantity: 8,
          unit_price_gbp: 50,
          amount_gbp: 400,
          xero_item_code: "SW",
        },
      ],
    },
  },
];

for (const { invoice_number, patch } of patches) {
  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, amount_gbp")
    .eq("invoice_number", invoice_number)
    .maybeSingle();
  if (error || !share) {
    console.log(invoice_number, "not found:", error?.message);
    continue;
  }
  const lineTotal = (patch.line_items as Array<{ amount_gbp: number }>).reduce(
    (s, l) => s + l.amount_gbp,
    0,
  );
  if (Math.abs(lineTotal - Number(share.amount_gbp)) > 0.01) {
    console.log(invoice_number, `line total ${lineTotal} != invoice ${share.amount_gbp} — skipped`);
    continue;
  }
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", share.id);
  if (upErr) {
    console.log(invoice_number, "update failed:", upErr.message);
    continue;
  }
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log(invoice_number, regen.ok ? "patched + PDF regenerated" : `regen failed: ${regen.error}`);
}
