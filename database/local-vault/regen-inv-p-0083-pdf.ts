import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

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

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: share } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .eq("invoice_number", "INV-P-0083")
  .maybeSingle();
if (!share) {
  console.error("INV-P-0083 missing");
  Deno.exit(1);
}
const r = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
console.log(JSON.stringify(r, null, 2));
if (!r?.ok) Deno.exit(1);
