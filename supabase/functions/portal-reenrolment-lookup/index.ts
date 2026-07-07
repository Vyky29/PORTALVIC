// portal-reenrolment-lookup — match parent + participant, return 2026/27 renewal preview.
// POST JSON: parent_first_name, parent_last_name, participant_name, participant_age | participant_dob
// Optional: contact_id + x-parent-portal-session (family portal — skips identity form).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import {
  ageMatchesInput,
  annualTotalForWeekly,
  buildCurrentArrangements2526,
  mergeWeeklySlotsFromRosterAndPayment,
  paymentClientKeyForParticipant,
  enrichWeeklySlotsFromRoster,
  namesMatch,
  normalizePersonName,
  parentNamesMatch,
  paymentRowToContext,
  REENROL_ACADEMIC_YEAR,
  slotsFromPublishedSessions,
  weeklySlotsFromRosterRows,
} from "../_shared/reenrolment_catalog.ts";
import {
  canonicalParticipantClientId,
  participantIdentityMatches,
  resolveParticipantLookupNames,
} from "../_shared/participant_identity.ts";
import { resolveParticipantAvatarUrls } from "../_shared/participant_avatar.ts";

const CRASH_INFO = {
  note:
    "Intensive crash courses (Swimming, Acton Centre) are booked separately — 4-day blocks Mon–Thu, 30' or 60'. Times TBC.",
  indicativePrices: { "30min": 50, "60min": 100 },
  venue: "Acton Centre",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function parseAge(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 120 ? Math.round(n) : null;
}

function parseDobInput(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 8) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    return `${yyyy}-${mm}-${dd}`;
  }
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

