/**
 * Auto-release Autumn 26/27 standing seats when the first bank payment
 * (due Sat 15 Aug 2026) is still unpaid after end of that London day.
 *
 * Live from: Sun 16 Aug 2026 00:00 Europe/London.
 * Last minute to pay: Sat 15 Aug 2026 23:59:59 Europe/London.
 *
 * Effect: MADRE client_name → NO PARTICIPANT on autumn + standing-template
 * days so Booking Portal can offer the seats. Also marks in_class=false.
 *
 * Exempt: GoCardless / LA funder, paid first instalment, parent-reported /
 * pending_confirmation (office still validating), void/hidden, office allowlist.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { MadreDoc } from "./portal_madre_fold_logic.ts";
import { normalizePaymentSchedule } from "./portal_invoice_payment_schedule.ts";
import {
  MADRE_TERM_KEY,
  buildStandingTemplateDatesByWeekday,
  reenrolReleaseAppliesToStandingSlot,
} from "./portal_reenrol_release_madre.ts";

export const UNPAID_AUG15_DUE_ISO = "2026-08-15";
/** First London calendar day when unpaid seats are released. */
export const UNPAID_AUG15_RELEASE_LIVE_FROM_ISO = "2026-08-16";
export const UNPAID_AUG15_REASON = "unpaid_autumn_first_2026-08-15";

/** Never auto-release these invoices (office exceptions). */
export const UNPAID_AUG15_EXCLUDE_INVOICES = new Set<string>([
  // add invoice numbers here only for true office holds
]);

