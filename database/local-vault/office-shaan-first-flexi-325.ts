/**
 * Office: Shaan Boora INV-P-0126 — only 1st flexi half paid (£325 on 29 Jul).
 * Admin had marked both halves paid; reopen 2nd half (due 26 Oct).
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-shaan-first-flexi-325.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  normalizePaymentSchedule,
  nextInstalmentDueDate,
} from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE = "INV-P-0126";
const RECEIVED = 325;
const PAID_AT = "2026-07-29T12:00:00.000Z";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: inv, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", INVOICE)
  .maybeSingle();
if (error || !inv) throw new Error(error?.message || "invoice missing");

console.log(APPLY ? "APPLY" : "DRY RUN", INVOICE, {
  status: inv.payment_status,
  amount: inv.amount_gbp,
  paid: inv.amount_paid_gbp,
  schedule: inv.payment_schedule,
});

const sched = normalizePaymentSchedule(inv.payment_schedule).map((row) => {
  if (row.seq === 1) {
    return {
      ...row,
      amount_gbp: RECEIVED,
      status: "paid" as const,
      paid_at: PAID_AT,
      paid_via: "admin",
      label: row.label || "Autumn term · 1st half",
    };
  }
  if (row.seq === 2) {
    return {
      ...row,
      status: "pending" as const,
      paid_at: null,
      paid_via: null,
    };
  }
  return row;
});

const note =
  `${String(inv.notes || "").trim()} · office: Meena paid £325 (1st flexi half) 2026-07-29 bank — NOT full autumn; 2nd half £325 still due 2026-10-26`.trim();

console.log("→ partial £325 paid; 2nd half pending", {
  next_due: nextInstalmentDueDate(sched),
  schedule: sched,
});

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_status: "partial",
    amount_paid_gbp: RECEIVED,
    payment_schedule: sched,
    next_instalment_due: nextInstalmentDueDate(sched),
    paid_at: null,
    paid_via: null,
    notes: note.slice(0, 2000),
    updated_at: now,
  })
  .eq("id", inv.id);
if (upErr) throw new Error(upErr.message);

const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
console.log(
  "OK Shaan",
  INVOICE,
  "partial £" + RECEIVED,
  regen.ok ? regen.pdfStoragePath : "PDF fail: " + regen.error,
);
