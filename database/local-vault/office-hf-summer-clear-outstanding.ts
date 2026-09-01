/**
 * H&F Summer fully paid:
 *  - Faris / Simon / Yassir → Paid £0 on LA sheet
 *  - Adam Pilcher INV-P-0001 (£300 crash) + Saaib INV-P-0127 (£100 crash) → paid
 *    (ASW LA rows already Paid via office-hf-3550; Day Centre Out came from these INV-Ps)
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-hf-summer-clear-outstanding.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";

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
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function num(v: unknown): number {
  if (typeof v === "string") v = v.replace(/[£,\s]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const { data: la, error } = await admin
  .from("client_payments")
  .select("id, client_name, amount, payment_status, data")
  .eq("sheet", "LA");
if (error) throw error;

const markNames = [
  { re: /^faris$/i, label: "Faris" },
  { re: /^simon$/i, label: "Simon" },
  { re: /^yassir$/i, label: "Yassir" },
];

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("\n=== LA sheet H&F outstanding → Paid ===");
for (const m of markNames) {
  const row = (la || []).find((r) => m.re.test(String(r.client_name || "").trim()));
  if (!row) {
    console.warn("missing", m.label);
    continue;
  }
  const before = num(row.amount);
  const d = { ...((row.data || {}) as Record<string, unknown>) };
  d["Amount before H&F Summer clear"] = before;
  d["Office owed (LA)"] = 0;
  d["Payment status"] = "Paid";
  d["H&F Summer clear (25/26)"] = before;
  d["H&F pay note"] =
    `${String(d["H&F pay note"] || "").trim()} · H&F Summer cleared £${before.toFixed(2)} (bank confirmed)`.trim();
  d["Office owed note"] =
    `${String(d["Office owed note"] || "").trim()} · H&F Summer paid in full`.trim();
  console.log(`${m.label}: £${before} ${row.payment_status} → Paid £0`);
  if (APPLY) {
    const { error: upErr } = await admin
      .from("client_payments")
      .update({
        amount: 0,
        payment_status: "Paid",
        data: d,
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`${m.label}: ${upErr.message}`);
  }
}

/* Keep Adam / Saaib data.Payment status in sync with column. */
console.log("\n=== Sync Adam P / Saaib Payment status field ===");
for (const re of [/^adam p$/i, /saaib/i]) {
  const row = (la || []).find((r) => re.test(String(r.client_name || "").trim()));
  if (!row) continue;
  const d = { ...((row.data || {}) as Record<string, unknown>) };
  if (String(d["Payment status"] || "") === "Paid" && row.payment_status === "Paid") {
    console.log(row.client_name, "already synced");
    continue;
  }
  d["Payment status"] = "Paid";
  console.log(row.client_name, "data.Payment status → Paid");
  if (APPLY) {
    const { error: upErr } = await admin
      .from("client_payments")
      .update({ data: d, payment_status: "Paid" })
      .eq("id", row.id);
    if (upErr) throw new Error(`${row.client_name}: ${upErr.message}`);
  }
}

console.log("\n=== Crash INV-Ps Adam / Saaib → paid ===");
const crashTargets = [
  { invoice_number: "INV-P-0001", contact_id: "354", label: "Adam Pilcher" },
  {
    invoice_number: "INV-P-0127",
    contact_id: "gap-saaib-abdullah",
    label: "Saaib Abdullah",
  },
];

for (const t of crashTargets) {
  const { data: inv, error: invErr } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, payment_status, amount_paid_gbp, contact_id",
    )
    .eq("invoice_number", t.invoice_number)
    .maybeSingle();
  if (invErr) throw invErr;
  if (!inv) {
    console.warn("missing invoice", t.invoice_number, t.label);
    continue;
  }
  const amt = num(inv.amount_gbp);
  console.log(
    `${t.label} ${inv.invoice_number}: £${amt} ${inv.payment_status} → paid`,
  );
  if (APPLY) {
    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "paid",
        amount_paid_gbp: amt,
        paid_via: "office_bank",
        paid_at: now,
        updated_at: now,
      })
      .eq("id", inv.id);
    if (upErr) throw new Error(`${t.invoice_number}: ${upErr.message}`);
  }
}

if (!APPLY) console.log("\nRe-run with APPLY=1 to write.");
