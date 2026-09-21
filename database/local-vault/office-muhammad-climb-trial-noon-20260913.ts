/**
 * Muhammad Climbing trial → Sun 13 Sep 12.00–13.00 Alex (open seat).
 * Clears stale Alex 3–4 undated + service_lines that painted two climbs + whole-term Sundays.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-muhammad-climb-trial-noon-20260913.ts
 * Apply: npx -y deno run -A database/local-vault/office-muhammad-climb-trial-noon-20260913.ts --apply
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
loadEnv("local-secrets/edge-secrets.env");

const APPLY = Deno.args.includes("--apply");
const ISO = "2026-09-13";
const REV = "office:muhammad-climb-trial-noon-20260913";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: roster } = await admin
  .from("portal_roster_rows")
  .select("id,client_name,session_date,service,time_slot,instructors,venue,status")
  .ilike("client_name", "%muhammad%");

const { data: ovs } = await admin
  .from("schedule_overrides")
  .select("id,override_type,status,anchor_staff_id,anchor_client_id,anchor_start,anchor_end,payload,reason")
  .eq("session_date", ISO)
  .eq("status", "active")
  .or("anchor_client_id.ilike.%muhammad%,payload->>to_client_id.ilike.%muhammad%,payload->>replacement_client_id.ilike.%muhammad%");

const { data: lines } = await admin
  .from("portal_participant_service_lines")
  .select("client_key,sessions,source")
  .eq("client_key", "muhammad")
  .maybeSingle();

console.log("roster", roster);
console.log("ovs", ovs);
console.log("service_lines", lines);
console.log("APPLY", APPLY);

if (!APPLY) {
  console.log("Dry-run. Pass --apply to write.");
  Deno.exit(0);
}

const now = new Date().toISOString();

/* 1) Delete stale undated climb 3-4 + undated aquatic "(trial)" leftover */
const delIds = (roster || [])
  .filter((r) => {
    const name = String(r.client_name || "").toLowerCase();
    const svc = String(r.service || "").toLowerCase();
    const time = String(r.time_slot || "").toLowerCase();
    const dated = String(r.session_date || "").slice(0, 10);
    if (!dated && /climb/.test(svc) && /3\s*to\s*4|3\.00/.test(time)) return true;
    if (!dated && /aquatic/.test(svc) && /\(trial\)/.test(name)) return true;
    return false;
  })
  .map((r) => r.id);

if (delIds.length) {
  const { error } = await admin.from("portal_roster_rows").delete().in("id", delIds);
  if (error) throw new Error("delete stale roster: " + error.message);
  console.log("deleted roster", delIds);
}

/* 2) Move dated climb trial row Carlos 2-3 → Alex 12-1 */
const datedClimb = (roster || []).find((r) =>
  String(r.session_date || "").slice(0, 10) === ISO && /climb/i.test(String(r.service || "")),
);
if (datedClimb) {
  const { error } = await admin.from("portal_roster_rows").update({
    instructors: "Alex",
    time_slot: "12 to 1",
    area: "Wall",
    venue: "Westway",
    client_name: "Muhammad",
    updated_at: now,
  }).eq("id", datedClimb.id);
  if (error) throw new Error("update dated climb: " + error.message);
  console.log("updated dated climb", datedClimb.id);
} else {
  const { data: ins, error } = await admin.from("portal_roster_rows").insert([{
    client_name: "Muhammad",
    session_date: ISO,
    service: "Climbing Activity",
    time_slot: "12 to 1",
    instructors: "Alex",
    venue: "Westway",
    area: "Wall",
    status: "active",
    day: "Sunday",
  }]).select("id");
  if (error) throw new Error("insert dated climb: " + error.message);
  console.log("inserted dated climb", ins);
}

/* 3) Cancel old Carlos 2-3 trial replace; insert Alex 12-1 */
const oldOvs = (ovs || []).filter((o) =>
  String(o.override_type) === "client_replace_in_slot" &&
  String(o.anchor_staff_id || "").toLowerCase() === "carlos" &&
  String(o.anchor_start || "").startsWith("14:00"),
);
if (oldOvs.length) {
  const { error } = await admin.from("schedule_overrides").update({
    status: "cancelled",
    reason: "Superseded — Muhammad climb trial moved to Alex 12-1 Sun 13",
    spreadsheet_revision: REV,
    updated_by: ACTOR,
    updated_at: now,
  }).in("id", oldOvs.map((o) => o.id));
  if (error) throw new Error("cancel old ov: " + error.message);
  console.log("cancelled old ovs", oldOvs.map((o) => o.id));
}

