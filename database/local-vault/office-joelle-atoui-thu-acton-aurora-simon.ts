/**
 * Joelle Atoui (406) · Thu Acton Aquatic 5.30–6.30 with Aurora + Simon.
 * Also moves Yunis reservation instructor note Aurora → Roberto (seat already on board).
 *
 *   npx -y deno run -A database/local-vault/office-joelle-atoui-thu-acton-aurora-simon.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-joelle-atoui-thu-acton-aurora-simon.ts
 *
 * Prefer MADRE sync after this:
 *   APPLY=1 node database/local-vault/office-madre-sync-local-board-mon-fri.mjs
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "406";
const PARTICIPANT = "Joelle Atoui";
const PARENT = "Tina Atoui";
const EMAIL = "tinaatoui@btinternet.com";
const PHONE = "07932222224";
const SLOT_ID = "live-aquatic-acton-thursday-17-30-5-30-6-30";
/** First Autumn Thursday AS (standing from Mon 7 Sep). */
const DATE_ISO = "2026-09-10";
const YUNIS_RESERVATION_ID = "7ceb06a2-6fa6-40e4-9747-d7f60fd9fe94";
/** Reuse prior expired Mon hold for same family when present. */
const PRIOR_RESERVATION_ID = "f8e5c149-a324-413d-a6fe-1e31be24732d";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function actorId(): Promise<string | null> {
  try {
    const { data } = await admin
      .from("portal_roster_rows")
      .select("created_by")
      .not("created_by", "is", null)
      .limit(1);
    return data?.[0] ? String(data[0].created_by || "") : null;
  } catch {
    return null;
  }
}

