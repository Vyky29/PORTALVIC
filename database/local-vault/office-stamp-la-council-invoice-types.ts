/**
 * Stamp named LA council on Invoice type chips (Ealing / H&F — never bare "Local Authority").
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-stamp-la-council-invoice-types.ts
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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function councilShort(blob: string): string {
  const low = blob.toLowerCase();
  if (/westminster/.test(low)) return "Westminster";
  if (/kensington|chelsea|\brbkc\b/.test(low)) return "Kensington & Chelsea";
  if (/h\s*&\s*f|hammersmith|fulham|\blbhf\b/.test(low)) return "H&F";
  if (/\bealing\b/.test(low)) return "Ealing";
  if (/\bbrent\b/.test(low)) return "Brent";
  return "";
}

const { data: rows, error } = await admin
  .from("client_payments")
  .select("id,client_name,parent_name,sheet,data")
  .eq("sheet", "LA");
if (error) throw error;

console.log(APPLY ? "APPLY" : "DRY RUN", "LA rows", rows?.length || 0);

let changed = 0;
for (const r of rows || []) {
  const d = { ...((r.data || {}) as Record<string, unknown>) };
  const blob = [d.Funder, d.Funding, d["Local Authority"], d.LA, d.Council, r.parent_name]
    .map((x) => String(x || ""))
    .join(" ");
  const la = councilShort(blob);
  if (!la) {
    console.log("SKIP (no council)", r.client_name, "|", blob.slice(0, 80));
    continue;
  }
  const nextInv = `${la} (Exempt invoice)`;
  const prevInv = String(d["Invoice type"] || "");
  if (prevInv === nextInv && String(d.Funder || "").includes(la === "H&F" ? "H&F" : la)) {
    continue;
  }
  d["Invoice type"] = nextInv;
  if (!d.Funder || /local\s*authority/i.test(String(d.Funder))) {
    d.Funder = la === "H&F" ? "H&F (Hammersmith & Fulham)" : la;
  }
  console.log(r.client_name.padEnd(22), prevInv || "(empty)", "→", nextInv);
  changed++;
  if (APPLY) {
    const { error: upErr } = await admin.from("client_payments").update({ data: d }).eq("id", r.id);
    if (upErr) throw new Error(`${r.client_name}: ${upErr.message}`);
  }
}
console.log("changed", changed, APPLY ? "written" : "(dry)");
if (!APPLY) console.log("Re-run APPLY=1");
