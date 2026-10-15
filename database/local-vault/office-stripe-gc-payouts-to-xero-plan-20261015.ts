/**
 * Read only. For each Stripe / GoCardless payout still to reconcile on Tide, map every charge to the
 * portal INV-P and its live Xero invoice, and show fees (+ Stripe card surcharge) so the payout can
 * be matched: invoice payments + one fee/surcharge adjustment = payout.
 *
 * Input: payouts JSON from office-stripe-gc-payouts-breakdown-20261015.ts --json=...
 *   npx -y deno run -A database/local-vault/office-stripe-gc-payouts-to-xero-plan-20261015.ts \
 *     database/local-vault/private/ealing-mail/payouts_sep_oct.json [--from=2026-09-10] [--json=out]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XERO_API, xeroAccessToken, xeroAuthHeaders } from "../../supabase/functions/_shared/xero_auth.ts";
import { xeroHydrateRefreshFromDb, xeroPersistRefreshToDb } from "../../supabase/functions/_shared/xero_oauth_store.ts";
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

const input = Deno.args.find((a) => !a.startsWith("--")) || "database/local-vault/private/ealing-mail/payouts_sep_oct.json";
const from = (Deno.args.find((a) => a.startsWith("--from=")) || "--from=2026-09-10").slice(7);
const jsonOut = (Deno.args.find((a) => a.startsWith("--json=")) || "").slice(7);
const payouts = JSON.parse(Deno.readTextFileSync(input));
const r2 = (n: number) => Math.round(n * 100) / 100;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/* Portal paid instalments */
const { data: shares } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, amount_gbp, payment_schedule, paid_at, paid_via, payment_status, notes")
  .gte("updated_at", "2026-07-01");
const { data: allShares } = await admin.from("portal_parent_invoice_share").select("id, invoice_number, notes");
const shareById = new Map((allShares || []).map((x: any) => [String(x.id), x]));
const shareByNum = new Map((allShares || []).map((x: any) => [String(x.invoice_number), x]));
/* Schedule copies point at the real (tracker) INV-P in notes. */
const realInv = (inv: string) => {
  const sh: any = shareByNum.get(inv);
  const m = String(sh?.notes || "").match(/Consolidated payment tracker:\s*([0-9a-f-]{20,80})/i);
  const t: any = m ? shareById.get(m[1]) : null;
  return t && t.invoice_number ? String(t.invoice_number) : inv;
};
const toks = (s: string) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const nameScore = (a: string, b: string) => { const A = new Set(toks(a)); return toks(b).filter((w) => A.has(w)).length; };
const { data: parents } = await admin.from("portal_parent_contacts").select("contact_id, parent_display");
const parentBy = new Map((parents || []).map((p: any) => [String(p.contact_id), String(p.parent_display || "")]));
type Paid = { inv: string; contact: string; parent: string; date: string; amount: number; via: string; used?: boolean };
const paid: Paid[] = [];
for (const s of shares || []) {
  const sched = Array.isArray(s.payment_schedule) ? s.payment_schedule : [];
  const ps = sched.filter((x: any) => String(x.status) === "paid" && x.paid_at);
  const rows = ps.length
    ? ps.map((x: any) => ({ date: String(x.paid_at).slice(0, 10), amount: Number(x.amount_gbp), via: String(x.paid_via || s.paid_via || "") }))
    : s.paid_at ? [{ date: String(s.paid_at).slice(0, 10), amount: Number(s.amount_gbp), via: String(s.paid_via || "") }] : [];
  for (const r of rows) paid.push({ inv: s.invoice_number, contact: String(s.contact_id), parent: parentBy.get(String(s.contact_id)) || "", ...r });
}

/* Xero INV-P invoices */
await xeroHydrateRefreshFromDb(admin);
const token = await xeroAccessToken();
await xeroPersistRefreshToDb(admin);
if (!token) Deno.exit(1);
const h = xeroAuthHeaders(token);
const xinv = new Map<string, any[]>();
for (let page = 1; page < 20; page++) {
  const r = await fetch(`${XERO_API}/Invoices?where=${encodeURIComponent('Type=="ACCREC"&&Date>=DateTime(2026,06,01)')}&page=${page}&summaryOnly=true`, { headers: h });
  if (!r.ok) console.log("xero invoices", r.status, (await r.text()).slice(0, 200));
  const list = r.ok ? (await r.clone().json()).Invoices || [] : [];
  for (const i of list) {
    if (["VOIDED", "DELETED"].includes(i.Status) || !String(i.InvoiceNumber).startsWith("INV-P-")) continue;
    const base = String(i.InvoiceNumber).replace(/-R\d+$/, "");
    xinv.set(base, [...(xinv.get(base) || []), i]);
  }
  if (list.length < 100) break;
}
console.log(`Xero INV-P invoices loaded: ${xinv.size}`);
const xeroFor = (inv: string) => {
  const list = xinv.get(String(inv).replace(/-R\d+$/, "")) || [];
  return list.find((i) => i.Status === "AUTHORISED") || list[0] || null;
};
const xeroTxt = (x: any, amount: number) => {
  if (!x) return "NOT IN XERO";
  const flag = x.Status !== "AUTHORISED" ? ` (${x.Status})` : Number(x.AmountDue) + 0.005 < amount ? ` (due only £${x.AmountDue})` : "";
  return `${x.InvoiceNumber} ${x.Contact?.Name || ""} due £${x.AmountDue}${flag}`;
};

