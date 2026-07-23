/**
 * After re-enrol deadline (Wed 22 Jul 2026), release standing MADRE seats that
 * are no longer kept for 26/27 so the public booking offer shows them as free.
 *
 * Idempotent: safe to re-run. Admin can later set CLOSED / re-name slots.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { MadreDoc } from "./portal_madre_fold_logic.ts";

export const REENROL_RELEASE_DEADLINE_ISO = "2026-07-22";
export const REENROL_RELEASE_LIVE_FROM_ISO = "2026-07-23";
export const MADRE_TERM_KEY = "summer-2026";

type ReleaseRule =
  | {
    kind: "all";
    /** Match client_name (case-insensitive exact or starts-with token). */
    clients: string[];
    reason: string;
  }
  | {
    kind: "filter";
    clients: string[];
    reason: string;
    /** Return true to release this slot. */
    match: (slot: {
      client: string;
      day: string;
      time: string;
      venue: string;
      service: string;
    }) => boolean;
  };

/** Confirmed post-deadline releases for Autumn 26/27 booking accuracy. */
export const REENROL_RELEASE_RULES: ReleaseRule[] = [
  {
    kind: "all",
    clients: ["Adam Me", "Adam Memy"],
    reason: "not_continuing",
  },
  {
    kind: "all",
    clients: ["Scott"],
    reason: "not_renewing",
  },
  {
    kind: "all",
    clients: ["Ayden W", "Ayden"],
    reason: "unconfirmed_deadline",
  },
  {
    kind: "all",
    clients: ["Thushyan"],
    reason: "unconfirmed_deadline",
  },
  {
    kind: "all",
    clients: ["Yoan"],
    reason: "unconfirmed_deadline",
  },
  {
    kind: "all",
    clients: ["Yossi", "yossi"],
    reason: "unconfirmed_deadline",
  },
  {
    kind: "all",
    clients: ["Mohammed", "Mohamed"],
    reason: "unconfirmed_deadline",
  },
  {
    kind: "filter",
    clients: ["Eiji"],
    reason: "withdrew_aquatic_acton",
    match: (s) =>
      /aquatic/i.test(s.service) &&
      /acton/i.test(s.venue) &&
      /tue|thu/i.test(s.day),
  },
  {
    kind: "filter",
    clients: ["Hazem"],
    reason: "withdrew_aquatic_acton",
    match: (s) =>
      /aquatic/i.test(s.service) &&
      /acton/i.test(s.venue) &&
      /tue|thu/i.test(s.day),
  },
  {
    kind: "filter",
    clients: ["Adam Ab", "Adam Abed"],
    reason: "reenrol_sunday_multi_only_release_wed",
    match: (s) =>
      /multi/i.test(s.service) &&
      /acton/i.test(s.venue) &&
      /wed/i.test(s.day),
  },
  {
    kind: "filter",
    clients: ["Mia"],
    reason: "reduced_to_30_acton_release_northolt_60",
    match: (s) =>
      /aquatic/i.test(s.service) &&
      /northolt/i.test(s.venue) &&
      /wed/i.test(s.day) &&
      /5\.30\s*to\s*6\.30|5\.30\s*-\s*6\.30/i.test(s.time),
  },
];

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function clientMatches(slotClient: string, tokens: string[]): boolean {
  const c = norm(slotClient).toLowerCase();
  if (!c || c === "no participant" || c === "closed" || c === "no client") {
    return false;
  }
  return tokens.some((t) => {
    const tok = norm(t).toLowerCase();
    if (!tok) return false;
    return c === tok || c.startsWith(tok + " ") || c.startsWith(tok);
  });
}

function londonTodayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function reenrolReleaseIsLive(todayIso = londonTodayIso()): boolean {
  return todayIso >= REENROL_RELEASE_LIVE_FROM_ISO;
}

export type ReenrolReleaseApplyResult = {
  ok: true;
  skipped?: boolean;
  reason?: string;
  changed: number;
  notes: string[];
  revision?: number;
} | {
  ok: false;
  error: string;
};

