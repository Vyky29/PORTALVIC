/**
 * Retry Xero push for paid/partial INV-Ps stuck with xero_push_status=failed.
 *
 *   npx -y deno run -A database/local-vault/office-retry-xero-failed-paid.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("database/local-vault/private/xero-secrets.env");
loadEnv("local-secrets/xero.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: need, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, payment_status, xero_push_error, xero_invoice_id",
  )
  .eq("xero_push_status", "failed")
  .in("payment_status", ["paid", "partial"])
  .is("xero_invoice_id", null)
  .order("updated_at", { ascending: false });

if (error) {
  console.error(error);
  Deno.exit(1);
}
console.log("need push", (need || []).length);
for (const row of need || []) {
  console.log("\n→", row.invoice_number, row.payment_status, row.xero_push_error);
  const r = await pushPortalInvoiceShareToXero(admin, row.id);
  console.log(JSON.stringify(r));
  await new Promise((res) => setTimeout(res, 1500));
}
console.log("\ndone");
