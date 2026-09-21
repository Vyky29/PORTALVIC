/**
 * NHS Day Centre INV-Ps: PDF body Reference = PO XXPRASHERV1 (not month),
 * Client's ID = NWL{digits}. Top invoice Reference box stays the month.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-net --allow-read --allow-write \
 *     database/local-vault/office-nhs-nwl-reference-regen-20260916.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** NHS Day Centre four — shared PO XXPRASHERV1. */
const NHS_SUFFIXES = ["_fadi", "_ikram-omar", "_emanuel", "_timi"];

const OUT = "database/local-vault/tmp/nhs-nwl-reference-20260916";

console.log("APPLY=", APPLY);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, reference_text, amount_gbp, ready_by, payment_method_hint, share_status",
  )
  .eq("payment_method_hint", "la_funded")
  .order("invoice_number");
if (error) {
  console.error(error.message);
  Deno.exit(1);
}

const rows = (shares || []).filter((s) => {
  const rb = String(s.ready_by || "");
  if (!/nhs/i.test(rb)) return false;
  if (/office_la_nhs_/i.test(rb)) return false; // H&F autumn packs mislabeled
  // Monthly + year for the four XXPRASHERV1 Day Centre clients
  if (/office_funder_2627_nhs_(month|year)_/i.test(rb)) {
    return /_(fadi|ikram-omar|emanuel|timi)$/i.test(rb);
  }
  // Emanuel Jun/Jul 2026 NHS summer INV-Ps
  if (/office_emanuel_jun_jul_nhs_/i.test(rb)) return true;
  return false;
});

console.log("NHS funder shares:", rows.length);
for (const s of rows) {
  console.log(
    s.invoice_number,
    s.contact_id,
    s.reference_text,
    `£${s.amount_gbp}`,
    s.ready_by,
  );
}

if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1 to regenerate PDFs.");
  Deno.exit(0);
}

mkdirSync(OUT, { recursive: true });
let ok = 0;
let fail = 0;
for (const s of rows) {
  const r = await regeneratePortalInvoiceSharePdf(admin, String(s.id), {
    mode: "store",
  });
  if (!r.ok) {
    console.error("FAIL", s.invoice_number, r);
    fail += 1;
    continue;
  }
  const bytes = await regeneratePortalInvoiceSharePdf(admin, String(s.id), {
    mode: "bytes",
  });
  if (bytes.ok && "pdfBytes" in bytes) {
    writeFileSync(`${OUT}/${s.invoice_number}.pdf`, bytes.pdfBytes);
  }
  console.log("OK", s.invoice_number);
  ok += 1;
}
console.log({ ok, fail, out: OUT });
