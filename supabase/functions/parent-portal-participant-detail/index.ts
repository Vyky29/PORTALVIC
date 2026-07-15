// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-participant-detail
// --------------------------------
// Sessions overview + parent-safe feedback + achievement photos for one linked child.
//
// Headers: x-parent-portal-session
// Body: { contact_id: string, sections?: ("general"|"sessions"|"achievements"|"swim"|"weekly_notes")[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import {
  resolveParentPortalSession,
} from "../_shared/parent_portal_session.ts";
import {
  feedbackAuthorFirstName,
  resolveFeedbackAuthorRole,
} from "../_shared/parent_feedback_author_role.ts";
import { enforceParticipantFirstNameInText } from "../_shared/participant_feedback_name.ts";
import { resolveParticipantAvatarUrls } from "../_shared/participant_avatar.ts";
import {
  lookupClientsInfoSheetForParticipant,
  parseGeneralInfoSheet,
} from "../_shared/participant_general_info.ts";
import {
  expandParticipantClientSlugs,
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
  slugifyParticipantKey,
} from "../_shared/participant_identity.ts";
import {
  buildParentAttendanceSummary,
  PARENT_SESSION_TERM_START_ISO,
} from "../_shared/parent_attendance_summary.ts";
import { REENROL_ACADEMIC_YEAR } from "../_shared/reenrolment_catalog.ts";
import { buildReenrolmentParentSummary } from "../_shared/reenrolment_parent_summary.ts";

const ACH_BUCKET = "participant-achievements";
const DOC_BUCKET = "documents";
/** Same folder rows as admin participant gallery (exclude lead inbox). */
const PARENT_ACH_STATUSES = ["draft", "attached", "archived_unused", "downloaded"] as const;
const LEAD_INBOX_CLIENT_ID = "_inbox";
/** Max achievement rows returned per parent page load. */
const PARENT_ACH_QUERY_LIMIT = 500;
/** Max feedback rows returned per parent page load. */
const PARENT_FEEDBACK_LIMIT = 60;
const TERM_LABEL = "Summer Term 2026";

type DetailSection = "general" | "sessions" | "achievements" | "swim" | "weekly_notes";

function parseSections(raw: unknown): Set<DetailSection> {
  const all = new Set<DetailSection>([
    "general",
    "sessions",
    "achievements",
    "swim",
    "weekly_notes",
  ]);
  if (!Array.isArray(raw) || !raw.length) return all;
  const out = new Set<DetailSection>();
  for (const item of raw) {
    const t = clean(item, 40).toLowerCase();
    if (
      t === "general" ||
      t === "sessions" ||
      t === "achievements" ||
      t === "swim" ||
      t === "weekly_notes"
    ) {
      out.add(t as DetailSection);
    }
  }
  return out.size ? out : all;
}

const TEAM_FEEDBACK_SINCE = "2026-06-01";

function staffKeyFromName(raw: string): string {
  let k = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)[0] || "";
  if (k === "yousef" || k === "yusef") k = "youssef";
  if (k === "lulia") k = "luliya";
  if (k === "javi") k = "javier";
  return k;
}

function upsertTeamMember(
  map: Map<string, Record<string, unknown>>,
  key: string,
  patch: Record<string, unknown>,
) {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return;
  const prev = map.get(k) || {
    staff_key: k,
    name: "",
    avatar_url: "/portal/staff_photos/" + k + ".png",
    role: "instructor",
  };
  const name =
    clean(patch.name, 80) || clean(prev.name, 80) || k.charAt(0).toUpperCase() + k.slice(1);
  map.set(k, {
    ...prev,
    ...patch,
    staff_key: k,
    name,
    avatar_url:
      clean(patch.avatar_url, 200) ||
      clean(prev.avatar_url, 200) ||
      "/portal/staff_photos/" + k + ".png",
  });
}

