/** npx -y deno run -A database/local-vault/diag-outstanding-corrections-2-20260914.ts */
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
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const { data: adaam } = await admin.from("session_feedback").select("session_date,client_name,session_time,completed_by_name,portal_session_key,attendance").ilike("client_name", "%adaam%").gte("session_date", "2026-09-07").lte("session_date", "2026-09-11");
console.log("adaam", adaam);

const { data: adam } = await admin.from("session_feedback").select("session_date,client_name,session_time,completed_by_name,portal_session_key,attendance").ilike("portal_session_key", "%adam%").gte("session_date", "2026-09-07").lte("session_date", "2026-09-12");
console.log("adam keys", adam);

const { data: cyrus } = await admin.from("session_feedback").select("session_date,client_name,session_time,completed_by_name,portal_session_key").ilike("client_name", "%cyrus%").gte("session_date", "2026-09-07").lte("session_date", "2026-09-09");
console.log("cyrus fb", cyrus);

const { data: ovsAll8 } = await admin.from("schedule_overrides").select("override_type,status,anchor_staff_id,anchor_client_id,anchor_start,payload,reason,spreadsheet_revision").eq("session_date", "2026-09-08");
console.log("tue8 cyrus/victor/javi cover");
for (const o of ovsAll8 || []) {
  const b = JSON.stringify(o).toLowerCase();
  if (b.includes("cyrus") || b.includes("victor") || (o.payload && String((o.payload as any).covering_staff_id || "").toLowerCase() === "javi")) {
    console.log({
      t: o.override_type,
      st: o.status,
      staff: o.anchor_staff_id,
      client: o.anchor_client_id,
      start: o.anchor_start,
      cover: (o.payload as any)?.covering_staff_id,
      res: (o.payload as any)?.feedback_resolution,
      cba: (o.payload as any)?.cancelled_by_admin,
      day_reassign: (o.payload as any)?.day_reassign,
      rev: o.spreadsheet_revision,
      reason: o.reason,
    });
  }
}

const { data: aym } = await admin.from("schedule_overrides").select("id,session_date,status,anchor_staff_id,anchor_client_id,anchor_start,anchor_end,payload,reason").eq("session_date", "2026-09-16").ilike("reason", "%ayman%");
console.log("ayman 16", JSON.stringify(aym, null, 2));

const { data: adaamOv } = await admin.from("schedule_overrides").select("override_type,status,anchor_staff_id,anchor_client_id,anchor_start,payload,reason").eq("session_date", "2026-09-09").or("anchor_client_id.ilike.%adaam%,reason.ilike.%adaam%");
console.log("adaam ov9", adaamOv);

const { data: danWed } = await admin.from("portal_roster_rows").select("*").eq("session_date", "2026-09-09").ilike("instructors", "%dan%");
console.log("dan wed roster", danWed?.map((r) => ({ c: r.client_name, t: r.time_slot, i: r.instructors, s: r.service })));
