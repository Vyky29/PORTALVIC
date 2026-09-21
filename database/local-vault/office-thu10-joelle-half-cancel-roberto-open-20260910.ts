/**
 * Thu 10 Sep Acton:
 * - Joelle 6–6.30 Cancelled on Aurora + Simon (second half cancelled)
 * - Aurora keeps Anas makeup 6–6.30
 * - Roberto 6–6.30 No participant (Maiyar second half cancelled — today only)
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-thu10-joelle-half-cancel-roberto-open-20260910.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ISO = "2026-09-10";
const REV = "office:thu10-joelle-half-cancel-roberto-open-20260910";

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

const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";

const cancelRows = [
  {
    anchor_staff_id: "aurora",
    anchor_client_id: "joelle",
    reason: "Joelle cancelled second half Thu 10 · Aurora 6-6.30",
  },
  {
    anchor_staff_id: "simon",
    anchor_client_id: "joelle",
    reason: "Joelle cancelled second half Thu 10 · Simon 6-6.30",
  },
];

const datedRoster = [
  {
    client_name: "Joelle",
    instructors: "AURORA",
    time_slot: "5.30 to 6",
    area: "Teaching Pool",
  },
  {
    client_name: "Joelle",
    instructors: "AURORA",
    time_slot: "6 to 6.30",
    area: "Teaching Pool",
  },
  {
    client_name: "Anas",
    instructors: "AURORA",
    time_slot: "6 to 6.30",
    area: "Lane (DE)",
  },
  {
    client_name: "Joelle",
    instructors: "SIMON",
    time_slot: "5.30 to 6",
    area: "Teaching Pool",
  },
  {
    client_name: "Joelle",
    instructors: "SIMON",
    time_slot: "6 to 6.30",
    area: "Teaching Pool",
  },
  {
    client_name: "No participant",
    instructors: "ROBERTO",
    time_slot: "6 to 6.30",
    area: "Lane (DE)",
  },
];

console.log("PLAN cancels", cancelRows.length, "dated roster", datedRoster.length, "APPLY", APPLY);

if (!APPLY) {
  console.log("Dry-run. Re-run with APPLY=1");
  Deno.exit(0);
}

const now = new Date().toISOString();

/* Supersede prior Joelle clears for this band if re-run */
{
  const { error } = await admin
    .from("schedule_overrides")
    .update({
      status: "cancelled",
      reason: "Superseded — " + REV,
      spreadsheet_revision: REV,
      updated_by: ACTOR,
      updated_at: now,
    })
    .eq("session_date", ISO)
    .eq("status", "active")
    .eq("override_type", "slot_clear_client")
    .eq("anchor_client_id", "joelle")
    .eq("anchor_start", "18:00:00")
    .eq("anchor_end", "18:30:00");
  if (error) throw new Error(error.message);
}

for (const c of cancelRows) {
  const { data, error } = await admin
    .from("schedule_overrides")
    .insert({
      session_date: ISO,
      anchor_staff_id: c.anchor_staff_id,
      anchor_start: "18:00:00",
      anchor_end: "18:30:00",
      anchor_venue: "Acton",
      anchor_client_id: c.anchor_client_id,
      anchor_time_slot_label: "6 to 6.30",
      override_type: "slot_clear_client",
      payload: {
        cancelled_by_admin: true,
        feedback_resolution: "cancelled",
        service: "Aquatic Activity",
        activity: "Aquatic Activity",
        portal_session_key: `${ISO}|18:00|joelle|${c.anchor_staff_id}`,
        area: "Teaching Pool",
      },
      reason: c.reason,
      status: "active",
      spreadsheet_revision: REV,
      created_by: ACTOR,
      updated_by: ACTOR,
    })
    .select("id,anchor_staff_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  console.log("cancel", data);
}

/* Keep Anas makeup active; refresh reason */
{
  const { data: anasRows, error } = await admin
    .from("schedule_overrides")
    .select("id,payload,reason")
    .eq("session_date", ISO)
    .eq("status", "active")
    .eq("override_type", "client_replace_in_slot")
    .eq("anchor_staff_id", "aurora")
    .eq("anchor_start", "18:00:00");
  if (error) throw new Error(error.message);
  for (const row of anasRows || []) {
    const p = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    const name = String(p.to_client_name || p.replacement_client_name || "").toLowerCase();
    if (!name.includes("anas")) continue;
    const { error: uErr } = await admin
      .from("schedule_overrides")
      .update({
        reason: "Makeup — Anas (absent Tue 8) Aurora 6-6.30 (Joelle second half cancelled)",
        spreadsheet_revision: REV,
        updated_by: ACTOR,
        updated_at: now,
        created_by: ACTOR,
        payload: {
          ...p,
          is_makeup: true,
          service: "Aquatic Activity",
          activity: "Aquatic Activity",
        },
      })
      .eq("id", row.id);
    if (uErr) throw new Error(uErr.message);
    console.log("anas makeup refreshed", row.id);
  }
}

/* Upsert dated roster rows */
for (const r of datedRoster) {
  const { data: existing, error: fErr } = await admin
    .from("portal_roster_rows")
    .select("id")
    .eq("session_date", ISO)
    .eq("client_name", r.client_name)
    .eq("instructors", r.instructors)
    .eq("time_slot", r.time_slot)
    .eq("venue", "Acton")
    .maybeSingle();
  if (fErr) throw new Error(fErr.message);

  const payload = {
    client_name: r.client_name,
    day: "Thursday",
    time_slot: r.time_slot,
    instructors: r.instructors,
    service: "Aquatic Activity",
    area: r.area,
    venue: "Acton",
    session_date: ISO,
    status: "active",
    updated_by: ACTOR,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await admin.from("portal_roster_rows").update(payload).eq("id", existing.id);
    if (error) throw new Error(error.message);
    console.log("roster update", r.client_name, r.instructors, r.time_slot);
  } else {
    const { error } = await admin.from("portal_roster_rows").insert({
      ...payload,
      created_by: ACTOR,
      created_at: now,
    });
    if (error) throw new Error(error.message);
    console.log("roster insert", r.client_name, r.instructors, r.time_slot);
  }
}

console.log("DONE", REV);
