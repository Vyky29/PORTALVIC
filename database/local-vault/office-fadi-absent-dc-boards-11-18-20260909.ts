/**
 * Fadi absent until Mon 21 Sep — DC boards Fri 11–Fri 18 (Victor sign-off).
 * - Cancel Fadi client_absence_announced (no Absent chip)
 * - Dated portal_roster_rows for each weekday board (no Fadi)
 * - Thu offs: Roberto, Luliya, Michelle, Youssef
 *
 * Dry:  npx -y deno run -A database/local-vault/office-fadi-absent-dc-boards-11-18-20260909.ts
 * Run:  npx -y deno run -A database/local-vault/office-fadi-absent-dc-boards-11-18-20260909.ts --apply
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

const APPLY = Deno.args.includes("--apply");
const REV = "office:fadi-absent-dc-boards-11-18-20260909";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function resolveActorId(): Promise<string> {
  const { data: ov } = await admin
    .from("schedule_overrides")
    .select("updated_by")
    .not("updated_by", "is", null)
    .limit(1)
    .maybeSingle();
  if (ov?.updated_by) return String(ov.updated_by);
  const { data: sp } = await admin
    .from("staff_profiles")
    .select("id")
    .not("id", "is", null)
    .limit(1)
    .maybeSingle();
  if (sp?.id) return String(sp.id);
  throw new Error("no_actor_id");
}

type Seat = { client: string; instructors: string; time: string; area?: string };
type Board = Record<string, Seat[]>;

const BOARDS: Board = {
  "2026-09-11": [
    { client: "Emanuel", instructors: "ROBERTO", time: "11 to 3" },
    { client: "Ikram", instructors: "LULIYA", time: "11 to 4" },
    { client: "Ikram", instructors: "YOUSSEF", time: "11 to 3" },
    { client: "Timi", instructors: "VICTOR", time: "11 to 1" },
    { client: "Emanuel", instructors: "VICTOR", time: "3 to 4" },
    { client: "Timi", instructors: "MICHELLE", time: "11 to 1" },
    { client: "Ikram", instructors: "MICHELLE", time: "3 to 4" },
    { client: "Timi", instructors: "RAUL", time: "11 to 1" },
    { client: "Emanuel", instructors: "RAUL", time: "3 to 4" },
  ],
  "2026-09-14": [
    { client: "Emanuel", instructors: "ROBERTO", time: "11 to 3" },
    { client: "Ikram", instructors: "LULIYA", time: "11 to 3" },
    { client: "Ikram", instructors: "YOUSSEF", time: "11 to 3" },
    { client: "Timi", instructors: "VICTOR", time: "11 to 1" },
    { client: "Emanuel", instructors: "VICTOR", time: "3 to 4" },
    { client: "Timi", instructors: "MICHELLE", time: "11 to 1" },
    { client: "Ikram", instructors: "MICHELLE", time: "3 to 4" },
    { client: "Office", instructors: "RAUL", time: "11 to 3", area: "Hub · Office" },
    { client: "Ikram", instructors: "RAUL", time: "3 to 4" },
  ],
  "2026-09-15": [
    { client: "ACAT", instructors: "ROBERTO", time: "11 to 12", area: "Hub · ACAT" },
    { client: "Ikram", instructors: "ROBERTO", time: "12 to 3" },
    { client: "Ikram", instructors: "LULIYA", time: "11 to 3" },
    { client: "Ikram", instructors: "MICHELLE", time: "11 to 12" },
    { client: "Manager", instructors: "MICHELLE", time: "12 to 3", area: "Hub · Manager" },
    { client: "Ikram", instructors: "MICHELLE", time: "3 to 4" },
    { client: "Office", instructors: "VICTOR", time: "11 to 3", area: "Hub · Office" },
    { client: "Ikram", instructors: "VICTOR", time: "3 to 4" },
    { client: "Office", instructors: "RAUL", time: "11 to 4", area: "Hub · Office" },
  ],
  "2026-09-16": [
    { client: "Emanuel", instructors: "ROBERTO", time: "11 to 4" },
    { client: "Ikram", instructors: "LULIYA", time: "11 to 3" },
    { client: "Office", instructors: "RAUL", time: "11 to 3", area: "Hub · Office" },
    { client: "Ikram", instructors: "RAUL", time: "3 to 4" },
    { client: "Ikram", instructors: "MICHELLE", time: "11 to 4" },
    { client: "Office", instructors: "VICTOR", time: "11 to 4", area: "Hub · Office" },
  ],
  "2026-09-17": [
    { client: "Office", instructors: "RAUL", time: "11 to 4", area: "Hub · Office" },
    { client: "Office", instructors: "VICTOR", time: "11 to 4", area: "Hub · Office" },
  ],
  "2026-09-18": [
    { client: "Emanuel", instructors: "ROBERTO", time: "11 to 3" },
    { client: "Ikram", instructors: "LULIYA", time: "11 to 4" },
    { client: "Ikram", instructors: "YOUSSEF", time: "11 to 3" },
    { client: "Timi", instructors: "VICTOR", time: "11 to 1" },
    { client: "Emanuel", instructors: "VICTOR", time: "3 to 4" },
    { client: "Timi", instructors: "MICHELLE", time: "11 to 1" },
    { client: "Ikram", instructors: "MICHELLE", time: "3 to 4" },
    { client: "Timi", instructors: "RAUL", time: "11 to 1" },
    { client: "Emanuel", instructors: "RAUL", time: "3 to 4" },
  ],
};

const DOW: Record<string, string> = {
  "2026-09-11": "Friday",
  "2026-09-14": "Monday",
  "2026-09-15": "Tuesday",
  "2026-09-16": "Wednesday",
  "2026-09-17": "Thursday",
  "2026-09-18": "Friday",
};

const THU_OFFS = ["roberto", "luliya", "michelle", "youssef"] as const;
const THU_ISO = "2026-09-17";

console.log("DATES", Object.keys(BOARDS));
console.log("APPLY", APPLY);

if (!APPLY) {
  console.log("Dry run. Pass --apply to write.");
  Deno.exit(0);
}

const ACTOR = await resolveActorId();
console.log("ACTOR", ACTOR);

/* 1) Cancel all active Fadi absences until Mon 21 */
{
  const { data, error } = await admin
    .from("schedule_overrides")
    .update({
      status: "cancelled",
      reason: "Superseded — Fadi removed from DC until Mon 21 (no Absent chip)",
      spreadsheet_revision: REV,
      updated_by: ACTOR,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "active")
    .eq("override_type", "client_absence_announced")
    .eq("anchor_client_id", "fadi")
    .gte("session_date", "2026-09-01")
    .lt("session_date", "2026-09-21")
    .select("id, session_date");
  if (error) {
    console.error("CANCEL_FADI_ABSENT", error.message);
    Deno.exit(1);
  }
  console.log("CANCELLED_FADI_ABSENT", (data || []).length, data);
}

/* 2) Dated DC boards */
for (const iso of Object.keys(BOARDS)) {
  const seats = BOARDS[iso];
  const day = DOW[iso];
  const { error: delErr } = await admin
    .from("portal_roster_rows")
    .delete()
    .eq("session_date", iso)
    .eq("status", "active")
    .ilike("service", "%day centre%")
    .ilike("venue", "%SwimFarm%");
  if (delErr) {
    console.error("DELETE_DC", iso, delErr.message);
    Deno.exit(1);
  }
  const rows = seats.map((s) => ({
    client_name: s.client,
    instructors: s.instructors,
    time_slot: s.time,
    area: s.area || "Hub Room",
    day,
    service: "Day Centre",
    venue: "SwimFarm",
    session_date: iso,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  }));
  const { error: insErr } = await admin.from("portal_roster_rows").insert(rows);
  if (insErr) {
    console.error("INSERT_DC", iso, insErr.message);
    Deno.exit(1);
  }
  console.log("DC_BOARD", iso, rows.length);
}

/* 3) Thu staff offs */
for (const key of THU_OFFS) {
  const { data: sp } = await admin
    .from("staff_profiles")
    .select("id, full_name, username")
    .ilike("username", key)
    .maybeSingle();
  const { error } = await admin.from("staff_unavailability").upsert(
    {
      name_key: key,
      staff_name: sp?.full_name || key,
      staff_id: sp?.id || null,
      off_date: THU_ISO,
      reason: "Time off — DC closed for staff (Fadi away week; Raul+Victor Office only)",
    },
    { onConflict: "name_key,off_date" },
  );
  if (error) {
    console.error("UNAVAIL", key, error.message);
    Deno.exit(1);
  }
  console.log("THU_OFF", key);
}

console.log("DONE", REV);
