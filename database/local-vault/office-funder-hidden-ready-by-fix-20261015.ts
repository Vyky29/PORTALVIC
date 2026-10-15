/**
 * createPortalFamilyInvoice only stores ready_by when share_status is "ready". Hidden funder INV-Ps
 * created 15 Oct 2026 lost their funder key, so the PDF fell back to the participant's default funder
 * (Tinashe -> Ealing BST / 514985). Sets ready_by from the marker at the start of notes, keeps them
 * hidden, and regenerates the PDFs.
 *
 *   npx -y deno run -A database/local-vault/office-funder-hidden-ready-by-fix-20261015.ts [--apply]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

function loadEnv(path: string) {
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
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const APPLY = Deno.args.includes("--apply");
const TARGETS: Record<string, string> = {
  "INV-P-0555": "docs/finance/nhs-oct-2026-4week",
  "INV-P-0556": "docs/finance/tinashe-nhs-2026-27",
  "INV-P-0557": "docs/finance/tinashe-nhs-2026-27",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, ready_by, share_status, notes, xero_invoice_id")
  .in("invoice_number", Object.keys(TARGETS));
if (error) throw error;

for (const r of rows || []) {
  const m = /^(office_funder_\d{4}_(?:nhs|hf|ealing)_month_\d{4}-\d{2}_[a-z0-9-]+)\b/.exec(String(r.notes || ""));
  if (!m) throw new Error(`${r.invoice_number}: no funder marker in notes`);
  const notes = String(r.notes || "").replace(/\s*LA bill-to: Business Support Team \(BST\)[\s\S]*$/, "");
  console.log(`${r.invoice_number}: ready_by ${r.ready_by || "null"} → ${m[1]} · ${r.share_status} · xero ${r.xero_invoice_id ? "yes" : "no"}`);
  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({ ready_by: m[1], notes, updated_at: new Date().toISOString() })
    .eq("id", r.id);
  if (upErr) throw upErr;
  const stored = await regeneratePortalInvoiceSharePdf(admin, r.id);
  if (!stored.ok) throw new Error(`${r.invoice_number} pdf ${stored.error}`);
  const bytes = await regeneratePortalInvoiceSharePdf(admin, r.id, { mode: "bytes" });
  if (!bytes.ok || !("pdfBytes" in bytes)) throw new Error(`${r.invoice_number} bytes`);
  const out = TARGETS[r.invoice_number];
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/${r.invoice_number}.pdf`, bytes.pdfBytes);
  console.log("   WROTE", `${out}/${r.invoice_number}.pdf`);
}
if (!APPLY) console.log("Dry run. Re-run with --apply");
