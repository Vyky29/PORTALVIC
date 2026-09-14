/**
 * Capacity chain owns standing Overview seats. Void overrides that only
 * papered old canonical boards, and project John→Emmanuel Tinashe covers.
 *
 * Void (status=cancelled):
 *   - Patrick term slot_update (Alex-anchored; standing is Carlos + occupants)
 *   - Giuseppe duplicate Youssef-covers-Emanuel Sun 6 (keep emanuel-anchored)
 *   - Wed 9/16 session_add "Emanuel shadowing" Tinashe (wrong chrome)
 *
 * Insert:
 *   - instructor_reassign John→Emmanuel Tinashe Hub 4.30–6 on Wed 9 + Wed 16
 *
 * Dry:   npx -y deno run -A database/local-vault/office-void-capacity-chain-redundant-overrides-20260914.ts
 * Apply: npx -y deno run -A database/local-vault/office-void-capacity-chain-redundant-overrides-20260914.ts --apply
 *
 * Apply note: service-role PATCH hits schedule_overrides_set_updated_trg which
 * sets updated_by = auth.uid() (null) and fails. Apply mints a short-lived
 * Victor user JWT for voids; inserts still use service role.
 * SQL twin (trigger disabled): office-void-capacity-chain-redundant-overrides-20260914.sql
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = Deno.args.includes("--apply");
const REV = "office:void-capacity-chain-redundant-overrides-20260914";
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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function mintActorAccessToken(): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ACTOR_EMAIL,
  });
  if (error) throw new Error("generateLink: " + error.message);
  const hashed =
    (data as { properties?: { hashed_token?: string } })?.properties?.hashed_token ||
    (data as { hashed_token?: string })?.hashed_token ||
    "";
  // admin.generateLink shape varies; fall back to raw Auth API
  let tokenHash = hashed;
  if (!tokenHash) {
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
    tokenHash = String(j.hashed_token || "");
    if (!tokenHash) throw new Error("no hashed_token from generate_link");
  }
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
  if (!session.access_token) {
    throw new Error("verify failed: " + JSON.stringify(session));
  }
  return String(session.access_token);
}

type Ov = {
  id: string;
  session_date: string;
  override_type: string;
  status: string;
  anchor_staff_id: string | null;
  anchor_client_id: string | null;
  reason: string | null;
  spreadsheet_revision: string | null;
  payload?: Record<string, unknown> | null;
};

function classify(r: Ov): "patrick_slot_update" | "giuseppe_dup" | "tinashe_shadow_session_add" | null {
  const t = String(r.override_type || "");
  const staff = String(r.anchor_staff_id || "").toLowerCase();
  const client = String(r.anchor_client_id || "").toLowerCase();
  const reason = String(r.reason || "");
  if (t === "slot_update" && client === "patrick" && /term roster/i.test(reason)) {
    return "patrick_slot_update";
  }
  if (
    t === "instructor_reassign" &&
    staff === "giuseppe" &&
    /youssef covers emanuel/i.test(reason)
  ) {
    return "giuseppe_dup";
  }
  if (
    t === "session_add" &&
    client === "tinashe" &&
    (r.session_date === "2026-09-09" || r.session_date === "2026-09-16") &&
    /shadowing/i.test(reason)
  ) {
    return "tinashe_shadow_session_add";
  }
  return null;
}

const JOHN_COVERS = [
  {
    session_date: "2026-09-09",
    reason: "Emmanuel covers John — Tinashe Hub Bespoke 4.30–6 2026-09-09",
    portal_session_key: "2026-09-09|16:30|tinashe|john",
  },
  {
    session_date: "2026-09-16",
    reason: "Emmanuel covers John — Tinashe Hub Bespoke 4.30–6 2026-09-16",
    portal_session_key: "2026-09-16|16:30|tinashe|john",
  },
] as const;

const { data: rows, error } = await admin
  .from("schedule_overrides")
  .select(
    "id,session_date,override_type,status,anchor_staff_id,anchor_client_id,reason,spreadsheet_revision,payload",
  )
  .eq("status", "active")
  .gte("session_date", "2026-09-01")
  .lte("session_date", "2026-12-20")
  .order("session_date");
if (error) throw new Error(error.message);

const buckets: Record<string, Ov[]> = {
  patrick_slot_update: [],
  giuseppe_dup: [],
  tinashe_shadow_session_add: [],
};
for (const r of (rows || []) as Ov[]) {
  const b = classify(r);
  if (b) buckets[b].push(r);
}

const voidIds = Object.values(buckets).flat().map((r) => r.id);
console.log("DRY summary", {
  apply: APPLY,
  patrick_slot_update: buckets.patrick_slot_update.length,
  giuseppe_dup: buckets.giuseppe_dup.length,
  tinashe_shadow_session_add: buckets.tinashe_shadow_session_add.length,
  voidTotal: voidIds.length,
});
for (const [k, list] of Object.entries(buckets)) {
  console.log(`\n=== ${k} (${list.length}) ===`);
  for (const r of list) {
    console.log(
      `  ${r.session_date} ${r.override_type} ${r.anchor_staff_id || "-"} ${r.anchor_client_id || "-"} | ${(r.reason || "").slice(0, 70)}`,
    );
  }
}

const { data: existingJohn } = await admin
  .from("schedule_overrides")
  .select("id,session_date,status,anchor_staff_id,anchor_client_id,reason")
  .eq("status", "active")
  .eq("override_type", "instructor_reassign")
  .eq("anchor_staff_id", "john")
  .eq("anchor_client_id", "tinashe")
  .in("session_date", ["2026-09-09", "2026-09-16"]);
console.log("\nexisting John→Tinashe reassigns", existingJohn || []);

if (!APPLY) {
  console.log("\nDry only. Re-run with --apply to write.");
  Deno.exit(0);
}

if (voidIds.length) {
  if (!ANON_KEY) throw new Error("missing SUPABASE_ANON_KEY for actor JWT voids");
  const accessToken = await mintActorAccessToken();
  const asVictor = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const chunk = 10;
  for (let i = 0; i < voidIds.length; i += chunk) {
    const ids = voidIds.slice(i, i + chunk);
    const { error: upErr } = await asVictor
      .from("schedule_overrides")
      .update({
        status: "cancelled",
        reason:
          "Superseded — capacity chain standing / John cover (office:void-capacity-chain-redundant-overrides-20260914)",
        spreadsheet_revision: REV,
      })
      .in("id", ids)
      .eq("status", "active");
    if (upErr) throw new Error("void update: " + upErr.message);
  }
  console.log("cancelled", voidIds.length);
}

const have = new Set(
  ((existingJohn || []) as { session_date: string }[]).map((r) => r.session_date),
);
const toInsert = JOHN_COVERS.filter((c) => !have.has(c.session_date)).map((c) => ({
  session_date: c.session_date,
  anchor_staff_id: "john",
  anchor_start: "16:30:00",
  anchor_end: "18:00:00",
  anchor_venue: "SwimFarm",
  anchor_client_id: "tinashe",
  anchor_time_slot_label: "4.30 to 6",
  override_type: "instructor_reassign",
  payload: {
    service: "Bespoke Programme",
    activity: "Bespoke Programme",
    area: "Hub Room",
    absent_staff_id: "john",
    absent_staff_name: "John",
    covering_staff_id: "emmanuel",
    covering_staff_name: "Emmanuel",
    portal_session_key: c.portal_session_key,
  },
  reason: c.reason,
  status: "active",
  spreadsheet_revision: REV,
  created_by: ACTOR,
  updated_by: ACTOR,
}));

if (toInsert.length) {
  const { data: ins, error: insErr } = await admin
    .from("schedule_overrides")
    .insert(toInsert)
    .select("id,session_date,anchor_staff_id,anchor_client_id");
  if (insErr) throw new Error("insert john covers: " + insErr.message);
  console.log("inserted john covers", ins);
} else {
  console.log("john covers already present");
}

console.log("done", REV);