async function verifyParentSession(
  supabase: ReturnType<typeof createClient>,
  token: string,
): Promise<string | null> {
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const { data: sess } = await supabase
    .from("portal_parent_portal_sessions")
    .select("parent_person_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!sess || sess.revoked_at) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) return null;
  return String(sess.parent_person_id || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sessionToken = String(req.headers.get("x-parent-portal-session") || "").trim();
  const contactIdParam = String(body.contact_id || "").trim();
  let parentPersonId = sessionToken ? await verifyParentSession(supabase, sessionToken) : null;

  const parentFirst = String(body.parent_first_name || "").trim();
  const parentLast = String(body.parent_last_name || "").trim();
  const participantName = String(body.participant_name || "").trim();
  const inputAge = parseAge(body.participant_age);
  const dobIso = parseDobInput(String(body.participant_dob || ""));

  let participantRow: Record<string, unknown> | null = null;

  if (parentPersonId && contactIdParam) {
    const { data: pRow } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name, dob_iso, parent_person_id, avatar_storage_path")
      .eq("contact_id", contactIdParam)
      .eq("parent_person_id", parentPersonId)
      .maybeSingle();
    if (pRow) participantRow = pRow;
  }

  if (!participantRow) {
    if (!parentFirst || !parentLast || !participantName) {
      return json(400, { ok: false, error: "missing_fields" });
    }
    if (inputAge == null && !dobIso) {
      return json(400, { ok: false, error: "missing_age_or_dob" });
    }

    const { data: parents } = await supabase
      .from("portal_parent_contacts")
      .select("parent_person_id, parent_first_name, parent_last_name, parent_display")
      .limit(500);

    const matchedParents = (parents || []).filter((p) =>
      normalizeParentRow(p, parentFirst, parentLast)
    );

    if (!matchedParents.length) {
      return json(200, { ok: false, error: "not_found" });
    }

    const parentIds = matchedParents.map((p) => String(p.parent_person_id));

    const { data: participants } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name, dob_iso, parent_person_id, avatar_storage_path")
      .in("parent_person_id", parentIds);

    participantRow = (participants || []).find((p) => {
      if (!participantRecordMatches(participantName, p)) return false;
      if (dobIso && String(p.dob_iso || "") !== dobIso) return false;
      if (inputAge != null && !ageMatchesInput(String(p.dob_iso || ""), inputAge)) return false;
      return true;
    }) || null;
  }

  if (!participantRow) {
    return json(200, { ok: false, error: "not_found" });
  }

  parentPersonId = String(participantRow.parent_person_id || parentPersonId || "");

  const paymentCtx = await findPaymentContext(supabase, participantRow, parentFirst, parentLast);

  const { data: prior } = await supabase
    .from("portal_re_enrolment_submissions")
    .select("id, submitted_at")
    .eq("academic_year", REENROL_ACADEMIC_YEAR)
    .eq("participant_contact_id", String(participantRow.contact_id))
    .order("submitted_at", { ascending: false })
    .limit(1);

  const { data: parentContact } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, parent_last_name, email, mobile")
    .eq("parent_person_id", parentPersonId)
    .limit(1)
    .maybeSingle();

  const avatar = await resolveParticipantAvatarUrls(supabase, url, {
    contact_id: String(participantRow.contact_id),
    display_name: String(participantRow.display_name || ""),
    dob_iso: participantRow.dob_iso ? String(participantRow.dob_iso) : null,
    avatar_storage_path: participantRow.avatar_storage_path
      ? String(participantRow.avatar_storage_path)
      : null,
  });

  const participantDisplayName = String(participantRow.display_name || "");
  const paymentWeeklySlots = paymentCtx?.weeklySlots || [];
  let rosterRows: Awaited<ReturnType<typeof fetchRosterRowsForParticipant>> = [];
  try {
    rosterRows = await fetchRosterRowsForParticipant(supabase, participantDisplayName, participantRow);
  } catch (err) {
    console.error("[portal-reenrolment-lookup] roster fetch", err);
  }
  // Admin-published services (client_services_review.html → "Publicar al portal"
  // → portal_participant_service_lines) are the authoritative source of the
  // participant's service list when present. They override the payment/roster
  // derivation; payment rows still supply pricing via the merge helper.
  let publishedSlots: Awaited<ReturnType<typeof fetchPublishedServiceLines>> = [];
  try {
    publishedSlots = await fetchPublishedServiceLines(
      supabase,
      participantDisplayName,
      participantRow,
      paymentCtx?.clientKey || "",
    );
  } catch (err) {
    console.error("[portal-reenrolment-lookup] published fetch", err);
  }

  let weeklySlots = paymentWeeklySlots;
  let dayCentreSlots = paymentCtx?.dayCentreSlots || [];
  if (publishedSlots.length) {
    const pubWeekly = publishedSlots.filter((s) => !s.isDayCentre);
    const pubDc = publishedSlots.filter((s) => s.isDayCentre);
    // Published weekly slots define days/services; payment rows supply pricing.
    weeklySlots = pubWeekly.length
      ? mergeWeeklySlotsFromRosterAndPayment(
          participantDisplayName,
          pubWeekly,
          paymentWeeklySlots,
          [],
        )
      : paymentWeeklySlots;
    if (pubDc.length) dayCentreSlots = pubDc;
  } else {
    try {
      const rosterSlots = rosterRows.length
        ? weeklySlotsFromRosterRows(participantDisplayName, rosterRows)
        : [];
      if (rosterSlots.length) {
        weeklySlots = mergeWeeklySlotsFromRosterAndPayment(
          participantDisplayName,
          rosterSlots,
          paymentWeeklySlots,
          rosterRows,
        );
      } else if (paymentWeeklySlots.length && rosterRows.length) {
        weeklySlots = enrichWeeklySlotsFromRoster(
          participantDisplayName,
          paymentWeeklySlots,
          rosterRows,
        );
      }
    } catch (err) {
      console.error("[portal-reenrolment-lookup] roster merge", err);
    }
  }
  const annualWeeklyTotal = annualTotalForWeekly(weeklySlots);
  const currentArrangements2526 = buildCurrentArrangements2526({
    participantName: participantDisplayName,
    dobIso: participantRow.dob_iso ? String(participantRow.dob_iso) : null,
    serviceRaw: paymentCtx?.serviceRaw || null,
    weeklySlots,
    dayCentreSlots,
    rosterRows,
    paymentMethod: paymentCtx?.payMethod || null,
    funding: paymentCtx?.fundingSource || null,
    invoiceType: paymentCtx?.vat || null,
  });

  return json(200, {
    ok: true,
    academic_year: REENROL_ACADEMIC_YEAR,
    participant: {
      contact_id: participantRow.contact_id,
      display_name: participantRow.display_name,
      dob_iso: participantRow.dob_iso,
      avatar_url: avatar.avatar_url,
      avatar_source: avatar.avatar_source,
    },
    parent: {
      parent_person_id: parentPersonId,
      display_name: parentContact?.parent_display ?? null,
      first_name: parentContact?.parent_first_name ?? parentFirst,
      last_name: parentContact?.parent_last_name ?? parentLast,
      email: parentContact?.email ?? null,
    },
    funding: {
      current_2526: {
        payment_method: paymentCtx?.payMethod || null,
        funding: paymentCtx?.fundingSource || null,
        invoice_type: paymentCtx?.vat || null,
        invoice_type_code: paymentCtx?.vatCode || null,
      },
    },
    payment_status: paymentCtx?.paymentStatus || null,
    outstanding_amount: paymentCtx?.outstanding ?? null,
    service_raw: paymentCtx?.serviceRaw || null,
    current_arrangements_2526: currentArrangements2526,
    weekly_slots: weeklySlots,
    day_centre: dayCentreSlots.length
      ? {
          slots: dayCentreSlots,
          venue: "SwimFarm",
          note: "Day Centre fees are agreed with your funder — not shown here.",
        }
      : null,
    annual_weekly_total: annualWeeklyTotal,
    crash_info: CRASH_INFO,
    calendar_url: "/portal/day-centre-calendar-2026-27-section.html",
    existing_submission: !!(prior && prior.length),
    existing_submission_at: prior?.[0]?.submitted_at ?? null,
    client_key: paymentCtx?.clientKey || null,
  });
});

function participantRecordMatches(
  participantName: string,
  p: { display_name?: string; first_name?: string; last_name?: string; contact_id?: string },
): boolean {
  const display = String(p.display_name || "");
  const first = String(p.first_name || "");
  const last = String(p.last_name || "");
  if (participantIdentityMatches(
    { displayName: participantName, firstName: participantName.split(/\s+/)[0] },
    display,
    String(p.contact_id || ""),
  )) {
    return true;
  }
  if (namesMatch(participantName, display)) return true;
  if (namesMatch(participantName, `${first} ${last}`.trim())) return true;
  const want = normalizePersonName(participantName);
  const gotFirst = normalizePersonName(first);
  if (want && gotFirst && (want === gotFirst || gotFirst.startsWith(want) || want.startsWith(gotFirst))) {
    return true;
  }
  return false;
}

function normalizeParentRow(
  p: { parent_first_name?: string; parent_last_name?: string; parent_display?: string },
  parentFirst: string,
  parentLast: string,
): boolean {
  const pf = String(p.parent_first_name || "").trim();
  const pl = String(p.parent_last_name || "").trim();
  if (pf && pl && namesMatch(parentFirst, pf) && namesMatch(parentLast, pl)) return true;
  return parentNamesMatch(parentFirst, parentLast, String(p.parent_display || ""));
}

async function findPaymentContext(
  supabase: ReturnType<typeof createClient>,
  participantRow: Record<string, unknown>,
  parentFirst: string,
  parentLast: string,
) {
  const displayName = String(participantRow.display_name || "");
  const firstName = String(participantRow.first_name || displayName.split(" ")[0] || "");
  const contactId = String(participantRow.contact_id || "");
  const preferredKey = paymentClientKeyForParticipant(displayName);

  if (preferredKey) {
    const { data: keyed } = await supabase
      .from("client_payments")
      .select("client_key, client_name, parent_name, payment_status, amount, data, sheet")
      .eq("client_key", preferredKey)
      .maybeSingle();
    if (keyed) {
      const keyedCtx = paymentRowToContext(keyed as Record<string, unknown>);
      if (keyedCtx.weeklySlots.length || keyedCtx.dayCentreSlots.length) {
        return keyedCtx;
      }
    }
  }

  const { data: rows } = await supabase
    .from("client_payments")
    .select("client_key, client_name, parent_name, payment_status, amount, data, sheet")
    .order("imported_at", { ascending: false })
    .limit(400);

  let best: ReturnType<typeof paymentRowToContext> | null = null;
  let bestScore = -1;

  for (const row of rows || []) {
    const clientName = String(row.client_name || "");
    const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
    const pax = String(data.pax || clientName || "");

    const nameOk =
      participantIdentityMatches(
        { displayName, firstName, contactId },
        pax || clientName,
        String(row.client_key || pax || clientName),
      ) || namesMatch(displayName, clientName) || namesMatch(firstName, pax);

    if (!nameOk) continue;

    const parentName = String(row.parent_name || data.parent || "");
    if (parentFirst && parentLast && parentName && parentName !== "—") {
      if (!parentNamesMatch(parentFirst, parentLast, parentName) && String(row.sheet) === "PARENTS") {
        continue;
      }
    }

    const ctx = paymentRowToContext(row as Record<string, unknown>);
    if (!ctx.weeklySlots.length && !ctx.dayCentreSlots.length) continue;
    let score = ctx.annualWeeklyTotal + ctx.weeklySlots.length * 0.01;
    if (String(row.client_key || "") === preferredKey) score += 1_000_000;
    if (String(row.sheet || "") === "LA") score += 100;
    if (score > bestScore) {
      bestScore = score;
      best = ctx;
    }
  }

  return best;
}

// Admin-reviewed services published from client_services_review.html →
// portal_participant_service_lines. Bridged by client_key (payments use dashes,
// the review tool uses underscores) with a fuzzy name fallback.
async function fetchPublishedServiceLines(
  supabase: ReturnType<typeof createClient>,
  participantName: string,
  participantRow: Record<string, unknown> | undefined,
  paymentClientKey: string,
) {
  const empty: ReturnType<typeof slotsFromPublishedSessions> = [];
  const tryKeys = new Set<string>();
  if (paymentClientKey) {
    tryKeys.add(paymentClientKey.replace(/-/g, "_"));
    tryKeys.add(paymentClientKey);
  }
  const slug = canonicalParticipantClientId(participantName);
  if (slug) {
    tryKeys.add(slug);
    tryKeys.add(slug.replace(/_/g, "-"));
  }

  for (const key of tryKeys) {
    if (!key) continue;
    const { data } = await supabase
      .from("portal_participant_service_lines")
      .select("client_key, client_name, sessions")
      .eq("client_key", key)
      .maybeSingle();
    const sessions = data && Array.isArray((data as Record<string, unknown>).sessions)
      ? (data as { sessions: unknown[] }).sessions
      : null;
    if (sessions && sessions.length) {
      return slotsFromPublishedSessions(sessions as Parameters<typeof slotsFromPublishedSessions>[0]);
    }
  }

  // Fuzzy fallback: match published rows by normalized-name prefix.
  const identity = {
    displayName: participantName,
    firstName: String(participantRow?.first_name || participantName.split(/\s+/)[0] || ""),
    lastName: String(participantRow?.last_name || ""),
    contactId: String(participantRow?.contact_id || ""),
  };
  const prefixes = new Set<string>();
  for (const nm of resolveParticipantLookupNames(identity)) {
    const tok = normalizePersonName(nm).split(" ")[0] || "";
    if (tok.length >= 2) prefixes.add(tok);
  }
  if (!prefixes.size) return empty;

  for (const prefix of [...prefixes].slice(0, 5)) {
    const { data } = await supabase
      .from("portal_participant_service_lines")
      .select("client_key, client_name, client_name_norm, sessions")
      .ilike("client_name_norm", `${prefix}%`)
      .limit(20);
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const name = String(row.client_name || "");
      const sessions = Array.isArray(row.sessions) ? (row.sessions as unknown[]) : null;
      if (!sessions || !sessions.length) continue;
      if (
        namesMatch(participantName, name) ||
        participantIdentityMatches(identity, name, String(row.client_key || name))
      ) {
        return slotsFromPublishedSessions(
          sessions as Parameters<typeof slotsFromPublishedSessions>[0],
        );
      }
    }
  }
  return empty;
}