async function gcCustomerName(paymentId: string): Promise<string> {
  const p: any = await gocardlessRequest("GET", `/payments/${paymentId}`);
  const mandate = p?.data?.payments?.links?.mandate;
  if (!mandate) return "";
  const m: any = await gocardlessRequest("GET", `/mandates/${mandate}`);
  const cust = m?.data?.mandates?.links?.customer;
  if (!cust) return "";
  const c: any = await gocardlessRequest("GET", `/customers/${cust}`);
  const cc = c?.data?.customers || {};
  return [cc.given_name, cc.family_name].filter(Boolean).join(" ") || cc.company_name || cc.email || "";
}

const plan: unknown[] = [];
console.log("STRIPE");
for (const p of payouts.stripe || []) {
  if (p.arrival < from) continue;
  let invTotal = 0, fees = 0, surcharge = 0;
  const lines: string[] = [];
  const items = [];
  for (const it of p.items) {
    fees += it.fee;
    const c = paid
      .filter((x) => !x.used && /stripe|card|payment_link/i.test(x.via) && dayDiff(x.date, it.created) <= 3 && x.amount <= it.gross + 0.005 && it.gross <= x.amount * 1.06 + 0.01)
      .sort((a, b) => nameScore(it.who, b.parent) - nameScore(it.who, a.parent) || dayDiff(a.date, it.created) - dayDiff(b.date, it.created) || (b.amount - a.amount));
    const hit = c[0];
    if (hit) {
      hit.used = true;
      invTotal += hit.amount;
      surcharge += it.gross - hit.amount;
      const x = xeroFor(hit.inv);
      items.push({ inv: hit.inv, xero: x?.InvoiceNumber || null, amount: hit.amount, gross: it.gross, fee: it.fee });
      lines.push(`   ${it.created} ${it.who || "-"} gross £${it.gross} fee £${it.fee} -> ${hit.inv} £${hit.amount} (${hit.parent}) | Xero ${xeroTxt(x, hit.amount)}`);
    } else {
      items.push({ inv: null, gross: it.gross, fee: it.fee, who: it.who });
      lines.push(`   ${it.created} ${it.who || "-"} gross £${it.gross} fee £${it.fee} -> NO PORTAL MATCH`);
    }
  }
  const adj = r2(p.amount - invTotal);
  plan.push({ kind: "stripe", arrival: p.arrival, amount: p.amount, items, fees: r2(fees), surcharge: r2(surcharge), adjustment: adj });
  console.log(`${p.arrival} | payout £${p.amount} | invoices £${r2(invTotal)} | surcharge £${r2(surcharge)} | fees £${r2(fees)} | adjustment £${adj}`);
  lines.forEach((l) => console.log(l));
}

console.log("\nGOCARDLESS");
for (const p of payouts.gocardless || []) {
  if (p.arrival < "2026-09-01") continue;
  let invTotal = 0, fees = 0;
  const lines: string[] = [];
  const items = [];
  for (const it of p.items) {
    if (it.type !== "payment_paid_out") {
      fees += -it.amount;
      continue;
    }
    let inv = it.md?.invoice_number ? realInv(String(it.md.invoice_number)) : "";
    let who = "";
    let x: any = inv ? xeroFor(inv) : null;
    if (!inv && it.payment) {
      who = await gcCustomerName(it.payment);
      const last = toks(who).slice(-1)[0] || "";
      const cands = [...xinv.values()].flat().filter((i: any) => i.Status === "AUTHORISED" && last && toks(i.Contact?.Name).includes(last) && Number(i.AmountDue) + 0.005 >= it.amount);
      if (cands.length === 1) { x = cands[0]; inv = String(x.InvoiceNumber).replace(/-R\d+$/, ""); }
      else if (cands.length > 1) who += ` (${cands.length} Xero candidates: ${cands.map((c: any) => c.InvoiceNumber).join(", ")})`;
    }
    invTotal += it.amount;
    items.push({ inv: inv || null, xero: x?.InvoiceNumber || null, amount: it.amount, who });
    lines.push(`   £${it.amount} | ${inv || "no INV (" + (who || it.desc) + ")"} | Xero ${inv ? xeroTxt(x, it.amount) : "-"}`);
  }
  plan.push({ kind: "gocardless", arrival: p.arrival, amount: p.amount, items, fees: r2(fees), adjustment: r2(p.amount - invTotal) });
  console.log(`${p.arrival} | payout £${p.amount} | payments £${r2(invTotal)} | fees £${r2(fees)} | adjustment £${r2(p.amount - invTotal)}`);
  lines.forEach((l) => console.log(l));
}
if (jsonOut) Deno.writeTextFileSync(jsonOut, JSON.stringify(plan, null, 2));
await xeroPersistRefreshToDb(admin);
