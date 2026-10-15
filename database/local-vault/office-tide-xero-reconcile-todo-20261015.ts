/**
 * Read only. Tide statement lines (tide_24jul_12oct.json) vs Xero Tide account (clubSENsational LTD):
 * which lines are already reconciled, which have an unreconciled Xero payment / transaction to match,
 * and which have nothing (receipts: suggests the open ACCREC invoice with the same amount due).
 * Writes private/ealing-mail/tide_reconcile_todo.json.
 *
 *   npx -y deno run -A database/local-vault/office-tide-xero-reconcile-todo-20261015.ts
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

const TIDE = "ffe69fb0-8363-4a15-a29f-18dd13109c24";
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

const xdate = (s: string) => {
  const m = /\/Date\((\d+)/.exec(s || "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(s || "").slice(0, 10);
};
async function pageAll(path: string, key: string) {
  const out: any[] = [];
  for (let page = 1; page < 60; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${XERO_API}/${path}${sep}page=${page}`, { headers: h });
    if (!r.ok) {
      console.log(`${path}: ${r.status}`);
      break;
    }
    const list = (await r.json())[key] || [];
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}

const since = "DateTime(2026,07,15)";
const pays = (await pageAll(`Payments?where=${encodeURIComponent(`Date>=${since}`)}`, "Payments"))
  .filter((p) => p.Account?.AccountID === TIDE && p.Status !== "DELETED");
const bts = (await pageAll(`BankTransactions?where=${encodeURIComponent(`Date>=${since}`)}`, "BankTransactions"))
  .filter((t) => t.BankAccount?.AccountID === TIDE && t.Status !== "DELETED");
const openInv = await pageAll(
  `Invoices?where=${encodeURIComponent('Type=="ACCREC" AND Status=="AUTHORISED"')}`,
  "Invoices",
);
console.log(`Xero Tide payments ${pays.length}, bank transactions ${bts.length}, open sales invoices ${openInv.length}`);

type X = { kind: string; date: string; amount: number; signed: number; reconciled: boolean; label: string; used?: boolean };
const batches = new Map<string, any[]>();
for (const p of pays) {
  const id = p.BatchPayment?.BatchPaymentID;
  if (id) batches.set(id, [...(batches.get(id) || []), p]);
}
const xs: X[] = [
  ...[...batches.values()].map((ps) => {
    const recv = /ACCREC|ARCREDIT/.test(ps[0].PaymentType || "");
    const sum = Math.round(ps.reduce((s, p) => s + Number(p.Amount), 0) * 100) / 100;
    return {
      kind: "batch",
      date: xdate(ps[0].Date),
      amount: sum,
      signed: recv ? sum : -sum,
      reconciled: ps.every((p) => p.IsReconciled),
      label: ps.map((p) => p.Invoice?.InvoiceNumber || "-").join("+"),
    };
  }),
  ...pays.filter((p) => !p.BatchPayment?.BatchPaymentID).map((p) => {
    const t = String(p.PaymentType || "");
    const recv = t === "ACCRECPAYMENT" || t === "APCREDITPAYMENT" || /^AR(OVER|PRE)PAYMENT/.test(t);
    return {
      kind: "payment",
      date: xdate(p.Date),
      amount: Number(p.Amount),
      signed: recv ? Number(p.Amount) : -Number(p.Amount),
      reconciled: !!p.IsReconciled,
      label: `${p.Invoice?.InvoiceNumber || p.CreditNote?.CreditNoteNumber || "-"} ${p.Invoice?.Contact?.Name || ""}`.trim(),
    };
  }),
  ...bts.map((t) => {
    const recv = /RECEIVE/.test(t.Type || "");
    return {
      kind: "banktx",
      date: xdate(t.Date),
      amount: Number(t.Total),
      signed: recv ? Number(t.Total) : -Number(t.Total),
      reconciled: !!t.IsReconciled,
      label: `${t.Type} ${t.Contact?.Name || ""} ${(t.LineItems || []).map((l: any) => l.AccountCode).join("/")}`.trim(),
    };
  }),
];

const raw = JSON.parse(Deno.readTextFileSync("database/local-vault/empresa-sep25-jul26/tide_24jul_12oct.json"));
const rows: any[] = Array.isArray(raw) ? raw : raw.transactions || Object.values(raw)[0];
const toIso = (d: string) => new Date(`${d} 12:00 UTC`).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

const todo: any[] = [];
const practice = new Map<string, string[]>();
const payeeMap = new Map<string, string>();
const payeeKey = (d: unknown) =>
  String(d || "").split("/")[0].replace(/\s+-\s.*$/, "").replace(/[^A-Za-z ]+/g, " ").trim().toUpperCase().split(/\s+/).slice(0, 2).join(" ");
let done = 0;
for (const r of rows.slice().reverse()) {
  const iso = toIso(r.date);
  const signed = Number(r.signed);
  const cands = xs.filter((x) => !x.used && Math.abs(x.signed - signed) < 0.005 && dayDiff(x.date, iso) <= 5)
    .sort((a, b) => Number(b.reconciled) - Number(a.reconciled) || dayDiff(a.date, iso) - dayDiff(b.date, iso));
  const hit = cands[0];
  if (hit?.reconciled) {
    hit.used = true;
    done++;
    const who = String(r.details).split("/")[0].replace(/\s+-\s.*$/, "").trim().slice(0, 28);
    const k = `${signed > 0 ? "IN " : "OUT"} ${who}`;
    practice.set(k, [...(practice.get(k) || []), `${hit.kind}: ${hit.label}`]);
    if (hit.kind === "banktx") payeeMap.set(payeeKey(r.details), hit.label);
    continue;
  }
  const item: any = { date: iso, amount: signed, details: r.details, type: r.type };
  if (hit) {
    hit.used = true;
    item.action = `Match: ${hit.kind} ${hit.date} ${hit.label}`;
  } else if (signed > 0) {
    const inv = openInv.filter((i) => Math.abs(Number(i.AmountDue) - signed) < 0.005);
    item.action = inv.length
      ? `Find & Match invoice ${inv.map((i) => `${i.InvoiceNumber} (${i.Contact?.Name})`).join(" or ")}`
      : "Create (no open invoice with that amount)";
  } else {
    item.action = "Create (spend)";
  }
  todo.push(item);
}
/* Portal side for pending receipts: INV-Ps paid within 4 days whose paid amounts add up to the line. */
const { data: paidShares } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, amount_gbp, payment_schedule, paid_at, paid_via, payment_method_hint, xero_invoice_id, contact_id, reference_text")
  .gte("updated_at", "2026-07-15");
