/**
 * Regenerate H&F monthly PDFs only (e.g. after PO Number layout fix).
 *   APPLY=1 npx -y deno run -A database/local-vault/office-hf-monthly-invp-regen-pdfs.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false } },
);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .like("ready_by", "office_funder_2627_hf_month_%")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

console.log(`H&F monthly PDFs to regen: ${(shares || []).length} · ${APPLY ? "APPLY" : "dry-run"}`);

let ok = 0;
let fail = 0;
for (const s of shares || []) {
  if (!APPLY) {
    console.log("would regen", s.invoice_number);
    ok += 1;
    continue;
  }
  const r = await regeneratePortalInvoiceSharePdf(admin, String(s.id));
  if (!r.ok) {
    console.error("FAIL", s.invoice_number, r.error);
    fail += 1;
  } else {
    console.log("OK", s.invoice_number);
    ok += 1;
  }
}

// Year drafts too (same PO layout)
const { data: drafts } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .like("ready_by", "office_funder_2627_hf_year_draft_%")
  .neq("payment_status", "void");
for (const s of drafts || []) {
  if (!APPLY) {
    console.log("would regen draft", s.invoice_number);
    ok += 1;
    continue;
  }
  const r = await regeneratePortalInvoiceSharePdf(admin, String(s.id));
  if (!r.ok) {
    console.error("FAIL draft", s.invoice_number, r.error);
    fail += 1;
  } else {
    console.log("OK draft", s.invoice_number);
    ok += 1;
  }
}

console.log(`Done ok=${ok} fail=${fail}`);
