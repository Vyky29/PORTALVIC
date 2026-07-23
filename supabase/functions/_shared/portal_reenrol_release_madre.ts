/**
 * After re-enrol deadline (Wed 22 Jul 2026), release standing MADRE seats that
 * are no longer kept for 26/27 so the public booking offer shows them as free.
 *
 * Idempotent: safe to re-run. Admin can later set CLOSED / re-name slots.
 * Do not move participants between venues here — office handles venue changes.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { MadreDoc } from "./portal_madre_fold_logic.ts";

export const REENROL_RELEASE_DEADLINE_ISO = "2026-07-22";
export const REENROL_RELEASE_LIVE_FROM_ISO = "2026-07-23";
export const MADRE_TERM_KEY = "summer-2026";

type SlotCtx = {
  client: string;
  day: string;
  time: string;
  venue: string;
  service: string;
};

type ReleaseRule =
  | {
    kind: "all";
    clients: string[];
    reason: string;
    /** Default NO PARTICIPANT (bookable). CLOSED = hidden from public offer. */
    setTo?: "NO PARTICIPANT" | "CLOSED";
  }
  | {
    kind: "filter";
    clients: string[];
    reason: string;
    setTo?: "NO PARTICIPANT" | "CLOSED";
    match: (slot: SlotCtx) => boolean;
  };

/**
 * Post-deadline releases for Autumn 26/27.
 * Thushyan / Yoan / Yossi / Mohammed stay CLOSED (office hold — not public).
 * Mia is never touched here.
 */
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
    reason: "office_hold_block",
    setTo: "CLOSED",
  },
  {
    kind: "all",
    clients: ["Yoan"],
    reason: "office_hold_block",
    setTo: "CLOSED",
  },
  {
    kind: "all",
    clients: ["Yossi", "yossi"],
    reason: "office_hold_block",
    setTo: "CLOSED",
  },
  {
    kind: "all",
    clients: ["Mohammed", "Mohamed"],
    reason: "office_hold_block",
    setTo: "CLOSED",
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
];

/**
 * Standing lines we opened for office-hold kids — keep CLOSED.
 * Staff keys pin the exact instructor line (avoid closing Eiji’s freed Thu 5.30–6.30).
 */
