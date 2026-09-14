/**
 * Outstanding truth corrections (Victor 14 Sep 2026):
 *  - Ayman Wed Acton first session = Wed 16 (not Wed 9) — stamp first_session
 *  - Victor Cyrus Tue 8 Bespoke: admin cancel (no session / no feedback)
 *  - Javi Palankas Tue 8 Javier-book covers: void (redistributed; day 7 Physical already done)
 *
 * Dry:   npx -y deno run -A database/local-vault/office-outstanding-truth-20260914.ts
 * Apply: npx -y deno run -A database/local-vault/office-outstanding-truth-20260914.ts --apply
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = Deno.args.includes("--apply");
const REV = "office:outstanding-truth-20260914";
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
  if (!tokenHash) throw new Error("no hashed_token: " + JSON.stringify(j));
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

const { data: aymanOv, error: ae } = await admin
  .from("schedule_overrides")
  .select("id,payload,reason,session_date")
  .eq("id", "50914a81-aa1f-4b91-b757-719e714b3138")
  .maybeSingle();
if (ae) throw ae;

const { data: javiTue8, error: je } = await admin
  .from("schedule_overrides")
  .select("id,anchor_client_id,anchor_start,payload,reason")
  .eq("session_date", "2026-09-08")
  .eq("status", "active")
  .eq("override_type", "instructor_reassign")
  .eq("anchor_staff_id", "javier");
if (je) throw je;
const javiCovers = (javiTue8 || []).filter(
  (r) => String((r.payload || {}).covering_staff_id || "").toLowerCase() === "javi",
);

const { data: cyrusExist } = await admin
  .from("schedule_overrides")
  .select("id,override_type,status,payload,reason")
  .eq("session_date", "2026-09-08")
  .eq("anchor_staff_id", "victor")
  .or("anchor_client_id.ilike.%cyrus%,reason.ilike.%cyrus%");

console.log("DRY", {
  apply: APPLY,
  aymanFirst: (aymanOv?.payload as Record<string, unknown>)?.first_session,
  javiTue8Covers: javiCovers.map((r) => `${r.anchor_client_id}@${r.anchor_start}`),
  cyrusVictorTue8: cyrusExist,
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

if (aymanOv?.id) {
  const pl = {
    ...((aymanOv.payload && typeof aymanOv.payload === "object" ? aymanOv.payload : {}) as Record<
      string,
      unknown
    >),
    first_session: "2026-09-16",
    firstSession: "2026-09-16",
    booked_from: "2026-09-16",
    bookedFrom: "2026-09-16",
  };
  const { error } = await asVictor
    .from("schedule_overrides")
    .update({
      payload: pl,
      reason:
        "Finish booking term · Ayman El Bakry · Acton · 5.00 – 6.00 · first session Wed 16 Sep",
      spreadsheet_revision: REV,
    })
    .eq("id", aymanOv.id);
  if (error) throw new Error("ayman first_session: " + error.message);
  console.log("Ayman first_session → 2026-09-16");
}

if (javiCovers.length) {
  const ids = javiCovers.map((r) => r.id);
  const { error } = await asVictor
    .from("schedule_overrides")
    .update({
      status: "cancelled",
      reason:
        "Cancelled — Tue 8 Javier book redistributed (Javi Palankas did not cover; Roberto/Luliya/Junaid moves)",
      spreadsheet_revision: REV,
    })
    .in("id", ids)
    .eq("status", "active");
  if (error) throw new Error("void javi tue8: " + error.message);
  console.log("cancelled javi tue8 covers", ids.length, ids);
}

const alreadyCyrusCancel = (cyrusExist || []).some(
  (r) =>
    String(r.status) === "active" &&
    (String(r.override_type) === "slot_clear_client" ||
      String(r.override_type) === "slot_close" ||
      String((r.payload || {}).feedback_resolution || "").toLowerCase() === "cancelled"),
);
if (!alreadyCyrusCancel) {
  const { data: ins, error } = await admin
    .from("schedule_overrides")
    .insert([
      {
        session_date: "2026-09-08",
        anchor_staff_id: "victor",
        anchor_start: "15:30:00",
        anchor_end: "17:00:00",
        anchor_venue: "SwimFarm",
        anchor_client_id: "cyrus",
        anchor_time_slot_label: "3.30 to 5",
        override_type: "slot_clear_client",
        payload: {
          cancelled_by_admin: true,
          feedback_resolution: "cancelled",
          portal_session_key: "2026-09-08|15:30|cyrus|victor",
          service: "Bespoke Programme",
          activity: "Bespoke Programme",
          area: "Hub Room",
        },
        reason: "Admin cancel — Cyrus Tue 8 Bespoke with Victor did not run",
        status: "active",
        spreadsheet_revision: REV,
        created_by: ACTOR,
        updated_by: ACTOR,
      },
    ])
    .select("id");
  if (error) throw new Error("cyrus cancel insert: " + error.message);
  console.log("inserted Cyrus Tue 8 cancel", ins);
} else {
  console.log("Cyrus Tue 8 cancel already present");
}

console.log("done", REV);
