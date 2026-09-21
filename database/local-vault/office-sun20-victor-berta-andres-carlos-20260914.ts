/**
 * Sun 20 Sep 2026 Covers truth (Schedule & Covers → Overview):
 *   - Aurora worked (keep standing). Luliya did not (no Luliya invent-cover).
 *   - Berta off → Victor covers Hub Lead Multi (not COVER NEEDED / Directors).
 *   - Carlos off → Andres covers Westway Climbing.
 *
 * Dry:   npx -y deno run -A database/local-vault/office-sun20-victor-berta-andres-carlos-20260914.ts
 * Apply: npx -y deno run -A database/local-vault/office-sun20-victor-berta-andres-carlos-20260914.ts --apply
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = Deno.args.includes("--apply");
const REV = "office:sun20-victor-berta-andres-carlos-20260914";
const ISO = "2026-09-20";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";
const ACTOR_EMAIL = "victor@clubsensational.org";

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function mintActorAccessToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: ACTOR_EMAIL }),
  });
  const j = await res.json();
  const tokenHash = String(j.hashed_token || "");
  if (!tokenHash) throw new Error("no hashed_token");
  const verify = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  const session = await verify.json();
  if (!session.access_token) throw new Error("verify failed: " + JSON.stringify(session));
  return String(session.access_token);
}

const BERTA_HUB = [
  { client: "jack w", start: "09:30:00", end: "10:15:00", label: "9.30 to 10.15" },
  { client: "adam ab", start: "10:15:00", end: "11:00:00", label: "10.15 to 11" },
  { client: "cyrus", start: "11:00:00", end: "11:45:00", label: "11 to 11.45" },
  { client: "arthur ma", start: "11:45:00", end: "12:30:00", label: "11.45 to 12.30" },
  { client: "erik", start: "12:30:00", end: "13:15:00", label: "12.30 to 1.15" },
  { client: "aydaan ah", start: "13:15:00", end: "14:00:00", label: "1.15 to 2" },
] as const;

const CARLOS_CLIMB = [
  { client: "hazem", start: "10:00:00", end: "11:00:00", label: "10 to 11" },
  { client: "zaid", start: "11:00:00", end: "12:00:00", label: "11 to 12" },
  { client: "serine", start: "12:00:00", end: "13:00:00", label: "12 to 1" },
  { client: "zakariya", start: "13:00:00", end: "14:00:00", label: "1 to 2" },
  { client: "available", start: "14:00:00", end: "15:00:00", label: "2 to 3" },
  { client: "patrick", start: "15:00:00", end: "16:00:00", label: "3 to 4" },
] as const;

const { data: rows, error } = await admin
  .from("schedule_overrides")
  .select(
    "id,session_date,override_type,status,anchor_staff_id,anchor_client_id,reason,payload",
  )
  .eq("session_date", ISO)
  .eq("status", "active");
if (error) throw new Error(error.message);

const coverNeeded = (rows || []).filter(
  (r) =>
    String(r.override_type) === "instructor_cover_needed" &&
    String(r.anchor_staff_id || "").toLowerCase() === "berta",
);
const existingVictor = (rows || []).filter(
  (r) =>
    String(r.override_type) === "instructor_reassign" &&
    String(r.anchor_staff_id || "").toLowerCase() === "berta" &&
    String((r.payload || {}).covering_staff_id || "").toLowerCase() === "victor",
);
const existingAndres = (rows || []).filter(
  (r) =>
    String(r.override_type) === "instructor_reassign" &&
    String(r.anchor_staff_id || "").toLowerCase() === "carlos" &&
    String((r.payload || {}).covering_staff_id || "").toLowerCase() === "andres",
);

console.log("DRY", {
  apply: APPLY,
  coverNeeded: coverNeeded.length,
  existingVictor: existingVictor.length,
  existingAndres: existingAndres.length,
});

if (!APPLY) {
  console.log("Dry only. Re-run with --apply.");
  Deno.exit(0);
}

const accessToken = await mintActorAccessToken();
const asVictor = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

if (coverNeeded.length) {
  const ids = coverNeeded.map((r) => r.id);
  const { error: upErr } = await asVictor
    .from("schedule_overrides")
    .update({
      status: "cancelled",
      reason:
        "Superseded — Victor covers Berta Hub Lead Sun 20 (office:sun20-victor-berta-andres-carlos-20260914)",
      spreadsheet_revision: REV,
    })
    .in("id", ids)
    .eq("status", "active");
  if (upErr) throw new Error("void cover_needed: " + upErr.message);
  console.log("cancelled cover_needed", ids.length);
}

const haveVictorClient = new Set(
  existingVictor.map((r) => String(r.anchor_client_id || "").toLowerCase()),
);
const victorInserts = BERTA_HUB.filter((s) => !haveVictorClient.has(s.client)).map((s) => ({
  session_date: ISO,
  anchor_staff_id: "berta",
  anchor_start: s.start,
  anchor_end: s.end,
  anchor_venue: "SwimFarm",
  anchor_client_id: s.client,
  anchor_time_slot_label: s.label,
  override_type: "instructor_reassign",
  payload: {
    service: "Multi-Activity",
    activity: "Multi-Activity",
    area: "Hub Room",
    absent_staff_id: "berta",
    absent_staff_name: "Berta",
    covering_staff_id: "victor",
    covering_staff_name: "Victor",
    portal_session_key: `${ISO}|${s.start.slice(0, 5)}|${s.client}|berta`,
  },
  reason: `Victor covers Berta — ${s.client} Hub ${s.label} ${ISO}`,
  status: "active",
  spreadsheet_revision: REV,
  created_by: ACTOR,
  updated_by: ACTOR,
}));

const haveAndresClient = new Set(
  existingAndres.map((r) => String(r.anchor_client_id || "").toLowerCase()),
);
const andresInserts = CARLOS_CLIMB.filter((s) => !haveAndresClient.has(s.client)).map((s) => ({
  session_date: ISO,
  anchor_staff_id: "carlos",
  anchor_start: s.start,
  anchor_end: s.end,
  anchor_venue: "Westway",
  anchor_client_id: s.client,
  anchor_time_slot_label: s.label,
  override_type: "instructor_reassign",
  payload: {
    service: "Climbing Activity",
    activity: "Climbing Activity",
    area: "Wall",
    absent_staff_id: "carlos",
    absent_staff_name: "Carlos",
    covering_staff_id: "andres",
    covering_staff_name: "Andres",
    portal_session_key: `${ISO}|${s.start.slice(0, 5)}|${s.client}|carlos`,
  },
  reason: `Andres covers Carlos — ${s.client} Westway Climb ${s.label} ${ISO}`,
  status: "active",
  spreadsheet_revision: REV,
  created_by: ACTOR,
  updated_by: ACTOR,
}));

const toInsert = victorInserts.concat(andresInserts);
if (toInsert.length) {
  const { data: ins, error: insErr } = await admin
    .from("schedule_overrides")
    .insert(toInsert)
    .select("id,anchor_staff_id,anchor_client_id,payload");
  if (insErr) throw new Error("insert covers: " + insErr.message);
  console.log(
    "inserted",
    (ins || []).map((r) => `${r.anchor_staff_id}->${(r.payload || {}).covering_staff_name}:${r.anchor_client_id}`),
  );
} else {
  console.log("reassigns already present");
}

const { error: bertaOffErr } = await admin
  .from("staff_unavailability")
  .update({
    reason: "Time off requested — Victor covers Hub Lead Multi",
  })
  .eq("off_date", ISO)
  .eq("name_key", "berta");
if (bertaOffErr) throw new Error("berta unavail: " + bertaOffErr.message);

const { error: carlosOffErr } = await admin
  .from("staff_unavailability")
  .update({
    reason: "Time off requested — Andres covers Westway Climbing",
  })
  .eq("off_date", ISO)
  .eq("name_key", "carlosherrero");
if (carlosOffErr) throw new Error("carlos unavail: " + carlosOffErr.message);

console.log("done", REV);
