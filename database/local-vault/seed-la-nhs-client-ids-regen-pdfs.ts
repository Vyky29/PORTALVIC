/**
 * Seed LA / NHS Client ID + PO on client_payments, hide funder INV-Ps from the
 * parent hub (share_status=hidden), and regenerate PDFs without participant names.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-net --allow-read \
 *     database/local-vault/seed-la-nhs-client-ids-regen-pdfs.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** client_key → { clientId, po? } */
const SEED: Record<string, { clientId: string; po?: string }> = {
  /* H&F */
  "adam-p": { clientId: "70416281", po: "FW10561494" },
  "abodi-patel": { clientId: "2744795", po: "9005466730" },
  simon: { clientId: "2633551", po: "9005737675" },
  yassir: { clientId: "62016161", po: "FW10559382" },
  faris: { clientId: "2399946", po: "9005739631" },
  saiib: { clientId: "2741139", po: "9005705437" },
  haneef: { clientId: "2396503", po: "9005711782" },
  elijah: { clientId: "2500772", po: "9005340499" },
  /* Ealing */
  "adaam-ah": { clientId: "721303" },
  "amaar-ah": { clientId: "782835" },
  "aydaan-ah": { clientId: "780469" },
  samer: { clientId: "972515" },
  steven: { clientId: "719915" },
  tinashe: { clientId: "724579" },
  "amar-rai": { clientId: "626186" },
  "yousef-al": { clientId: "790419" },
  /* NHS */
  fadi: { clientId: "613434", po: "XXPRASHERV1" },
  "ikram-omar": { clientId: "572135", po: "XXPRASHERV1" },
  emanuel: { clientId: "474280", po: "XXPRASHERV1" },
  timi: { clientId: "477032", po: "XXPRASHERV1" },
  /* NHS / ILA (separate LA sheet row) */
  "tinashe-nhs": { clientId: "594072", po: "910006639" },
};

const REGEN_INVOICES = ["INV-P-0001", "INV-P-0127", "INV-P-0128", "INV-P-0129"];

console.log("Seed targets:", Object.keys(SEED).length);
console.log("Regen invoices:", REGEN_INVOICES.join(", "));

if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1");
  Deno.exit(0);
}

const { data: rows, error } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, data, sheet")
  .eq("sheet", "LA");
if (error) {
  console.error("client_payments", error.message);
  Deno.exit(1);
}

let seeded = 0;
for (const row of rows || []) {
  const key = String(row.client_key || "").trim();
  const seed = SEED[key];
  if (!seed) continue;
  const data = { ...((row.data as Record<string, unknown>) || {}) };
  data["Client Id"] = seed.clientId;
  data["Client ID"] = seed.clientId;
  if (seed.po) {
    data.PO = seed.po;
    data.po = seed.po;
  }
  const { error: up } = await admin
    .from("client_payments")
    .update({ data })
    .eq("id", row.id);
  if (up) {
    console.error("seed fail", key, up.message);
    Deno.exit(1);
  }
  console.log("seeded", key, row.client_name, seed.clientId, seed.po || "—");
  seeded += 1;
}
console.log("seeded rows:", seeded);

const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, share_status, payment_method_hint")
  .in("invoice_number", REGEN_INVOICES);
if (shErr) {
  console.error("shares", shErr.message);
  Deno.exit(1);
}

for (const share of shares || []) {
  if (String(share.payment_method_hint || "") !== "la_funded") continue;
  if (String(share.share_status || "") !== "hidden") {
    const { error: hideErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        share_status: "hidden",
        updated_at: new Date().toISOString(),
      })
      .eq("id", share.id);
    if (hideErr) {
      console.error("hide", share.invoice_number, hideErr.message);
      Deno.exit(1);
    }
    console.log("hidden from parent hub", share.invoice_number);
  }
  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log("pdf", share.invoice_number, pdf);
  if (!pdf?.ok) {
    console.error("pdf failed", share.invoice_number);
    Deno.exit(1);
  }
}

console.log("OK — Client IDs/POs seeded; LA/NHS INV-Ps hidden from parents; PDFs regenerated.");
