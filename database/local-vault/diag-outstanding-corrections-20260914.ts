/**
 * Diag outstanding corrections Victor listed 14 Sep.
 *   npx -y deno run -A database/local-vault/diag-outstanding-corrections-20260914.ts
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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function dumpFb(iso: string) {
  const { data, error } = await admin
    .from("session_feedback")
    .select("client_name,session_time,completed_by_name,portal_session_key,attendance")
    .eq("session_date", iso);
  if (error) console.log("fb", iso, error.message);
  else console.log("fb", iso, data);
}

async function dumpOv(iso: string, re: RegExp) {
  const { data, error } = await admin
    .from("schedule_overrides")
    .select(
      "id,override_type,status,anchor_staff_id,anchor_client_id,anchor_start,anchor_time_slot_label,payload,reason,spreadsheet_revision",
    )
    .eq("session_date", iso);
  if (error) {
    console.log("ov", iso, error.message);
    return;
  }
  for (const o of data || []) {
    if (re.test(JSON.stringify(o))) {
      console.log({
        iso,
        t: o.override_type,
        st: o.status,
        staff: o.anchor_staff_id,
        client: o.anchor_client_id,
        start: o.anchor_start,
        slot: o.anchor_time_slot_label,
        cover: (o.payload as Record<string, unknown>)?.covering_staff_id,
        to: (o.payload as Record<string, unknown>)?.to_client_id ||
          (o.payload as Record<string, unknown>)?.replacement_client_id,
        first: (o.payload as Record<string, unknown>)?.first_session,
        res: (o.payload as Record<string, unknown>)?.feedback_resolution,
        cba: (o.payload as Record<string, unknown>)?.cancelled_by_admin,
        key: (o.payload as Record<string, unknown>)?.portal_session_key,
        rev: o.spreadsheet_revision,
        reason: o.reason,
      });
    }
  }
}

console.log("=== Wed 9 ===");
await dumpFb("2026-09-09");
await dumpOv("2026-09-09", /ayman|adaam|dan|javier|cyrus/i);

console.log("\n=== Tue 8 ===");
await dumpFb("2026-09-08");
await dumpOv("2026-09-08", /javi|ayman|linda|rayan|junaid|cyrus|victor|roberto|luliya|simon/i);

console.log("\n=== Mon 7 ===");
await dumpFb("2026-09-07");
await dumpOv("2026-09-07", /javi|ayaan|serine|physical/i);

console.log("\n=== Fri 11 ===");
await dumpFb("2026-09-11");
await dumpOv("2026-09-11", /adam|youssef/i);

// Ayman standing / first session
const { data: aymanOv } = await admin
  .from("schedule_overrides")
  .select("session_date,override_type,status,anchor_staff_id,anchor_client_id,anchor_start,payload,reason")
  .or("anchor_client_id.ilike.%ayman%,payload->>to_client_id.ilike.%ayman%,payload->>replacement_client_id.ilike.%ayman%")
  .gte("session_date", "2026-09-01")
  .lte("session_date", "2026-09-30")
  .order("session_date");
console.log("\n=== Ayman overrides Sep ===");
for (const o of aymanOv || []) {
  console.log({
    d: o.session_date,
    t: o.override_type,
    st: o.status,
    staff: o.anchor_staff_id,
    client: o.anchor_client_id,
    start: o.anchor_start,
    to: (o.payload as Record<string, unknown>)?.to_client_id,
    first: (o.payload as Record<string, unknown>)?.first_session,
    finish: (o.payload as Record<string, unknown>)?.finish_booking,
    reason: o.reason,
  });
}

const { data: roster } = await admin
  .from("portal_roster_rows")
  .select("session_date,instructors,client_name,time_slot,service,status")
  .ilike("client_name", "%ayman%")
  .gte("session_date", "2026-09-01")
  .lte("session_date", "2026-09-30");
console.log("\n=== Ayman dated roster ===", roster);
