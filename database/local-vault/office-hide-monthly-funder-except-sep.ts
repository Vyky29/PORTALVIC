/**
 * Arrears monthly funder billing: only September 2026 shared (ready).
 * Hide Oct 2026 → Jul 2027 monthly NHS/LA funder INV-Ps for all contacts.
 *
 * APPLY=1 to write.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const KEEP_PREFIX = "2026-09";

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

function isMonthlyFunder(r: {
  ready_by?: string | null;
  notes?: string | null;
  reference_text?: string | null;
}): boolean {
  const blob = `${r.ready_by || ""} ${r.notes || ""} ${r.reference_text || ""}`;
  return /office_funder_2627_nhs_month_|office_funder_2627_.*_month_|_hf_month_|schedule:monthly_11|funder monthly|nhs_month_|la_month_/i
    .test(blob);
}

const { data: laFunded, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, due_date, share_status, payment_status, amount_gbp, ready_by, reference_text, notes",
  )
  .eq("payment_method_hint", "la_funded")
  .neq("payment_status", "void");
if (error) throw error;

const monthly = (laFunded || []).filter(isMonthlyFunder);
const keepSep = monthly.filter((r) => String(r.due_date || "").startsWith(KEEP_PREFIX));
const hideRest = monthly.filter(
  (r) => !String(r.due_date || "").startsWith(KEEP_PREFIX) && r.share_status === "ready",
);
const sepNeedReady = keepSep.filter((r) => r.share_status !== "ready");

console.log("monthly total", monthly.length);
console.log(
  "Sep currently ready",
  keepSep.filter((r) => r.share_status === "ready").length,
);
console.log("to hide (ready, not Sep)", hideRest.length);
for (const r of hideRest) {
  console.log(`  hide ${r.invoice_number} ${r.due_date} ${r.contact_id} £${r.amount_gbp}`);
}
console.log(
  "Sep to unhide",
  sepNeedReady.map((r) => r.invoice_number),
);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const note =
  "Office 12 Aug: arrears billing — only September funder month shared; later months hidden until due.";

for (let i = 0; i < hideRest.length; i += 40) {
  const chunk = hideRest.slice(i, i + 40).map((r) => r.id);
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({ share_status: "hidden", updated_at: now, notes: note })
    .in("id", chunk);
  if (upErr) throw upErr;
}

if (sepNeedReady.length) {
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({ share_status: "ready", updated_at: now })
    .in(
      "id",
      sepNeedReady.map((r) => r.id),
    );
  if (upErr) throw upErr;
}

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, due_date, share_status, contact_id, amount_gbp, ready_by, notes, reference_text",
  )
  .eq("payment_method_hint", "la_funded")
  .neq("payment_status", "void");
const readyAfter = (after || []).filter(isMonthlyFunder).filter((r) =>
  r.share_status === "ready"
);
console.log("\nAFTER ready monthly count", readyAfter.length);
for (const r of readyAfter) {
  console.log(`  ${r.invoice_number} ${r.due_date} ${r.contact_id} £${r.amount_gbp}`);
}
console.log("DONE");
