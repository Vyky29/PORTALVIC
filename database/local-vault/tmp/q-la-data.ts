import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const { data: rows } = await admin
  .from("client_payments")
  .select("client_key, client_name, parent_name, sheet, data")
  .eq("sheet", "LA")
  .limit(10);
for (const r of rows || []) {
  console.log("---", r.client_name, "| key:", r.client_key);
  console.log(JSON.stringify(r.data));
}

// Which LA-funded invoices exist?
const { data: invs } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, payment_status, amount_gbp")
  .eq("payment_method_hint", "la_funded")
  .order("created_at", { ascending: true });
console.log("LA invoices:", JSON.stringify(invs));

// Participant names for those contacts.
const ids = Array.from(new Set((invs || []).map((i) => String(i.contact_id))));
if (ids.length) {
  const { data: pax } = await admin
    .from("portal_participants")
    .select("contact_id, display_name")
    .in("contact_id", ids);
  console.log("pax:", JSON.stringify(pax));
}
