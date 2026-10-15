/**
 * Ealing 2025/26 audit (15 Oct 2026): client_payments sheet LA rows get the real year.
 * Billed = invoices sent for 2025/26 (1695 Amar-Rai, 1696 Steven, 1699 Tinashe, INV-0054 Samer,
 * Ahmeds Care in Finance £2,640 + INV-0344/0345/0346 £2,470). Received = Ealing remittances of the
 * 13 cycles 8 Sep 2025 - 6 Sep 2026 (all in Tide), plus Care in Finance for the Ahmed Sundays.
 * Ealing pays its PO (weekly price x 38 / 52.14 over 52 weeks), so four children come out over the
 * invoice. Nothing is owed for 2025/26. Yousef £143 and Steven £93.48 are 2024/25 claims from the
 * 29 Jul 2026 email, kept as office owed. Old values are kept under "Before Ealing audit 15 Oct 2026".
 *
 *   npx -y deno run -A database/local-vault/office-ealing-2526-ledger-audit-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-ealing-2526-ledger-audit-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = Deno.env.get("APPLY") === "1";

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

const money = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Fix = { key: string; billed: number; received: number; invoices: string; owed: number; owedNote: string };

const FIXES: Fix[] = [
  { key: "tinashe", billed: 25530, received: 26149.76, invoices: "invoice 1699 (74 sessions x £345)", owed: 0, owedNote: "" },
  { key: "amar-rai", billed: 7400, received: 7579.52, invoices: "invoice 1695 (74 sessions x £100)", owed: 0, owedNote: "" },
  { key: "steven", billed: 1850, received: 1894.88, invoices: "invoice 1696 (37 sessions x £50)", owed: 93.48, owedNote: "2024/25 claim from the 29 Jul 2026 email, not part of 2025/26" },
  { key: "samer", billed: 2640, received: 3498.4, invoices: "INV-0054 (22 Sundays x £120, from 7 Dec)", owed: 0, owedNote: "" },
  { key: "aydaan-ah", billed: 5110, received: 5110, invoices: "Care in Finance £2,640 (22 Sundays) + INV-0346 £2,470", owed: 0, owedNote: "" },
  { key: "adaam-ah", billed: 5110, received: 5110, invoices: "Care in Finance £2,640 (22 Sundays) + INV-0344 £2,470", owed: 0, owedNote: "" },
  { key: "amaar-ah", billed: 5110, received: 5110, invoices: "Care in Finance £2,640 (22 Sundays) + INV-0345 £2,470", owed: 0, owedNote: "" },
  { key: "yousef-al", billed: 0, received: 0, invoices: "no service in 2025/26 (Ealing paid Sep-Jan and took it back in Mar)", owed: 143, owedNote: "2024/25 claim, Ealing ended his package 27 Jul 2025" },
];

const { data: rows, error } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, amount, payment_status, data")
  .eq("sheet", "LA")
  .in("client_key", FIXES.map((f) => f.key));
if (error) throw error;

console.log(`\nEaling 2025/26 ledger audit (${APPLY ? "APPLY" : "DRY"})\n`);
for (const f of FIXES) {
  const row = (rows || []).find((r) => r.client_key === f.key);
  if (!row) {
    console.log(`${f.key}: not found`);
    continue;
  }
  const d = { ...(row.data || {}) } as Record<string, unknown>;
  const over = Math.round((f.received - f.billed) * 100) / 100;
  const before = d["Before Ealing audit 15 Oct 2026"] || {
    amount: row.amount,
    payment_status: row.payment_status,
    "Office owed (LA)": d["Office owed (LA)"] ?? null,
    "Office owed note": d["Office owed note"] ?? null,
    "Year billed (25/26)": d["Year billed (25/26)"] ?? null,
    "Year received (25/26)": d["Year received (25/26)"] ?? null,
    "Ealing credit balance (25/26)": d["Ealing credit balance (25/26)"] ?? null,
    Next: d.Next ?? null,
  };
  d["Before Ealing audit 15 Oct 2026"] = before;
  d["Year billed (25/26)"] = money(f.billed);
  d["Year received (25/26)"] = money(f.received);
  d["Year outstanding"] = "£0";
  d["Office owed (LA)"] = f.owed;
  d["Office owed note"] = f.owed > 0 ? f.owedNote : "Ealing audit 15 Oct 2026: nothing owed for 2025/26";
  if (over > 0) {
    d["Ealing credit balance (25/26)"] = over;
    d["Ealing credit balance note"] =
      "Ealing paid its PO (weekly price x 38 / 52.14 over 52 weeks), more than our invoice. Keep on file; Ealing has not asked for it back";
  } else {
    delete d["Ealing credit balance (25/26)"];
    delete d["Ealing credit balance note"];
  }
  d.Next =
    `Yr 25/26: ${money(f.billed)} billed (${f.invoices}) · ${money(f.received)} received` +
    (over > 0 ? ` · Ealing paid ${money(over)} over the invoice` : "") +
    " · checked against remittances 15 Oct 2026";
  const amount = f.owed;
  const status = f.owed > 0 ? "Outstanding" : "Paid";
  console.log(
    `${f.key}: billed ${money(f.billed)} | received ${money(f.received)} | over ${money(over)} | amount ${row.amount} -> ${amount} | ${row.payment_status} -> ${status}`,
  );
  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("client_payments")
    .update({ amount, payment_status: status, data: d })
    .eq("id", row.id);
  if (upErr) throw upErr;
}
if (!APPLY) console.log("\nDry run. Re-run with APPLY=1");
else console.log("\nDone.");