/** Instructors from feedback + covering staff from schedule_overrides. */
async function buildParentTeam(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  clientSlugs: string[],
  feedbackRows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const map = new Map<string, Record<string, unknown>>();

  for (const row of feedbackRows || []) {
    const date = isoFromAny(row.session_date);
    if (!date || date < TEAM_FEEDBACK_SINCE) continue;
    const name = clean(row.completed_by_name, 120);
    const key = staffKeyFromName(name);
    if (!key) continue;
    upsertTeamMember(map, key, {
      name: feedbackAuthorFirstName(name) || name,
      role: "instructor",
    });
  }

  const slugSet = new Set(clientSlugs.map((s) => String(s || "").toLowerCase()).filter(Boolean));

  if (slugSet.size) {
    const { data: ovRows, error } = await supabase
      .from("schedule_overrides")
      .select("session_date, override_type, status, payload, anchor_staff_id, anchor_client_id")
      .eq("status", "active")
      .in("override_type", ["instructor_reassign", "client_replace_in_slot"])
      .gte("session_date", PARENT_SESSION_TERM_START_ISO)
      .limit(300);
    if (error) {
      console.error("[parent-portal-participant-detail] team overrides", error.message);
    }
    for (const ov of ovRows || []) {
      const pl = (ov && ov.payload && typeof ov.payload === "object" ? ov.payload : {}) as Record<
        string,
        unknown
      >;
      const ot = clean(ov.override_type, 40);
      const anchorClient = clean(ov.anchor_client_id, 80).toLowerCase();
      const toClient = clean(pl.to_client_id || pl.replacement_client_id, 80).toLowerCase();
      const forThisChild =
        (anchorClient && slugSet.has(anchorClient)) || (toClient && slugSet.has(toClient));
      if (!forThisChild) continue;

      if (ot === "instructor_reassign") {
        const slug =
          clean(pl.covering_staff_id, 80) || staffKeyFromName(clean(pl.covering_staff_name, 120));
        const name = clean(pl.covering_staff_name, 120) || clean(pl.to_staff_name, 120);
        if (slug) {
          upsertTeamMember(map, staffKeyFromName(slug) || slug.toLowerCase(), {
            name: name || slug,
            role: "cover",
          });
        }
      } else if (ot === "client_replace_in_slot") {
        const staffSlug = clean(ov.anchor_staff_id, 80);
        if (staffSlug && (pl.open_slot_makeup || pl.parent_portal_makeup || toClient)) {
          upsertTeamMember(map, staffKeyFromName(staffSlug) || staffSlug.toLowerCase(), {
            name: staffSlug,
            role: "cover",
          });
        }
      }
    }
  }

  return [...map.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

async function detectHasAquatics(
  supabase: ReturnType<typeof createClient>,
  clientSlugs: string[],
): Promise<boolean> {
  if (!clientSlugs.length) return false;
  const { data } = await supabase
    .from("session_feedback")
    .select("service")
    .in("client_id", clientSlugs)
    .order("session_date", { ascending: false })
    .limit(12);
  return (data || []).some((row) => isAquaticService(row.service));
}

/** Acton / Northolt pool sites — achievement photos are not taken (centre rules). */
function isCentreAquaticVenue(raw: unknown): boolean {
  const v = clean(raw, 80).toLowerCase();
  return v === "acton" || v === "northolt";
}

/**
 * True when every active roster slot for this child is Aquatic Activity at Acton or Northolt.
 * Parents in that programme should see an empty achievement gallery with a centre-rules note.
 */
async function detectAquaticOnlyNoPhotos(
  supabase: ReturnType<typeof createClient>,
  identityInput: {
    contactId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  },
  lookupNames: string[],
): Promise<boolean> {
  const names = [
    ...new Set(
      [...lookupNames.slice(0, 5), identityInput.displayName || ""]
        .map((n) => clean(n, 80))
        .filter(Boolean),
    ),
  ];
  if (!names.length) return false;

  const queries = names.map((nm) =>
    supabase
      .from("portal_roster_rows")
      .select("client_name, service, venue, status")
      .eq("status", "active")
      .ilike("client_name", nm)
      .limit(40),
  );

  const rows: Array<{ service?: unknown; venue?: unknown; client_name?: unknown }> = [];
  const seen = new Set<string>();
  const results = await Promise.all(queries);
  for (const { data } of results) {
    for (const row of data || []) {
      if (!row) continue;
      if (!participantIdentityMatches(identityInput, String(row.client_name || ""), "")) continue;
      const key = [
        clean(row.client_name, 80),
        clean(row.service, 80),
        clean(row.venue, 80),
      ]
        .join("|")
        .toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  if (!rows.length) return false;
  return rows.every((r) => isAquaticService(r.service) && isCentreAquaticVenue(r.venue));
}

/** Preferred venue per programme (and optional day/time) for Sessions Overview. */
async function loadParticipantVenueByService(
  supabase: ReturnType<typeof createClient>,
  identityInput: {
    contactId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  },
  lookupNames: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const put = (key: string, venue: string) => {
    const k = clean(key, 120).toLowerCase();
    const v = clean(venue, 80);
    if (!k || !v || map.has(k)) return;
    map.set(k, v);
  };
  const rememberSlot = (service: unknown, venue: unknown, day?: unknown, timeSlot?: unknown) => {
    const rawSvc = clean(service, 120);
    const canon = canonicalProgrammeName(rawSvc) || rawSvc;
    const ven = clean(venue, 80);
    if (!ven) return;
    const dayKey = clean(day, 20).toLowerCase();
    const timeKey = clean(timeSlot, 40).toLowerCase().replace(/\./g, ":").replace(/\s+/g, " ");
    if (canon) {
      put(canon, ven);
      if (dayKey) put(`${canon}|${dayKey}`, ven);
      if (dayKey && timeKey) put(`${canon}|${dayKey}|${timeKey}`, ven);
    }
    if (rawSvc) {
      put(rawSvc, ven);
      if (dayKey) put(`${rawSvc}|${dayKey}`, ven);
      if (dayKey && timeKey) put(`${rawSvc}|${dayKey}|${timeKey}`, ven);
    }
  };

  const slugs = [
    ...new Set(
      resolveParticipantClientSlugs(identityInput)
        .map((s) => slugifyParticipantKey(s))
        .filter(Boolean),
    ),
  ];

  if (slugs.length) {
    try {
      const { data } = await supabase
        .from("portal_participant_service_lines")
        .select("client_key, sessions")
        .in("client_key", slugs)
        .limit(8);
      for (const row of data || []) {
        const sessions = Array.isArray(row.sessions) ? row.sessions : [];
        for (const slot of sessions) {
          if (!slot || typeof slot !== "object") continue;
          const s = slot as Record<string, unknown>;
          rememberSlot(s.service, s.venue, s.day, s.timeSlot || s.time_slot || s.time);
        }
      }
    } catch (e) {
      console.warn("[parent-portal-participant-detail] venue from service_lines", e);
    }
  }

  const names = [
    ...new Set(
      [...lookupNames.slice(0, 5), identityInput.displayName || "", identityInput.firstName || ""]
        .map((n) => clean(n, 80))
        .filter(Boolean),
    ),
  ];
  const queries = [];
  for (const nm of names) {
    queries.push(
      supabase
        .from("portal_roster_rows")
        .select("client_name, service, venue, day, time_slot, status")
        .eq("status", "active")
        .ilike("client_name", nm)
        .limit(80),
    );
    const first = nm.split(/\s+/)[0];
    if (first && first.length >= 2 && first.toLowerCase() !== nm.toLowerCase()) {
      queries.push(
        supabase
          .from("portal_roster_rows")
          .select("client_name, service, venue, day, time_slot, status")
          .eq("status", "active")
          .ilike("client_name", `${first}%`)
          .limit(80),
      );
    }
  }
  if (queries.length) {
    const results = await Promise.all(queries);
    for (const { data } of results) {
      for (const row of data || []) {
        if (!row) continue;
        if (!participantIdentityMatches(identityInput, String(row.client_name || ""), "")) continue;
        rememberSlot(row.service, row.venue, row.day, row.time_slot);
      }
    }
  }

  return map;
}

function weekdayLongFromIso(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long" });
  } catch (_) {
    return "";
  }
}

function normalizeParentTimeKey(raw: unknown): string {
  return clean(raw, 40)
    .toLowerCase()
    .replace(/\./g, ":")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, " to ")
    .replace(/\s*—\s*/g, " to ");
}

function resolveVenueForSession(
  venueByService: Map<string, string>,
  service: string,
  sessionDate: string,
  sessionTime: string,
): string {
  const canon = canonicalProgrammeName(service) || service;
  const day = weekdayLongFromIso(sessionDate).toLowerCase();
  const timeKey = normalizeParentTimeKey(sessionTime);
  const keys = [
    canon && day && timeKey ? `${canon}|${day}|${timeKey}` : "",
    service && day && timeKey ? `${service}|${day}|${timeKey}` : "",
    canon && day ? `${canon}|${day}` : "",
    service && day ? `${service}|${day}` : "",
    canon || "",
    service || "",
  ]
    .map((k) => k.toLowerCase())
    .filter(Boolean);
  for (const k of keys) {
    const hit = venueByService.get(k);
    if (hit) return hit;
  }
  /* Soft time match: same service+day, any stored time that shares the start token. */
  if (canon && day && timeKey) {
    const startTok = timeKey.split(/\s+to\s+|\s*-\s*/)[0] || "";
    if (startTok) {
      for (const [k, v] of venueByService.entries()) {
        if (k.indexOf(`${canon.toLowerCase()}|${day}|`) === 0 && k.indexOf(startTok) >= 0) return v;
      }
    }
  }
  return "";
}

function isAquaticService(raw: unknown): boolean {
  const p = clean(raw, 200).toLowerCase();
  return /aquatic|swim|pool|splash/.test(p);
}

function canonicalProgrammeName(raw: unknown): string {
  const t = clean(raw, 200);
  if (!t) return "";
  const p = t.toLowerCase().replace(/\s+/g, " ");
  if (/multi[\s_-]*activity|splash[\s&+]+connect/.test(p)) return "Multi-Activity";
  if (/\bfitness\b|physical\s+act/.test(p)) return "Physical Activity";
  if (/\bclimb(ing)?\b/.test(p)) return "Climbing Activity";
  if (/\baquatic|swim|pool/.test(p)) return "Aquatic Activity";
  return t.length > 48 ? t.slice(0, 45) + "…" : t;
}

const DAY_ORDER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/**
 * Roster convention: afternoon times are written 12h without am/pm ("1.30" = 13:30).
 * Mirror of portal-roster-rows-merge.js hourTo24 so absolute minutes are correct.
 */
function hourTo24(hour: number, day: string): number {
  const isSunday = String(day || "").toLowerCase() === "sunday";
  if (!isSunday && hour < 8) return hour + 12;
  if (isSunday && hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

/** Parse a "12.30 to 3" / "4.30-5.15" slot into start/end tokens + day-aware minutes. */
function parseSlotTokens(
  raw: unknown,
  day: string,
): { startTok: string; endTok: string; start: number | null; end: number | null } | null {
  const parts = clean(raw, 40).split(/to|-|—/i);
  if (parts.length !== 2) return null;
  const startTok = parts[0].trim();
  const endTok = parts[1].trim();
  const toMin = (t: string): number | null => {
    const m = t.match(/^(\d{1,2})(?:[.:](\d{1,2}))?$/);
    if (!m) return null;
    return hourTo24(parseInt(m[1], 10), day) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  };
  return { startTok, endTok, start: toMin(startTok), end: toMin(endTok) };
}

/**
 * Parent-safe services list from the roster-review snapshot.
 *
 * Collapses to ONE entry per (programme + weekday): the roster splits a single
 * booked service into staff/cover lines (e.g. Day Centre 12.30–3 stored as 3 rows,
 * or a 90-min Multi-Activity as two 45-min teaching slots). Parents and accounting
 * see the same service once per day, spanning the outer time bounds
 * (e.g. "150' Day Centre · Monday · 12.30 to 3"). Instructor omitted; venue/area kept for the hub card.
 */
function buildServicesDetail(
  sessions: unknown,
): Array<{ label: string; day: string; time: string; venue: string; area: string }> {
  const list = Array.isArray(sessions) ? sessions : [];
  type Group = {
    svc: string;
    day: string;
    startTok: string;
    endTok: string;
    startMin: number | null;
    endMin: number | null;
    rawTime: string;
    venue: string;
    area: string;
  };
  const groups = new Map<string, Group>();

  for (const raw of list) {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const svc = canonicalProgrammeName(s.service) || clean(s.service, 80) || "Service";
    const day = clean(s.day, 20);
    const key = (svc + "|" + day).toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = {
        svc,
        day,
        startTok: "",
        endTok: "",
        startMin: null,
        endMin: null,
        rawTime: clean(s.timeSlot, 40),
        venue: "",
        area: "",
      };
      groups.set(key, g);
    }
    if (!g.venue) g.venue = clean(s.venue, 80);
    if (!g.area) g.area = clean(s.area, 80);
    const tok = parseSlotTokens(s.timeSlot, day);
    if (tok) {
      if (tok.start != null && (g.startMin == null || tok.start < g.startMin)) {
        g.startMin = tok.start;
        g.startTok = tok.startTok;
      }
      if (tok.end != null && (g.endMin == null || tok.end > g.endMin)) {
        g.endMin = tok.end;
        g.endTok = tok.endTok;
      }
      if (!g.startTok && tok.startTok) g.startTok = tok.startTok;
      if (!g.endTok && tok.endTok) g.endTok = tok.endTok;
    }
  }

  return [...groups.values()]
    .map((g) => {
      const spanDur = g.startMin != null && g.endMin != null && g.endMin > g.startMin
        ? g.endMin - g.startMin
        : null;
      // Multi-Activity is a single 90' service billed per day, even when the
      // roster splits it into two 45' halves — always show it as 90'.
      const dur = g.svc === "Multi-Activity" ? 90 : spanDur;
      const label = dur ? `${dur}' ${g.svc}` : g.svc;
      const time = g.startTok && g.endTok ? `${g.startTok} to ${g.endTok}` : g.rawTime;
      return {
        label,
        day: g.day,
        time,
        venue: g.venue,
        area: g.area,
        _order: DAY_ORDER[g.day.toLowerCase()] || 8,
        _start: g.startMin ?? 9999,
      };
    })
    .sort((a, b) => (a._order !== b._order ? a._order - b._order : a._start - b._start))
    .map(({ label, day, time, venue, area }) => ({ label, day, time, venue, area }));
}

/**
 * Look up the child's roster-review service snapshot. Keyed by the same canonical
 * participant slug used across the portal (participant_identity.ts) so spelling
 * variants (e.g. "Aadam Ahmed" ↔ roster "Adaam Ah") still resolve.
 */
async function fetchRosterServiceLines(
  supabase: ReturnType<typeof createClient>,
  identityInput: {
    contactId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  },
): Promise<{
  count: number;
  detail: Array<{ label: string; day: string; time: string; venue: string; area: string }>;
} | null> {
  const slugs = [
    ...new Set(
      resolveParticipantClientSlugs(identityInput)
        .map((s) => slugifyParticipantKey(s))
        .filter(Boolean),
    ),
  ];
  if (!slugs.length) return null;

  const { data, error } = await supabase
    .from("portal_participant_service_lines")
    .select("client_name, sessions, services_count")
    .in("client_key", slugs)
    .limit(6);

  if (error) {
    console.error("[parent-portal-participant-detail] service lines error", error);
    return null;
  }

  let best: Record<string, unknown> | null = null;
  for (const row of data || []) {
    if (!best || Number(row.services_count || 0) > Number(best.services_count || 0)) best = row;
  }
  if (!best) return null;

  const detail = buildServicesDetail(best.sessions);
  return { count: detail.length || Number(best.services_count || 0), detail };
}

function formatDobDisplay(iso: unknown): string {
  const s = isoFromAny(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  try {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch (_) {
    return s;
  }
}

function clean(v: unknown, max = 4000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isoFromAny(raw: unknown): string {
  const s = clean(raw, 32);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return "";
}

function independenceLabel(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map((x) => clean(x, 120)).filter(Boolean).join(", ");
  return clean(raw, 400);
}

function parentCommentFromRow(
  positiveText: string,
  cache: Record<string, unknown> | undefined,
): { comment: string | null; pending: boolean } {
  const status = cache ? String(cache.share_status || "") : "";
  // Admin-released text (parent_message) is the source of truth when a share
  // row exists. Falls back to positive_feedback for older rows with no share.
  const adminMsg = cache ? clean(cache.parent_message, 2500) : "";
  if (status === "hidden") return { comment: null, pending: false };
  if (status === "pending") return { comment: null, pending: true };
  if (status === "approved") {
    const text = adminMsg || positiveText;
    return { comment: text || null, pending: false };
  }
  // No share row yet: legacy passthrough on positive_feedback.
  if (!positiveText) return { comment: null, pending: false };
  return { comment: positiveText, pending: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string; sections?: string[] } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return parentPortalJsonInvalid(400);

  const sections = parseSections(body.sections);
  const wantGeneral = sections.has("general");
  const wantSessions = sections.has("sessions");
  const wantAchievements = sections.has("achievements");
  const wantSwim = sections.has("swim");
  const wantWeeklyNotes = sections.has("weekly_notes");

  const { data: participant, error: partErr } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, dob_iso, in_class, on_waiting_list, avatar_storage_path")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (partErr || !participant) return parentPortalJsonInvalid(403);

  const displayName = clean(participant.display_name) ||
    [participant.first_name, participant.last_name].filter(Boolean).join(" ");
  const identityInput = {
    contactId,
    displayName,
    firstName: clean(participant.first_name, 80),
    lastName: clean(participant.last_name, 80),
  };
  const clientSlugs = resolveParticipantClientSlugs(identityInput);
  const lookupNames = resolveParticipantLookupNames(identityInput);

  const { data: contactRow } = await supabase
    .from("portal_parent_contacts")
    .select("city, postcode, in_class, on_waiting_list, child_display")
    .eq("contact_id", contactId)
    .eq("parent_person_id", session.parent_person_id)
    .maybeSingle();

  const avatar = await resolveParticipantAvatarUrls(supabase, url, {
    contact_id: contactId,
    display_name: displayName,
    dob_iso: participant.dob_iso,
    avatar_storage_path: participant.avatar_storage_path,
  });

  let generalInfoSheet = "";
  let generalUpdatedAt: string | null = null;

  if (wantGeneral) {
    const { data: genRow } = await supabase
      .from("portal_participant_general_info")
      .select("general_info_sheet, updated_at")
      .eq("contact_id", contactId)
      .maybeSingle();

    generalInfoSheet = clean(genRow?.general_info_sheet, 12000);
    generalUpdatedAt = genRow?.updated_at ? String(genRow.updated_at) : null;

    if (!generalInfoSheet) {
      const nameFilters = lookupNames.slice(0, 4);
      for (const nm of nameFilters) {
        const { data: docRows } = await supabase
          .from("portal_participant_documents")
          .select("payload_json, participant_name")
          .ilike("participant_name", nm)
          .order("submitted_at", { ascending: false })
          .limit(3);
        for (const doc of docRows || []) {
          const payload = doc?.payload_json as Record<string, unknown> | null;
          const blob = clean(payload?.general_info || payload?.client_info || payload?.info_sheet, 12000);
          if (blob) {
            generalInfoSheet = blob;
            break;
          }
        }
        if (generalInfoSheet) break;
      }
    }

    if (!generalInfoSheet) {
      generalInfoSheet = lookupClientsInfoSheetForParticipant(identityInput);
    }
  }

  const generalFields = wantGeneral ? parseGeneralInfoSheet(generalInfoSheet) : [];

  let rawFeedback: Record<string, unknown>[] = [];
  let sessionsOut: Record<string, unknown>[] = [];

  if (wantSessions) {
    const fbSel =
      "id, session_date, client_name, client_id, service, session_time, attendance, engagement_rating, engagement_patterns, client_emotions, positive_feedback, relevant_information, completed_by_name, created_at";

    const fbQueries = [];
    if (clientSlugs.length) {
      fbQueries.push(supabase.from("session_feedback").select(fbSel).in("client_id", clientSlugs));
    }
    for (const nm of lookupNames.slice(0, 4)) {
      fbQueries.push(supabase.from("session_feedback").select(fbSel).ilike("client_name", nm));
    }

    const seenIds = new Set<string>();
    const fbResults = await Promise.all(
      fbQueries.map((q) => q.order("session_date", { ascending: false }).limit(PARENT_FEEDBACK_LIMIT)),
    );
    for (const { data, error } of fbResults) {
      if (error) {
        console.error("[parent-portal-participant-detail] feedback error", error);
        continue;
      }
      for (const row of data || []) {
        if (!row || !participantIdentityMatches(identityInput, String(row.client_name || ""), String(row.client_id || ""))) continue;
        const id = String(row.id || "");
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        rawFeedback.push(row);
      }
    }

    rawFeedback.sort((a, b) => {
      const da = isoFromAny(a.session_date);
      const db = isoFromAny(b.session_date);
      if (da !== db) return db.localeCompare(da);
      return clean(b.session_time).localeCompare(clean(a.session_time));
    });

    const feedbackIds = rawFeedback.map((r) => String(r.id)).filter(Boolean);
    const cacheById = new Map<string, Record<string, unknown>>();
    const venueByService = await loadParticipantVenueByService(supabase, identityInput, lookupNames);

    if (feedbackIds.length) {
      const { data: cached } = await supabase
        .from("portal_parent_feedback_share")
        .select("session_feedback_id, source_fingerprint, parent_message, share_status, review_model, reviewed_at, admin_edited_at")
        .in("session_feedback_id", feedbackIds);
      for (const row of cached || []) {
        cacheById.set(String(row.session_feedback_id), row);
      }
    }

    for (const row of rawFeedback) {
      const id = String(row.id);
      const patterns = row.engagement_patterns;
      const positiveText = enforceParticipantFirstNameInText(
        clean(row.positive_feedback, 2500),
        clean(row.client_name, 200),
      );
      const service = clean(row.service, 200);
      const staffName = clean(row.completed_by_name, 120);
      const instructor = feedbackAuthorFirstName(staffName);
      const sessionDate = isoFromAny(row.session_date);
      const sessionTime = clean(row.session_time, 80);
      const venue = resolveVenueForSession(venueByService, service, sessionDate, sessionTime);
      const cache = cacheById.get(id);
      const commentPack = parentCommentFromRow(positiveText, cache);

      sessionsOut.push({
        id,
        session_date: sessionDate,
        service,
        session_time: sessionTime,
        venue,
        instructor,
        attendance: clean(row.attendance, 40),
        engagement_rating: row.engagement_rating,
        client_emotions: clean(row.client_emotions, 200),
        independence: independenceLabel(patterns),
        feedback_by_name: instructor,
        feedback_by_role: staffName ? resolveFeedbackAuthorRole(staffName, service) : "",
        comment: commentPack.comment,
        parent_message: commentPack.comment,
        message_pending: commentPack.pending,
      });
    }

    sessionsOut.sort((a, b) => {
      const da = String(a.session_date || "");
      const db = String(b.session_date || "");
      if (da !== db) return db.localeCompare(da);
      return clean(b.session_time).localeCompare(clean(a.session_time));
    });
  }

  let attendanceSummary = { attended: 0, absent: 0, total: 0, makeup_absent: 0 };
  if (wantSessions && clientSlugs.length) {
    const { data: overrideRows, error: ovErr } = await supabase
      .from("schedule_overrides")
      .select("session_date, anchor_start, anchor_client_id, override_type, status, payload")
      .eq("status", "active")
      .in("override_type", ["client_replace_in_slot", "client_absence_announced"])
      .gte("session_date", PARENT_SESSION_TERM_START_ISO)
      .in("anchor_client_id", clientSlugs);
    if (ovErr) {
      console.error("[parent-portal-participant-detail] schedule_overrides error", ovErr);
    }
    attendanceSummary = buildParentAttendanceSummary(
      rawFeedback,
      overrideRows || [],
      clientSlugs,
      PARENT_SESSION_TERM_START_ISO,
    );
  } else if (wantSessions && rawFeedback.length) {
    attendanceSummary = buildParentAttendanceSummary(
      rawFeedback,
      [],
      clientSlugs,
      PARENT_SESSION_TERM_START_ISO,
    );
  }

  let achievements: Record<string, unknown>[] = [];

  if (wantAchievements) {
    const achSelect =
      "id, session_date, storage_path, client_name, client_id, attached_at, session_feedback_id, status, parent_downloaded_at, width, height, media_type";
    const expandedSlugs = expandParticipantClientSlugs(clientSlugs);
    const achRows: Record<string, unknown>[] = [];
    const seenAch = new Set<string>();

    const mergeAchievementRows = (rows: unknown[] | null | undefined) => {
      for (const row of rows || []) {
        if (!row || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        if (!participantIdentityMatches(
          identityInput,
          String(rec.client_name || ""),
          String(rec.client_id || ""),
        )) continue;
        if (clean(rec.client_id, 80).toLowerCase() === LEAD_INBOX_CLIENT_ID) continue;
        const aid = String(rec.id || "");
        if (!aid || seenAch.has(aid)) continue;
        seenAch.add(aid);
        achRows.push(rec);
      }
    };

    if (expandedSlugs.length) {
      const { data, error } = await supabase
        .from("portal_participant_achievement_photos")
        .select(achSelect)
        .in("status", [...PARENT_ACH_STATUSES])
        .in("client_id", expandedSlugs)
        .order("session_date", { ascending: false })
        .limit(PARENT_ACH_QUERY_LIMIT);
      if (error) {
        console.error("[parent-portal-participant-detail] achievements by client_id error", error);
      }
      mergeAchievementRows(data);
    }

    for (const nm of lookupNames.slice(0, 6)) {
      const { data, error } = await supabase
        .from("portal_participant_achievement_photos")
        .select(achSelect)
        .in("status", [...PARENT_ACH_STATUSES])
        .ilike("client_name", nm)
        .order("session_date", { ascending: false })
        .limit(PARENT_ACH_QUERY_LIMIT);
      if (error) {
        console.error("[parent-portal-participant-detail] achievements by client_name error", error);
        continue;
      }
      mergeAchievementRows(data);
    }

    achRows.sort((a, b) => String(b.session_date || "").localeCompare(String(a.session_date || "")));

    const signedRows = await Promise.all(
      achRows.map(async (row) => {
        const path = clean(row.storage_path, 500);
        if (!path) return null;
        const { data: signed, error: signErr } = await supabase.storage
          .from(ACH_BUCKET)
          .createSignedUrl(path, 3600);
        if (signErr || !signed?.signedUrl) {
          console.error("[parent-portal-participant-detail] achievement sign error", signErr, path);
          return null;
        }
        return {
          id: row.id,
          session_date: row.session_date,
          session_feedback_id: row.session_feedback_id,
          status: clean(row.status, 40),
          downloaded_at: row.parent_downloaded_at ? String(row.parent_downloaded_at) : null,
          width: Number(row.width) > 0 ? Number(row.width) : null,
          height: Number(row.height) > 0 ? Number(row.height) : null,
          media_type: clean(row.media_type, 20) || "photo",
          url: signed.signedUrl,
        };
      }),
    );
    achievements = signedRows.filter(Boolean) as Record<string, unknown>[];
  }

  const serviceSet = new Set<string>();
  rawFeedback.forEach((row) => {
    const label = canonicalProgrammeName(row.service);
    if (label) serviceSet.add(label);
  });
  const services = Array.from(serviceSet).sort();
  let hasAquatics = services.some((s) => isAquaticService(s)) ||
    rawFeedback.some((r) => isAquaticService(r.service));
  if (!hasAquatics && (wantGeneral || wantSwim) && !wantSessions) {
    hasAquatics = await detectHasAquatics(supabase, clientSlugs);
  }

  const aquaticOnlyNoPhotos = await detectAquaticOnlyNoPhotos(supabase, identityInput, lookupNames);

  // Roster-review service snapshot: the parent-facing "number of services" must match the
  // roster (admin roster review), not what happens to have feedback. Loaded for the hub (general).
  let rosterServicesCount = 0;
  let rosterServicesDetail: Array<{
    label: string;
    day: string;
    time: string;
    venue: string;
    area: string;
  }> = [];
  if (wantGeneral) {
    const lines = await fetchRosterServiceLines(supabase, identityInput);
    if (lines) {
      rosterServicesCount = lines.count;
      rosterServicesDetail = lines.detail;
    }
  }

  let reenrolmentSummary = buildReenrolmentParentSummary(null, null);
  if (wantGeneral) {
    const { data: reenrolRow } = await supabase
      .from("portal_re_enrolment_submissions")
      .select("submitted_at, payload")
      .eq("academic_year", REENROL_ACADEMIC_YEAR)
      .eq("participant_contact_id", contactId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const submittedAt = reenrolRow?.submitted_at ? String(reenrolRow.submitted_at) : null;
    const payload = reenrolRow?.payload && typeof reenrolRow.payload === "object"
      ? (reenrolRow.payload as Record<string, unknown>)
      : null;
    reenrolmentSummary = buildReenrolmentParentSummary(payload, submittedAt);
  }

  let swimTermReviewAvailable = false;
  if (wantGeneral) {
    const { count: swimShareCount } = await supabase
      .from("portal_parent_swim_term_share")
      .select("document_id", { count: "exact", head: true })
      .eq("contact_id", contactId)
      .eq("share_status", "ready");
    swimTermReviewAvailable = (swimShareCount || 0) > 0;
  }

  const swimTermReviews: Record<string, unknown>[] = [];
  if (wantSwim && (hasAquatics || swimTermReviewAvailable)) {
    const { data: shares } = await supabase
      .from("portal_parent_swim_term_share")
      .select("document_id, ready_at")
      .eq("contact_id", contactId)
      .eq("share_status", "ready");

    const shareIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
    if (shareIds.length) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, title, related_date, file_url, created_at, related_client, document_type")
        .in("id", shareIds)
        .eq("document_type", "swim_term_review");

      const swimSigned = await Promise.all(
        (docs || []).map(async (doc) => {
          if (!doc?.file_url) return null;
          if (!participantIdentityMatches(identityInput, String(doc.related_client || ""), "")) return null;
          const { data: signed, error: signErr } = await supabase.storage
            .from(DOC_BUCKET)
            .createSignedUrl(String(doc.file_url), 3600);
          if (signErr || !signed?.signedUrl) return null;
          const shareMeta = (shares || []).find((s) => String(s.document_id) === String(doc.id));
          return {
            id: doc.id,
            title: clean(doc.title, 200),
            related_date: doc.related_date,
            ready_at: shareMeta?.ready_at || doc.created_at,
            download_url: signed.signedUrl,
          };
        }),
      );
      swimTermReviews.push(...(swimSigned.filter(Boolean) as Record<string, unknown>[]));
      swimTermReviews.sort((a, b) =>
        String(b.related_date || b.ready_at || "").localeCompare(String(a.related_date || a.ready_at || ""))
      );
    }
  }

  let teamOut: Record<string, unknown>[] = [];
  if (wantGeneral || wantSessions) {
    // Prefer feedback already loaded for sessions; otherwise a light pull for hub/team.
    let fbForTeam = rawFeedback;
    if (!fbForTeam.length && clientSlugs.length) {
      const { data: fbLite } = await supabase
        .from("session_feedback")
        .select("session_date, completed_by_name, client_id")
        .in("client_id", clientSlugs)
        .gte("session_date", TEAM_FEEDBACK_SINCE)
        .order("session_date", { ascending: false })
        .limit(80);
      fbForTeam = fbLite || [];
    }
    teamOut = await buildParentTeam(supabase, clientSlugs, fbForTeam);
  }

  let weeklyNotes: Record<string, unknown>[] = [];
  let weeklyNoteLatest: Record<string, unknown> | null = null;
  if (wantWeeklyNotes) {
    const { data: noteRows, error: noteErr } = await supabase
      .from("portal_parent_weekly_notes")
      .select(
        "id, week_start, week_end, body, share_status, generated_at, generated_early, review_model",
      )
      .eq("contact_id", contactId)
      .eq("share_status", "ready")
      .order("week_start", { ascending: false })
      .limit(52);
    if (noteErr) {
      console.error("[parent-portal-participant-detail] weekly_notes", noteErr);
    } else {
      weeklyNotes = (noteRows || []).map((n) => ({
        id: n.id,
        week_start: n.week_start,
        week_end: n.week_end,
        body: clean(n.body, 4000),
        generated_at: n.generated_at || null,
        generated_early: !!n.generated_early,
      }));
      // One note per week (newest wins) — defensive if rows ever race.
      const byWeek = new Map<string, Record<string, unknown>>();
      for (const n of weeklyNotes) {
        const ws = String(n.week_start || "");
        if (!ws || byWeek.has(ws)) continue;
        byWeek.set(ws, n);
      }
      weeklyNotes = Array.from(byWeek.values());
      weeklyNoteLatest = weeklyNotes[0] || null;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      term_label: TERM_LABEL,
      sections_loaded: Array.from(sections),
      participant: {
        contact_id: participant.contact_id,
        display_name: displayName,
        first_name: participant.first_name,
        last_name: participant.last_name,
        dob_iso: participant.dob_iso,
        dob_display: formatDobDisplay(participant.dob_iso),
        in_class: participant.in_class ?? contactRow?.in_class ?? null,
        on_waiting_list: participant.on_waiting_list ?? contactRow?.on_waiting_list ?? null,
        city: contactRow?.city && contactRow.city !== "—" ? contactRow.city : null,
        postcode: contactRow?.postcode && contactRow.postcode !== "—" ? contactRow.postcode : null,
        avatar_url: avatar.avatar_url,
      },
      general: {
        services,
        services_count: rosterServicesCount,
        services_detail: rosterServicesDetail,
        has_aquatics: hasAquatics,
        aquatic_only_no_photos: aquaticOnlyNoPhotos,
        term_label: TERM_LABEL,
        general_info_sheet: generalInfoSheet,
        fields: generalFields,
        updated_at: generalUpdatedAt,
        editable: true,
      },
      team: teamOut,
      sessions: sessionsOut,
      attendance_summary: attendanceSummary,
      achievements,
      swim_term_reviews: swimTermReviews,
      swim_term_review_available: swimTermReviewAvailable,
      reenrolment: reenrolmentSummary,
      pending_review_count: sessionsOut.filter((s) => s.message_pending).length,
      weekly_notes: weeklyNotes,
      weekly_note_latest: weeklyNoteLatest,
      // Wireframe slot — club noticeboard (not wired yet).
      club_announcements: [],
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
