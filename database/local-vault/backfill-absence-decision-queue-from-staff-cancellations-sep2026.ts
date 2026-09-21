/**
 * Backfill Absents Open(decide) from staff cancellation_reports (same queue as Schedule Cancelled).
 *
 *   npx -y deno run -A database/local-vault/backfill-absence-decision-queue-from-staff-cancellations-sep2026.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/backfill-absence-decision-queue-from-staff-cancellations-sep2026.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enqueueDecideFromStaffCancellation } from "../../supabase/functions/_shared/portal_enqueue_decide_from_cancellation.ts";

const APPLY = Deno.env.get("APPLY") === "1";
const SINCE = Deno.env.get("SINCE") || "2026-09-01";

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
loadEnv(resolve("local-secrets/secrets.env"));

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: rows, error } = await admin
  .from("cancellation_reports")
  .select(
    "id, client_id, client_name, session_date, session_time, service, reason_category, notes, submitted_by_name, created_at",
  )
  .gte("session_date", SINCE)
  .order("session_date", { ascending: true });

if (error) {
  console.error("cancellation_reports query failed", error.message);
  Deno.exit(1);
}

let inserted = 0;
let skipped = 0;
let already = 0;
let failed = 0;

for (const r of rows || []) {
  const label = `${r.session_date} ${r.client_name} ${r.service || ""}`.trim();
  if (!APPLY) {
    console.log("DRY", label, r.client_id || "", r.submitted_by_name || "");
    continue;
  }
  const res = await enqueueDecideFromStaffCancellation(admin, {
    cancellation_id: r.id,
    client_id: r.client_id,
    client_name: r.client_name,
    session_date: String(r.session_date).slice(0, 10),
    session_time: r.session_time,
    service: r.service,
    reason_category: r.reason_category,
    notes: r.notes,
    submitted_by_name: r.submitted_by_name,
  });
  if (res.already_reported) {
    already++;
    console.log("EXISTS", label);
  } else if (res.ok) {
    inserted++;
    console.log("APPLY", label);
  } else if (res.skipped === "no_participant") {
    skipped++;
    console.log("SKIP no participant", label, r.client_id || "");
  } else {
    failed++;
    console.log("FAIL", label, res.error || "");
  }
}

console.log({
  APPLY,
  since: SINCE,
  reportCount: (rows || []).length,
  inserted,
  already,
  skipped,
  failed,
});
if (!APPLY) console.log("Re-run with APPLY=1 to write.");
