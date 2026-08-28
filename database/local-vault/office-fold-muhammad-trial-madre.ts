/**
 * Backfill: fold Muhammad validated trial onto MADRE Dan seat (Northolt Mon 4.30–5).
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fold-muhammad-trial-madre.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { foldValidatedReservationOntoMadre } from "../../supabase/functions/_shared/portal_booking_fold_madre.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const RESERVATION_ID = (Deno.env.get("RESERVATION_ID") ||
  "7f161007-6ecf-4725-9c4b-e02ee105aee3").trim();

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
loadEnv("database/local-vault/secrets.env");

const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: row } = await admin
  .from("portal_booking_slot_reservations")
  .select(
    "id, status, participant_name, date_iso, time_label, venue, notes, slot_id",
  )
  .eq("id", RESERVATION_ID)
  .maybeSingle();

console.log("reservation", row);
if (!row) {
  console.error("not found");
  Deno.exit(1);
}

/* Ensure notes hint Dan for Northolt Mon 4.30–5 if missing. */
const notes = String(row.notes || "");
if (!/instructor\s*=/i.test(notes) && APPLY) {
  await admin
    .from("portal_booking_slot_reservations")
    .update({
      notes: (notes ? notes + "|" : "") + "instructor=Dan",
      updated_at: new Date().toISOString(),
    })
    .eq("id", RESERVATION_ID);
  console.log("patched notes with instructor=Dan");
}

if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1 to fold onto MADRE.");
  Deno.exit(0);
}

const result = await foldValidatedReservationOntoMadre(admin, RESERVATION_ID);
console.log("fold result", result);
if (!result.ok) Deno.exit(1);
