/**
 * Jibril / Hali — not re-enrolled, never matched to portal contact, no MADRE/roster seat.
 * Clear phantom £650 so Payments / Summer totals don't treat him as owed or occupying a place.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-jibril-clear-nonrenew.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ID = "33ba7767-9628-4d17-bce1-c5e25e3babcf";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: row, error } = await admin
  .from("client_payments")
  .select("*")
  .eq("id", ID)
  .maybeSingle();
if (error || !row) throw new Error(error?.message || "missing");

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", {
  sheet: row.sheet,
  status: row.payment_status,
  amount: row.amount,
  client: row.client_name,
});

const d = { ...((row.data || {}) as Record<string, unknown>) };
d["Amount before nonrenew clear"] = row.amount;
d["Office owed note"] =
  "Not re-enrolled — no portal contact, no MADRE/roster seat. Cleared £650 phantom; does not occupy open places 26/27.";
d["Cleared at"] = new Date().toISOString();

const patch = {
  sheet: "No re-enroled",
  payment_status: "Not re-enrolled",
  amount: 0,
  data: d,
};

console.log("AFTER", patch);

if (!APPLY) {
  console.log("Re-run APPLY=1");
  Deno.exit(0);
}

const { error: upErr } = await admin.from("client_payments").update(patch).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("OK Jibril → No re-enroled · £0");
