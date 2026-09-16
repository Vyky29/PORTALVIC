/**
 * Wed Acton Javier aquatic = 30' seats only:
 *   Cyrus 4–4.30 + 4.30–5 · Ayman 5–5.30 + 5.30–6 (from Wed 16) · Kayden 6–6.30
 *
 * Also splits any active Ayman 60' finish-booking OV (17:00–18:00) into two 30' OVs
 * so Schedule & Covers can cancel/reoffer one half.
 *
 *   npx -y deno run -A database/local-vault/office-javier-wed-acton-half-hours-20260916.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-javier-wed-acton-half-hours-20260916.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ACTOR = "d365ab5c-e190-461a-a390-31e54b0b066f";
const AYMAN_FROM = "2026-09-16";

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
loadEnv("database/local-vault/.env");
loadEnv(".env");

const url = Deno.env.get("SUPABASE_URL") || "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const WANT = [
  {
    client_name: "Cyrus",
    day: "Wednesday",
    time_slot: "4 to 4.30",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
  {
    client_name: "Cyrus",
    day: "Wednesday",
    time_slot: "4.30 to 5",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
  {
    client_name: "Ayman",
    day: "Wednesday",
    time_slot: "5 to 5.30",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
  {
    client_name: "Ayman",
    day: "Wednesday",
    time_slot: "5.30 to 6",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
  {
    client_name: "Kayden",
    day: "Wednesday",
    time_slot: "6 to 6.30",
    instructors: "JAVIER",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null as string | null,
    status: "active",
    created_by: ACTOR,
    updated_by: ACTOR,
  },
];

const { data: existing, error: e1 } = await sb
  .from("portal_roster_rows")
  .select("id, client_name, day, time_slot, instructors, service, area, venue, session_date, status")
  .ilike("day", "Wednesday")
  .ilike("venue", "%acton%")
  .ilike("instructors", "%javier%");
if (e1) {
  console.error(e1);
  Deno.exit(1);
}

console.log("existing Wed Acton Javier rows:", (existing || []).length);
for (const r of existing || []) {
  console.log({
    id: r.id,
    client: r.client_name,
    time: r.time_slot,
    area: r.area,
    date: r.session_date,
    status: r.status,
  });
}

const { data: hourOvs, error: e2 } = await sb
  .from("schedule_overrides")
  .select(
    "id, session_date, anchor_staff_id, anchor_start, anchor_end, anchor_venue, anchor_time_slot_label, override_type, status, payload, reason",
  )
  .eq("status", "active")
  .eq("override_type", "client_replace_in_slot")
  .ilike("anchor_staff_id", "javier%")
  .ilike("anchor_venue", "%acton%")
  .gte("session_date", AYMAN_FROM)
  .or("anchor_start.eq.17:00:00,anchor_start.eq.17:00");
if (e2) {
  console.error(e2);
  Deno.exit(1);
}

const aymanHourOvs = (hourOvs || []).filter((o) => {
  const end = String(o.anchor_end || "");
  const p = (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<
    string,
    unknown
  >;
  const name = String(p.replacement_client_name || p.to_client_name || "").toLowerCase();
  const isHour = /^18:00/.test(end) || /5\s*to\s*6/i.test(String(o.anchor_time_slot_label || ""));
  return isHour && /ayman/i.test(name);
});

console.log("\nAyman hour-span OVs to split:", aymanHourOvs.length);
for (const o of aymanHourOvs) {
  console.log({
    id: o.id,
    date: o.session_date,
    start: o.anchor_start,
    end: o.anchor_end,
    label: o.anchor_time_slot_label,
  });
}

if (!APPLY) {
  console.log("\nDry run. Would:");
  console.log(" - delete", (existing || []).length, "Wed Acton Javier roster rows");
  console.log(" - insert", WANT.length, "standing half-hour templates");
  console.log(" - void", aymanHourOvs.length, "hour OVs and insert 2×30' OVs each");
  console.log("Re-run with APPLY=1 to write.");
  Deno.exit(0);
}

const ids = (existing || []).map((r) => r.id).filter(Boolean);
if (ids.length) {
  const { error: delErr } = await sb.from("portal_roster_rows").delete().in("id", ids);
  if (delErr) {
    console.error("delete failed", delErr);
    Deno.exit(1);
  }
  console.log("deleted roster", ids.length);
}

const { data: inserted, error: insErr } = await sb
  .from("portal_roster_rows")
  .insert(WANT)
  .select("id, client_name, time_slot, area");
if (insErr) {
  console.error("insert failed", insErr);
  Deno.exit(1);
}
console.log("inserted roster", inserted);

for (const o of aymanHourOvs) {
  const p = (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<
    string,
    unknown
  >;
  /* Void updates can null updated_by via trigger under service role — delete instead. */
  const { error: delErr } = await sb.from("schedule_overrides").delete().eq("id", o.id);
  if (delErr) {
    console.error("delete OV failed", o.id, delErr);
    Deno.exit(1);
  }
  const halves = [
    { start: "17:00:00", end: "17:30:00", label: "5 to 5.30" },
    { start: "17:30:00", end: "18:00:00", label: "5.30 to 6" },
  ];
  for (const h of halves) {
    const { error: insOvErr } = await sb.from("schedule_overrides").insert({
      session_date: o.session_date,
      anchor_staff_id: o.anchor_staff_id,
      anchor_start: h.start,
      anchor_end: h.end,
      anchor_venue: o.anchor_venue,
      anchor_client_id: "available",
      anchor_time_slot_label: h.label,
      override_type: "client_replace_in_slot",
      payload: {
        ...p,
        aquatic_half_band: true,
        split_from_hour_ov: o.id,
      },
      reason: `Finish booking term · Ayman · Acton · ${h.label} · split from hour OV`,
      status: "active",
      spreadsheet_revision: "finish_booking_half_split",
      created_by: ACTOR,
      updated_by: ACTOR,
    });
    if (insOvErr) {
      console.error("insert half OV failed", h.label, insOvErr);
      Deno.exit(1);
    }
    console.log("inserted OV", o.session_date, h.label);
  }
}

console.log("done");
