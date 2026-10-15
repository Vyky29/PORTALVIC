/**
 * Read only. Xero bank statement lines for the LB Ealing receipts: reconciled or not.
 * Uses Accounts (bank accounts) + Reports/BankStatement.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-xero-bank-lines-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XERO_API, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) {
  console.log("xero auth failed");
  Deno.exit(1);
}
const h = xeroAuthHeaders(token);

const ar = await fetch(`${XERO_API}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`, { headers: h });
if (!ar.ok) {
  console.log("Accounts not readable", ar.status, (await ar.text()).slice(0, 200));
  Deno.exit(0);
}
const banks = (await ar.json()).Accounts || [];
for (const b of banks) console.log(`bank account: ${b.Name} | ${b.AccountID} | ${b.Status}`);

const WANT = /ealing/i;
const AMTS = new Set(["2929.84", "2383.11", "3862.70", "2317.62", "5057.92", "3527.44", "10748.00", "3090.16"]);
for (const b of banks) {
  const url = `${XERO_API}/Reports/BankStatement?bankAccountID=${b.AccountID}&fromDate=2025-09-01&toDate=2026-10-15`;
  const r = await fetch(url, { headers: h });
  if (!r.ok) {
    console.log(`BankStatement ${b.Name}: ${r.status} ${(await r.text()).slice(0, 160)}`);
    continue;
  }
  const rep = (await r.json()).Reports?.[0];
  const header = rep?.Rows?.find((x: any) => x.RowType === "Header")?.Cells?.map((c: any) => c.Value) || [];
  console.log(`\n== ${b.Name} columns: ${header.join(" | ")}`);
  for (const sec of rep?.Rows || []) {
    for (const row of sec.Rows || []) {
      const cells = (row.Cells || []).map((c: any) => String(c.Value ?? ""));
      const blob = cells.join(" | ");
      const hasAmt = cells.some((c: string) => AMTS.has(Number(c.replace(/,/g, "")).toFixed(2)));
      if (WANT.test(blob) || hasAmt) console.log("   " + blob);
    }
  }
}
await xeroPersistRefreshToDb(admin);