/** Mutate MADRE doc in memory; returns change notes. */
export function applyReenrolReleaseRulesToMadre(doc: MadreDoc): {
  changed: number;
  notes: string[];
  miaPlacedOnActon: number;
} {
  let changed = 0;
  const notes: string[] = [];
  let miaPlacedOnActon = 0;

  for (const week of doc.weeks ?? []) {
    for (const st of Object.values(week.staff || {}) as Array<Record<string, unknown>>) {
      const days = (st.days as Array<Record<string, unknown>>) || [];
      for (const day of days) {
        const weekday = norm(day.weekday);
        const slots = (day.slots as Array<Record<string, unknown>>) || [];
        for (const slot of slots) {
          const client = norm(slot.client_name);
          const time = norm(slot.time_slot);
          const venue = norm(slot.venue);
          const service = norm(slot.service);
          const ctx = { client, day: weekday, time, venue, service };

          for (const rule of REENROL_RELEASE_RULES) {
            if (!clientMatches(client, rule.clients)) continue;
            if (rule.kind === "filter" && !rule.match(ctx)) continue;
            if (client.toUpperCase() === "NO PARTICIPANT") continue;
            slot.client_name = "NO PARTICIPANT";
            if ("participant_info" in slot) slot.participant_info = "";
            changed += 1;
            notes.push(
              `${client} → NO PARTICIPANT · ${weekday} ${time} ${venue} (${rule.reason})`,
            );
            break;
          }

          // Mia 30' Acton: claim one standing open Acton Wed 6–6.30 (youssef line).
          // Kayden keeps the other Acton 6–6.30 instructor line.
          if (
            norm(slot.client_name).toUpperCase() === "NO PARTICIPANT" &&
            /acton/i.test(venue) &&
            /wed/i.test(weekday) &&
            /^6(\.00)?\s*to\s*6\.30/i.test(time) &&
            /aquatic/i.test(service)
          ) {
            slot.client_name = "Mia";
            if ("participant_info" in slot) {
              slot.participant_info = "Re-enrol 26/27 · 30' Acton (office)";
            }
            changed += 1;
            miaPlacedOnActon += 1;
            notes.push(
              `NO PARTICIPANT → Mia · ${weekday} ${time} ${venue} (place_30)`,
            );
          }
        }
      }
    }
  }

  return { changed, notes, miaPlacedOnActon };
}

/**
 * Load live MADRE, apply release rules when live, persist if anything changed.
 * No-op before Thu 23 Jul 2026 (London) unless force=true.
 */
export async function ensureReenrolUnconfirmedReleasedOnMadre(
  admin: SupabaseClient,
  opts: { force?: boolean } = {},
): Promise<ReenrolReleaseApplyResult> {
  if (!opts.force && !reenrolReleaseIsLive()) {
    return {
      ok: true,
      skipped: true,
      reason: "before_release_date",
      changed: 0,
      notes: [],
    };
  }

  const { data: row, error } = await admin
    .from("portal_madre_document")
    .select("term_key, revision, document")
    .eq("term_key", MADRE_TERM_KEY)
    .maybeSingle();
  if (error || !row?.document) {
    return { ok: false, error: error?.message || "madre_missing" };
  }

  const doc = row.document as MadreDoc;
  const meta = (doc.meta || {}) as Record<string, unknown>;
  const { changed, notes, miaPlacedOnActon } = applyReenrolReleaseRulesToMadre(doc);

  if (changed <= 0) {
    return {
      ok: true,
      skipped: true,
      reason: "already_applied",
      changed: 0,
      notes: [],
      revision: Number(row.revision) || 0,
    };
  }

  doc.meta = {
    ...meta,
    reenrol_release_deadline: REENROL_RELEASE_DEADLINE_ISO,
    reenrol_release_live_from: REENROL_RELEASE_LIVE_FROM_ISO,
    reenrol_release_applied_at: new Date().toISOString(),
    reenrol_release_changed: changed,
    reenrol_release_mia_acton: miaPlacedOnActon,
  };

  const nextRev = (Number(row.revision) || 0) + 1;
  const { error: upErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: nextRev,
      updated_at: new Date().toISOString(),
    })
    .eq("term_key", MADRE_TERM_KEY)
    .eq("revision", row.revision);
  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  return {
    ok: true,
    changed,
    notes: notes.slice(0, 80),
    revision: nextRev,
  };
}
