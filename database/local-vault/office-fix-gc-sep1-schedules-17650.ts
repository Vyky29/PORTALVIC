/**
 * Repair: restore Sep–Dec £176.50 schedules after GC Aug→Sep reschedule
 * accidentally collapsed all instalments onto 2026-09-01.
 *
 *   npx -y deno run -A database/local-vault/office-fix-gc-sep1-schedules-17650.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { nextInstalmentDueDate } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

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
loadEnv("local-secrets/edge-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const schedule = [
  {
    seq: 1,
    label: "Payment 1 · September 2026 (Autumn)",
    due_date: "2026-09-01",
    amount_gbp: 176.5,
    status: "pending" as const,
  },
  {
    seq: 2,
    label: "Payment 2 · October 2026 (Autumn)",
    due_date: "2026-10-01",
    amount_gbp: 176.5,
    status: "pending" as const,
  },
  {
    seq: 3,
    label: "Payment 3 · November 2026 (Autumn)",
    due_date: "2026-11-01",
    amount_gbp: 176.5,
    status: "pending" as const,
  },
  {
    seq: 4,
    label: "Payment 4 · December 2026 (Autumn)",
    due_date: "2026-12-01",
    amount_gbp: 176.5,
    status: "pending" as const,
  },
];

const invs = ["INV-P-0028", "INV-P-0042", "INV-P-0046", "INV-P-0038"];
const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_schedule, gocardless_payment_id, due_date")
  .in("invoice_number", invs);
if (error) throw error;

for (const row of data || []) {
  const { error: up } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_schedule: schedule,
      next_instalment_due: nextInstalmentDueDate(schedule),
      due_date: "2026-09-01",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (up) throw up;
  console.log("restored", row.invoice_number, "gc=", row.gocardless_payment_id);
}
console.log("OK Sep/Oct/Nov/Dec £176.50 restored");
