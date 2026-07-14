/**
 * Parent portal weekly notes — Saturday→Friday summaries from filtered/raw feedback.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sha256Hex } from "./parent_portal_auth.ts";
import {
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
  type ParticipantIdentityInput,
} from "./participant_identity.ts";

export const WEEKLY_NOTE_PROMPT_VERSION = "20260714-celebrate-v1";
export const DEFAULT_WEEKLY_NOTE_MODEL = "gpt-4o-mini";

export type WeeklyNoteDaySource = {
  feedback_id: string;
  session_date: string;
  service: string;
  text: string;
  source: "filtered" | "positive" | "narrative";
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
};

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
  const clientSlugs = resolveParticipantClientSlugs(identity);
  const lookupNames = resolveParticipantLookupNames(identity);
  const fbSel =
    "id, session_date, client_name, client_id, service, attendance, positive_feedback, session_narrative, relevant_information";

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

/**
 * Early generate when the child only attends Mon–Wed (no Thu/Fri habit)
 * and their last expected day this week has already passed (London today).
 */
export function canGenerateWeeklyNoteEarly(opts: {
  weekStart: string;
  weekEnd: string;
  todayIso: string;
  daySources: WeeklyNoteDaySource[];
  habitualWeekdays: number[];
}): { ok: boolean; reason: string } {
  const { weekStart, weekEnd, todayIso, daySources, habitualWeekdays } = opts;
  if (!daySources.length) return { ok: false, reason: "no_sources" };
  if (todayIso > weekEnd) return { ok: true, reason: "week_complete" };
  if (todayIso < weekStart) return { ok: false, reason: "week_not_started" };

  const habit = habitualWeekdays.length
    ? habitualWeekdays
    : [...new Set(daySources.map((d) => isoWeekdayMon1(d.session_date)).filter(Boolean))].sort(
      (a, b) => a - b,
    );

  if (!habit.length) return { ok: false, reason: "no_habit" };
  if (habit.some((d) => d >= 4)) {
    // Attends Thu or later — wait for Saturday batch after Friday.
    return { ok: false, reason: "attends_late_week" };
  }

  const lastExpected = Math.max(...habit);
  // Last calendar date in this week that matches lastExpected weekday
  let lastDate = "";
  for (let i = 0; i <= 6; i++) {
    const d = addDaysIso(weekStart, i);
    if (isoWeekdayMon1(d) === lastExpected) lastDate = d;
  }
  if (!lastDate) return { ok: false, reason: "no_last_date" };
  if (todayIso <= lastDate) return { ok: false, reason: "waiting_last_day" };

  // Prefer having at least one source on/after their typical last day, else any sources + day passed.
  return { ok: true, reason: "early_mon_wed" };
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
    `Always use the child's first name "${firstName}" (not they/them as the subject opener).`,
    "Write 1–3 short paragraphs in English. No bullet lists. No title heading.",
    "Output plain text only — no JSON, no markdown.",
  ].join("\n");

  const user = [
    `Week: ${weekStart} (Saturday) to ${weekEnd} (Friday).`,
    "Day notes to summarise into one weekly note for the family:",
    dayBlocks,
  ].join("\n\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
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

export async function generateWeeklyNoteForContact(
  supabase: SupabaseClient,
  opts: {
    contactId: string;
    identity: ParticipantIdentityInput;
    displayName: string;
    weekStart: string;
    force?: boolean;
    allowEarly?: boolean;
    todayIso?: string;
  },
): Promise<WeeklyNoteBuildResult> {
  const weekStart = saturdayWeekStart(opts.weekStart);
  const weekEnd = fridayWeekEnd(weekStart);
  if (!weekStart || !weekEnd) {
    return { ok: false, error: "bad_week" };
  }

  const todayIso = opts.todayIso || londonTodayIso();
  const rows = await loadFeedbackForParticipantWeek(supabase, opts.identity, weekStart, weekEnd);
  const sources = await buildDaySources(supabase, rows);
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
    generatedEarly = early.reason === "early_mon_wed";
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

  const firstName = firstNameOf(opts.displayName || opts.identity.firstName || "");
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  let body = "";
  let reviewModel = "";
  let shareStatus: "ready" | "hidden" | "draft" = "ready";

  if (apiKey) {
    const ai = await callOpenAiWeeklyNote(apiKey, firstName, weekStart, weekEnd, sources);
    if (ai.ok) {
      body = ai.body;
      reviewModel = ai.model;
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
