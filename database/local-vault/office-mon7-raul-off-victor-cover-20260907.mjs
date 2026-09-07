/**
 * Mon 7 Sep 2026: Raul OFF — Victor covers full Monday board.
 *   Day Centre: Timi 11–1, Emanuel 1–4 (anchor Raul → covering Victor)
 *   Hub Bespoke: Tinashe 4.30–6 (client session; staff paid band is 4.15–6.15)
 *   staff_unavailability: Raul day off
 *
 * Dry-run (default):
 *   node database/local-vault/office-mon7-raul-off-victor-cover-20260907.mjs
 * Apply:
 *   APPLY=1 node database/local-vault/office-mon7-raul-off-victor-cover-20260907.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";
const DATE = "2026-09-07";
const REVISION = "office:mon7-raul-off-victor-cover-20260907";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve("local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL || process.env.PORTAL_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PORTAL_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(url, key, { auth: { persistSession: false } });

const SLOTS = [
  {
    client: "timi",
    label: "11 to 1",
    start: "11:00:00",
    end: "13:00:00",
    venue: "SwimFarm",
    service: "Day Centre",
  },
  {
    client: "emanuel",
    label: "1 to 4",
    start: "13:00:00",
    end: "16:00:00",
    venue: "SwimFarm",
    service: "Day Centre",
  },
  {
    client: "tinashe",
    label: "4.30 to 6",
    start: "16:30:00",
    end: "18:00:00",
    venue: "SwimFarm",
    service: "Bespoke Programme",
  },
];

function portalSessionKey(iso, startHHMM, clientSlug) {
  return `${iso}|${startHHMM}|${clientSlug}`;
}

async function main() {
  const { data: actorRows, error: actorErr } = await sb
    .from("staff_profiles")
    .select("id, username, app_role")
    .in("app_role", ["ceo", "admin", "lead"])
    .limit(20);
  if (actorErr) throw actorErr;
  const roleRank = { ceo: 0, admin: 1, lead: 2 };
  const actor = (actorRows || [])
    .slice()
    .sort((a, b) => (roleRank[a.app_role] ?? 9) - (roleRank[b.app_role] ?? 9))[0];
  if (!actor?.id) throw new Error("No ceo/admin/lead actor for created_by");

  const { data: profiles, error: pErr } = await sb
    .from("staff_profiles")
    .select("id, username, full_name, app_role")
    .or("username.ilike.raul,username.ilike.victor,full_name.ilike.Raul%,full_name.ilike.Victor%");
  if (pErr) throw pErr;

  const byUser = (want) =>
    (profiles || []).find((p) => String(p.username || "").toLowerCase() === want) ||
    (profiles || []).find((p) =>
      String(p.full_name || "")
        .toLowerCase()
        .startsWith(want)
    );

  const raul = byUser("raul");
  const victor = byUser("victor");
  if (!raul?.id) throw new Error("Raul staff_profiles row not found");
  if (!victor?.id) throw new Error("Victor staff_profiles row not found");

  console.log("Actor:", actor.username, actor.app_role, actor.id);
  console.log("Raul:", raul.username, raul.id);
  console.log("Victor:", victor.username, victor.id);
  console.log(APPLY ? "APPLY=1 — writing" : "Dry-run — set APPLY=1 to write");
  console.log(
    "Note: service-role REST may null created_by; prefer SQL file if insert fails:",
    "npx supabase db query --linked -f database/local-vault/office-mon7-raul-off-victor-cover-20260907.sql"
  );

  const offRow = {
    name_key: "raul",
    staff_name: raul.full_name || "Raul",
    staff_id: raul.id,
    off_date: DATE,
    reason: "Time off requested — Victor covers DC + Tinashe",
  };

  const overrideRows = SLOTS.map((s) => {
    const startHHMM = s.start.slice(0, 5);
    return {
      session_date: DATE,
      anchor_staff_id: "raul",
      anchor_start: s.start,
      anchor_end: s.end,
      anchor_venue: s.venue,
      anchor_client_id: s.client,
      anchor_time_slot_label: s.label,
      override_type: "instructor_reassign",
      payload: {
        covering_staff_id: "victor",
        covering_staff_name: victor.full_name || "Victor",
        portal_session_key: portalSessionKey(DATE, startHHMM, s.client),
        service: s.service || null,
        activity: s.service || null,
      },
      reason: `Victor covers Raul — ${s.client} ${s.label} ${DATE}`,
      status: "active",
      superseded_by: null,
      spreadsheet_revision: REVISION,
      created_by: actor.id,
      updated_by: actor.id,
    };
  });

  console.log("\nPlanned staff_unavailability:", offRow);
  console.log("\nPlanned instructor_reassign:");
  for (const r of overrideRows) {
    console.log(
      `  ${r.anchor_client_id} ${r.anchor_time_slot_label} ${r.anchor_start}-${r.anchor_end} → ${r.payload.covering_staff_id}`
    );
  }

  if (!APPLY) {
    console.log("\nDone (dry-run).");
    return;
  }

  const { data: existingOff, error: offLookErr } = await sb
    .from("staff_unavailability")
    .select("id, reason")
    .eq("name_key", "raul")
    .eq("off_date", DATE)
    .maybeSingle();
  if (offLookErr) throw offLookErr;

  if (existingOff?.id) {
    const { error: upOff } = await sb
      .from("staff_unavailability")
      .update({
        reason: offRow.reason,
        staff_id: offRow.staff_id,
        staff_name: offRow.staff_name,
      })
      .eq("id", existingOff.id);
    if (upOff) throw upOff;
    console.log("Updated staff_unavailability", existingOff.id);
  } else {
    const { data: insOff, error: insOffErr } = await sb
      .from("staff_unavailability")
      .insert([offRow])
      .select("id");
    if (insOffErr) throw insOffErr;
    console.log("Inserted staff_unavailability", insOff?.[0]?.id);
  }

  for (const row of overrideRows) {
    const { data: existing, error: exErr } = await sb
      .from("schedule_overrides")
      .select("id, status, payload, anchor_start")
      .eq("session_date", DATE)
      .eq("override_type", "instructor_reassign")
      .eq("anchor_staff_id", "raul")
      .eq("anchor_client_id", row.anchor_client_id)
      .eq("status", "active");
    if (exErr) throw exErr;

    if (existing?.length) {
      const keep = existing[0];
      const { error: upErr } = await sb
        .from("schedule_overrides")
        .update({
          payload: row.payload,
          reason: row.reason,
          anchor_start: row.anchor_start,
          anchor_end: row.anchor_end,
          anchor_venue: row.anchor_venue,
          anchor_time_slot_label: row.anchor_time_slot_label,
          spreadsheet_revision: REVISION + "-client-window",
          updated_by: actor.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", keep.id);
      if (upErr) throw upErr;
      console.log("Updated override", row.anchor_client_id, keep.id, row.anchor_time_slot_label);
      for (const dup of existing.slice(1)) {
        const { error: cancelErr } = await sb
          .from("schedule_overrides")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", dup.id);
        if (cancelErr) throw cancelErr;
        console.log("Cancelled duplicate", dup.id);
      }
      continue;
    }

    const { data: ins, error: insErr } = await sb
      .from("schedule_overrides")
      .insert([row])
      .select("id");
    if (insErr) throw insErr;
    console.log("Inserted override", row.anchor_client_id, ins?.[0]?.id);
  }

  const { data: verify, error: vErr } = await sb
    .from("schedule_overrides")
    .select(
      "id, anchor_staff_id, anchor_client_id, anchor_time_slot_label, payload, status"
    )
    .eq("session_date", DATE)
    .eq("override_type", "instructor_reassign")
    .eq("status", "active")
    .eq("anchor_staff_id", "raul");
  if (vErr) throw vErr;
  console.log("\nActive Raul→cover overrides on", DATE, ":");
  for (const r of verify || []) {
    console.log(
      `  ${r.anchor_client_id} ${r.anchor_time_slot_label} → ${r.payload?.covering_staff_id}`
    );
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
