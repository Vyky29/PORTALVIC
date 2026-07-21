import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch { return ""; }
}
const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: map, error } = await admin.from("portal_xero_product_map").select("*").order("sort_order");
if (error) throw error;
const { data: items, error: itemError } = await admin.from("portal_xero_items").select("*");
if (itemError) throw itemError;
const wanted = new Set<string>();
for (const r of map || []) {
  if (r.xero_item_code_vat) wanted.add(String(r.xero_item_code_vat));
  if (r.xero_item_code_exempt) wanted.add(String(r.xero_item_code_exempt));
}
console.log("MAP", JSON.stringify(map, null, 2));
console.log("ITEMS", JSON.stringify((items || []).filter((r) =>
  wanted.has(String(r.code || r.item_code || r.xero_item_code || ""))
), null, 2));
const { data: inv } = await admin.from("portal_parent_invoice_share")
  .select("invoice_number,line_items").eq("invoice_number","INV-P-0079").maybeSingle();
console.log("INV", JSON.stringify(inv, null, 2));
