/**
 * Smoke: finish-booking instructor fold heuristics + Reggie term truth.
 *
 * Catches the gap A→B Feedbacks smokes missed: post-pay seat assignment.
 *
 *   npx -y deno run -A database/local-vault/smoke-finish-booking-fold-instructors-20260917.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { preferredInstructorForReservation } from "../../supabase/functions/_shared/portal_booking_fold_madre.ts";
import standingOccupants from "../../supabase/functions/_shared/portal_capacity_chain_standing_occupants.json" with {
  type: "json",
};

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

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  const line = (pass ? "OK  " : "FAIL") + "  " + label + (detail ? " — " + detail : "");
  console.log(line);
  if (!pass) fails.push(label + (detail ? ": " + detail : ""));
}

/* --- 1) Heuristic: notes win --- */
ok(
  "notes instructor=Luliya wins over band heuristic",
  preferredInstructorForReservation({
    notes: "post_trial_term|instructor=Luliya|booking_kind=term",
    venue: "Acton",
    day_label: "Tuesday",
    time_label: "4.30 – 5.00",
    service_name: "Aquatic Activity",
  }) === "Luliya",
);

ok(
  "Tue Acton 4.30 without notes → Luliya (not Aurora/Adam)",
  preferredInstructorForReservation({
    notes: "booking_kind=term",
    venue: "Acton",
    day_label: "Tuesday",
    time_label: "4.30 – 5.00",
    service_name: "Aquatic Activity",
  }) === "Luliya",
);

ok(
  "Tue Acton 4-4.30 → Luliya",
  preferredInstructorForReservation({
    venue: "Acton",
    day_label: "Tuesday",
    time_label: "4.00 – 4.30",
    service_name: "Aquatic Activity",
  }) === "Luliya",
);

ok(
  "Mon Northolt 4.30 → Dan",
  preferredInstructorForReservation({
    venue: "Northolt",
    day_label: "Monday",
    time_label: "4.30 – 5.00",
    service_name: "Aquatic Activity",
  }) === "Dan",
);

/* Source must not still hardcode Aurora for that band */
{
  const src = readFileSync("supabase/functions/_shared/portal_booking_fold_madre.ts", "utf8");
  ok(
    "fold_madre no longer says standing band is Aurora for 4.30",
    !/Tue Acton 4\.30-5 standing band is Aurora/.test(src),
  );
  ok(
    "fold_madre documents Adam-on-Aurora / Luliya term seat",
    /Aurora already has Adam Ma/.test(src) && /return "Luliya"/.test(src),
  );
}

/* --- 2) Capacity chain: Reggie on Luliya, Adam on Aurora --- */
{
  const by = (standingOccupants as { bySlotId?: Record<string, unknown> }).bySlotId || {};
  const slot = by["live-aquatic-acton-tuesday-16-30-4-30-5-00"] as {
    seatLines?: Array<{ instructor?: string; client?: string; kind?: string }>;
    openInstructors?: string[];
  };
  const lines = slot?.seatLines || [];
  const aurora = lines.find((l) => /^aurora$/i.test(String(l.instructor || "")));
  const luliya = lines.find((l) => /^luliya$/i.test(String(l.instructor || "")));
  ok(
    "chain Tue 4.30 Aurora = Adam Ma",
    !!aurora && /adam/i.test(String(aurora.client || "")),
    JSON.stringify(aurora),
  );
  ok(
    "chain Tue 4.30 Luliya = Reggie (booked, not Aurora)",
    !!luliya &&
      /reggie/i.test(String(luliya.client || "")) &&
      !/hold by trial/i.test(String(luliya.client || "")) &&
      String(luliya.kind || "") === "booked",
    JSON.stringify(luliya),
  );
  ok(
    "chain Tue 4.30 Luliya not listed as openInstructors",
    !(slot?.openInstructors || []).some((x) => /luliya/i.test(x)),
    JSON.stringify(slot?.openInstructors || []),
  );
}

/* --- 3) Live DB: Reggie term not on Aurora --- */
{
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false } },
  );

  const { data: roster } = await admin
    .from("portal_roster_rows")
    .select("client_name,instructors,session_date,time_slot,status,day,venue")
    .eq("status", "active")
    .ilike("client_name", "%Reggie%");

  const termish = (roster || []).filter((r) => {
    const d = String(r.session_date || "");
    return !d || d >= "2026-09-22" || d === "";
  });
  const onAurora = termish.filter((r) => /aurora/i.test(String(r.instructors || "")));
  const onLuliya = termish.filter((r) => /luliya/i.test(String(r.instructors || "")));
  ok(
    "DB Reggie term/standing not on Aurora",
    onAurora.length === 0,
    "auroraRows=" + JSON.stringify(onAurora),
  );
  ok(
    "DB Reggie term/standing on Luliya",
    onLuliya.length >= 1,
    "luliyaRows=" + onLuliya.length,
  );

  const { data: ovs } = await admin
    .from("schedule_overrides")
    .select("session_date,override_type,status,anchor_staff_id,reason,payload")
    .eq("status", "active")
    .gte("session_date", "2026-09-20")
    .ilike("reason", "%Reggie%");
  const auroraOv = (ovs || []).filter((o) =>
    /^aurora$/i.test(String(o.anchor_staff_id || "")),
  );
  const luliyaOv = (ovs || []).filter((o) =>
    /^luliya$/i.test(String(o.anchor_staff_id || "")),
  );
  ok("DB no active Aurora Reggie OV from 20 Sep", auroraOv.length === 0, "n=" + auroraOv.length);
  ok("DB Luliya Reggie term OV exists", luliyaOv.length >= 1, "n=" + luliyaOv.length);
}

if (fails.length) {
  console.log("\nSMOKE FAIL (" + fails.length + ")");
  for (const f of fails) console.log(" - " + f);
  Deno.exit(1);
}
console.log("\nSMOKE PASS");
