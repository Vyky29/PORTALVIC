/**
 * Email funder invoices to Sevitha at admin@clubsensational.org.
 *
 * Dry:
 *   MONTH=2026-09 PACKS=hf,nhs_ila npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/send-funder-invoices-sevitha.ts
 * Send:
 *   APPLY=1 MONTH=2026-09 PACKS=hf,nhs_ila npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/send-funder-invoices-sevitha.ts
 *
 * PACKS: hf, nhs, nhs_ila
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  sendFunderInvoicesToSevitha,
  type FunderPack,
} from "../../supabase/functions/_shared/portal_funder_invoice_mail.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const MONTH = (Deno.env.get("MONTH") || "").trim();
const PACKS = (Deno.env.get("PACKS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter((s): s is FunderPack => s === "hf" || s === "nhs" || s === "nhs_ila");

function loadEnvFile(path: string) {
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
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");
loadEnvFile("database/local-vault/secrets.env");

if (!/^\d{4}-\d{2}$/.test(MONTH) || !PACKS.length) {
  console.error("Need MONTH=YYYY-MM and PACKS=hf,nhs_ila");
  Deno.exit(1);
}

console.log(APPLY ? "SEND" : "DRY", MONTH, PACKS.join(","), "→ admin@clubsensational.org");
if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1 to send.");
  Deno.exit(0);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const result = await sendFunderInvoicesToSevitha(admin, { ym: MONTH, packs: PACKS });
console.log(result);
if (!result.ok) Deno.exit(1);
