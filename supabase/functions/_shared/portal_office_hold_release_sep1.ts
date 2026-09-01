/**
 * Office holds that keep a seat past the Aug-15 unpaid release, then
 * auto-release at London midnight on 1 Sep 2026 if still unpaid / not re-enrolled.
 *
 * Erik Ndregjoni (176) · Agata — deadline 31 Aug 23:59 London; release from 1 Sep 00:00.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { MadreDoc } from "./portal_madre_fold_logic.ts";
import { MADRE_TERM_KEY } from "./portal_reenrol_release_madre.ts";
import {
  applyMadreReleaseForNames,
  collectStandingMadreClientNames,
  madreNamesForReleaseContacts,
} from "./portal_reenrol_release_unpaid_aug15.ts";

export const OFFICE_HOLD_SEP1_LIVE_FROM_ISO = "2026-09-01";
/** Last London calendar day the place is held (pay / re-enrol by 23:59). */
export const OFFICE_HOLD_SEP1_DEADLINE_ISO = "2026-08-31";
export const OFFICE_HOLD_SEP1_REASON = "office_hold_expired_2026-09-01";

export type OfficeHoldSep1Case = {
  contact_id: string;
  parent_person_id: string;
  child_label: string;
  madre_tokens: string[];
};

/** Families held by office until end of Aug; released 1 Sep if still unpaid. */
export const OFFICE_HOLD_SEP1_CASES: OfficeHoldSep1Case[] = [
  {
    contact_id: "176",
    parent_person_id: "5797478",
    child_label: "Erik Ndregjoni",
    madre_tokens: ["Erik", "Erik Ndregjoni", "Ndregjoni"],
  },
];

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function londonTodayIso(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function officeHoldSep1ReleaseIsLive(todayIso = londonTodayIso()): boolean {
  return todayIso >= OFFICE_HOLD_SEP1_LIVE_FROM_ISO;
}

/** True when family completed re-enrol / paid after the Aug reset (keep place). */
export async function officeHoldSep1CaseIsSettled(
  admin: SupabaseClient,
  contactId: string,
): Promise<{ settled: boolean; reason: string }> {
  const cid = clean(contactId, 40);
  if (!cid) return { settled: false, reason: "no_contact" };

  const { data: invs } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, payment_status, amount_paid_gbp, share_status, created_at")
    .eq("contact_id", cid)
    .neq("payment_status", "void")
    .limit(40);

  for (const row of invs || []) {
    const st = clean(row.payment_status).toLowerCase();
    const paidAmt = Number(row.amount_paid_gbp) || 0;
    if (st === "paid") {
      return { settled: true, reason: `invoice_paid:${row.invoice_number}` };
    }
    if (paidAmt > 0 || st === "partial") {
      return { settled: true, reason: `invoice_partial:${row.invoice_number}` };
    }
    // Fresh unpaid but live invoice after reset = they re-enrolled; keep until paid chase.
    if (st === "unpaid" && clean(row.share_status).toLowerCase() === "ready") {
      const created = clean(row.created_at).slice(0, 10);
      if (created >= "2026-08-11") {
        return { settled: true, reason: `reenrolled_live_invoice:${row.invoice_number}` };
      }
    }
  }

  const { data: sub } = await admin
    .from("portal_re_enrolment_submissions")
    .select("id, submitted_at")
    .eq("participant_contact_id", cid)
    .gte("submitted_at", "2026-08-11T00:00:00.000Z")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sub?.id) {
    return { settled: true, reason: `reenrol_submission:${sub.id}` };
  }

  return { settled: false, reason: "no_paid_invoice_or_reenrol" };
}

export type OfficeHoldSep1RunResult = {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  dry_run?: boolean;
  live_from?: string;
  deadline?: string;
  cases: Array<{
    contact_id: string;
    child_label: string;
    action: "kept" | "would_release" | "released" | "skipped";
    detail: string;
  }>;
  madre_changed: number;
  madre_notes: string[];
};

