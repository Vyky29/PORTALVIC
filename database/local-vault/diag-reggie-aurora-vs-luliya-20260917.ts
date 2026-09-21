/**
 * Diag: why Reggie term seat is on Aurora (with Adam) instead of Luliya (trial instructor).
 *   npx -y deno run -A database/local-vault/diag-reggie-aurora-vs-luliya-20260917.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

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
  { auth: { persistSession: false } },
);

function brief(row: Record<string, unknown>) {
  return {
    id: String(row.id || "").slice(0, 8),
    client: row.client_name,
    inst: row.instructors,
    time: row.time_slot,
    day: row.day,
    date: row.session_date,
    svc: row.service,
    venue: row.venue,
    status: row.status,
  };
}

const { data: roster } = await admin
  .from("portal_roster_rows")
  .select(
    "id,client_name,instructors,time_slot,venue,session_date,day,status,service,area,created_at,updated_at",
  )
  .or("client_name.ilike.%Reggie%,client_name.ilike.%Adam Ma%,client_name.ilike.%Adam%")
  .order("session_date", { ascending: true, nullsFirst: true });

console.log("\n=== roster rows (Reggie / Adam) ===");
for (const r of roster || []) {
  if (!/reggie|adam\s*ma/i.test(String(r.client_name || ""))) continue;
  console.log(brief(r as Record<string, unknown>));
}

const { data: ovs } = await admin
  .from("schedule_overrides")
  .select(
    "id,session_date,override_type,status,anchor_staff_id,anchor_client_id,anchor_start,anchor_end,anchor_time_slot_label,anchor_venue,reason,payload,spreadsheet_revision,created_at",
  )
  .eq("status", "active")
  .gte("session_date", "2026-09-01")
  .order("session_date");

const reggieOvs = (ovs || []).filter((ov) => {
  const blob = JSON.stringify(ov).toLowerCase();
  return blob.includes("reggie");
});
console.log("\n=== active OVs mentioning Reggie ===", reggieOvs.length);
for (const ov of reggieOvs) {
  const p = (ov.payload || {}) as Record<string, unknown>;
  console.log({
    date: ov.session_date,
    type: ov.override_type,
    staff: ov.anchor_staff_id,
    client: ov.anchor_client_id,
    start: ov.anchor_start,
    label: ov.anchor_time_slot_label,
    reason: ov.reason,
    rev: ov.spreadsheet_revision,
    to: p.to_client_name || p.replacement_client_name,
    from: p.from_client_name || p.previous_client_name,
    instructors: p.instructors || p.to_instructors,
  });
}

/* Standing Tue Acton 4.30 seats for Aurora / Luliya */
const { data: tue430 } = await admin
  .from("portal_roster_rows")
  .select("id,client_name,instructors,time_slot,venue,session_date,day,status,service")
  .eq("status", "active")
  .is("session_date", null)
  .eq("day", "Tuesday")
  .ilike("venue", "%Acton%")
  .or("time_slot.ilike.%4.30%,time_slot.ilike.%4:30%,time_slot.ilike.%16:30%");

console.log("\n=== standing Tue Acton ~4.30 ===");
for (const r of tue430 || []) {
  const inst = String(r.instructors || "");
  if (!/aurora|luliya|javi/i.test(inst)) continue;
  console.log(brief(r as Record<string, unknown>));
}

const { data: holds } = await admin
  .from("portal_booking_slot_reservations")
  .select(
    "id,status,date_iso,day_label,time_label,venue,service_name,notes,hold_expires_at,updated_at,participant_name",
  )
  .or("notes.ilike.%reggie%,participant_name.ilike.%Reggie%")
  .order("updated_at", { ascending: false })
  .limit(12);
console.log("\n=== booking holds Reggie ===");
console.log(holds);

const { data: sl } = await admin
  .from("service_lines")
  .select("id,participant_name,instructor,day,time_slot,venue,service,term_key,status,notes,updated_at")
  .ilike("participant_name", "%Reggie%")
  .order("updated_at", { ascending: false })
  .limit(10);
console.log("\n=== service_lines Reggie ===");
console.log(sl);
