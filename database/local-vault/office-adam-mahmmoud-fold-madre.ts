/**
 * Adam Mahmmoud (407) · INV-P-0464
 * Tue Acton 4.30-5 with Aurora — fold failed (date_iso null).
 *
 *   npx -y deno run -A database/local-vault/office-adam-mahmmoud-fold-madre.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-adam-mahmmoud-fold-madre.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { foldValidatedReservationOntoMadre } from "../../supabase/functions/_shared/portal_booking_fold_madre.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "407";
const RESERVATION_ID = "d69e2163-f3f0-4c5e-b6dc-713ce2731427";

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

const { data: resBefore } = await admin
  .from("portal_booking_slot_reservations")
  .select(
    "id, status, participant_name, date_iso, day_label, time_label, venue, service_name, notes, validated_at",
  )
  .eq("id", RESERVATION_ID)
  .maybeSingle();

const { data: rosterBefore } = await admin
  .from("portal_roster_rows")
  .select("client_name, day, time_slot, instructors, session_date, venue, status")
  .ilike("client_name", "%Adam Mah%")
  .limit(5);

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", { reservation: resBefore, roster: rosterBefore });

if (!APPLY) {
  console.log("Re-run with APPLY=1 to fold onto MADRE + portal_roster_rows.");
  Deno.exit(0);
}

const fold = await foldValidatedReservationOntoMadre(admin, RESERVATION_ID);
console.log("fold", fold);

const { data: line } = await admin
  .from("portal_participant_service_lines")
  .select("client_key, sessions")
  .eq("client_key", "adam-mahmmoud")
  .maybeSingle();
if (line?.sessions && Array.isArray(line.sessions)) {
  const sessions = (line.sessions as Record<string, unknown>[]).map((s) => ({
    ...s,
    instructor: "Aurora",
  }));
  await admin
    .from("portal_participant_service_lines")
    .update({ sessions, updated_at: new Date().toISOString() })
    .eq("client_key", "adam-mahmmoud");
}

/* Term seat: standing template (every Tuesday), not only first session date. */
const { data: tplExisting } = await admin
  .from("portal_roster_rows")
  .select("id")
  .is("session_date", null)
  .eq("day", "Tuesday")
  .ilike("client_name", "Adam Mah%")
  .eq("time_slot", "4.30 to 5")
  .eq("status", "active")
  .limit(1);
if (!tplExisting?.length) {
  let actorId: string | null = null;
  try {
    const { data: sample } = await admin
      .from("portal_roster_rows")
      .select("created_by")
      .not("created_by", "is", null)
      .limit(1);
    actorId = sample?.[0] ? String(sample[0].created_by || "") : null;
  } catch (_) {
    actorId = null;
  }
  const tplPayload: Record<string, unknown> = {
    client_name: "Adam Mahmmoud",
    day: "Tuesday",
    time_slot: "4.30 to 5",
    instructors: "Aurora",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: null,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  if (actorId) {
    tplPayload.created_by = actorId;
    tplPayload.updated_by = actorId;
  }
  const { error: tplErr } = await admin.from("portal_roster_rows").insert(tplPayload);
  if (tplErr) console.warn("template insert", tplErr.message);
  else console.log("portal_roster_rows template Tue Aurora 4.30-5 inserted");
}

const { data: resAfter } = await admin
  .from("portal_booking_slot_reservations")
  .select("date_iso, status, participant_name, day_label, time_label, venue")
  .eq("id", RESERVATION_ID)
  .maybeSingle();
const { data: rosterAfter } = await admin
  .from("portal_roster_rows")
  .select("client_name, day, time_slot, instructors, session_date, venue, status")
  .ilike("client_name", "%Adam Mah%")
  .limit(5);
const { data: contact } = await admin
  .from("portal_parent_contacts")
  .select("in_class, child_display")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

console.log("AFTER", JSON.stringify({ fold, reservation: resAfter, roster: rosterAfter, contact }, null, 2));

if (!fold.ok) {
  console.error("Fold failed:", fold.note);
  Deno.exit(1);
}

/* Belt: term seat on standing Tue Aurora 4.30-5 (MADRE snap week 2026-07-13). */
const { data: madreRow } = await admin
  .from("portal_madre_document")
  .select("document, revision")
  .eq("term_key", "summer-2026")
  .single();
const doc = madreRow!.document as {
  meta?: Record<string, unknown>;
  weeks?: Array<{
    start?: string;
    staff?: Array<{
      staffName?: string;
      staffKey?: string;
      days?: Array<{ slots?: Array<Record<string, unknown>> } | null> | null;
    } | null>;
  }>;
};
const standing = (doc.weeks || []).find((w) => w.start === "2026-07-13");
let madrePatched = false;
function staffList(week) {
  const s = week?.staff;
  if (!s) return [];
  return Array.isArray(s) ? s : Object.values(s);
}
function dayList(st) {
  const d = st?.days;
  if (!d) return [];
  return Array.isArray(d) ? d : Object.values(d);
}
function slotTime(sl: Record<string, unknown>) {
  return String(sl.time || sl.time_slot || "").replace(/\s+/g, " ").trim();
}
for (const st of staffList(standing)) {
  if (!st) continue;
  const sk = String(st.staffName || st.staffKey || "");
  if (!/^aurora$/i.test(sk)) continue;
  for (const day of dayList(st)) {
    if (!day?.slots) continue;
    const wd = String(day.weekday || day.day || "").toLowerCase();
    if (!wd.startsWith("tue")) continue;
    for (const sl of day.slots) {
      const t = slotTime(sl);
      const v = String(sl.venue || "");
      if (!/acton/i.test(v) || !/^4\.30\s*to\s*5(\.00)?$/i.test(t)) continue;
      const cur = String(sl.client_name || "");
      if (/^adam/i.test(cur)) {
        madrePatched = true;
        break;
      }
      if (/^no participant$/i.test(cur)) {
        sl.client_name = "Adam Mahmmoud";
        sl.service = sl.service || "Aquatic Activity";
        madrePatched = true;
        break;
      }
    }
  }
}
if (madrePatched) {
  const now = new Date().toISOString();
  doc.meta = doc.meta || {};
  doc.meta.lastLiveFoldAt = now;
  doc.meta.lastLiveFoldNote = "office:Adam Mahmmoud:Tue Acton 4.30-5:Aurora";
  const { error: mErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: (Number(madreRow!.revision) || 0) + 1,
      updated_at: now,
    })
    .eq("term_key", "summer-2026");
  if (mErr) throw new Error(mErr.message);
  console.log("MADRE standing Tue Aurora 4.30-5 → Adam Mahmmoud");
} else {
  console.log("MADRE standing patch skipped (slot not open or already set)");
}
