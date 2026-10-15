/**
 * INV-0391 was already cancelled by CN-0395 (26 Aug 2026, uplift not required: package
 * started after 1 Apr 2026). NHS still paid it on 7 Sep and 15 Oct, so £446.60 is owed back.
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
  "INV-0391 (Emanuel uplift £223.30) was cancelled by CN-0395 on 26 Aug 2026 (uplift not required, package started after 1 Apr 2026). " +
  "NHS W&N ICB still paid it twice: remittance 925522 3 Sep 2026 (in Tide 7 Sep) and again 15 Oct 2026. " +
  "Owed back £446.60 in total: CN-0395 covers the first payment, CN-0391 (this row) the second. Send both to NHS. PDF: documents/credit-notes/CN-0391.pdf";

const { data, error } = await admin
  .from("portal_parent_family_credits")
  .update({ notes, updated_at: new Date().toISOString() })
  .eq("contact_id", "gap-emanuel-dodson")
  .eq("linked_invoice_number", "INV-0391")
  .eq("xero_credit_note_number", "CN-0391")
  .select("id, amount_gbp, status");
if (error) throw new Error(error.message);
console.log(data);
