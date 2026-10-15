/**
 * Read only. Stripe payouts and GoCardless payouts (since 1 Sep) broken down to the charges /
 * payments inside each one, with fees, so each Tide payout line can be matched to Xero invoices.
 *
 *   npx -y deno run -A database/local-vault/office-stripe-gc-payouts-breakdown-20261015.ts [--since=2026-09-01] [--json=path]
 */
import { gocardlessRequest } from "../../supabase/functions/_shared/gocardless.ts";

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

const since = (Deno.args.find((a) => a.startsWith("--since=")) || "--since=2026-09-01").slice(8);
const jsonOut = (Deno.args.find((a) => a.startsWith("--json=")) || "").slice(7);
const sinceTs = Math.floor(Date.parse(since + "T00:00:00Z") / 1000);
const key = (Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
const out: Record<string, unknown> = { stripe: [], gocardless: [] };

async function stripe(path: string): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  return r.ok ? r.json() : { error: r.status, body: (await r.text()).slice(0, 200) };
}
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

if (!key) console.log("STRIPE_SECRET_KEY missing");
else {
  const payouts = await stripe(`payouts?limit=100&created[gte]=${sinceTs}`);
  console.log(`STRIPE payouts since ${since}: ${(payouts.data || []).length}${payouts.error ? " error " + payouts.error : ""}`);
  for (const p of (payouts.data || []).slice().reverse()) {
    const bt = await stripe(`balance_transactions?payout=${p.id}&limit=100&expand[]=data.source`);
    const rows = (bt.data || []).filter((t: any) => t.type !== "payout");
    const items = rows.map((t: any) => {
      const s = t.source || {};
      const md = s.metadata || {};
      const who = s.billing_details?.name || s.receipt_email || md.parent_name || "";
      const inv = md.invoice_number || md.invoice || (String(s.description || "").match(/INV-P-\d{4}(-R\d+)?/) || [])[0] || "";
      return { type: t.type, gross: t.amount / 100, fee: t.fee / 100, net: t.net / 100, created: day(t.created), inv, who, desc: String(s.description || t.description || "").slice(0, 60) };
    });
    (out.stripe as unknown[]).push({ id: p.id, arrival: day(p.arrival_date), amount: p.amount / 100, status: p.status, items });
    console.log(`\n${day(p.arrival_date)} | payout £${(p.amount / 100).toFixed(2)} | ${p.status} | ${items.length} items`);
    for (const i of items) console.log(`   ${i.created} | ${i.type} | gross £${i.gross} | fee £${i.fee} | net £${i.net} | ${i.inv || "-"} | ${i.who || "-"} | ${i.desc}`);
  }
}

try {
  const gp: any = await gocardlessRequest("GET", `/payouts?created_at[gte]=${since}T00:00:00Z&limit=100`);
  const list = gp?.payouts || gp?.data?.payouts || [];
  console.log(`\nGOCARDLESS payouts since ${since}: ${list.length}`);
  for (const p of list.slice().reverse()) {
    const it: any = await gocardlessRequest("GET", `/payout_items?payout=${p.id}&limit=500`);
    const items = it?.payout_items || it?.data?.payout_items || [];
    const rows = [];
    for (const x of items) {
      const pid = x.links?.payment;
      let pay: any = null;
      if (pid) {
        const pr: any = await gocardlessRequest("GET", `/payments/${pid}`);
        pay = pr?.payments || pr?.data?.payments || null;
      }
      rows.push({ type: x.type, amount: Number(x.amount) / 100, payment: pid || "", desc: pay?.description || "", ref: pay?.reference || "", md: pay?.metadata || {}, charge: pay?.charge_date || "" });
    }
    (out.gocardless as unknown[]).push({ id: p.id, arrival: p.arrival_date, amount: Number(p.amount) / 100, fees: Number(p.deducted_fees) / 100, items: rows });
    console.log(`\n${p.arrival_date} | payout £${(Number(p.amount) / 100).toFixed(2)} | fees £${(Number(p.deducted_fees) / 100).toFixed(2)} | ${rows.length} items`);
    for (const r of rows) console.log(`   ${r.type} | £${r.amount} | ${r.charge} | ${r.desc} | ${r.ref} | ${JSON.stringify(r.md).slice(0, 80)}`);
  }
} catch (e) {
  console.log("GoCardless error", String(e).slice(0, 200));
}
if (jsonOut) Deno.writeTextFileSync(jsonOut, JSON.stringify(out, null, 2));
