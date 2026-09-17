/**
 * Backfill Absents & cancellations decision queue from schedule_overrides
 * since 2026-09-01 (client_absence_announced + admin clears / cancels).
 *
 *   npx -y deno run -A database/local-vault/backfill-absence-decision-queue-from-overrides-sep2026.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/backfill-absence-decision-queue-from-overrides-sep2026.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = Deno.env.get("APPLY") === "1";
const SINCE = "2026-09-01";

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
loadEnv(resolve("local-secrets/secrets.env"));

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Roster slug → portal_participants.contact_id (when slug ≠ contact_id). */
const SLUG_TO_CONTACT: Record<string, string> = {
  abodi_pa: "155",
  abodi_p: "155",
  abodi: "155",
  adam_p: "354",
  adam_pi: "354",
  amaar_ah: "105",
  amar_rai: "130",
  anas: "7560101",
  cyrus: "79",
  gabriel: "99",
  joelle: "406",
  junaid_f: "368",
  maiyar: "48",
  yamik: "gap-yamik-limbu",
  yassir: "119",
  yunis: "232",
};

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function serviceLabel(ov: Record<string, unknown>): string {
  const pl = (ov.payload || {}) as Record<string, unknown>;
  const bits = [
    clean(pl.service || pl.activity || "Session", 80),
    clean(ov.anchor_venue, 60),
    clean(ov.anchor_time_slot_label, 40),
  ].filter(Boolean);
  return bits.join(" · ").slice(0, 160) || "Session";
}

function isMoveNotCancel(ov: Record<string, unknown>): boolean {
  const pl = (ov.payload || {}) as Record<string, unknown>;
  if (pl.client_move || pl.moved_to_staff_id || pl.moved_client_id) return true;
  if (pl.day_reassign && !pl.cancelled_by_admin) return true;
  return false;
}

async function resolveParticipant(slug: string) {
  const mapped = SLUG_TO_CONTACT[slug] || slug;
  const { data } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, parent_person_id")
    .eq("contact_id", mapped)
    .maybeSingle();
  return data;
}

const { data: ovs, error } = await admin
  .from("schedule_overrides")
  .select(
    "id, session_date, override_type, anchor_client_id, anchor_venue, anchor_time_slot_label, reason, payload, created_at",
  )
  .gte("session_date", SINCE)
  .in("override_type", [
    "client_absence_announced",
    "slot_clear_client",
    "slot_close",
    "client_cancelled",
  ])
  .eq("status", "active")
  .order("session_date", { ascending: true });

if (error) {
  console.error("OV query failed", error.message);
  Deno.exit(1);
}

let inserted = 0;
let skipped = 0;
let updated = 0;
const seen = new Set<string>();

for (const ov of ovs || []) {
  const type = clean(ov.override_type, 40);
  const slug = clean(ov.anchor_client_id, 80);
  if (!slug) {
    skipped++;
    console.log("skip no client", ov.id);
    continue;
  }
  if (type === "slot_clear_client" && isMoveNotCancel(ov)) {
    skipped++;
    console.log("skip move", ov.session_date, slug, ov.id);
    continue;
  }

  const pax = await resolveParticipant(slug);
  if (!pax?.contact_id || !pax.parent_person_id) {
    skipped++;
    console.log("skip no participant", slug, ov.session_date);
    continue;
  }

  const isCancel =
    type === "slot_clear_client" || type === "slot_close" || type === "client_cancelled";
  const caseKind = isCancel ? "cancellation" : "absence";
  const reasonCode = isCancel ? "club_cancelled" : "office_other";
  const svc = serviceLabel(ov);
  const sessionDate = String(ov.session_date).slice(0, 10);
  const dedupe = `${pax.contact_id}|${sessionDate}|${svc}`;
  if (seen.has(dedupe)) {
    skipped++;
    console.log("skip dup batch", dedupe);
    continue;
  }
  seen.add(dedupe);

  const reasonNote = clean(ov.reason, 400) ||
    (isCancel
      ? "Admin cancelled (Schedule & Covers backfill)"
      : "Absent announced (Schedule & Covers backfill)");
  const reasonText = isCancel
    ? `Schedule · Club cancelled — ${reasonNote}`
    : `Schedule · Absent — ${reasonNote}`;

  const now = new Date().toISOString();
  // Far proof_deadline so list expire does not wipe office decision rows.
  const proofDeadline = "2027-03-31";
  const payload = {
    reason_code: reasonCode,
    source: isCancel ? "schedule_covers_backfill" : "schedule_covers_absent_backfill",
    case_kind: caseKind,
    schedule_override_id: ov.id,
    backfill_since: SINCE,
  };

  const { data: existing } = await admin
    .from("portal_parent_absence_reports")
    .select("id, status, case_kind")
    .eq("contact_id", pax.contact_id)
    .eq("session_date", sessionDate)
    .eq("service_label", svc)
    .maybeSingle();

  const row = {
    parent_person_id: pax.parent_person_id,
    contact_id: pax.contact_id,
    participant_display: pax.display_name || slug,
    session_date: sessionDate,
    service_label: svc,
    session_time: clean(ov.anchor_time_slot_label, 40),
    status: "pending_review",
    case_kind: caseKind,
    reason_code: reasonCode,
    reason_text: reasonText,
    proof_deadline: proofDeadline,
    schedule_override_id: ov.id,
    payload,
    updated_at: now,
  };

  console.log(
    APPLY ? "APPLY" : "DRY",
    caseKind,
    sessionDate,
    pax.display_name,
    svc,
    existing ? `exists:${existing.status}` : "new",
  );

  if (!APPLY) continue;

  if (existing) {
    if (["excused", "rejected"].includes(String(existing.status))) {
      skipped++;
      continue;
    }
    const { error: uErr } = await admin
      .from("portal_parent_absence_reports")
      .update(row)
      .eq("id", existing.id);
    if (uErr) {
      console.error("update fail", uErr.message);
      skipped++;
    } else {
      updated++;
    }
    continue;
  }

  const { error: iErr } = await admin.from("portal_parent_absence_reports").insert({
    ...row,
    created_at: ov.created_at || now,
  });
  if (iErr) {
    console.error("insert fail", iErr.message, dedupe);
    skipped++;
  } else {
    inserted++;
  }
}

console.log({ APPLY, since: SINCE, ovCount: (ovs || []).length, inserted, updated, skipped });
if (!APPLY) console.log("Re-run with APPLY=1 to write.");