type PaidRow = { inv: string; date: string; amount: number; via: string; xero: boolean; ref: string; contact: string };
const paidRows: PaidRow[] = [];
for (const s of paidShares || []) {
  const sched = Array.isArray(s.payment_schedule) ? s.payment_schedule : [];
  const paidSched = sched.filter((x: any) => String(x.status) === "paid" && x.paid_at);
  if (paidSched.length) {
    for (const x of paidSched) {
      paidRows.push({ inv: s.invoice_number, date: String(x.paid_at).slice(0, 10), amount: Number(x.amount_gbp), via: String(x.paid_via || s.paid_via || ""), xero: !!s.xero_invoice_id, ref: s.reference_text || "", contact: s.contact_id });
    }
  } else if (s.paid_at) {
    paidRows.push({ inv: s.invoice_number, date: String(s.paid_at).slice(0, 10), amount: Number(s.amount_gbp), via: String(s.paid_via || ""), xero: !!s.xero_invoice_id, ref: s.reference_text || "", contact: s.contact_id });
  }
}
for (const t of todo.filter((t) => t.amount > 0)) {
  const near = paidRows.filter((p) => dayDiff(p.date, t.date) <= 4 && !/stripe|gocardless|apple_pay|card/i.test(p.via));
  const exact = near.filter((p) => Math.abs(p.amount - t.amount) < 0.005);
  if (exact.length) {
    t.portal = exact.map((p) => `${p.inv} ${p.ref} (${p.via}${p.xero ? ", in Xero" : ", not in Xero"})`);
    continue;
  }
  const sameDayLa = near.filter((p) => /tide|office_bank|bank|victor|@/i.test(p.via));
  const sum = Math.round(sameDayLa.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  if (sameDayLa.length && Math.abs(sum - t.amount) < 0.005) {
    t.portal = sameDayLa.map((p) => `${p.inv} ${p.ref} £${p.amount} (${p.xero ? "in Xero" : "not in Xero"})`);
  }
}
console.log("\nPending receipts with portal invoices:");
for (const t of todo.filter((t) => t.amount > 0)) console.log(`${t.date} | +${t.amount.toFixed(2)} | ${String(t.details).slice(0, 40)} | ${t.portal ? t.portal.join(" ; ") : "-"}`);
console.log("\nHow reconciled lines were done (by counterparty):");
for (const [k, v] of [...practice.entries()].sort()) console.log(`  ${k} x${v.length}: ${[...new Set(v.map((s) => s.replace(/INV-[\w-]+|CN-\d+/g, "INV").slice(0, 60)))].slice(0, 3).join(" | ")}`);
const accAll = await fetch(`${XERO_API}/Accounts`, { headers: h });
const accByCode = new Map(((accAll.ok ? (await accAll.json()).Accounts : []) || []).map((a: any) => [String(a.Code), a.Name]));
for (const t of todo) {
  const prev = payeeMap.get(payeeKey(t.details));
  if (prev) {
    const code = prev.split(" ").pop() || "";
    t.suggest = `${prev.replace(/^(SPEND|RECEIVE)\s+/, "").replace(new RegExp(`\\s${code}$`), "")} -> ${code} ${accByCode.get(code) || ""}`.trim();
  }
}
const unusedUnrec = xs.filter((x) => !x.used && !x.reconciled);
console.log(`Tide lines ${rows.length}: reconciled ${done}, to do ${todo.length} (in ${todo.filter((t) => t.amount > 0).length}, out ${todo.filter((t) => t.amount < 0).length})`);
for (const t of todo) console.log(`${t.date} | ${t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)} | ${String(t.details).slice(0, 70)} | ${t.action}`);
console.log(`\nXero unreconciled items with no Tide line in window: ${unusedUnrec.length}`);
for (const x of unusedUnrec) console.log(`  ${x.date} | ${x.signed.toFixed(2)} | ${x.kind} | ${x.label}`);
Deno.writeTextFileSync("database/local-vault/private/ealing-mail/tide_reconcile_todo.json", JSON.stringify({ todo, unusedUnrec }, null, 1));
await xeroPersistRefreshToDb(admin);
