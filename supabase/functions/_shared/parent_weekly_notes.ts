/**
 * Parent portal weekly notes — Saturday→Friday summaries from filtered/raw feedback.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sha256Hex } from "./parent_portal_auth.ts";
import {
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
  acatGroupFeedbackEligibleSlugs,
  parentPortalSuppressSessionProgress,
  rosterParticipantSlugAlias,
  type ParticipantIdentityInput,
} from "./participant_identity.ts";

export const WEEKLY_NOTE_PROMPT_VERSION = "20260723-tinashe-lead-v1";
export const DEFAULT_WEEKLY_NOTE_MODEL = "gpt-4o-mini";

/** Tinashe: Mon/Wed/Fri lead briefs from John; feedback fallback from session instructors. */
const TINASHE_LEAD_WEEKDAYS = new Set([1, 3, 5]); // Mon, Wed, Fri
const TINASHE_CONTACT_IDS = new Set(["gap-tinashe-icloud"]);
const TINASHE_FEEDBACK_AUTHOR_RE = /\b(bismark|giuseppe|godsway)\b/i;

export type WeeklyNoteDaySource = {
  feedback_id: string;
  session_date: string;
  service: string;
  text: string;
  source: "filtered" | "positive" | "narrative" | "lead_brief";
};

export type WeeklyNoteBuildResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  contact_id?: string;
  week_start?: string;
  week_end?: string;
  body?: string;
  share_status?: "ready" | "hidden" | "draft";
  source_feedback_ids?: string[];
  source_fingerprint?: string;
  review_model?: string;
  generated_early?: boolean;
  error?: string;
};