/** Never auto-release these contact_ids. */
export const UNPAID_AUG15_EXCLUDE_CONTACTS = new Set<string>([
  // add contact_ids here only for true office holds
]);

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function londonTodayIso(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function unpaidAug15ReleaseIsLive(todayIso = londonTodayIso()): boolean {
  return todayIso >= UNPAID_AUG15_RELEASE_LIVE_FROM_ISO;
}

function hintIsExempt(hint: string): boolean {
  const h = hint.toLowerCase();
  return h === "gocardless" || h === "la_funded" || h === "funder" || h === "nhs";
}

/** True when the Aug-15 obligation is settled (first schedule row or full paid). */
export function aug15FirstObligationSettled(share: {
  payment_status?: string | null;
  payment_schedule?: unknown;
  amount_paid_gbp?: number | string | null;
  due_date?: string | null;
  next_instalment_due?: string | null;
}): boolean {
  const st = clean(share.payment_status).toLowerCase();
  if (st === "paid" || st === "void" || st === "cancelled") return true;

  const schedule = normalizePaymentSchedule(share.payment_schedule);
  const augRows = schedule.filter((r) => r.due_date === UNPAID_AUG15_DUE_ISO);
  if (augRows.length) {
    return augRows.every((r) => r.status === "paid");
  }
  // No schedule rows dated Aug 15 — treat whole-invoice due on Aug 15.
  if (st === "partial") {
    const paid = Number(share.amount_paid_gbp) || 0;
    return paid > 0; // any validated money + moved next due → keep (office)
  }
  return false;
}

export type UnpaidAug15Candidate = {
  invoice_id: string;
  invoice_number: string;
  contact_id: string;
  payment_status: string;
  child_display: string;
  madre_tokens: string[];
  skip_reason?: string;
};

type ParticipantRow = {
  contact_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

function tokensForParticipant(p: ParticipantRow): string[] {
  const out: string[] = [];
  const display = clean(p.display_name, 120);
  const first = clean(p.first_name, 80);
  const last = clean(p.last_name, 80);
  if (display) out.push(display);
  if (first) out.push(first);
  if (first && last) {
    out.push(`${first} ${last}`);
    out.push(`${first} ${last.slice(0, 1)}`);
    out.push(`${first} ${last.slice(0, 2)}`);
  }
  // Compact display variants ("Adam Me", "Mohamed Yu")
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    out.push(`${parts[0]} ${parts[1].slice(0, 1)}`);
    out.push(`${parts[0]} ${parts[1].slice(0, 2)}`);
    out.push(parts[0]);
  }
  const seen = new Set<string>();
  return out
    .map((t) => clean(t, 80))
    .filter((t) => {
      const k = t.toLowerCase();
      if (!k || k.length < 2) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function clientMatchesToken(slotClient: string, token: string): boolean {
  const c = clean(slotClient).toLowerCase();
  const tok = clean(token).toLowerCase();
  if (!c || !tok) return false;
  return c === tok || c.startsWith(tok + " ") || c.startsWith(tok);
}

/** Collect distinct named clients on standing-template + autumn seats. */
export function collectStandingMadreClientNames(doc: MadreDoc): string[] {
  const templateByWeekday = buildStandingTemplateDatesByWeekday(doc);
  const names = new Set<string>();
  for (const week of doc.weeks ?? []) {
    const weekRec = week as unknown as Record<string, unknown>;
    for (const st of Object.values(week.staff || {}) as Array<Record<string, unknown> | null>) {
      if (!st || typeof st !== "object") continue;
      for (const day of ((st.days as Array<Record<string, unknown>>) || [])) {
        const weekday = clean(day.weekday);
        const fromDay = clean(day.sessionDate).slice(0, 10);
        const fromWeek = clean(weekRec.start).slice(0, 10);
        const sessionIso = /^\d{4}-\d{2}-\d{2}$/.test(fromDay)
          ? fromDay
          : /^\d{4}-\d{2}-\d{2}$/.test(fromWeek)
          ? fromWeek
          : "";
        if (!reenrolReleaseAppliesToStandingSlot(sessionIso, weekday, templateByWeekday)) {
          continue;
        }
        for (const slot of ((day.slots as Array<Record<string, unknown>>) || [])) {
          const client = clean(slot.client_name);
          const u = client.toUpperCase();
          if (!client || u === "NO PARTICIPANT" || u === "CLOSED" || u === "OPEN" || u === "AVAILABLE") {
            continue;
          }
          names.add(client);
        }
      }
    }
  }
  return [...names];
}

/** Madre short names that must never be cleared by this unpaid-payment job. */
export const UNPAID_AUG15_NEVER_RELEASE_MADRE = [
  "Mia",
  "Rayyan Fi",
  "Rayyan",
  "Patrick",
  "Yoan",
  "Yossi",
  "Thushyan",
  "Adam Ab",
  "Adam Abed",
  "Eiji",
  "Hazem",
];

function isNeverReleaseMadreName(name: string): boolean {
  const c = clean(name).toLowerCase();
  return UNPAID_AUG15_NEVER_RELEASE_MADRE.some((t) => {
    const tok = t.toLowerCase();
    return c === tok || c.startsWith(tok + " ");
  });
}

/**
 * Map each unpaid contact → MADRE names they uniquely own (best score among all
 * in-class participants). Safer than name→contact then filter.
 */
export function madreNamesForReleaseContacts(
  madreNames: string[],
  releaseContactIds: Set<string>,
  participants: ParticipantRow[],
): { releaseNames: Set<string>; ambiguous: string[]; byContact: Map<string, string[]> } {
  const releaseNames = new Set<string>();
  const ambiguous: string[] = [];
  const byContact = new Map<string, string[]>();

  const firstNameCounts = new Map<string, number>();
  for (const p of participants) {
    const f = clean(p.first_name).toLowerCase();
    if (!f) continue;
    firstNameCounts.set(f, (firstNameCounts.get(f) || 0) + 1);
  }

  function scorePair(madreName: string, p: ParticipantRow): number {
    if (isNeverReleaseMadreName(madreName)) return 0;
    const tokens = tokensForParticipant(p);
    const first = clean(p.first_name).toLowerCase();
    const madre = clean(madreName).toLowerCase();
    let best = 0;
    for (const tok of tokens) {
      const t = tok.toLowerCase();
      if (!t) continue;
      if (madre === t) best = Math.max(best, 100);
      else if ((madre.startsWith(t + " ") || madre.startsWith(t)) && t.length >= 5) {
        best = Math.max(best, 80);
      } else if ((madre.startsWith(t + " ") || madre.startsWith(t)) && t.includes(" ") && t.length >= 3) {
        best = Math.max(best, 75);
      } else if (t.startsWith(madre) && madre.length >= 5) {
        best = Math.max(best, 70);
      }
    }
    if (best < 70 && first && madre === first && (firstNameCounts.get(first) || 0) === 1) {
      best = 65;
    }
    return best;
  }

  for (const madreName of madreNames) {
    if (isNeverReleaseMadreName(madreName)) continue;
    const scored = participants
      .map((p) => ({ contactId: clean(p.contact_id), score: scorePair(madreName, p) }))
      .filter((s) => s.score >= 65 && s.contactId)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) {
      ambiguous.push(madreName);
      continue;
    }
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      ambiguous.push(madreName);
      continue;
    }
    const winner = scored[0].contactId;
    if (!releaseContactIds.has(winner)) continue;
    releaseNames.add(madreName);
    const arr = byContact.get(winner) || [];
    arr.push(madreName);
    byContact.set(winner, arr);
  }
  return { releaseNames, ambiguous, byContact };
}

/** @deprecated prefer madreNamesForReleaseContacts */
export function mapMadreNamesToContacts(
  madreNames: string[],
  participants: ParticipantRow[],
): { map: Map<string, string>; ambiguous: string[] } {
  const map = new Map<string, string>();
  const allIds = new Set(participants.map((p) => clean(p.contact_id)));
  const { releaseNames, ambiguous, byContact } = madreNamesForReleaseContacts(
    madreNames,
    allIds,
    participants,
  );
  for (const [cid, names] of byContact) {
    for (const n of names) map.set(n, cid);
  }
  for (const n of releaseNames) {
    if (!map.has(n)) {
      /* filled via byContact */
    }
  }
  return { map, ambiguous };
}

export function applyMadreReleaseForNames(
  doc: MadreDoc,
  releaseNames: Set<string>,
  reason: string,
): { changed: number; notes: string[] } {
  let changed = 0;
  const notes: string[] = [];
  const templateByWeekday = buildStandingTemplateDatesByWeekday(doc);

  for (const week of doc.weeks ?? []) {
    const weekRec = week as unknown as Record<string, unknown>;
    for (const st of Object.values(week.staff || {}) as Array<Record<string, unknown> | null>) {
      if (!st || typeof st !== "object") continue;
      for (const day of ((st.days as Array<Record<string, unknown>>) || [])) {
        const weekday = clean(day.weekday);
        const fromDay = clean(day.sessionDate).slice(0, 10);
        const fromWeek = clean(weekRec.start).slice(0, 10);
        const sessionIso = /^\d{4}-\d{2}-\d{2}$/.test(fromDay)
          ? fromDay
          : /^\d{4}-\d{2}-\d{2}$/.test(fromWeek)
          ? fromWeek
          : "";
        if (!reenrolReleaseAppliesToStandingSlot(sessionIso, weekday, templateByWeekday)) {
          continue;
        }
        for (const slot of ((day.slots as Array<Record<string, unknown>>) || [])) {
          const client = clean(slot.client_name);
          if (!releaseNames.has(client)) continue;
          if (isNeverReleaseMadreName(client)) continue;
          if (client.toUpperCase() === "NO PARTICIPANT") continue;
          slot.client_name = "NO PARTICIPANT";
          if ("participant_info" in slot) {
            slot.participant_info = `Released · ${reason}`;
          }
          changed += 1;
          notes.push(
            `${client} → NO PARTICIPANT · ${sessionIso} ${weekday} ${clean(slot.time_slot)} ${clean(slot.venue)}`,
          );
        }
      }
    }
  }
  return { changed, notes };
}

/** @deprecated */
export function applyMadreReleaseForContactIds(
  doc: MadreDoc,
  releaseContactIds: Set<string>,
  madreToContact: Map<string, string>,
  reason: string,
): { changed: number; notes: string[] } {
  const releaseNames = new Set<string>();
  for (const [name, cid] of madreToContact) {
    if (releaseContactIds.has(cid)) releaseNames.add(name);
  }
  return applyMadreReleaseForNames(doc, releaseNames, reason);
}

export type UnpaidAug15RunResult = {
  ok: true;
  skipped?: boolean;
  reason?: string;
  dry_run: boolean;
  live_from: string;
  london_date: string;
  candidates: number;
  release_contacts: string[];
  exempt: Array<{ contact_id: string; invoice_number: string; reason: string }>;
  madre_changed: number;
  madre_notes: string[];
  ambiguous_madre: string[];
  in_class_cleared: number;
  invoices_flagged: number;
  revision?: number;
} | {
  ok: false;
  error: string;
};

/**
 * Select unpaid Aug-15 bank cohort, release MADRE seats, clear in_class.
 */
export async function runUnpaidAug15PlaceRelease(
  admin: SupabaseClient,
  opts: { force?: boolean; dry_run?: boolean } = {},
): Promise<UnpaidAug15RunResult> {
  const londonDate = londonTodayIso();
  const dryRun = !!opts.dry_run;

  if (!opts.force && !unpaidAug15ReleaseIsLive(londonDate)) {
    return {
      ok: true,
      skipped: true,
      reason: "before_release_date",
      dry_run: dryRun,
      live_from: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
      london_date: londonDate,
      candidates: 0,
      release_contacts: [],
      exempt: [],
      madre_changed: 0,
      madre_notes: [],
      ambiguous_madre: [],
      in_class_cleared: 0,
      invoices_flagged: 0,
    };
  }

  const { data: shares, error: shErr } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, contact_id, payment_status, payment_method_hint, payment_schedule, amount_gbp, amount_paid_gbp, due_date, next_instalment_due, parent_reported_paid_at, share_status, billing_term, notes",
    )
    .eq("share_status", "ready")
    .or(
      `due_date.eq.${UNPAID_AUG15_DUE_ISO},next_instalment_due.eq.${UNPAID_AUG15_DUE_ISO}`,
    )
    .limit(2000);
  if (shErr) return { ok: false, error: shErr.message };

  const exempt: Array<{ contact_id: string; invoice_number: string; reason: string }> = [];
  const toRelease = new Map<string, UnpaidAug15Candidate>();

  for (const row of shares || []) {
    const inv = clean(row.invoice_number, 40);
    const cid = clean(row.contact_id, 120);
    if (!cid || !inv) continue;

    if (UNPAID_AUG15_EXCLUDE_INVOICES.has(inv) || UNPAID_AUG15_EXCLUDE_CONTACTS.has(cid)) {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: "office_exclude" });
      continue;
    }
    const hint = clean(row.payment_method_hint, 40);
    if (hintIsExempt(hint)) {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: `hint_${hint || "empty"}` });
      continue;
    }
    const st = clean(row.payment_status).toLowerCase();
    if (st === "void" || st === "cancelled") {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: st });
      continue;
    }
    if (row.parent_reported_paid_at || st === "pending_confirmation") {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: "pending_bank_confirm" });
      continue;
    }
    if (aug15FirstObligationSettled(row)) {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: "aug15_settled" });
      continue;
    }
    // Must actually have an Aug-15 obligation still pending
    const schedule = normalizePaymentSchedule(row.payment_schedule);
    const hasAugPending = schedule.some(
      (r) => r.due_date === UNPAID_AUG15_DUE_ISO && r.status !== "paid",
    );
    const dueIsAug =
      clean(row.due_date).slice(0, 10) === UNPAID_AUG15_DUE_ISO ||
      clean(row.next_instalment_due).slice(0, 10) === UNPAID_AUG15_DUE_ISO;
    if (!hasAugPending && !dueIsAug) {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: "no_aug15_obligation" });
      continue;
    }
    if (st !== "unpaid" && st !== "partial") {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: `status_${st}` });
      continue;
    }

    // Already released? (idempotent marker in notes)
    const notesText = clean(row.notes, 4000);
    if (notesText.includes(UNPAID_AUG15_REASON) || notesText.includes("Auto-released")) {
      exempt.push({ contact_id: cid, invoice_number: inv, reason: "already_released" });
      continue;
    }

    toRelease.set(cid, {
      invoice_id: clean(row.id, 80),
      invoice_number: inv,
      contact_id: cid,
      payment_status: st,
      child_display: "",
      madre_tokens: [],
    });
  }

  const contactIds = [...toRelease.keys()];
  if (!contactIds.length) {
    return {
      ok: true,
      dry_run: dryRun,
      live_from: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
      london_date: londonDate,
      candidates: 0,
      release_contacts: [],
      exempt,
      madre_changed: 0,
      madre_notes: [],
      ambiguous_madre: [],
      in_class_cleared: 0,
      invoices_flagged: 0,
    };
  }

  const { data: parts } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name")
    .in("contact_id", contactIds);
  const partList = (parts || []) as ParticipantRow[];
  for (const p of partList) {
    const c = toRelease.get(clean(p.contact_id));
    if (!c) continue;
    c.child_display = clean(p.display_name || p.first_name, 120);
    c.madre_tokens = tokensForParticipant(p);
  }

  // Also load keepers (in-class) for disambiguation
  const { data: allParts } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, in_class")
    .eq("in_class", true)
    .limit(5000);

  const { data: madreRow, error: mErr } = await admin
    .from("portal_madre_document")
    .select("term_key, revision, document")
    .eq("term_key", MADRE_TERM_KEY)
    .maybeSingle();
  if (mErr || !madreRow?.document) {
    return { ok: false, error: mErr?.message || "madre_missing" };
  }

  const doc = JSON.parse(JSON.stringify(madreRow.document)) as MadreDoc;
  const madreNames = collectStandingMadreClientNames(doc);
  const releaseSet = new Set(contactIds);
  const { releaseNames, ambiguous, byContact } = madreNamesForReleaseContacts(
    madreNames,
    releaseSet,
    (allParts || []) as ParticipantRow[],
  );
  // Also score against unpaid-only participants so kids already not in_class still match.
  const unpaidParts = partList;
  const extra = madreNamesForReleaseContacts(madreNames, releaseSet, unpaidParts);
  for (const n of extra.releaseNames) releaseNames.add(n);
  for (const [cid, names] of extra.byContact) {
    const arr = byContact.get(cid) || [];
    for (const n of names) if (!arr.includes(n)) arr.push(n);
    byContact.set(cid, arr);
  }

  const applied = applyMadreReleaseForNames(doc, releaseNames, UNPAID_AUG15_REASON);
  const notes = [...applied.notes];

  // Fallback: only strong multi-word / long tokens for contacts still without a MADRE name.
  for (const cand of toRelease.values()) {
    if ((byContact.get(cand.contact_id) || []).length) continue;
    const strongTokens = cand.madre_tokens.filter((t) => {
      const x = t.toLowerCase();
      return x.length >= 5 || x.includes(" ");
    });
    if (!strongTokens.length) continue;
    const templateByWeekday = buildStandingTemplateDatesByWeekday(doc);
    for (const week of doc.weeks ?? []) {
      const weekRec = week as unknown as Record<string, unknown>;
      for (const st of Object.values(week.staff || {}) as Array<Record<string, unknown> | null>) {
        if (!st || typeof st !== "object") continue;
        for (const day of ((st.days as Array<Record<string, unknown>>) || [])) {
          const weekday = clean(day.weekday);
          const fromDay = clean(day.sessionDate).slice(0, 10);
          const fromWeek = clean(weekRec.start).slice(0, 10);
          const sessionIso = /^\d{4}-\d{2}-\d{2}$/.test(fromDay)
            ? fromDay
            : /^\d{4}-\d{2}-\d{2}$/.test(fromWeek)
            ? fromWeek
            : "";
          if (!reenrolReleaseAppliesToStandingSlot(sessionIso, weekday, templateByWeekday)) {
            continue;
          }
          for (const slot of ((day.slots as Array<Record<string, unknown>>) || [])) {
            const client = clean(slot.client_name);
            if (!client || client.toUpperCase() === "NO PARTICIPANT") continue;
            if (isNeverReleaseMadreName(client)) continue;
            if (releaseNames.has(client)) continue;
            const hit = strongTokens.some((t) => {
              const tl = t.toLowerCase();
              const cl = client.toLowerCase();
              return cl === tl || cl.startsWith(tl + " ") || (tl.length >= 5 && cl.startsWith(tl));
            });
            if (!hit) continue;
            // Ensure no other in-class kid scores higher
            const ownerCheck = madreNamesForReleaseContacts(
              [client],
              new Set([cand.contact_id]),
              (allParts || []) as ParticipantRow[],
            );
            if (!ownerCheck.releaseNames.has(client)) continue;
            slot.client_name = "NO PARTICIPANT";
            if ("participant_info" in slot) {
              slot.participant_info = `Released · ${UNPAID_AUG15_REASON}`;
            }
            releaseNames.add(client);
            notes.push(
              `${client} → NO PARTICIPANT · ${sessionIso} ${weekday} (fallback ${cand.contact_id})`,
            );
          }
        }
      }
    }
  }

  const madreChanged = notes.length;

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      live_from: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
      london_date: londonDate,
      candidates: contactIds.length,
      release_contacts: contactIds,
      exempt,
      madre_changed: madreChanged,
      madre_notes: notes.slice(0, 120),
      ambiguous_madre: ambiguous,
      in_class_cleared: 0,
      invoices_flagged: 0,
      revision: Number(madreRow.revision) || 0,
    };
  }

  let revision = Number(madreRow.revision) || 0;
  if (madreChanged > 0) {
    const meta = (doc.meta || {}) as Record<string, unknown>;
    doc.meta = {
      ...meta,
      unpaid_aug15_release_due: UNPAID_AUG15_DUE_ISO,
      unpaid_aug15_release_live_from: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
      unpaid_aug15_release_applied_at: new Date().toISOString(),
      unpaid_aug15_release_changed: madreChanged,
      unpaid_aug15_release_contacts: contactIds.slice(0, 200),
    };
    const nextRev = revision + 1;
    const { error: upErr } = await admin
      .from("portal_madre_document")
      .update({
        document: doc,
        revision: nextRev,
        updated_at: new Date().toISOString(),
      })
      .eq("term_key", MADRE_TERM_KEY)
      .eq("revision", madreRow.revision);
    if (upErr) return { ok: false, error: upErr.message };
    revision = nextRev;
  }

  // Clear in_class for released contacts
  let inClassCleared = 0;
  const { data: clearedParts } = await admin
    .from("portal_participants")
    .update({ in_class: false, updated_at: new Date().toISOString() })
    .in("contact_id", contactIds)
    .eq("in_class", true)
    .select("contact_id");
  inClassCleared = (clearedParts || []).length;
  await admin
    .from("portal_parent_contacts")
    .update({ in_class: false, updated_at: new Date().toISOString() })
    .in("contact_id", contactIds);

  // Flag invoices (notes marker keeps re-runs idempotent)
  let invoicesFlagged = 0;
  const nowIso = new Date().toISOString();
  for (const cand of toRelease.values()) {
    const { data: cur } = await admin
      .from("portal_parent_invoice_share")
      .select("id, notes")
      .eq("id", cand.invoice_id)
      .maybeSingle();
    if (!cur) continue;
    const noteLine =
      `Auto-released ${nowIso.slice(0, 10)} · ${UNPAID_AUG15_REASON} · unpaid first Autumn payment due ${UNPAID_AUG15_DUE_ISO}`;
    const notesText = clean(cur.notes, 2000);
    if (notesText.includes(UNPAID_AUG15_REASON)) {
      invoicesFlagged += 1;
      continue;
    }
    const { error } = await admin
      .from("portal_parent_invoice_share")
      .update({
        notes: [notesText, noteLine].filter(Boolean).join("\n").slice(0, 4000),
        updated_at: nowIso,
      })
      .eq("id", cand.invoice_id);
    if (!error) invoicesFlagged += 1;
  }

  return {
    ok: true,
    dry_run: false,
    live_from: UNPAID_AUG15_RELEASE_LIVE_FROM_ISO,
    london_date: londonDate,
    candidates: contactIds.length,
    release_contacts: contactIds,
    exempt,
    madre_changed: madreChanged,
    madre_notes: notes.slice(0, 120),
    ambiguous_madre: ambiguous,
    in_class_cleared: inClassCleared,
    invoices_flagged: invoicesFlagged,
    revision,
  };
}
