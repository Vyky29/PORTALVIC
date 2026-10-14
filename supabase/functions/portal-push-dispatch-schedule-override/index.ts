// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
// Deploy: supabase functions deploy portal-push-dispatch-schedule-override --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import {
  normalizeParentPhoneE164,
  sendParentMobileMessage,
  withStaffApiMachineFooter,
} from "../_shared/portal_parent_messaging.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

/** Push to the instructor whose live book changes.
 * - makeup / absence / slot_open → anchor_staff_id
 * - instructor_reassign → covering_staff_id (the worker who gains the session)
 * - instructor_reassign cancelled (was active) → same worker: cover removed
 * - slot_clear_client / slot_close / client_cancelled → that worker (named cover if set)
 * No push for move/reassign clears or COVER NEEDED placeholders. */
const ELIGIBLE = new Set([
  "client_replace_in_slot",
  "client_absence_announced",
  "slot_open",
  "instructor_reassign",
  "slot_clear_client",
  "slot_close",
  "client_cancelled",
  "session_add",
]);

function rosterKeyFromProfile(username: string, fullName: string): string {
  const raw = (username || "").trim() || (fullName || "").trim();
  if (!raw) return "";
  const first = raw.split(/\s+/).filter(Boolean)[0] ?? raw;
  return first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normSpreadsheetKey(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function payloadObj(record: Record<string, unknown>): Record<string, unknown> {
  const raw = record.payload;
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

function prettyClientLabel(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function replacementDisplayName(record: Record<string, unknown>): string {
  const pl = payloadObj(record);
  const a = String(pl.to_client_name ?? "").trim();
  if (a) return a;
  const b = String(pl.replacement_client_name ?? "").trim();
  return b;
}

function clientDisplayName(record: Record<string, unknown>): string {
  const pl = payloadObj(record);
  const fromPayload = String(
    pl.to_client_name ?? pl.replacement_client_name ?? "",
  ).trim();
  if (fromPayload) return fromPayload;
  return prettyClientLabel(String(record.anchor_client_id ?? "").trim());
}

function isSessionCancelType(t: string): boolean {
  return t === "slot_clear_client" || t === "slot_close" || t === "client_cancelled";
}

function isNamedBookedClient(record: Record<string, unknown>): boolean {
  const id = String(record.anchor_client_id ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!id) return false;
  return !(
    id === "available" ||
    id === "no_participant" ||
    id === "no_client" ||
    id === "noclient" ||
    id === "closed" ||
    id === "office" ||
    id === "manager" ||
    id === "home" ||
    id === "casa"
  );
}

function isSessionCancelledForInstructor(record: Record<string, unknown>): boolean {
  const t = String(record.override_type ?? "").trim();
  if (!isSessionCancelType(t)) return false;
  const pl = payloadObj(record);
  if (flagTrue(pl.client_move) || flagTrue(pl.day_reassign) || flagTrue(pl.not_makeup)) {
    return false;
  }
  const kind = String(
    pl.replace_kind || pl.booking_kind || pl.clear_kind || pl.session_kind || "",
  ).trim().toLowerCase();
  if (kind === "day_reassign" || kind === "slot_move" || kind === "instructor_day_cover") {
    return false;
  }
  if (!isNamedBookedClient(record)) return false;
  if (t === "client_cancelled" || t === "slot_close") return true;
  return t === "slot_clear_client" && flagTrue(pl.cancelled_by_admin);
}

function coverRosterKey(record: Record<string, unknown>): string {
  const pl = payloadObj(record);
  const fromId = normSpreadsheetKey(String(pl.covering_staff_id ?? ""));
  if (fromId && fromId !== "coverneeded" && fromId !== "cover_needed") {
    return fromId;
  }
  const fromName = normSpreadsheetKey(String(pl.covering_staff_name ?? ""));
  if (fromName && fromName !== "coverneeded" && !fromName.includes("coverneeded")) {
    return fromName;
  }
  return "";
}

function flagTrue(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function isTrialReplace(record?: Record<string, unknown>): boolean {
  if (!record) return false;
  const pl = payloadObj(record);
  if (pl.is_trial === true) return true;
  const k = String(pl.booking_kind || pl.session_kind || "").trim().toLowerCase();
  return k === "trial";
}

function isFinishBookingNewClient(record?: Record<string, unknown>): boolean {
  if (!record) return false;
  if (isTrialReplace(record)) return false;
  const pl = payloadObj(record);
  return flagTrue(pl.finish_booking) || flagTrue(pl.new_client) || flagTrue(pl.term_new_participant);
}

/** Day, time, instructor, or child. updated_at alone must not buzz the phone again. */
function rosterPushFingerprint(record: Record<string, unknown>): string {
  return [
    String(record.session_date ?? "").slice(0, 10),
    String(record.anchor_start ?? ""),
    String(record.anchor_end ?? ""),
    String(record.anchor_time_slot_label ?? ""),
    normSpreadsheetKey(String(record.anchor_staff_id ?? "")),
    String(record.override_type ?? "").trim(),
    String(record.status ?? "").trim(),
    clientDisplayName(record).toLowerCase(),
    isTrialReplace(record) ? "trial" : "",
    coverRosterKey(record),
  ].join("|");
}

function pushCopy(
  overrideType: string,
  record?: Record<string, unknown>,
  facts?: CoverFacts | null,
): { title: string; body: string } {
  const t = String(overrideType || "").trim();
  const who = (facts && facts.childName) || (record ? clientDisplayName(record) : "");
  if (t === "client_replace_in_slot") {
    const full = record ? replacementDisplayName(record) : "";
    const name = full.trim() || who;
    const trialName = name.replace(/\s*\(\s*trial[^)]*\)\s*/gi, " ").replace(/\s+/g, " ").trim();
    if (isTrialReplace(record)) {
      if (trialName) {
        return {
          title: `New client for trial: ${trialName}`,
          body: `${trialName} is on your roster for a trial.`,
        };
      }
      return {
        title: "New client for trial",
        body: "A trial was added to your roster.",
      };
    }
    if (isFinishBookingNewClient(record)) {
      if (name) {
        return {
          title: `New client: ${name}`,
          body: `${name} is now on your roster as a new client.`,
        };
      }
      return {
        title: "New client",
        body: "A new client was added to your roster.",
      };
    }
    if (name) {
      return {
        title: `Make-up: ${name}`,
        body: `${name} is on your roster for a make-up session.`,
      };
    }
    return {
      title: "Make-up session",
      body: "A make-up session was scheduled on your roster.",
    };
  }
  if (t === "client_absence_announced") {
    return {
      title: "Absent participant",
      body: who
        ? `${who} was marked absent on your roster.`
        : "An absence was recorded on your roster.",
    };
  }
  if (t === "slot_open") {
    return {
      title: "Slot reopened",
      body:
        "A closed block was reopened on your roster. Open that day in the portal to review your schedule.",
    };
  }
  if (t === "session_add") {
    const pl = record ? payloadObj(record) : {};
    const kind = String(pl.kind || record?.anchor_client_id || "").trim().toLowerCase();
    const when = record ? String(record.anchor_time_slot_label || "").trim() : "";
    const venue = record ? String(record.anchor_venue || "").trim() : "";
    const who = String(pl.client_name || pl.to_client_name || "").trim();
    let title = "New session";
    let what = who ? `${who} was added to your day` : "A session was added to your day";
    if (kind === "training") {
      title = "Training";
      what = "A training session was added to your day";
    } else if (kind === "shadowing") {
      title = "Shadowing";
      what = "A shadowing session was added to your day";
    } else if (kind === "meeting") {
      title = "Meeting";
      what = "A meeting was added to your day";
    }
    const bits = [what];
    if (when) bits.push(when);
    if (venue) bits.push(venue);
    return { title: title, body: bits.join(" · ") + "." };
  }
  if (t === "instructor_reassign") {
    const when = record
      ? String(record.anchor_time_slot_label || "").trim()
      : "";
    const venue = record ? String(record.anchor_venue || "").trim() : "";
    const removed = record && String(record.status || "").trim() === "cancelled";
    if (removed) {
      const bits = [
        who || "This session",
        "is no longer on your rota",
      ];
      if (when) bits.push(`· ${when}`);
      if (venue) bits.push(`· ${venue}`);
      return {
        title: who ? `Cover removed: ${who}` : "Cover removed",
        body: bits.join(" ") + ". You are not covering this session.",
      };
    }
    if (facts && facts.staffName) {
      const session = facts.when
        ? `Session with ${facts.childName}, ${facts.when}`
        : `Session with ${facts.childName}`;
      return {
        title: facts.childName ? `Cover: ${facts.childName}` : "Cover session",
        body: `You are covering ${facts.staffName}. ${session}.`,
      };
    }
    const bits = [who || "A participant", "is now on your roster (cover)"];
    if (when) bits.push(`· ${when}`);
    if (venue) bits.push(`· ${venue}`);
    return {
      title: who ? `Cover: ${who}` : "Cover session",
      body: bits.join(" ") + ".",
    };
  }
  if (isSessionCancelType(t)) {
    const when = record
      ? String(record.anchor_time_slot_label || "").trim()
      : "";
    const venue = record ? String(record.anchor_venue || "").trim() : "";
    const bits = [
      who || "A session",
      "was cancelled on your roster",
    ];
    if (when) bits.push(`· ${when}`);
    if (venue) bits.push(`· ${venue}`);
    return {
      title: who ? `Session cancelled: ${who}` : "Session cancelled",
      body: bits.join(" ") + ".",
    };
  }
  return { title: "Schedule update", body: "Your roster was updated." };
}

type StaffProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  app_role: string | null;
};

function ukDate(iso: string): string {
  const m = String(iso || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || "").slice(0, 10);
  return m[3] + "/" + m[2] + "/" + m[1];
}

function weekdayName(iso: string): string {
  const m = String(iso || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getUTCDay()] || "";
}

/** "16:00:00" and "4 to 4.30" are the same afternoon half. */
function startMinutes(raw: string): number | null {
  const s = String(raw || "").trim().toLowerCase();
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const label = s.match(/(\d{1,2})(?:[:.](\d{2}))?/);
  if (!label) return null;
  return Number(label[1]) * 60 + Number(label[2] || 0);
}

function sameClock(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  return Math.abs(a - b) === 12 * 60;
}

function displayPerson(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/\s/.test(s) && /[A-Z]/.test(s)) return s;
  return prettyClientLabel(s);
}

function personKeysMatch(rosterName: string, want: string): boolean {
  const r = normSpreadsheetKey(rosterName);
  const w = normSpreadsheetKey(want);
  if (!r || !w) return false;
  if (r === w || r.startsWith(w) || w.startsWith(r)) return true;
  return normSpreadsheetKey(String(rosterName || "").split(/\s+/)[0] || "") === w;
}

type CoverFacts = {
  staffName: string;
  childName: string;
  when: string;
  venue: string;
  area: string;
  dateLabel: string;
  sortMin: number;
};

/**
 * Cover WhatsApp names the instructor who is off, then the child who is actually
 * in that seat today (a same-slot swap wins over the standing child), then the
 * child's pool / area. Four paragraphs fill the staff template boxes.
 */
async function resolveCoverFacts(
  admin: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
): Promise<CoverFacts> {
  const staffName = displayPerson(String(record.anchor_staff_id || "")) || "the instructor";
  const standingChild = clientDisplayName(record) || "this session";
  const when = String(record.anchor_time_slot_label || "")
    .replace(/^[A-Za-z]+ · /, "")
    .trim();
  const venue = String(record.anchor_venue || "").trim();
  const iso = String(record.session_date || "").slice(0, 10);
  const seatStart = startMinutes(String(record.anchor_start || "") || when);
  let childName = standingChild;

  const { data: swaps } = await admin.from("schedule_overrides")
    .select("anchor_client_id, anchor_start, payload")
    .eq("session_date", iso)
    .eq("status", "active")
    .eq("override_type", "client_replace_in_slot")
    .eq("anchor_staff_id", String(record.anchor_staff_id || ""));
  const seatClient = normSpreadsheetKey(String(record.anchor_client_id || ""));
  for (const row of swaps || []) {
    if (!sameClock(seatStart, startMinutes(String(row.anchor_start || "")))) continue;
    const rowClient = normSpreadsheetKey(String(row.anchor_client_id || ""));
    if (seatClient && rowClient && seatClient !== rowClient) continue;
    const pl = row.payload && typeof row.payload === "object" ? row.payload : {};
    const next = displayPerson(String(
      pl.to_client_name || pl.replacement_client_name || "",
    ));
    if (next && normSpreadsheetKey(next) !== seatClient) childName = next;
  }

  let area = "";
  const day = weekdayName(iso);
  if (day && childName) {
    const token = childName.split(/\s+/)[0] || childName;
    const { data: rows } = await admin.from("portal_roster_rows")
      .select("client_name, time_slot, area, service, session_date")
      .eq("status", "active")
      .ilike("day", day)
      .ilike("client_name", `%${token}%`)
      .limit(40);
    const matches = (rows || []).filter((row) => personKeysMatch(String(row.client_name || ""), childName));
    const timed = matches.filter((row) => sameClock(seatStart, startMinutes(String(row.time_slot || ""))));
    const pool = timed.length ? timed : matches;
    const standing = pool.find((row) => !row.session_date) || pool[0];
    area = String(standing?.area || standing?.service || "").trim();
  }

  return {
    staffName,
    childName,
    when,
    venue,
    area: area || "Area not on the roster",
    dateLabel: ukDate(iso),
    sortMin: seatStart == null ? 0 : seatStart,
  };
}

function coverWhatsappParagraphs(
  first: string,
  facts: CoverFacts,
  direction: "assigned" | "removed",
): string {
  const session = facts.when
    ? `Session with ${facts.childName}, ${facts.when}`
    : `Session with ${facts.childName}`;
  const lead = direction === "removed"
    ? `You are no longer covering ${facts.staffName}. ${session}. That cover was removed.`
    : `You are covering ${facts.staffName}. ${session}.`;
  const where = [facts.dateLabel, facts.venue].filter(Boolean).join(" - ");
  return `Hi ${first},\n\n${lead}\n\n${where}.\n\n${facts.area}`;
}

function coverEventKey(direction: "assigned" | "removed", rosterKey: string): string {
  return direction + ":" + String(rosterKey || "").slice(0, 80);
}

const COVER_BATCH_WAIT_MS = 60_000;

/** Several covers in a row become one WhatsApp. One session keeps the four-box text. */
function coverBatchParagraphs(
  first: string,
  factsList: CoverFacts[],
  direction: "assigned" | "removed",
): string {
  const ordered = factsList.slice().sort((a, b) => a.sortMin - b.sortMin);
  if (ordered.length === 1) return coverWhatsappParagraphs(first, ordered[0], direction);
  const staffs: string[] = [];
  for (const facts of ordered) {
    if (facts.staffName && !staffs.includes(facts.staffName)) staffs.push(facts.staffName);
  }
  const who = staffs.join(" and ") || "the instructor";
  const lead = direction === "removed"
    ? `You are no longer covering ${who}.`
    : `You are covering ${who}.`;
  const sessions = ordered.map((facts) => {
    const prefix = staffs.length > 1 ? `${facts.staffName}: ` : "";
    const when = facts.when ? `, ${facts.when}` : "";
    const area = facts.area && facts.area !== "Area not on the roster" ? `, ${facts.area}` : "";
    return `${prefix}${facts.childName}${when}${area}`;
  }).join(". ");
  const places: string[] = [];
  for (const facts of ordered) {
    const where = [facts.dateLabel, facts.venue].filter(Boolean).join(" - ");
    if (where && !places.includes(where)) places.push(where);
  }
  return `Hi ${first},\n\n${lead}\n\n${sessions}.\n\n${places.join(". ")}.`;
}

/** Drop this override from an open batch. True when it was still waiting, so it was never texted. */
async function pullPendingCoverOverride(
  admin: ReturnType<typeof createClient>,
  overrideId: string,
  direction: "assigned" | "removed",
): Promise<boolean> {
  const { data } = await admin.from("portal_cover_whatsapp_batch")
    .select("id, override_ids")
    .eq("status", "pending")
    .eq("direction", direction)
    .contains("override_ids", [overrideId]);
  let found = false;
  for (const row of data || []) {
    found = true;
    const ids = (Array.isArray(row.override_ids) ? row.override_ids : [])
      .map((id: unknown) => String(id))
      .filter((id: string) => id && id !== overrideId);
    if (!ids.length) {
      await admin.from("portal_cover_whatsapp_batch").delete().eq("id", row.id).eq("status", "pending");
    } else {
      await admin.from("portal_cover_whatsapp_batch").update({
        override_ids: ids,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "pending");
    }
  }
  return found;
}

/**
 * Hold the cover WhatsApp for one minute. Another override for the same
 * instructor and day resets the minute. One message goes out after a quiet minute.
 */
async function enqueueCoverWhatsapp(
  admin: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
  direction: "assigned" | "removed",
  rosterKey: string,
) {
  const overrideId = String(record.id ?? "").trim();
  const sessionDate = String(record.session_date ?? "").slice(0, 10);
  if (!overrideId || !rosterKey || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return;

  if (direction === "removed") {
    const stillWaiting = await pullPendingCoverOverride(admin, overrideId, "assigned");
    if (stillWaiting) return;
  } else {
    await pullPendingCoverOverride(admin, overrideId, "removed");
  }

  const event = coverEventKey(direction, rosterKey);
  const { data: already } = await admin.from("portal_cover_whatsapp_sent")
    .select("override_id")
    .eq("override_id", overrideId)
    .eq("event", event)
    .maybeSingle();
  if (already) return;

  const sendAfter = new Date(Date.now() + COVER_BATCH_WAIT_MS).toISOString();
  const patchOpen = async (row: { id: string; override_ids?: unknown }) => {
    const ids = (Array.isArray(row.override_ids) ? row.override_ids : []).map((id: unknown) => String(id));
    if (ids.includes(overrideId)) return;
    ids.push(overrideId);
    await admin.from("portal_cover_whatsapp_batch").update({
      override_ids: ids,
      send_after: sendAfter,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "pending");
  };

  const { data: open } = await admin.from("portal_cover_whatsapp_batch")
    .select("id, override_ids")
    .eq("roster_key", rosterKey)
    .eq("session_date", sessionDate)
    .eq("direction", direction)
    .eq("status", "pending")
    .maybeSingle();
  if (open) {
    await patchOpen(open);
    return;
  }

  const { error } = await admin.from("portal_cover_whatsapp_batch").insert({
    roster_key: rosterKey,
    session_date: sessionDate,
    direction,
    send_after: sendAfter,
    override_ids: [overrideId],
    status: "pending",
  });
  if (!error) return;
  const code = (error as { code?: string }).code || "";
  if (code !== "23505" && !String(error.message || "").includes("duplicate")) {
    console.warn("[portal-push-dispatch] cover batch enqueue", error);
    return;
  }
  const { data: raced } = await admin.from("portal_cover_whatsapp_batch")
    .select("id, override_ids")
    .eq("roster_key", rosterKey)
    .eq("session_date", sessionDate)
    .eq("direction", direction)
    .eq("status", "pending")
    .maybeSingle();
  if (raced) await patchOpen(raced);
}

async function sendCoverBatchWhatsapp(
  admin: ReturnType<typeof createClient>,
  batch: {
    id: string;
    roster_key: string;
    direction: string;
    override_ids?: unknown;
  },
) {
  const direction = batch.direction === "removed" ? "removed" : "assigned";
  const rosterKey = String(batch.roster_key || "");
  const overrideIds = (Array.isArray(batch.override_ids) ? batch.override_ids : [])
    .map((id: unknown) => String(id || "").trim())
    .filter(Boolean);
  const fresh: string[] = [];
  for (const overrideId of overrideIds) {
    const event = coverEventKey(direction, rosterKey);
    const { error: insErr } = await admin.from("portal_cover_whatsapp_sent").insert({
      override_id: overrideId,
      event,
    });
    if (insErr) {
      const code = (insErr as { code?: string }).code || "";
      if (code === "23505" || String(insErr.message || "").includes("duplicate")) continue;
      console.warn("[portal-push-dispatch] cover batch ledger", insErr);
      continue;
    }
    fresh.push(overrideId);
  }
  if (!fresh.length) return;

  const { data: records } = await admin.from("schedule_overrides")
    .select("id, session_date, anchor_staff_id, anchor_client_id, anchor_start, anchor_time_slot_label, anchor_venue, payload")
    .in("id", fresh);
  const facts: CoverFacts[] = [];
  for (const record of records || []) {
    facts.push(await resolveCoverFacts(admin, record as Record<string, unknown>));
  }
  if (!facts.length) {
    for (const overrideId of fresh) {
      await admin.from("portal_cover_whatsapp_sent").delete()
        .eq("override_id", overrideId)
        .eq("event", coverEventKey(direction, rosterKey));
    }
    return;
  }

  const { data: profiles } = await admin.from("staff_profiles")
    .select("id, full_name, username, phone_e164, app_role")
    .in("app_role", ["staff", "lead", "ceo"]);
  const people = (profiles || []).filter((p) =>
    rosterKeyFromProfile(String(p.username || ""), String(p.full_name || "")) === rosterKey
  );
  let sent = 0;
  let attempted = 0;
  let body = "";
  for (const p of people) {
    if (String(p.username || "").trim().toLowerCase() === "michelle") continue;
    const phone = normalizeParentPhoneE164(String(p.phone_e164 || ""));
    if (!phone) continue;
    attempted++;
    const first = String(p.full_name || p.username || "there").trim().split(/\s+/)[0] || "there";
    body = coverBatchParagraphs(first, facts, direction);
    const result = await sendParentMobileMessage(phone, withStaffApiMachineFooter(body), {
      kind: "staff_contact_update",
    });
    if (result.ok) sent++;
    else console.warn("[portal-push-dispatch] cover batch wa", result.error);
    await admin.from("portal_staff_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: "staff_contact_update",
      channel: "whatsapp",
      staff_profile_id: p.id,
      staff_username: p.username || null,
      staff_display_name: p.full_name || p.username || null,
      staff_phone: phone,
      subject: null,
      body_text: body,
      whatsapp_status: result.ok ? (result.channel === "sms" ? "sent_sms" : "sent") : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : (result.error || "send_failed"),
      meta: {
        used_template: true,
        wa_client_body: body,
        override_ids: fresh,
        cover_direction: direction,
        source: "schedule_override_cover_batch",
      },
    });
  }
  if (!sent && attempted) {
    for (const overrideId of fresh) {
      await admin.from("portal_cover_whatsapp_sent").delete()
        .eq("override_id", overrideId)
        .eq("event", coverEventKey(direction, rosterKey));
    }
    throw new Error("cover_batch_not_sent");
  }
}

async function flushCoverWhatsappBatches(admin: ReturnType<typeof createClient>) {
  const now = new Date().toISOString();
  const { data: due, error } = await admin.from("portal_cover_whatsapp_batch")
    .select("id, roster_key, direction, override_ids, send_after")
    .eq("status", "pending")
    .lte("send_after", now)
    .limit(20);
  if (error) {
    console.warn("[portal-push-dispatch] cover batch due", error);
    return { flushed: 0 };
  }
  let flushed = 0;
  for (const row of due || []) {
    const { data: claimed } = await admin.from("portal_cover_whatsapp_batch")
      .update({ status: "sending", updated_at: now })
      .eq("id", row.id)
      .eq("status", "pending")
      .lte("send_after", now)
      .select("id, roster_key, direction, override_ids")
      .maybeSingle();
    if (!claimed) continue;
    try {
      await sendCoverBatchWhatsapp(admin, claimed);
      await admin.from("portal_cover_whatsapp_batch")
        .update({ status: "sent", updated_at: new Date().toISOString() })
        .eq("id", claimed.id);
      flushed++;
    } catch (e) {
      console.warn("[portal-push-dispatch] cover batch flush", e);
      await admin.from("portal_cover_whatsapp_batch").update({
        status: "pending",
        send_after: new Date(Date.now() + COVER_BATCH_WAIT_MS).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", claimed.id).eq("status", "sending");
    }
  }
  return { flushed };
}

/** WhatsApp the named cover. Assigned and removed are separate, so undoing the override texts the same worker again. */
async function sendCoverStaffWhatsapp(
  admin: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
  userIds: string[],
  direction: "assigned" | "removed",
  rosterKey: string,
  facts?: CoverFacts,
) {
  const overrideId = String(record.id ?? "").trim();
  if (!overrideId || !userIds.length || !rosterKey) return;
  const event = coverEventKey(direction, rosterKey);
  const { error: insErr } = await admin.from("portal_cover_whatsapp_sent").insert({
    override_id: overrideId,
    event,
  });
  if (insErr) {
    const code = (insErr as { code?: string }).code || "";
    const msg = insErr.message || "";
    if (code === "23505" || msg.includes("duplicate")) return;
    console.warn("[portal-push-dispatch] cover wa ledger", insErr);
    return;
  }
  const resolved = facts || await resolveCoverFacts(admin, record);
  const { data: people } = await admin.from("staff_profiles")
    .select("id, full_name, username, phone_e164")
    .in("id", userIds);
  let sent = 0;
  let attempted = 0;
  for (const p of people || []) {
    if (String(p.username || "").trim().toLowerCase() === "michelle") continue;
    const phone = normalizeParentPhoneE164(String(p.phone_e164 || ""));
    if (!phone) continue;
    attempted++;
    const first = String(p.full_name || p.username || "there").trim().split(/\s+/)[0] || "there";
    const body = coverWhatsappParagraphs(first, resolved, direction);
    const result = await sendParentMobileMessage(phone, withStaffApiMachineFooter(body), {
      kind: "staff_contact_update",
    });
    if (result.ok) sent++;
    else console.warn("[portal-push-dispatch] cover wa", result.error);
    await admin.from("portal_staff_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: "staff_contact_update",
      channel: "whatsapp",
      staff_profile_id: p.id,
      staff_username: p.username || null,
      staff_display_name: p.full_name || p.username || null,
      staff_phone: phone,
      subject: null,
      body_text: body,
      whatsapp_status: result.ok ? (result.channel === "sms" ? "sent_sms" : "sent") : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : (result.error || "send_failed"),
      meta: {
        used_template: true,
        wa_client_body: body,
        override_id: overrideId,
        cover_direction: direction,
        source: "schedule_override_cover",
      },
    });
  }
  if (!sent && attempted) {
    await admin.from("portal_cover_whatsapp_sent").delete().eq("override_id", overrideId).eq("event", event);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const expected = Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const got = req.headers.get("x-portal-webhook-secret") ?? "";
  if (!expected || got !== expected) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ??
    "mailto:hello@clubsensational.org";
  const openBase = (Deno.env.get("PORTAL_PUSH_OPEN_URL") ?? "").replace(
    /\/$/,
    "",
  );

  if (
    !supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate || !openBase
  ) {
    console.error(
      "[portal-push-dispatch] missing env (SUPABASE_*, VAPID_*, PORTAL_PUSH_OPEN_URL)",
    );
    return new Response("Server misconfigured", {
      status: 500,
      headers: corsHeaders,
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown> | null;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400, headers: corsHeaders });
  }

  if (String((payload as { action?: string }).action || "") === "flush_cover_batches") {
    const flushAdmin = createClient(supabaseUrl, serviceKey);
    const result = await flushCoverWhatsappBatches(flushAdmin);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (payload.table !== "schedule_overrides") {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return new Response(JSON.stringify({ skipped: true, reason: "no record" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const status = String(record.status ?? "").trim();
  const oldStatus = String(payload.old_record?.status ?? "").trim();
  const coverRemoved =
    status === "cancelled" &&
    String(record.override_type ?? "").trim() === "instructor_reassign" &&
    (!oldStatus || oldStatus === "active");
  if (status !== "active" && !coverRemoved) {
    return new Response(JSON.stringify({ skipped: true, reason: "not active" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const overrideType = String(record.override_type ?? "").trim();
  if (!ELIGIBLE.has(overrideType)) {
    return new Response(JSON.stringify({ skipped: true, reason: "type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (isSessionCancelType(overrideType) &&
    !isSessionCancelledForInstructor(record as Record<string, unknown>)) {
    return new Response(JSON.stringify({ skipped: true, reason: "not instructor cancel" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const overrideId = String(record.id ?? "").trim();
  if (!overrideId) {
    return new Response(JSON.stringify({ skipped: true, reason: "no id" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionDate = String(record.session_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return new Response(JSON.stringify({ skipped: true, reason: "bad date" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: horizonOk, error: hzErr } = await admin.rpc(
    "portal_session_date_in_push_horizon",
    { p_session: sessionDate },
  );
  if (hzErr) {
    console.error("[portal-push-dispatch] horizon rpc", hzErr);
    return new Response(JSON.stringify({ error: hzErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!horizonOk) {
    return new Response(JSON.stringify({ skipped: true, reason: "outside horizon" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  /** instructor_reassign → covering worker; session cancel prefers named cover else anchor. */
  let targetRosterKey = "";
  if (overrideType === "instructor_reassign") {
    targetRosterKey = coverRosterKey(record as Record<string, unknown>);
    if (!targetRosterKey) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no covering staff" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (isSessionCancelType(overrideType)) {
    targetRosterKey = coverRosterKey(record as Record<string, unknown>) ||
      normSpreadsheetKey(String(record.anchor_staff_id ?? ""));
  } else {
    targetRosterKey = normSpreadsheetKey(String(record.anchor_staff_id ?? ""));
  }
  if (!targetRosterKey) {
    return new Response(JSON.stringify({ ok: true, sent: 0, targets: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const skipPushKey = normSpreadsheetKey(
    String(payloadObj(record as Record<string, unknown>).skip_push_staff_key ?? ""),
  );
  if (
    overrideType === "client_absence_announced" &&
    skipPushKey &&
    skipPushKey === targetRosterKey
  ) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "actor_already_marked" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { data: profiles, error: profErr } = await admin.from("staff_profiles")
    .select("id, username, full_name, app_role")
    .in("app_role", ["staff", "lead", "ceo"]);

  if (profErr || !profiles?.length) {
    console.error("[portal-push-dispatch] profiles", profErr);
    return new Response(JSON.stringify({ error: "profiles" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetUserIds = new Set<string>();
  for (const p of profiles as StaffProfile[]) {
    const rk = rosterKeyFromProfile(p.username ?? "", p.full_name ?? "");
    if (rk === targetRosterKey) targetUserIds.add(p.id);
  }

  if (!targetUserIds.size) {
    return new Response(JSON.stringify({ ok: true, sent: 0, targets: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = [...targetUserIds];

  const coverFacts = overrideType === "instructor_reassign"
    ? await resolveCoverFacts(admin, record as Record<string, unknown>)
    : null;

  if (overrideType === "instructor_reassign") {
    const direction = coverRemoved ? "removed" : "assigned";
    await enqueueCoverWhatsapp(
      admin,
      record as Record<string, unknown>,
      direction,
      targetRosterKey,
    );
    if (!coverRemoved && payload.old_record && typeof payload.old_record === "object") {
      const oldKey = coverRosterKey(payload.old_record as Record<string, unknown>);
      if (oldKey && oldKey !== targetRosterKey) {
        await enqueueCoverWhatsapp(
          admin,
          payload.old_record as Record<string, unknown>,
          "removed",
          oldKey,
        );
      }
    }
  }

  const { data: subs, error: subErr } = await admin.from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json")
    .in("user_id", ids)
    .eq("register_app", "portal");

  if (subErr) {
    console.error("[portal-push-dispatch] subs", subErr);
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!subs?.length) {
    if (isSessionCancelType(overrideType)) {
      return new Response(
        JSON.stringify({
          ok: true,
          sent: 0,
          targets: ids.length,
          note: "no push subscriptions",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        sent: 0,
        targets: ids.length,
        note: "no push subscriptions for targeted users",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const isUpdate = String(payload.type || "").toUpperCase() === "UPDATE";
  const oldRec = payload.old_record && typeof payload.old_record === "object"
    ? payload.old_record as Record<string, unknown>
    : null;
  if (isUpdate && oldRec) {
    if (rosterPushFingerprint(record as Record<string, unknown>) === rosterPushFingerprint(oldRec)) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "unchanged" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    await admin.from("portal_webpush_override_sent").delete().eq("override_id", overrideId);
  }

  const { error: dedupeErr } = await admin.from("portal_webpush_override_sent")
    .insert({ override_id: overrideId });

  if (dedupeErr) {
    const msg = dedupeErr.message || "";
    if (msg.includes("duplicate") || (dedupeErr as { code?: string }).code === "23505") {
      if (coverRemoved) {
        const removedEvent = "push_removed";
        const { error: pushLedgerErr } = await admin.from("portal_cover_whatsapp_sent").insert({
          override_id: overrideId,
          event: removedEvent,
        });
        const pushDup = pushLedgerErr &&
          ((pushLedgerErr as { code?: string }).code === "23505" ||
            (pushLedgerErr.message || "").includes("duplicate"));
        if (!pushLedgerErr || !pushDup) {
          if (pushLedgerErr && !pushDup) {
            console.warn("[portal-push-dispatch] cover removed push ledger", pushLedgerErr);
          } else if (subs?.length) {
            const copy = pushCopy(overrideType, record as Record<string, unknown>, coverFacts);
            const notifyUrl = `${openBase}?portalOpen=alerts`;
            const pushPayload = JSON.stringify({
              title: copy.title,
              body: `${copy.body} Date: ${sessionDate}.`,
              url: notifyUrl,
              portalOpen: "alerts",
              vibrate: [200, 80, 200, 80, 280, 100, 200],
            });
            for (const row of subs) {
              const raw = row.subscription_json;
              if (!raw || typeof raw !== "object") continue;
              try {
                await webpush.sendNotification(
                  raw as unknown as webpush.PushSubscription,
                  pushPayload,
                  { TTL: 86400, urgency: "high" },
                );
              } catch (e) {
                console.warn("[portal-push-dispatch] cover removed push", e);
              }
            }
          }
        }
      }
      return new Response(JSON.stringify({ skipped: true, reason: "already sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("[portal-push-dispatch] dedupe insert", dedupeErr);
    return new Response(JSON.stringify({ error: dedupeErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const copy = pushCopy(overrideType, record as Record<string, unknown>, coverFacts);
  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const body = `${copy.body} Date: ${sessionDate}.`;
  const pushPayload = JSON.stringify({
    title: copy.title,
    body,
    url: notifyUrl,
    portalOpen: "alerts",
    vibrate: [200, 80, 200, 80, 280, 100, 200],
  });

  let sent = 0;
  const rows = subs ?? [];

  for (const row of rows) {
    const userId = String(row.user_id ?? "");
    const raw = row.subscription_json;
    if (!raw || typeof raw !== "object") continue;
    try {
      await webpush.sendNotification(
        raw as unknown as webpush.PushSubscription,
        pushPayload,
        { TTL: 86400, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const st = (e as { statusCode?: number })?.statusCode;
      console.warn("[portal-push-dispatch] send fail", st, e);
      if (st === 404 || st === 410) {
        const ep = String(row.endpoint ?? (raw as { endpoint?: string }).endpoint ?? "");
        if (ep) {
          await admin.from("portal_push_subscriptions").delete().eq(
            "user_id",
            userId,
          ).eq("endpoint", ep);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, targets: ids.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
