/**
 * INV-0391: NHS refused the uplift in Aug (CN-0395), then validated it and paid on 7 Sep
 * and again on 15 Oct. One payment is extra, £223.30, with one credit note.
 * Updates the office note on the CN-0391 refund row.
 *
 *   npx -y deno run -A database/local-vault/office-nhs-0391-ledger-note-cn0395-20261015.ts
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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const notes =
  "INV-0391 (Emanuel uplift £223.30): NHS refused it in Aug (CN-0395, 26 Aug 2026), then validated the uplifts and paid it on 7 Sep (remittance 925522) and again on 15 Oct 2026. " +
  "One payment is the valid uplift; one is extra. Owed back £223.30 with ONE credit note: keep CN-0395 or CN-0391 and void the other in Xero. PDF: documents/credit-notes/CN-0391.pdf";

const { data, error } = await admin
  .from("portal_parent_family_credits")
  .update({ notes, updated_at: new Date().toISOString() })
  .eq("contact_id", "gap-emanuel-dodson")
  .eq("linked_invoice_number", "INV-0391")
  .eq("xero_credit_note_number", "CN-0391")
  .select("id, amount_gbp, status");
if (error) throw new Error(error.message);
console.log(data);
