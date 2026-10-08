/**
 * Xero credit note for refunds already marked paid (no parent WhatsApp/email).
 *
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-refund-xero-settle-backfill.ts
 *
 *   ENTRY_IDS=id1,id2 APPLY=1 ... (default: Chopi + Emmanuel Oct 2026)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { settleFamilyRefundAfterPayout } from "../../supabase/functions/_shared/portal_family_refund_settle.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DEFAULT_IDS =
  "ffe5de5a-e5b5-4f57-875b-3fc5e491126c,8d150470-10b1-4d4c-83bb-4570b91e3441";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const ids = (Deno.env.get("ENTRY_IDS") || DEFAULT_IDS).split(",").map((s) => s.trim()).filter(Boolean);

for (const id of ids) {
  const { data: entry, error } = await admin
    .from("portal_parent_family_credits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !entry) {
    console.error("missing", id, error?.message);
    continue;
  }
  console.log("\n---", entry.participant_display, entry.amount_gbp, entry.status, "---");
  if (!APPLY) {
    console.log("DRY RUN — set APPLY=1 to create Xero CN (notify_parent=false)");
    continue;
  }
  const settlement = await settleFamilyRefundAfterPayout(admin, entry, {
    notifyParent: false,
    sentByEmail: "office-refund-xero-settle-backfill",
    linkedInvoiceNumber: entry.contact_id === "409" ? "INV-P-0496" : null,
  });
  console.log(JSON.stringify(settlement, null, 2));
}
