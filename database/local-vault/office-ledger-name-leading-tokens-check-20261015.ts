/**
 * Read only. Which portal participants would match an LA / Direct Payments ledger row by the
 * "leading tokens" rule (ledger "Amar Rai" opens portal "Amar Rai Singh")? Shows the row each gets now.
 *
 *   npx -y deno run -A database/local-vault/office-ledger-name-leading-tokens-check-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveParticipantInvoiceFunding } from "../../supabase/functions/_shared/portal_invoice_funding.ts";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const { data: ledger } = await admin.from("client_payments").select("client_key, client_name, sheet").in("sheet", ["LA", "DIRECT_PAYMENTS"]).limit(400);
const { data: pax } = await admin.from("portal_participants").select("contact_id, display_name, first_name, last_name").limit(2000);
let hits = 0;
for (const p of pax || []) {
  const name = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
  const t = norm(name).split(/\s+/).filter(Boolean);
  for (const r of ledger || []) {
    const c = norm(r.client_name).split(/\s+/).filter((x) => x && x !== "acat");
    if (c.length >= 2 && c.length < t.length && c.every((x, i) => x === t[i])) {
      hits++;
      const f = await resolveParticipantInvoiceFunding(admin, { contactId: p.contact_id, displayName: name });
      console.log(`${name} (${p.contact_id}) <- ledger ${r.client_name} (${r.client_key}, ${r.sheet}) | resolves client ${f.clientId || "-"} | ${f.fundingLabel} | ${f.source}`);
    }
  }
}
console.log(`leading-token pairs: ${hits}`);