async function fetchRosterRowsForParticipant(
  supabase: ReturnType<typeof createClient>,
  participantName: string,
  participantRow?: Record<string, unknown>,
) {
  const identity = {
    displayName: participantName,
    firstName: String(participantRow?.first_name || participantName.split(/\s+/)[0] || ""),
    lastName: String(participantRow?.last_name || ""),
    contactId: String(participantRow?.contact_id || ""),
  };
  const prefixes = new Set<string>();
  for (const nm of resolveParticipantLookupNames(identity)) {
    const tok = normalizePersonName(nm).split(" ")[0] || "";
    if (tok.length >= 2) prefixes.add(tok);
  }
  const slugTok = canonicalParticipantClientId(participantName).split("_")[0] || "";
  if (slugTok.length >= 2) prefixes.add(slugTok);

  if (!prefixes.size) return [];

  const seenRow = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const prefix of [...prefixes].slice(0, 5)) {
    const { data } = await supabase
      .from("portal_roster_rows")
      .select("client_name, day, time_slot, service, venue, instructors")
      .eq("status", "active")
      .ilike("client_name", `${prefix}%`)
      .gte("session_date", "2026-01-01")
      .order("session_date", { ascending: false })
      .limit(250);

    for (const row of data || []) {
      const name = String(row.client_name || "");
      const key = `${name}|${row.day}|${row.time_slot}|${row.service}`;
      if (seenRow.has(key)) continue;
      if (
        !participantIdentityMatches(identity, name, name) &&
        !namesMatch(participantName, name)
      ) {
        continue;
      }
      seenRow.add(key);
      merged.push(row);
    }
  }
  return merged;
}