function clean(v: unknown, max = 8000): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function isoDateOnly(raw: unknown): string {
  const s = clean(raw, 32);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

/** Parse YYYY-MM-DD as local calendar parts (no TZ shift). */
export function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const s = isoDateOnly(iso);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function addDaysIso(iso: string, days: number): string {
  const p = parseIsoDate(iso);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** JS getUTCDay: 0=Sun … 6=Sat. Return Saturday that starts the week containing `iso`. */
export function saturdayWeekStart(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const dow = dt.getUTCDay(); // 0 Sun … 6 Sat
  const back = (dow + 1) % 7; // Sat→0, Sun→1, … Fri→6
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

export function fridayWeekEnd(weekStartSat: string): string {
  return addDaysIso(weekStartSat, 6);
}

export function londonTodayIso(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Weekday Mon=1 … Sun=7 for an ISO date (UTC calendar). */
export function isoWeekdayMon1(iso: string): number {
  const p = parseIsoDate(iso);
  if (!p) return 0;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 Sun
  return dow === 0 ? 7 : dow;
}

function feedbackAttendanceIsAbsent(attendance: unknown): boolean {
  const att = clean(attendance, 80).toLowerCase();
  if (!att) return false;
  if (att === "no" || att === "n" || att === "0" || att === "false") return true;
  if (/^(no[\s\-/]|n\/)/.test(att)) return true;
  if (/\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel)/.test(att)) return true;
  return false;
}

function firstNameOf(display: string): string {
  const t = clean(display, 120);
  return t.split(/\s+/)[0] || t || "they";
}

export function listWeekStartsInclusive(fromIso: string, throughIso: string): string[] {
  const start = saturdayWeekStart(fromIso);
  const endBound = saturdayWeekStart(throughIso);
  if (!start || !endBound) return [];
  const out: string[] = [];
  let cur = start;
  while (cur && cur <= endBound) {
    out.push(cur);
    cur = addDaysIso(cur, 7);
    if (out.length > 60) break;
  }
  return out;
}

type FeedbackRow = {
  id?: unknown;
  session_date?: unknown;
  client_name?: unknown;
  client_id?: unknown;
  service?: unknown;
  attendance?: unknown;
  positive_feedback?: unknown;
  session_narrative?: unknown;
  relevant_information?: unknown;
  completed_by_name?: unknown;
};

type LeadReportRow = {
  id?: unknown;
  session_date?: unknown;
  submitted_by_name?: unknown;
  client_name?: unknown;
  client_id?: unknown;
  service?: unknown;
  is_bespoke_programme?: unknown;
  brief_description?: unknown;
};

export function usesTinasheLeadWeeklyNotes(
  contactId: string,
  identity: ParticipantIdentityInput,
): boolean {
  const cid = clean(contactId, 80).toLowerCase();
  if (TINASHE_CONTACT_IDS.has(cid) || cid.includes("tinashe")) return true;
  for (const slug of resolveParticipantClientSlugs(identity)) {
    const alias = rosterParticipantSlugAlias(slug);
    if (alias === "tinashe" || slug.toLowerCase().includes("tinashe")) return true;
  }
  const first = clean(identity.firstName, 80).toLowerCase();
  const last = clean(identity.lastName, 80).toLowerCase();
  return first === "tinashe" || `${first}_${last}`.includes("tinashe");
}

function isJohnLeadSubmitter(name: unknown): boolean {
  const n = clean(name, 120).toLowerCase();
  return n.startsWith("john") || /\bjohn\b/.test(n);
}

function isTinasheLeadClient(row: LeadReportRow, identity: ParticipantIdentityInput): boolean {
  return participantIdentityMatches(
    identity,
    String(row.client_name || ""),
    String(row.client_id || ""),
  ) || /\btinashe\b/i.test(clean(row.client_name, 120));
}

function isTinasheFeedbackFallbackAuthor(name: unknown): boolean {
  return TINASHE_FEEDBACK_AUTHOR_RE.test(clean(name, 120));
}

type ShareRow = {
  session_feedback_id?: unknown;
  parent_message?: unknown;
  share_status?: unknown;
};

export async function loadFeedbackForParticipantWeek(
  supabase: SupabaseClient,
  identity: ParticipantIdentityInput,
  weekStart: string,
  weekEnd: string,
): Promise<FeedbackRow[]> {
  const clientSlugs = acatGroupFeedbackEligibleSlugs(resolveParticipantClientSlugs(identity));
  const lookupNames = resolveParticipantLookupNames(identity);
  const fbSel =
    "id, session_date, client_name, client_id, service, attendance, positive_feedback, session_narrative, relevant_information, completed_by_name";

  const queries = [];
  if (clientSlugs.length) {
    queries.push(
      supabase
        .from("session_feedback")
        .select(fbSel)
        .in("client_id", clientSlugs)
        .gte("session_date", weekStart)
        .lte("session_date", weekEnd),
    );
  }
  for (const nm of lookupNames.slice(0, 4)) {
    queries.push(
      supabase
        .from("session_feedback")
        .select(fbSel)
        .ilike("client_name", nm)
        .gte("session_date", weekStart)
        .lte("session_date", weekEnd),
    );
  }

  const seen = new Set<string>();
  const out: FeedbackRow[] = [];
  const results = await Promise.all(queries.map((q) => q.limit(40)));
  for (const { data, error } of results) {
    if (error) {
      console.error("[weekly-notes] feedback query", error);
      continue;
    }
    for (const row of data || []) {
      if (
        !participantIdentityMatches(
          identity,
          String(row.client_name || ""),
          String(row.client_id || ""),
        )
      ) {
        continue;
      }
      const id = String(row.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }

  out.sort((a, b) => isoDateOnly(a.session_date).localeCompare(isoDateOnly(b.session_date)));
  return out;
}

export function pickDaySourceText(
  row: FeedbackRow,
  share: ShareRow | null | undefined,
): WeeklyNoteDaySource | null {
  const id = clean(row.id, 80);
  const sessionDate = isoDateOnly(row.session_date);
  if (!id || !sessionDate) return null;
  if (feedbackAttendanceIsAbsent(row.attendance)) return null;

  const service = clean(row.service, 200) || "session";
  const filtered = clean(share?.parent_message, 4000);
  const status = clean(share?.share_status, 40).toLowerCase();
  if (status === "approved" && filtered.length >= 12) {
    return { feedback_id: id, session_date: sessionDate, service, text: filtered, source: "filtered" };
  }

  const positive = clean(row.positive_feedback, 4000);
  if (positive.length >= 12) {
    return { feedback_id: id, session_date: sessionDate, service, text: positive, source: "positive" };
  }

  const narrative = clean(row.session_narrative, 6000);
  if (narrative.length >= 20) {
    return { feedback_id: id, session_date: sessionDate, service, text: narrative, source: "narrative" };
  }

  return null;
}

export async function buildDaySources(
  supabase: SupabaseClient,
  rows: FeedbackRow[],
): Promise<WeeklyNoteDaySource[]> {
  const ids = rows.map((r) => String(r.id || "")).filter(Boolean);
  const shareById = new Map<string, ShareRow>();
  if (ids.length) {
    const { data: shares } = await supabase
      .from("portal_parent_feedback_share")
      .select("session_feedback_id, parent_message, share_status")
      .in("session_feedback_id", ids);
    for (const s of shares || []) {
      shareById.set(String(s.session_feedback_id), s);
    }
  }

  const out: WeeklyNoteDaySource[] = [];
  for (const row of rows) {
    const picked = pickDaySourceText(row, shareById.get(String(row.id || "")));
    if (picked) out.push(picked);
  }
  return out;
}

async function loadJohnLeadBriefsForTinasheWeek(
  supabase: SupabaseClient,
  identity: ParticipantIdentityInput,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyNoteDaySource[]> {
  const { data, error } = await supabase
    .from("lead_session_reports")
    .select(
      "id, session_date, submitted_by_name, client_name, client_id, service, is_bespoke_programme, brief_description",
    )
    .gte("session_date", weekStart)
    .lte("session_date", weekEnd)
    .ilike("submitted_by_name", "%john%")
    .limit(40);

  if (error) {
    console.error("[weekly-notes] tinashe lead query", error);
    return [];
  }

  const byDate = new Map<string, WeeklyNoteDaySource>();
  for (const row of data || []) {
    if (!isJohnLeadSubmitter(row.submitted_by_name)) continue;
    if (!isTinasheLeadClient(row, identity)) continue;
    const sessionDate = isoDateOnly(row.session_date);
    const wd = isoWeekdayMon1(sessionDate);
    if (!TINASHE_LEAD_WEEKDAYS.has(wd)) continue;
    // Parents see the brief only — never other_information / notes.
    const brief = clean(row.brief_description, 4000);
    if (brief.length < 12) continue;
    const id = clean(row.id, 80);
    if (!id) continue;
    byDate.set(sessionDate, {
      // Stored in uuid[] source_feedback_ids — lead report id (not session_feedback).
      feedback_id: id,
      session_date: sessionDate,
      service: clean(row.service, 200) || "Bespoke Programme",
      text: brief,
      source: "lead_brief",
    });
  }
  return [...byDate.values()].sort((a, b) => a.session_date.localeCompare(b.session_date));
}

/**
 * Tinashe weekly notes: John's lead brief on Mon/Wed/Fri (no "notes"/other).
 * If that day's lead report is missing, use session feedback from Bismark,
 * Giuseppe, or Godsway only.
 */
export async function buildTinasheDaySources(
  supabase: SupabaseClient,
  identity: ParticipantIdentityInput,
  weekStart: string,
  weekEnd: string,
  feedbackRows: FeedbackRow[],
): Promise<WeeklyNoteDaySource[]> {
  const leadByDate = new Map(
    (await loadJohnLeadBriefsForTinasheWeek(supabase, identity, weekStart, weekEnd)).map((s) => [
      s.session_date,
      s,
    ]),
  );

  const fallbackRows = feedbackRows.filter((row) => {
    const sessionDate = isoDateOnly(row.session_date);
    if (!TINASHE_LEAD_WEEKDAYS.has(isoWeekdayMon1(sessionDate))) return false;
    return isTinasheFeedbackFallbackAuthor(row.completed_by_name);
  });
  const feedbackSources = await buildDaySources(supabase, fallbackRows);
  const feedbackByDate = new Map(feedbackSources.map((s) => [s.session_date, s]));

  const out: WeeklyNoteDaySource[] = [];
  for (let i = 0; i <= 6; i++) {
    const day = addDaysIso(weekStart, i);
    if (!TINASHE_LEAD_WEEKDAYS.has(isoWeekdayMon1(day))) continue;
    const lead = leadByDate.get(day);
    if (lead) {
      out.push(lead);
      continue;
    }
    const fb = feedbackByDate.get(day);
    if (fb) out.push(fb);
  }
  return out;
}

/** Habitual weekdays Mon=1..Sun=7 from recent attendance (empty if unknown). */
export async function loadHabitualWeekdays(
  supabase: SupabaseClient,
  identity: ParticipantIdentityInput,
  beforeWeekStart: string,
): Promise<number[]> {
  const lookbackStart = addDaysIso(beforeWeekStart, -56);
  const rows = await loadFeedbackForParticipantWeek(
    supabase,
    identity,
    lookbackStart,
    addDaysIso(beforeWeekStart, -1),
  );
  const days = new Set<number>();
  for (const row of rows) {
    if (feedbackAttendanceIsAbsent(row.attendance)) continue;
    const iso = isoDateOnly(row.session_date);
    const wd = isoWeekdayMon1(iso);
    if (wd >= 1 && wd <= 7) days.add(wd);
  }
  return [...days].sort((a, b) => a - b);
}

export type WeeklyNoteEarlyCohort = "weekend_mon" | "tue_fri" | "any";

const WEEKEND_MON_DAYS = new Set([6, 7, 1]); // Sat, Sun, Mon
const TUE_FRI_DAYS = new Set([2, 3, 4, 5]); // Tue–Fri

function habitMatchesCohort(habit: number[], cohort: WeeklyNoteEarlyCohort): boolean {
  if (!habit.length) return false;
  if (cohort === "any") {
    // Legacy: finishes by Wed (no Thu/Fri habit).
    return habit.every((d) => d >= 1 && d <= 3);
  }
  if (cohort === "weekend_mon") {
    return habit.every((d) => WEEKEND_MON_DAYS.has(d));
  }
  if (cohort === "tue_fri") {
    return habit.every((d) => TUE_FRI_DAYS.has(d));
  }
  return false;
}

/**
 * Early generate when the child's habitual days fit the cohort and their
 * last expected day this week has already passed (London today).
 *
 * Cohorts (split AI load — Sunday is heaviest for Sat/Sun/Mon):
 *   weekend_mon — only Sat / Sun / Mon
 *   tue_fri     — only Tue–Fri
 */
export function canGenerateWeeklyNoteEarly(opts: {
  weekStart: string;
  weekEnd: string;
  todayIso: string;
  daySources: WeeklyNoteDaySource[];
  habitualWeekdays: number[];
  cohort?: WeeklyNoteEarlyCohort;
}): { ok: boolean; reason: string } {
  const { weekStart, weekEnd, todayIso, daySources, habitualWeekdays } = opts;
  const cohort: WeeklyNoteEarlyCohort = opts.cohort || "any";
  if (!daySources.length) return { ok: false, reason: "no_sources" };
  if (todayIso > weekEnd) return { ok: true, reason: "week_complete" };
  if (todayIso < weekStart) return { ok: false, reason: "week_not_started" };

  const habit = habitualWeekdays.length
    ? habitualWeekdays
    : [...new Set(daySources.map((d) => isoWeekdayMon1(d.session_date)).filter(Boolean))].sort(
      (a, b) => a - b,
    );

  if (!habit.length) return { ok: false, reason: "no_habit" };
  if (!habitMatchesCohort(habit, cohort)) {
    return { ok: false, reason: `cohort_mismatch_${cohort}` };
  }

  // For Mon=1 in weekend_mon, max is wrong if we use Math.max (1 < 6,7).
  // Order within the week Sat→Fri: prefer last calendar date among habit days.
  let lastDate = "";
  for (let i = 0; i <= 6; i++) {
    const d = addDaysIso(weekStart, i);
    const wd = isoWeekdayMon1(d);
    if (habit.includes(wd)) lastDate = d;
  }
  if (!lastDate) return { ok: false, reason: "no_last_date" };
  if (todayIso <= lastDate) return { ok: false, reason: "waiting_last_day" };

  return { ok: true, reason: `early_${cohort}` };
}

export async function fingerprintWeeklySources(
  contactId: string,
  weekStart: string,
  sources: WeeklyNoteDaySource[],
): Promise<string> {
  const payload = [
    WEEKLY_NOTE_PROMPT_VERSION,
    contactId,
    weekStart,
    ...sources.map((s) => [s.feedback_id, s.source, s.text].join(":")),
  ].join("\x1f");
  return sha256Hex(payload);
}

function fallbackCelebrateBody(firstName: string, sources: WeeklyNoteDaySource[]): string {
  const name = firstName || "They";
  const bits = sources
    .slice(0, 4)
    .map((s) => clean(s.text, 220))
    .filter(Boolean);
  if (!bits.length) {
    return `${name} had a good week with us. We look forward to seeing them again soon.`;
  }
  return (
    `${name} had a lovely week with us. ` +
    bits.join(" ") +
    ` We're proud of the effort ${name} put in and look forward to next week.`
  ).slice(0, 1800);
}

async function callOpenAiWeeklyNote(
  apiKey: string,
  firstName: string,
  weekStart: string,
  weekEnd: string,
  sources: WeeklyNoteDaySource[],
  priorBodies: string[] = [],
  varyHarder = false,
): Promise<{ ok: true; body: string; model: string } | { ok: false; error: string; model: string }> {
  const model = clean(Deno.env.get("PORTAL_OPENAI_MODEL"), 64) || DEFAULT_WEEKLY_NOTE_MODEL;
  const dayBlocks = sources
    .map(
      (s) =>
        `Date ${s.session_date} (${s.service}, source=${s.source}):\n${clean(s.text, 2500)}`,
    )
    .join("\n\n");

  const system = [
    "You write short weekly notes for parents at clubSENsational, a neurodivergent children's activity club.",
    "Tone: warm, plain English, celebrate effort and joy more than problems. Do not sound clinical or technical.",
    "Avoid jargon (engagement scores, regulation codes, independence levels). Prefer everyday words.",
    "If a day mentions a challenge, keep it brief and constructive; lead with what went well.",
    "Do not invent activities or feelings that are not in the day notes.",
    `Always use the child's first name exactly as given: "${firstName}" (spell it the same way every time; never a variant spelling).`,
    "Write 1–3 short paragraphs in English. No bullet lists. No title heading.",
    "Each week's note must feel fresh: vary the opening line and structure. Do not reuse stock openers like \"What a wonderful week…\", \"had a fantastic week…\", or the same closing sentence as earlier notes.",
    "Focus on what was distinctive this week (specific activities, moments, or progress from the day notes). Skip generic praise that could belong to any week.",
    "Output plain text only — no JSON, no markdown.",
  ].join("\n");

  const priorBlock = priorBodies.length
    ? [
        "Earlier weekly notes for this child (do NOT copy openings, closings, or near-identical sentences):",
        ...priorBodies.map((b, i) => `--- prior ${i + 1} ---\n${clean(b, 900)}`),
      ].join("\n\n")
    : "";

  const user = [
    `Week: ${weekStart} (Saturday) to ${weekEnd} (Friday).`,
    "Day notes to summarise into one weekly note for the family:",
    dayBlocks,
    priorBlock,
    varyHarder
      ? "IMPORTANT: Your previous draft was too similar to an earlier weekly note. Rewrite with a different opening, different sentence shapes, and only this week's concrete moments."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: varyHarder ? 0.7 : 0.55,
        max_tokens: 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `openai-http-${res.status}:${errText.slice(0, 120)}`, model };
    }
    const json = await res.json();
    const body = clean(json?.choices?.[0]?.message?.content, 2500);
    if (body.length < 40) {
      return { ok: false, error: "openai-empty", model };
    }
    return { ok: true, body, model };
  } catch (e) {
    return { ok: false, error: clean((e as Error)?.message || "openai-error", 200), model };
  }
}

/** Word overlap similarity — catch near-duplicate weekly notes across weeks. */
export function weeklyNoteBodySimilarity(a: string, b: string): number {
  const words = (t: string) =>
    new Set(
      clean(t, 4000)
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function tooSimilarToPriorNotes(body: string, priors: string[], threshold = 0.45): boolean {
  const b = clean(body);
  if (!b || !priors.length) return false;
  return priors.some((p) => weeklyNoteBodySimilarity(b, p) >= threshold);
}

export async function generateWeeklyNoteForContact(
  supabase: SupabaseClient,
  opts: {
    contactId: string;
    identity: ParticipantIdentityInput;
    displayName: string;
    weekStart: string;
    force?: boolean;
    allowEarly?: boolean;
    earlyCohort?: WeeklyNoteEarlyCohort;
    todayIso?: string;
  },
): Promise<WeeklyNoteBuildResult> {
  if (parentPortalSuppressSessionProgress(opts.identity) || String(opts.contactId || "") === "197") {
    return {
      ok: true,
      skipped: true,
      reason: "kate_no_parent_notes",
      contact_id: opts.contactId,
      week_start: saturdayWeekStart(opts.weekStart) || opts.weekStart,
    };
  }

  const weekStart = saturdayWeekStart(opts.weekStart);
  const weekEnd = fridayWeekEnd(weekStart);
  if (!weekStart || !weekEnd) {
    return { ok: false, error: "bad_week" };
  }

  const todayIso = opts.todayIso || londonTodayIso();
  const rows = await loadFeedbackForParticipantWeek(supabase, opts.identity, weekStart, weekEnd);
  const tinasheLeadMode = usesTinasheLeadWeeklyNotes(opts.contactId, opts.identity);
  const sources = tinasheLeadMode
    ? await buildTinasheDaySources(supabase, opts.identity, weekStart, weekEnd, rows)
    : await buildDaySources(supabase, rows);
  if (!sources.length) {
    return {
      ok: true,
      skipped: true,
      reason: "no_day_sources",
      contact_id: opts.contactId,
      week_start: weekStart,
      week_end: weekEnd,
    };
  }

  let generatedEarly = false;
  if (todayIso <= weekEnd && !opts.force) {
    const habitual = await loadHabitualWeekdays(supabase, opts.identity, weekStart);
    const early = canGenerateWeeklyNoteEarly({
      weekStart,
      weekEnd,
      todayIso,
      daySources: sources,
      habitualWeekdays: habitual,
      cohort: opts.earlyCohort || "any",
    });
    if (!early.ok) {
      if (!opts.allowEarly) {
        return {
          ok: true,
          skipped: true,
          reason: early.reason || "week_in_progress",
          contact_id: opts.contactId,
          week_start: weekStart,
          week_end: weekEnd,
        };
      }
      return {
        ok: true,
        skipped: true,
        reason: early.reason || "not_ready_early",
        contact_id: opts.contactId,
        week_start: weekStart,
        week_end: weekEnd,
      };
    }
    generatedEarly = early.reason.startsWith("early_");
  }

  const fingerprint = await fingerprintWeeklySources(opts.contactId, weekStart, sources);

  const { data: existing } = await supabase
    .from("portal_parent_weekly_notes")
    .select("id, source_fingerprint, body, share_status")
    .eq("contact_id", opts.contactId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (
    existing &&
    !opts.force &&
    clean(existing.source_fingerprint) === fingerprint &&
    clean(existing.body).length > 40 &&
    clean(existing.share_status) === "ready"
  ) {
    return {
      ok: true,
      skipped: true,
      reason: "unchanged",
      contact_id: opts.contactId,
      week_start: weekStart,
      week_end: weekEnd,
      body: clean(existing.body),
    };
  }

  const { data: priorRows } = await supabase
    .from("portal_parent_weekly_notes")
    .select("body, week_start")
    .eq("contact_id", opts.contactId)
    .eq("share_status", "ready")
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(4);
  const priorBodies = (priorRows || [])
    .map((r) => clean(r.body, 1200))
    .filter((b) => b.length > 40);

  const firstName = firstNameOf(opts.displayName || opts.identity.firstName || "");
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  let body = "";
  let reviewModel = "";
  let shareStatus: "ready" | "hidden" | "draft" = "ready";

  if (apiKey) {
    let ai = await callOpenAiWeeklyNote(
      apiKey,
      firstName,
      weekStart,
      weekEnd,
      sources,
      priorBodies,
      false,
    );
    if (ai.ok && tooSimilarToPriorNotes(ai.body, priorBodies)) {
      const retry = await callOpenAiWeeklyNote(
        apiKey,
        firstName,
        weekStart,
        weekEnd,
        sources,
        priorBodies,
        true,
      );
      if (retry.ok) ai = retry;
    }
    if (ai.ok) {
      body = ai.body;
      reviewModel = ai.model + (tooSimilarToPriorNotes(body, priorBodies) ? "+sim-warn" : "");
      // Last resort: keep uniqueness by appending week-specific day facts if still near-dup.
      if (tooSimilarToPriorNotes(body, priorBodies)) {
        body = fallbackCelebrateBody(firstName, sources);
        reviewModel = `${ai.model}+fallback-dedupe`;
      }
    } else {
      body = fallbackCelebrateBody(firstName, sources);
      reviewModel = `fallback:${ai.error}`;
    }
  } else {
    body = fallbackCelebrateBody(firstName, sources);
    reviewModel = "fallback-no-openai";
  }

  const row = {
    contact_id: opts.contactId,
    week_start: weekStart,
    week_end: weekEnd,
    body,
    share_status: shareStatus,
    source_feedback_ids: sources.map((s) => s.feedback_id),
    source_fingerprint: fingerprint,
    review_model: reviewModel,
    generated_early: generatedEarly,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("portal_parent_weekly_notes").upsert(row, {
    onConflict: "contact_id,week_start",
  });

  if (error) {
    console.error("[weekly-notes] upsert", error);
    return { ok: false, error: clean(error.message, 200), contact_id: opts.contactId, week_start: weekStart };
  }

  return {
    ok: true,
    contact_id: opts.contactId,
    week_start: weekStart,
    week_end: weekEnd,
    body,
    share_status: shareStatus,
    source_feedback_ids: row.source_feedback_ids,
    source_fingerprint: fingerprint,
    review_model: reviewModel,
    generated_early: generatedEarly,
  };
}
