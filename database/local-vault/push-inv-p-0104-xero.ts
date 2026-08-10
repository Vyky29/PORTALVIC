/**
 * One-off: push INV-P-0104 to Xero (awaiting payment, with credit line).
 *   deno run --allow-env --allow-net --allow-read database/local-vault/push-inv-p-0104-xero.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

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

loadEnv(path.join(root, "database/local-vault/private/parent-portal-secrets.env"));
loadEnv(path.join(root, "local-secrets/secrets.env"));

const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !key) {
  console.error("Missing Supabase env");
  Deno.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: oauth } = await admin
  .from("portal_xero_oauth")
  .select("refresh_token")
  .limit(1)
  .maybeSingle();
if (oauth?.refresh_token) Deno.env.set("XERO_REFRESH_TOKEN", String(oauth.refresh_token));

const SHARE_ID = "78e42ce3-ab35-4d58-acb2-40749fabcaea";

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, xero_invoice_id, line_items")
  .eq("id", SHARE_ID)
  .maybeSingle();
if (error || !share) {
  console.error("Serine replacement invoice not found", error?.message);
  Deno.exit(1);
}

console.log("pushing", share.invoice_number, "amount", share.amount_gbp);
const r = await pushPortalInvoiceShareToXero(admin, String(share.id));
console.log(JSON.stringify(r, null, 2));

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, amount_gbp, xero_invoice_id, xero_payment_id, xero_push_status, xero_push_error",
  )
  .eq("id", share.id)
  .single();
console.log("after", after);
if (!r.ok) Deno.exit(1);
