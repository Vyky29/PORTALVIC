/**
 * Read-only: portal invoice shares by invoice number - status, amounts, paid date / via, Xero link, notes.
 * Base numbers also match their -R1 / -R2 reissues.
 *
 *   npx -y deno run -A database/local-vault/office-portal-invoices-by-number-20261015.ts INV-P-0105 INV-P-0139 [--keys]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
loadEnv("local-secrets/edge-secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const nums = Deno.args.filter((a) => !a.startsWith("--"));
if (!nums.length) Deno.exit(1);
const showKeys = Deno.args.includes("--keys");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: parents } = await admin.from("portal_parent_contacts").select("contact_id, parent_display");
const orFilter = nums.map((n) => `invoice_number.ilike.${n}%`).join(",");
const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .or(orFilter)
  .order("invoice_number");
if (error) console.log(error.message);
if (showKeys && shares?.[0]) console.log(Object.keys(shares[0]).join(", "));
for (const s of shares || []) {
  const who = (parents || []).find((p: any) => p.contact_id === s.contact_id)?.parent_display || s.contact_id;
  console.log(
    `${s.invoice_number} | ${who} | £${s.amount_gbp} | paid £${s.amount_paid_gbp ?? s.amount_paid ?? "-"} | ${s.payment_status || "-"} | ${s.share_status || "-"} | paid ${String(s.paid_at || "-").slice(0, 10)} via ${s.paid_via || "-"} | xero ${s.xero_invoice_id ? "yes" : "no"}`,
  );
  console.log(`    ${String(s.notes || "").replace(/\s+/g, " ").slice(0, 260)}`);
}
