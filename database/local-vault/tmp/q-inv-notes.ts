import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
function secret(name: string): string {
  const e = Deno.env.get(name);
  if (e) return e.trim();
  try {
    const t = Deno.readTextFileSync("local-secrets/secrets.env");
    const l = t.split(/\r?\n/).find((r) => r.startsWith(name + "="));
    return l ? l.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}
const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, notes")
  .eq("invoice_number", "INV-P-0001")
  .maybeSingle();
console.log(JSON.stringify(data, null, 2));