const { data: existingNoon } = await admin
  .from("schedule_overrides")
  .select("id")
  .eq("session_date", ISO)
  .eq("status", "active")
  .eq("override_type", "client_replace_in_slot")
  .eq("anchor_staff_id", "alex")
  .eq("anchor_start", "12:00:00");

if (!(existingNoon || []).length) {
  const { data: insOv, error } = await admin.from("schedule_overrides").insert([{
    session_date: ISO,
    anchor_staff_id: "alex",
    anchor_start: "12:00:00",
    anchor_end: "13:00:00",
    anchor_venue: "Westway",
    anchor_client_id: "available",
    anchor_time_slot_label: "12 to 1",
    override_type: "client_replace_in_slot",
    payload: {
      is_trial: true,
      booking_kind: "trial",
      session_kind: "trial",
      to_client_id: "muhammad",
      to_client_name: "Muhammad (Trial)",
      replacement_client_id: "muhammad",
      replacement_client_name: "Muhammad (Trial)",
      finish_booking: true,
      new_client: false,
      term_new_participant: false,
      office_move_climb_noon_20260913: true,
    },
    reason: "Finish booking trial · Muhammad · Westway · 12.00 – 1.00 · Alex (moved from Carlos 2-3)",
    status: "active",
    spreadsheet_revision: REV,
    created_by: ACTOR,
    updated_by: ACTOR,
  }]).select("id");
  if (error) throw new Error("insert noon ov: " + error.message);
  console.log("inserted noon ov", insOv);
} else {
  console.log("noon ov already exists", existingNoon);
}

/* 4) Service lines: climb trial noon Alex weeks:1 + aquatic term Mon */
const sessions = [
  {
    day: "Sunday",
    area: "Wall",
    venue: "Westway",
    weeks: 1,
    isTrial: true,
    service: "Climbing Activity",
    timeSlot: "12.00 – 13.00",
    instructor: "Alex",
    durationMin: 60,
    dateIso: ISO,
  },
  {
    day: "Monday",
    area: "Teaching Pool",
    venue: "Northolt",
    service: "Aquatic Activity",
    timeSlot: "4.30 – 5.00",
    instructor: "Dan",
    durationMin: 30,
  },
];

const { error: lineErr } = await admin.from("portal_participant_service_lines").upsert({
  client_key: "muhammad",
  client_name: "Muhammad",
  client_name_norm: "muhammad",
  sessions,
  services_count: 2,
  source: REV,
  term_label: "2026/27",
  validated: true,
  updated_at: now,
}, { onConflict: "client_key" });
if (lineErr) throw new Error("service_lines: " + lineErr.message);
console.log("service_lines updated");

/* 5) Point validated reservation at noon if still on 2-3 / 3-4 */
const { data: holds } = await admin
  .from("portal_booking_slot_reservations")
  .select("id,date_iso,time_label,slot_id,status,notes,service_name")
  .ilike("participant_name", "muhammad%")
  .ilike("service_name", "%climb%")
  .in("status", ["validated", "held", "confirmed", "paid"]);

for (const h of holds || []) {
  const tl = String(h.time_label || "");
  if (/12\.00|12:00|12 to 1/i.test(tl) && String(h.date_iso || "").slice(0, 10) === ISO) {
    console.log("hold already noon", h.id);
    continue;
  }
  const { error } = await admin.from("portal_booking_slot_reservations").update({
    date_iso: ISO,
    day_label: "Sunday",
    time_label: "12.00 – 13.00",
    venue: "Westway",
    slot_id: "live-climbing-westway-sunday-12-00-12-00-1-00",
    notes: String(h.notes || "") + "|moved_to_alex_noon_20260913",
    updated_at: now,
  }).eq("id", h.id);
  if (error) console.warn("hold update failed", h.id, error.message);
  else console.log("updated hold", h.id);
}

console.log("done");
