/**
 * Read only. client_payments LA rows for Tinashe (Ealing + NHS / Virtual Wallet) and the contact funding label.
 *
 *   npx -y deno run -A database/local-vault/office-tinashe-nhs-ledger-row-20261015.ts
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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data } = await admin
  .from("client_payments")
  .select("client_key, client_name, sheet, data, imported_at")
  .ilike("client_key", "tinashe%");
for (const r of data || []) {
  const d = (r.data || {}) as Record<string, unknown>;
  const pick = Object.fromEntries(
    Object.entries(d).filter(([k]) => /funder|funding|client id|^po$|vat|year billed/i.test(k)),
  );
  console.log(`${r.client_key} | ${r.client_name} | ${r.sheet} | ${JSON.stringify(pick)}`);
}
const { data: c } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, funding_label")
  .eq("contact_id", "gap-tinashe-icloud")
  .maybeSingle();
console.log("contact funding_label:", c?.funding_label);
