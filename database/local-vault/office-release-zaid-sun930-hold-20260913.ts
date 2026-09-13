/**
 * Zaid SwimFarm Aquatic Sunday 9–9.30 trial hold stayed `validated` after
 * trial_hold_cleared / standing open (Javier). That painted Fully booked.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-release-zaid-sun930-hold-20260913.ts
 * Apply: APPLY=1 npx -y deno run -A ...
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = Deno.env.get("APPLY") === "1";
const HOLD_ID = "df7b1f78-f643-419b-8225-2ddea28535f2";

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

const { data: before, error } = await admin
  .from("portal_booking_slot_reservations")
  .select("id,slot_id,status,participant_name,notes,hold_expires_at")
  .eq("id", HOLD_ID)
  .maybeSingle();
if (error) throw error;
console.log("before", before);

if (!APPLY) {
  console.log("Dry run. Re-run APPLY=1 to release.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const notes = String(before?.notes || "");
const { data: after, error: upErr } = await admin
  .from("portal_booking_slot_reservations")
  .update({
    status: "released",
    released_at: now,
    updated_at: now,
    notes: (notes + "|office_released_standing_open_20260913").replace(/^\|/, "").slice(0, 500),
  })
  .eq("id", HOLD_ID)
  .select("id,status,notes")
  .maybeSingle();
if (upErr) throw upErr;
console.log("after", after);