async function upsertRosterTemplate(instructors: string, actor: string | null) {
  const { data: existing } = await admin
    .from("portal_roster_rows")
    .select("id")
    .is("session_date", null)
    .eq("day", "Thursday")
    .eq("time_slot", "5.30 to 6.30")
    .ilike("client_name", "Joelle%")
    .ilike("instructors", instructors)
    .eq("status", "active")
    .limit(1);
  if (existing?.length) {
    console.log("roster template ok", instructors, existing[0].id);
    return;
  }
  const payload: Record<string, unknown> = {
    client_name: "Joelle",
    day: "Thursday",
    time_slot: "5.30 to 6.30",
    instructors,
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  if (actor) {
    payload.created_by = actor;
    payload.updated_by = actor;
  }
  const { error } = await admin.from("portal_roster_rows").insert(payload);
  if (error) console.warn("roster template", instructors, error.message);
  else console.log("roster template inserted", instructors);
}

async function upsertDatedRoster(instructors: string, actor: string | null) {
  const { data: existing } = await admin
    .from("portal_roster_rows")
    .select("id")
    .eq("session_date", DATE_ISO)
    .eq("day", "Thursday")
    .eq("time_slot", "5.30 to 6.30")
    .ilike("client_name", "Joelle%")
    .ilike("instructors", instructors)
    .eq("status", "active")
    .limit(1);
  if (existing?.length) {
    console.log("roster dated ok", instructors, existing[0].id);
    return;
  }
  const payload: Record<string, unknown> = {
    client_name: "Joelle",
    day: "Thursday",
    time_slot: "5.30 to 6.30",
    instructors,
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: DATE_ISO,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  if (actor) {
    payload.created_by = actor;
    payload.updated_by = actor;
  }
  const { error } = await admin.from("portal_roster_rows").insert(payload);
  if (error) console.warn("roster dated", instructors, error.message);
  else console.log("roster dated inserted", instructors);
}

const { data: contact } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, parent_display, email, mobile, in_class")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

const { data: existingJoelle } = await admin
  .from("portal_booking_slot_reservations")
  .select("id, status, slot_id, time_label, day_label, notes, participant_name")
  .or(
    `id.eq.${PRIOR_RESERVATION_ID},slot_id.eq.${SLOT_ID},and(participant_name.ilike.Joelle%,day_label.ilike.Thursday%)`,
  )
  .order("updated_at", { ascending: false })
  .limit(8);

const { data: yunisBefore } = await admin
  .from("portal_booking_slot_reservations")
  .select("id, status, notes, slot_id, time_label")
  .eq("id", YUNIS_RESERVATION_ID)
  .maybeSingle();

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("contact", contact);
console.log("joelle reservations", existingJoelle);
console.log("yunis", yunisBefore);

if (!APPLY) {
  console.log("Re-run with APPLY=1 to write portal reservation + roster + contact.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const notes =
  "office_place|accepted_by_admin|ops_synced|instructor=Aurora+Simon|Thu Acton 5.30-6.30|2026-09-05";

const reuse = (existingJoelle || []).find(
  (r) =>
    String(r.id) === PRIOR_RESERVATION_ID ||
    String(r.slot_id) === SLOT_ID ||
    (/joelle/i.test(String(r.participant_name || "")) &&
      /thursday/i.test(String(r.day_label || ""))),
);

const reservationPayload = {
  slot_id: SLOT_ID,
  service_id: "aquatic",
  service_name: "Aquatic Activity",
  venue: "Acton",
  day_label: "Thursday",
  time_label: "5.30 – 6.30",
  activity: "Aquatic Activity",
  booking_mode: "term",
  date_iso: DATE_ISO,
  participant_name: PARTICIPANT,
  parent_name: PARENT,
  parent_email: EMAIL,
  parent_phone: PHONE,
  status: "validated",
  validated_at: now,
  hold_expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
  released_at: null,
  notes,
  updated_at: now,
};

let reservationId = reuse?.id || "";
if (reuse?.id) {
  const { error } = await admin
    .from("portal_booking_slot_reservations")
    .update(reservationPayload)
    .eq("id", reuse.id);
  if (error) throw new Error("reservation update: " + error.message);
  reservationId = reuse.id;
  console.log("UPDATED reservation", reservationId);
} else {
  const { data: row, error } = await admin
    .from("portal_booking_slot_reservations")
    .insert(reservationPayload)
    .select("id")
    .single();
  if (error) throw new Error("reservation insert: " + error.message);
  reservationId = String(row.id);
  console.log("INSERTED reservation", reservationId);
}

if (yunisBefore?.id) {
  const prevNotes = String(yunisBefore.notes || "");
  let nextNotes = prevNotes.replace(/instructor\s*=\s*Aurora/gi, "instructor=Roberto");
  if (!/instructor\s*=\s*Roberto/i.test(nextNotes)) {
    nextNotes = (nextNotes ? nextNotes + "|" : "") +
      "instructor=Roberto|moved_from_aurora_2026-09-05";
  }
  nextNotes = nextNotes.replace(/\|\|+/g, "|").slice(0, 500);
  const { error } = await admin
    .from("portal_booking_slot_reservations")
    .update({ notes: nextNotes, updated_at: now })
    .eq("id", YUNIS_RESERVATION_ID);
  if (error) console.warn("yunis notes", error.message);
  else console.log("Yunis notes → Roberto");
}

await admin
  .from("portal_parent_contacts")
  .update({ in_class: true, on_waiting_list: false, updated_at: now })
  .eq("contact_id", CONTACT_ID);
await admin
  .from("portal_participants")
  .update({ in_class: true, on_waiting_list: false, updated_at: now })
  .eq("contact_id", CONTACT_ID);
console.log("contact in_class=true");

const actor = await actorId();
for (const who of ["Aurora", "Simon"]) {
  await upsertRosterTemplate(who, actor);
  await upsertDatedRoster(who, actor);
}

const { data: after } = await admin
  .from("portal_booking_slot_reservations")
  .select("id, status, slot_id, time_label, day_label, venue, notes, date_iso")
  .eq("id", reservationId)
  .maybeSingle();
console.log("AFTER reservation", after);
console.log("Next: APPLY=1 node database/local-vault/office-madre-sync-local-board-mon-fri.mjs");