export async function runOfficeHoldSep1PlaceRelease(
  admin: SupabaseClient,
  opts: { force?: boolean; dry_run?: boolean } = {},
): Promise<OfficeHoldSep1RunResult> {
  const dry = !!opts.dry_run;
  const londonDate = londonTodayIso();
  const casesOut: OfficeHoldSep1RunResult["cases"] = [];

  if (!opts.force && !officeHoldSep1ReleaseIsLive(londonDate)) {
    return {
      ok: true,
      skipped: true,
      reason: "before_live_from",
      live_from: OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
      deadline: OFFICE_HOLD_SEP1_DEADLINE_ISO,
      cases: [],
      madre_changed: 0,
      madre_notes: [],
    };
  }

  const toReleaseIds: string[] = [];
  const labelById = new Map<string, string>();

  for (const c of OFFICE_HOLD_SEP1_CASES) {
    const settled = await officeHoldSep1CaseIsSettled(admin, c.contact_id);
    if (settled.settled) {
      casesOut.push({
        contact_id: c.contact_id,
        child_label: c.child_label,
        action: "kept",
        detail: settled.reason,
      });
      continue;
    }
    toReleaseIds.push(c.contact_id);
    labelById.set(c.contact_id, c.child_label);
    casesOut.push({
      contact_id: c.contact_id,
      child_label: c.child_label,
      action: dry ? "would_release" : "released",
      detail: settled.reason,
    });
  }

  if (!toReleaseIds.length) {
    return {
      ok: true,
      dry_run: dry,
      live_from: OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
      deadline: OFFICE_HOLD_SEP1_DEADLINE_ISO,
      cases: casesOut,
      madre_changed: 0,
      madre_notes: [],
    };
  }

  const { data: madreRow, error: mErr } = await admin
    .from("portal_madre_document")
    .select("term_key, revision, document")
    .eq("term_key", MADRE_TERM_KEY)
    .maybeSingle();
  if (mErr || !madreRow?.document) {
    return { ok: false, error: mErr?.message || "madre_missing", cases: casesOut, madre_changed: 0, madre_notes: [] };
  }

  const { data: allParts } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, in_class")
    .eq("in_class", true)
    .limit(5000);

  const doc = JSON.parse(JSON.stringify(madreRow.document)) as MadreDoc;
  const madreNames = collectStandingMadreClientNames(doc);
  const releaseSet = new Set(toReleaseIds);
  const { releaseNames, byContact } = madreNamesForReleaseContacts(
    madreNames,
    releaseSet,
    (allParts || []) as Array<{
      contact_id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>,
  );

  // Ensure Erik tokens hit even if scoring is thin.
  for (const c of OFFICE_HOLD_SEP1_CASES) {
    if (!toReleaseIds.includes(c.contact_id)) continue;
    for (const tok of c.madre_tokens) {
      for (const n of madreNames) {
        if (clean(n).toLowerCase() === clean(tok).toLowerCase()) releaseNames.add(n);
      }
    }
    const owned = byContact.get(c.contact_id) || [];
    for (const n of owned) releaseNames.add(n);
  }

  const applied = applyMadreReleaseForNames(doc, releaseNames, OFFICE_HOLD_SEP1_REASON);
  const now = new Date().toISOString();

  if (!dry && applied.changed > 0) {
    const prevRev = Number(madreRow.revision) || 0;
    const { error: saveErr } = await admin
      .from("portal_madre_document")
      .update({
        document: doc,
        revision: prevRev + 1,
        updated_at: now,
      })
      .eq("term_key", MADRE_TERM_KEY)
      .eq("revision", prevRev);
    if (saveErr) {
      return {
        ok: false,
        error: `madre_save:${saveErr.message}`,
        cases: casesOut,
        madre_changed: 0,
        madre_notes: applied.notes,
      };
    }
  }

  if (!dry) {
    for (const cid of toReleaseIds) {
      await admin
        .from("portal_parent_contacts")
        .update({ in_class: false, updated_at: now })
        .eq("contact_id", cid);
      await admin
        .from("portal_participants")
        .update({ in_class: false, updated_at: now })
        .eq("contact_id", cid);

      await admin
        .from("portal_family_payment_holds")
        .update({
          status: "hard_cut",
          notes: `Auto-released ${now.slice(0, 10)} · ${OFFICE_HOLD_SEP1_REASON} · no re-enrol/payment by ${OFFICE_HOLD_SEP1_DEADLINE_ISO} 23:59 London`,
          updated_at: now,
        })
        .eq("contact_id", cid)
        .in("status", ["soft_hold", "session_held"]);
    }
  }

  return {
    ok: true,
    dry_run: dry,
    live_from: OFFICE_HOLD_SEP1_LIVE_FROM_ISO,
    deadline: OFFICE_HOLD_SEP1_DEADLINE_ISO,
    cases: casesOut,
    madre_changed: applied.changed,
    madre_notes: applied.notes,
  };
}
