/**
 * Tue 15 Sep 2026 — New Client chips + Kareena seat paint:
 *  - Rayan Ta first session with Roberto Acton 5.30–6 → NEW CLIENT override
 *  - Kareena NEW CLIENT override: retarget anchor available → kareena (standing seat)
 *
 * Dry:   npx -y deno run -A database/local-vault/office-rayan-roberto-new-client-kareena-anchor-20260915.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-rayan-roberto-new-client-kareena-anchor-20260915.ts
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

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const FIRST = "2026-09-15";
const AQ = "Aquatic Activity";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";
const REV = "office:rayan-roberto-nc-kareena-anchor-20260915";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

async function upsertRayanRobertoNewClient() {
  const payload = {
    booking_kind: "term",
    session_kind: "term",
    is_trial: false,
    finish_booking: true,
    new_client: true,
    term_new_participant: true,
    not_makeup: true,
    first_session: FIRST,
    to_client_id: "rayan_ta",
    to_client_name: "Rayan Ta",
    replacement_client_id: "rayan_ta",
    replacement_client_name: "Rayan Ta",
    service: AQ,
    activity: AQ,
    area: "Lane (DE)",
    move_note: "Rayan Ta first session with Roberto Acton 5.30 from 15 Sep (moved from Javier)",
  };
  console.log("RAYAN NEW CLIENT plan", payload);
  if (!APPLY) return;

  const { data: existing } = await admin
    .from("schedule_overrides")
    .select("id,payload,anchor_client_id")
    .eq("status", "active")
    .eq("session_date", FIRST)
    .eq("override_type", "client_replace_in_slot")
    .eq("anchor_staff_id", "roberto")
    .eq("anchor_start", "17:30:00");

  const reason =
    "NEW CLIENT — Rayan Ta first session Tue 15 · Roberto Acton 5.30–6 (from Javier)";

  if (existing && existing.length) {
    for (const ov of existing) {
      const next = { ...((ov.payload || {}) as Record<string, unknown>), ...payload };
      const { error } = await admin
        .from("schedule_overrides")
        .update({
          payload: next,
          anchor_client_id: "rayan_ta",
          reason,
          spreadsheet_revision: REV,
          updated_by: ACTOR,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ov.id);
      if (error) throw new Error(error.message);
      console.log("RAYAN OVERRIDE patched", ov.id);
    }
    return;
  }

  const { error: insErr } = await admin.from("schedule_overrides").insert({
    session_date: FIRST,
    anchor_staff_id: "roberto",
    anchor_start: "17:30:00",
    anchor_end: "18:00:00",
    anchor_venue: "Acton",
    anchor_client_id: "rayan_ta",
    anchor_time_slot_label: "5.30 to 6",
    override_type: "client_replace_in_slot",
    payload,
    reason,
    status: "active",
    spreadsheet_revision: REV,
    created_by: ACTOR,
    updated_by: ACTOR,
  });
  if (insErr) throw new Error(insErr.message);
  console.log("RAYAN OVERRIDE inserted");
}

async function retargetKareenaAnchor() {
  const { data: existing, error } = await admin
    .from("schedule_overrides")
    .select("id,payload,anchor_client_id,reason")
    .eq("status", "active")
    .eq("session_date", FIRST)
    .eq("override_type", "client_replace_in_slot")
    .eq("anchor_staff_id", "javier")
    .eq("anchor_start", "17:30:00");
  if (error) throw new Error(error.message);
  console.log(
    "KAREENA OVS",
    (existing || []).map((r) => ({
      id: r.id,
      anchor: r.anchor_client_id,
      nc: !!(r.payload as Record<string, unknown>)?.new_client,
    })),
  );
  if (!APPLY) return;
  for (const ov of existing || []) {
    const pl = (ov.payload || {}) as Record<string, unknown>;
    const isNc = pl.new_client === true || pl.finish_booking === true || pl.term_new_participant === true;
    const blob = JSON.stringify(pl).toLowerCase();
    if (!isNc && !blob.includes("kareena")) continue;
    const next = {
      ...pl,
      booking_kind: "term",
      session_kind: "term",
      is_trial: false,
      finish_booking: true,
      new_client: true,
      term_new_participant: true,
      not_makeup: true,
      first_session: FIRST,
      to_client_id: "kareena",
      to_client_name: "Kareena",
      replacement_client_id: "kareena",
      replacement_client_name: "Kareena",
    };
    const { error: uErr } = await admin
      .from("schedule_overrides")
      .update({
        payload: next,
        anchor_client_id: "kareena",
        reason:
          "NEW CLIENT — Kareena first session Tue 15 · Javier Acton 5.30–6 (anchor=kareena standing)",
        spreadsheet_revision: REV,
        updated_by: ACTOR,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ov.id);
    if (uErr) throw new Error(uErr.message);
    console.log("KAREENA OVERRIDE retargeted", ov.id, "available → kareena");
  }
}

await upsertRayanRobertoNewClient();
await retargetKareenaAnchor();
console.log(APPLY ? "APPLIED" : "DRY (set APPLY=1)");
