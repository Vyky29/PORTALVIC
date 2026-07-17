/**
 * Regenerate all ready re-enrolment invoice PDFs (family bill-to + layout).
 * APPLY=1 to write.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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

const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id,invoice_number,payment_method_hint")
  .eq("created_via", "reenrolment")
  .eq("share_status", "ready")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

console.log(`${data?.length || 0} invoice(s) to regenerate`);
if (!APPLY) {
  console.log(data?.map((r) => r.invoice_number).join(", "));
  console.log("Dry run — set APPLY=1 to write.");
  Deno.exit(0);
}

let ok = 0;
let fail = 0;
for (const row of data || []) {
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
  if (regen.ok) {
    ok++;
    console.log(`${row.invoice_number}: ok`);
  } else {
    fail++;
    console.log(`${row.invoice_number}: ${regen.error}`);
  }
}
console.log(`Done — ${ok} ok, ${fail} failed.`);
