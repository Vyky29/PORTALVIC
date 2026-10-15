/**
 * Read only. Where are the Ealing bank receipts in Xero? Looks for the LB Ealing amounts in
 * Payments, BankTransactions (receive money), Overpayments, Prepayments, and lists every invoice
 * to the Ealing contacts (any total, including £0) from Sep 2025.
 *
 *   npx -y deno run -A database/local-vault/office-ealing-xero-find-receipts-20261015.ts
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
  console.log("xero auth failed: reconnect Xero, then re-run");
  Deno.exit(1);
}
const h = xeroAuthHeaders(token);
const day = (s: unknown) => {
  const m = /Date\((\d+)/.exec(String(s));
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").slice(0, 10);
};

/** Ealing bank receipts for the 2025/26 cycles, from Tide. */
const BANK = [
  ["2025-10-27", 2929.84], ["2025-12-04", 2929.84], ["2025-12-08", 2929.84], ["2026-01-26", 2929.84],
  ["2026-03-02", 2929.84], ["2026-03-16", 2383.11], ["2026-04-23", 3862.7], ["2026-05-18", 2317.62],
  ["2026-06-22", 5057.92], ["2026-07-16", 3527.44], ["2026-08-13", 3527.44], ["2026-09-24", 10748.0],
  ["2026-10-12", 3090.16],
] as const;
const AMTS = new Set(BANK.map((b) => b[1].toFixed(2)));
const EALING = /ealing|business support team|bst/i;

async function pageAll(path: string, key: string) {
  const out: any[] = [];
  for (let page = 1; page < 80; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${XERO_API}/${path}${sep}page=${page}`, { headers: h });
    if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const rows = j[key] || [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

const since = encodeURIComponent("Date>=DateTime(2025,09,01)");

console.log("\n== Payments matching an Ealing bank amount or an Ealing contact");
const payments = await pageAll(`Payments?where=${since}`, "Payments");
for (const p of payments) {
  const amt = Number(p.Amount).toFixed(2);
  const c = p.Invoice?.Contact?.Name || "";
  if (!AMTS.has(amt) && !EALING.test(c)) continue;
  console.log(
    `${day(p.Date)} | ${amt} | ${p.Status} | ${p.PaymentType} | inv ${p.Invoice?.InvoiceNumber || "-"} (${c}) | reconciled ${p.IsReconciled} | ref ${p.Reference || ""}`,
  );
}

console.log("\n== Bank transactions (receive money etc.) matching");
const bts = await pageAll(`BankTransactions?where=${since}`, "BankTransactions").catch((e) => {
  console.log("   not readable with this Xero connection:", String(e).slice(0, 80));
  return [] as any[];
});
for (const b of bts) {
  const amt = Number(b.Total).toFixed(2);
  const c = b.Contact?.Name || "";
  if (!AMTS.has(amt) && !EALING.test(c)) continue;
  const lines = (b.LineItems || []).map((l: any) => `${(l.Description || "").slice(0, 60)} ${l.AccountCode || ""} ${l.LineAmount}`).join(" ; ");
  console.log(`${day(b.Date)} | ${amt} | ${b.Type} | ${b.Status} | ${c} | reconciled ${b.IsReconciled} | ref ${b.Reference || ""} | ${lines}`);
}

console.log("\n== Overpayments / prepayments to Ealing contacts");
for (const [path, key] of [["Overpayments", "Overpayments"], ["Prepayments", "Prepayments"]] as const) {
  const rows = await pageAll(path, key).catch((e) => {
    console.log(`   ${key} not readable:`, String(e).slice(0, 80));
    return [] as any[];
  });
  for (const o of rows) {
    const c = o.Contact?.Name || "";
    if (!EALING.test(c) && !AMTS.has(Number(o.Total).toFixed(2))) continue;
    console.log(`${key} ${day(o.Date)} | ${o.Total} | remaining ${o.RemainingCredit} | ${o.Status} | ${c}`);
  }
}

console.log("\n== All invoices to Ealing contacts since Sep 2025 (any total)");
const invs = await pageAll(`Invoices?where=${encodeURIComponent('Type=="ACCREC" AND Date>=DateTime(2025,09,01)')}`, "Invoices");
const eal = invs.filter((x) => EALING.test(x.Contact?.Name || ""));
eal.sort((a, b) => day(a.Date).localeCompare(day(b.Date)));
for (const x of eal) {
  const desc = (x.LineItems || []).map((l: any) => (l.Description || "").replace(/\s+/g, " ")).join(" / ");
  const cref = desc.match(/Client Ref:?\s*\d+\s*\(([^)]+)\)/i);
  const cid = desc.match(/(\d{6,7}\/\d{6})|Client Id:?\s*(\d{6})/i);
  console.log(
    `${x.InvoiceNumber} | ${day(x.Date)} | ${x.Status} | total ${x.Total} paid ${x.AmountPaid} cred ${x.AmountCredited} due ${x.AmountDue} | ${x.Contact?.Name} | ${x.Reference || ""} | ${cid ? cid[0] : ""} ${cref ? cref[1] : ""}`,
  );
}
console.log(`\nTotal ACCREC since Sep 2025: ${invs.length}; to Ealing contacts: ${eal.length}`);
await xeroPersistRefreshToDb(admin);
