/**
 * H&F paid £3,550 = Adam Pilcher Summer ASW £3,150 + Day Centre £300 + Saaib £100.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-hf-3550-adam-saaib-paid.ts
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

const { data, error } = await admin
  .from("client_payments")
  .select("id, client_name, amount, payment_status, data")
  .eq("sheet", "LA");
if (error) throw error;

const adam = (data || []).find((r) => /^adam p$/i.test(String(r.client_name || "").trim()));
const saaib = (data || []).find((r) => /saaib/i.test(String(r.client_name || "")));

if (!adam) throw new Error("Adam P row missing");
if (!saaib) throw new Error("Saaib row missing");

const adamBefore = num(adam.amount);
const saaibBefore = num(saaib.amount);
const adamDc = 300;
const hfTotal = 3550;
const expected = adamBefore + adamDc + saaibBefore;
if (Math.abs(expected - hfTotal) > 0.5) {
  console.warn(
    `WARN: expected ${adamBefore}+${adamDc}+${saaibBefore}=${expected}, H&F paid ${hfTotal}`,
  );
}

type Patch = {
  label: string;
  id: string;
  before: number;
  after: number;
  data: Record<string, unknown>;
};

const patches: Patch[] = [];

{
  const d = { ...((adam.data || {}) as Record<string, unknown>) };
  d["Amount before H&F Aug pay"] = adamBefore;
  d["Office owed (LA)"] = 0;
  d["H&F Aug pay (25/26)"] = adamBefore + adamDc;
  d["H&F Day Centre summer paid (25/26)"] = adamDc;
  d["H&F pay note"] =
    `H&F £3,550 split: Adam Pilcher ASW £${adamBefore.toFixed(2)} + Day Centre £${adamDc.toFixed(2)} + Saaib £${saaibBefore.toFixed(2)}`;
  d["Office owed note"] =
    `${String(d["Office owed note"] || "").trim()} · H&F Aug paid ASW £${adamBefore.toFixed(2)} + DC £${adamDc.toFixed(2)} (part of £3,550)`.trim();
  patches.push({
    label: "Adam P (Pilcher)",
    id: String(adam.id),
    before: adamBefore,
    after: 0,
    data: d,
  });
}

{
  const d = { ...((saaib.data || {}) as Record<string, unknown>) };
  d["Amount before H&F Aug pay"] = saaibBefore;
  d["Office owed (LA)"] = 0;
  d["H&F Aug pay (25/26)"] = saaibBefore;
  d["H&F pay note"] =
    `H&F £3,550 split: Adam Pilcher ASW+DC £${(adamBefore + adamDc).toFixed(2)} + Saaib £${saaibBefore.toFixed(2)}`;
  d["Office owed note"] =
    `${String(d["Office owed note"] || "").trim()} · H&F Aug paid £${saaibBefore.toFixed(2)} (part of £3,550 with Adam)`.trim();
  patches.push({
    label: "Saaib Abdullah",
    id: String(saaib.id),
    before: saaibBefore,
    after: 0,
    data: d,
  });
}

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log(`H&F £${hfTotal} = Adam ASW £${adamBefore} + DC £${adamDc} + Saaib £${saaibBefore}`);
for (const p of patches) {
  console.log(`${p.label}: £${p.before} → £${p.after} Paid`);
  if (APPLY) {
    const { error: upErr } = await admin
      .from("client_payments")
      .update({
        amount: p.after,
        payment_status: "Paid",
        data: p.data,
      })
      .eq("id", p.id);
    if (upErr) throw new Error(`${p.label}: ${upErr.message}`);
  }
}
if (!APPLY) console.log("\nRe-run with APPLY=1 to write.");