const OFFICE_HOLD_CLOSED_BANDS: Array<{
  label: string;
  staff: RegExp;
  day: RegExp;
  time: RegExp;
  venue: RegExp;
  service?: RegExp;
}> = [
  {
    label: "Thushyan",
    staff: /^simon$/i,
    day: /thu/i,
    time: /^4\.30\s*to\s*5$/i,
    venue: /acton/i,
    service: /aquatic/i,
  },
  {
    label: "Yoan",
    staff: /^roberto$/i,
    day: /sun/i,
    time: /2\.30\s*to\s*3\.30/i,
    venue: /swimfarm|swim farm/i,
    service: /aquatic/i,
  },
  {
    label: "Yossi",
    staff: /^roberto$/i,
    day: /thu/i,
    time: /^(5\s*to\s*5\.30|17\s*to\s*17\.30)$/i,
    venue: /acton/i,
  },
  {
    label: "Mohammed",
    staff: /^roberto$/i,
    day: /thu/i,
    time: /5\.30\s*to\s*6\.30/i,
    venue: /acton/i,
    service: /aquatic/i,
  },
];

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function clientMatches(slotClient: string, tokens: string[]): boolean {
  const c = norm(slotClient).toLowerCase();
  if (!c) return false;
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

/**
 * Office corrections kept idempotent on every release pass:
 * - Mia stays Northolt Wed 6–6.30 only (not Acton; not 5.30–6.30).
 * - First half Northolt Wed 5.30–6 on dan stays bookable (NO PARTICIPANT).
 * - CLOSED hold lines for Thushyan / Yoan / Yossi / Mohammed.
 */
export function applyReenrolOfficeCorrectionsToMadre(doc: MadreDoc): {
  changed: number;
  notes: string[];
} {
  let changed = 0;
  const notes: string[] = [];

  for (const week of doc.weeks ?? []) {
    for (const st of Object.values(week.staff || {}) as Array<Record<string, unknown>>) {
      const staffKey = norm(st.staffKey || st.name).toLowerCase();
      const days = (st.days as Array<Record<string, unknown>>) || [];
      for (const day of days) {
        const weekday = norm(day.weekday);
        const slots = (day.slots as Array<Record<string, unknown>>) || [];

        // Mia: shrink / place Northolt Wed 6–6.30 on dan; free 5.30–6.
        if (/wed/i.test(weekday) && staffKey === "dan") {
          let miaSlot: Record<string, unknown> | null = null;
          let halfOpen: Record<string, unknown> | null = null;
          for (const slot of slots) {
            const client = norm(slot.client_name);
            const time = norm(slot.time_slot);
            const venue = norm(slot.venue);
            const service = norm(slot.service);
            if (!/northolt/i.test(venue) || !/aquatic/i.test(service)) continue;
            if (/^mia$/i.test(client) && /5\.30\s*to\s*6\.30/i.test(time)) {
              miaSlot = slot;
            }
            if (/^mia$/i.test(client) && /^6(\.00)?\s*to\s*6\.30/i.test(time)) {
              miaSlot = slot;
            }
            if (
              /5\.30\s*to\s*6(?!\.30)/i.test(time) &&
              (client.toUpperCase() === "NO PARTICIPANT" || !client)
            ) {
              halfOpen = slot;
            }
          }
          if (miaSlot && /5\.30\s*to\s*6\.30/i.test(norm(miaSlot.time_slot))) {
            miaSlot.time_slot = "6 to 6.30";
            if ("participant_info" in miaSlot) miaSlot.participant_info = "";
            changed += 1;
            notes.push("Mia Northolt 5.30–6.30 → 6–6.30 (dan)");
            if (!halfOpen) {
              const open530: Record<string, unknown> = {
                ...miaSlot,
                client_name: "NO PARTICIPANT",
                time_slot: "5.30 to 6",
                participant_info: "",
              };
              slots.push(open530);
              changed += 1;
              notes.push("Add Northolt Wed 5.30–6 NO PARTICIPANT (dan)");
            }
          }
        }

        for (const slot of slots) {
          const client = norm(slot.client_name);
          const time = norm(slot.time_slot);
          const venue = norm(slot.venue);
          const service = norm(slot.service);
          const info = norm(slot.participant_info);

          // Never keep Mia on Acton from auto-place.
          if (
            (/^mia$/i.test(client) || /re-enrol 26\/27.*acton|place_30/i.test(info)) &&
            /acton/i.test(venue) &&
            /wed/i.test(weekday) &&
            /^6(\.00)?\s*to\s*6\.30/i.test(time) &&
            /aquatic/i.test(service)
          ) {
            slot.client_name = "NO PARTICIPANT";
            if ("participant_info" in slot) slot.participant_info = "";
            changed += 1;
            notes.push(`Mia Acton undo → NO PARTICIPANT · ${weekday} ${time}`);
            continue;
          }

          // Office hold: keep these instructor lines CLOSED (not public).
          for (const band of OFFICE_HOLD_CLOSED_BANDS) {
            if (!band.staff.test(staffKey)) continue;
            if (!band.day.test(weekday)) continue;
            if (!band.time.test(time)) continue;
            if (!band.venue.test(venue)) continue;
            if (band.service && service && !band.service.test(service)) continue;
            if (client.toUpperCase() === "CLOSED") continue;
            if (
              client.toUpperCase() !== "NO PARTICIPANT" &&
              !clientMatches(client, [band.label])
            ) {
              continue;
            }
            slot.client_name = "CLOSED";
            if ("participant_info" in slot) {
              slot.participant_info =
                `Office hold · ${band.label} · not released to booking portal`;
            }
            changed += 1;
            notes.push(
              `${client || "slot"} → CLOSED · ${staffKey} ${weekday} ${time} ${venue} (${band.label})`,
            );
            break;
          }
        }
      }
    }
  }

  return { changed, notes };
}

/** Mutate MADRE doc in memory; returns change notes. */
export function applyReenrolReleaseRulesToMadre(doc: MadreDoc): {
  changed: number;
  notes: string[];
  miaPlacedOnActon: number;
} {
  let changed = 0;
  const notes: string[] = [];

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
            const target = rule.setTo || "NO PARTICIPANT";
            if (client.toUpperCase() === target.toUpperCase()) continue;
            // Re-block if we previously opened a hold kid as NO PARTICIPANT.
            if (
              target === "CLOSED" &&
              client.toUpperCase() === "NO PARTICIPANT"
            ) {
              // handled in corrections via band match; skip here (name no longer matches)
              continue;
            }
            if (
              client.toUpperCase() === "NO PARTICIPANT" ||
              client.toUpperCase() === "CLOSED"
            ) {
              continue;
            }
            slot.client_name = target;
            if ("participant_info" in slot) {
              slot.participant_info = target === "CLOSED"
                ? "Office hold · not released to booking portal"
                : "";
            }
            changed += 1;
            notes.push(
              `${client} → ${target} · ${weekday} ${time} ${venue} (${rule.reason})`,
            );
            break;
          }
        }
      }
    }
  }

  const fix = applyReenrolOfficeCorrectionsToMadre(doc);
  changed += fix.changed;
  notes.push(...fix.notes);

  return { changed, notes, miaPlacedOnActon: 0 };
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
  const { changed, notes } = applyReenrolReleaseRulesToMadre(doc);

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
    reenrol_release_mia_acton: 0,
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
