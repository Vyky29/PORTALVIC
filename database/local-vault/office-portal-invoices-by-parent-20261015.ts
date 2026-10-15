/**
 * Read-only: portal invoice shares (portal_parent_invoice_share) for parents whose display name
 * matches a pattern - number, amount, schedule, status, paid date / via, Xero id and notes.
 *
 *   npx -y deno run -A database/local-vault/office-portal-invoices-by-parent-20261015.ts "Bakry"
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

const pattern = Deno.args.find((a) => !a.startsWith("--")) || "";
if (!pattern) Deno.exit(1);
const re = new RegExp(pattern, "i");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: parents } = await admin.from("portal_parent_contacts").select("contact_id, parent_display");
const ids = (parents || []).filter((p: any) => re.test(String(p.parent_display || ""))).map((p: any) => p.contact_id);
if (!ids.length) {
  console.log("no parent matches");
  Deno.exit(0);
}
const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .in("contact_id", ids)
  .order("invoice_number");
if (error) console.log(error.message);
for (const s of shares || []) {
  const who = (parents || []).find((p: any) => p.contact_id === s.contact_id)?.parent_display;
  console.log(
    `${s.invoice_number} | ${who} | £${s.amount_gbp} | ${s.payment_schedule || "-"} | ${s.payment_status || "-"} | paid ${s.paid_at || "-"} via ${s.paid_via || "-"} | xero ${s.xero_invoice_id ? "yes" : "no"} | created ${String(s.created_at || "").slice(0, 10)}`,
  );
  console.log(`    ${String(s.notes || "").replace(/\s+/g, " ").slice(0, 300)}`);
}
