import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const BUCKET = "participant-documents";

type DocRow = {
  id: string;
  form_type: string;
  participant_name: string;
  participant_dob: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  pdf_storage_path: string;
  photo_storage_path: string | null;
  payload_json: Record<string, unknown>;
  status: string;
  submitted_at: string;
  pdf_signed_url: string | null;
  photo_signed_url: string | null;
  place_kind: string;
  place_label: string;
  place_tone: string;
  place_detail: string | null;
  place_secondary_label: string | null;
  place_secondary_tone: string | null;
  place_chips: PlaceChip[] | null;
  form_chips: PlaceChip[] | null;
  reservation_status: string | null;
  booking_status: string | null;
  client_status: string | null;
  in_class: boolean | null;
  on_waiting_list: boolean | null;
};

type ReservationLite = {
  status: string | null;
  participant_name: string | null;
  parent_email: string | null;
  service_name: string | null;
  venue: string | null;
  day_label: string | null;
  time_label: string | null;
  notes: string | null;
  hold_expires_at: string | null;
  updated_at: string | null;
};

function normalizeName(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function emailNorm(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function truthyFlag(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "waiting_list";
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ap = na.split(" ");
  const bp = nb.split(" ");
  if (ap[0] === bp[0] && (!!ap[1] || !!bp[1]) && (ap[1] || "") === (bp[1] || "")) {
    return true;
  }
  // Nickname / form spelling: Yossi ↔ Yosiyas (same family surname).
  const nickPairs = [["yossi", "yosiyas"], ["yosiyas", "yossi"]];
  for (const [x, y] of nickPairs) {
    if (ap[0] === x && bp[0] === y && (ap[1] || "") && (ap[1] || "") === (bp[1] || "")) {
      return true;
    }
  }
  return false;
}

function isMergedRetiredName(name: string): boolean {
  const n = normalizeName(name);
  return (
    n.includes("merged") ||
    n.includes("retired") ||
    n.startsWith("zzz ") ||
    /\(merged/.test(n)
  );
}

function slotDetailFromReservation(r: ReservationLite | null): string | null {
  if (!r) return null;
  const bits = [r.service_name, r.venue, r.day_label, r.time_label]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

function isTrialNotes(notes: string | null | undefined): boolean {
  return /booking_kind\s*=\s*trial/i.test(String(notes || ""));
}

function isTrialPaidNotes(notes: string | null | undefined): boolean {
  const n = String(notes || "");
  return /trial_paid/i.test(n) || /paid_stripe/i.test(n) || /stripe.*paid|paid.*stripe/i.test(n);
}

function isPayHoldNotes(notes: string | null | undefined): boolean {
  return /pay_hold/i.test(String(notes || ""));
}

function holdStillOpen(holdExpiresAt: string | null | undefined): boolean {
  if (!holdExpiresAt) return false;
  const t = Date.parse(String(holdExpiresAt));
  return Number.isFinite(t) && t > Date.now();
}

function officePlaceTag(
  notes: string | null | undefined,
  payload: Record<string, unknown>,
): string {
  const fromNotes = String(notes || "").match(/office_place\s*=\s*([a-z0-9_]+)/i);
  if (fromNotes && fromNotes[1]) return fromNotes[1].toLowerCase();
  const fromPayload = String(payload.office_place || "").trim().toLowerCase();
  return fromPayload;
}

type PlaceChip = { label: string; tone: string };

type PlaceOut = {
  kind: string;
  label: string;
  tone: string;
  detail: string | null;
  secondary_label: string | null;
  secondary_tone: string | null;
  chips?: PlaceChip[] | null;
};

function normalizeSupportRatio(
  raw: string | null | undefined,
  notes?: string | null,
): "1to1" | "2to1" | null {
  const s = String(raw || "").toLowerCase().replace(/\s+/g, "");
  const n = String(notes || "");
  if (
    s === "2to1" ||
    s === "2:1" ||
    s.includes("2to1") ||
    /ratio\s*=\s*2to1|support_regulated\s*=\s*2to1/i.test(n)
  ) {
    return "2to1";
  }
  if (
    s === "1to1" ||
    s === "1:1" ||
    s.includes("1to1") ||
    /ratio\s*=\s*1to1|support_regulated\s*=\s*1to1/i.test(n)
  ) {
    return "1to1";
  }
  return null;
}

function fundingChipFromCode(code: string | null | undefined): PlaceChip | null {
  const c = String(code || "").trim().toLowerCase();
  if (c === "sw_nhs_referral" || c === "nhs_referral") {
    return { label: "Local Authority / NHS referral", tone: "info" };
  }
  if (c === "la_direct_payments") {
    return { label: "Funded with Direct Payments", tone: "info" };
  }
  if (c === "privately_funded") {
    return { label: "Privately funded", tone: "pend" };
  }
  return null;
}

function fundingCodeFromChoices(choices: unknown): string {
  const cj = asRecord(choices);
  if (!cj) return "";
  return String(cj.funding_code || cj.funding || "").trim();
}

/** Prefer live finish choices over stale expired token columns. */
function pickFundingCodeFromTokens(
  tokens: Array<{
    document_id?: string | null;
    funding_code?: string | null;
    status?: string | null;
    choices_json?: unknown;
    updated_at?: string | null;
  }>,
): Map<string, string> {
  const best = new Map<string, { code: string; score: number; at: number }>();
  for (const t of tokens || []) {
    const id = String(t.document_id || "");
    const code = String(t.funding_code || "").trim() || fundingCodeFromChoices(t.choices_json);
    if (!id || !code) continue;
    const st = String(t.status || "").toLowerCase();
    const score = st === "completed" ? 3 : st === "pending" ? 2 : st === "expired" ? 1 : 0;
    const at = Date.parse(String(t.updated_at || "")) || 0;
    const prev = best.get(id);
    if (!prev || score > prev.score || (score === prev.score && at > prev.at)) {
      best.set(id, { code, score, at });
    }
  }
  const out = new Map<string, string>();
  for (const [id, v] of best.entries()) out.set(id, v.code);
  return out;
}

/** Funding + support chips for the Form column (registration / booking attempt). */
function deriveFormChips(opts: {
  payload_json: Record<string, unknown> | null;
  reservation: ReservationLite | null;
  funding_code?: string | null;
  /** Finish-booking token exists (even if funding never saved). */
  has_finish_token?: boolean;
}): PlaceChip[] {
  const payload = asRecord(opts.payload_json) || {};
  const br = asRecord(payload.booking_request);
  const notes = String(opts.reservation?.notes || "");
  const officeTag = officePlaceTag(notes, payload);
  const existingClient = truthyFlag(payload.existing_client_confirm);
  const bookingKind = String(br?.booking_kind || payload.booking_kind || "")
    .trim()
    .toLowerCase();
  const isTrialIntent =
    bookingKind === "trial" ||
    bookingKind === "trial_session" ||
    bookingKind === "taster" ||
    /booking_kind\s*=\s*trial/i.test(notes);

  /* Registration form / NHS flags first — finish-token funding can be stale (expired retry). */
  let funding =
    fundingChipFromCode(String(payload.funding_code || "")) ||
    fundingChipFromCode(String(br?.funding_code || "")) ||
    null;

  if (!funding) {
    if (
      officeTag === "nhs_referral_2to1" ||
      officeTag === "sw_nhs_referral" ||
      truthyFlag(payload.nhs_referral) ||
      truthyFlag(payload.sw_nhs_referral) ||
      /sw_nhs_referral|nhs_referral|no_parent_pay/i.test(notes)
    ) {
      funding = { label: "Local Authority / NHS referral", tone: "info" };
    } else if (/la_direct_payments|direct.?payment/i.test(notes)) {
      funding = { label: "Funded with Direct Payments", tone: "info" };
    } else if (/privately_funded/i.test(notes)) {
      funding = { label: "Privately funded", tone: "pend" };
    }
  }

  if (!funding) {
    funding = fundingChipFromCode(opts.funding_code);
  }

  /* Funding is chosen on finish-booking (not the registration PDF). If they never
     finished that step, show an explicit gap so office does not think the chip is broken. */
  if (!funding && (opts.has_finish_token || isTrialIntent || existingClient)) {
    funding = { label: "Funding not chosen", tone: "urgSoft" };
  }

  let support = normalizeSupportRatio(
    String(
      payload.support_regulated ||
        br?.support_regulated ||
        payload.ratio_needed ||
        "",
    ),
    notes,
  );
  /* Booking Portal defaults to 1to1; existing-client confirm often omitted the field. */
  if (
    !support &&
    (existingClient ||
      String(br?.from || "").toLowerCase() === "bookingportal" ||
      funding)
  ) {
    support = "1to1";
  }

  const chips: PlaceChip[] = [];
  if (funding) chips.push(funding);
  if (support) chips.push({ label: support, tone: "info" });
  return chips;
}

function withWaitSecondary(
  place: PlaceOut,
  waitFlag: boolean,
): PlaceOut {
  if (!waitFlag) return place;
  if (/waiting.?list/i.test(place.label)) return place;
  return {
    ...place,
    secondary_label: "Waiting list",
    secondary_tone: "info",
  };
}

/**
 * Live place status only — Registration forms do not show form snapshot slots.
 * Slot detail comes from the live reservation (finish-booking / pay hold).
 */
function derivePlace(row: {
  payload_json: Record<string, unknown> | null;
  booking_status: string | null;
  client_status: string | null;
  in_class: boolean | null;
  on_waiting_list: boolean | null;
  reservation: ReservationLite | null;
}): PlaceOut {
  const payload = asRecord(row.payload_json) || {};
  const br = asRecord(payload.booking_request);
  const bookingStatus = String(row.booking_status || "").toLowerCase();
  const clientStatus = String(row.client_status || "").toLowerCase();
  const res = row.reservation;
  const resStatus = String(res?.status || "").toLowerCase();
  const notes = String(res?.notes || "");
  const detail = slotDetailFromReservation(res);
  const none: PlaceOut = {
    kind: "registered_only",
    label: "Registered only",
    tone: "pend",
    detail: null,
    secondary_label: null,
    secondary_tone: null,
  };

  const waitFromPayload =
    truthyFlag(payload.waiting_list) ||
    truthyFlag(payload.on_waiting_list) ||
    truthyFlag(br?.waiting_list) ||
    truthyFlag(br?.join_waiting_list) ||
    String(br?.mode || "").toLowerCase() === "waiting_list" ||
    String(br?.booking_mode || "").toLowerCase() === "waiting_list";

  const waitFlag =
    row.on_waiting_list === true ||
    bookingStatus === "waiting_list" ||
    clientStatus === "waiting_list" ||
    waitFromPayload;

  const officeTag = officePlaceTag(notes, payload);

  // Explicit office triage tags (Registration forms Place column).
  if (officeTag === "registered_trial_expired_admin_hold") {
    return {
      kind: "registered_trial_expired_admin_hold",
      label: "Registered",
      tone: "pend",
      detail,
      secondary_label: null,
      secondary_tone: null,
      chips: [
        { label: "Registered", tone: "pend" },
        { label: "Trial expired", tone: "orange" },
        { label: "Slot hold by admin", tone: "urgSoft" },
      ],
    };
  }
  if (officeTag === "registered_trial_expired_slot_lost") {
    return {
      kind: "registered_trial_expired_slot_lost",
      label: "Registered",
      tone: "pend",
      detail,
      secondary_label: null,
      secondary_tone: null,
      chips: [
        { label: "Registered", tone: "pend" },
        { label: "Trial expired", tone: "orange" },
        { label: "Slot lost", tone: "urg" },
      ],
    };
  }
  if (
    officeTag === "waiting_list_ma_sunday" ||
    (waitFlag && String(payload.waitlist_service || "").toLowerCase().includes("multi"))
  ) {
    const wlDetail = [
      payload.waitlist_service || "Multi-Activity",
      payload.waitlist_venue || "SwimFarm",
      payload.waitlist_day || "Sunday",
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(" · ");
    return {
      kind: "waiting_list_ma_sunday",
      label: "Waiting list · MA Sunday",
      tone: "info",
      detail: wlDetail || detail,
      secondary_label: null,
      secondary_tone: null,
    };
  }

  // LA / NHS referral funding is shown under Form (funding + support chips), not as Place.
  if (
    (resStatus === "released" || resStatus === "expired") &&
    /registered_only|office_declined|fortnight/i.test(notes)
  ) {
    return { ...none, kind: "registered_only" };
  }

  // 1) Live seat / class membership (may also be on another waiting list).
  if (row.in_class === true) {
    if (resStatus === "validated" && isTrialNotes(res?.notes)) {
      return withWaitSecondary(
        {
          kind: "trial_in_class",
          label: "In class · trial",
          tone: "ok",
          detail,
          secondary_label: null,
          secondary_tone: null,
        },
        waitFlag,
      );
    }
    return withWaitSecondary(
      {
        kind: "in_class",
        label: "In class",
        tone: "ok",
        detail,
        secondary_label: null,
        secondary_tone: null,
      },
      waitFlag,
    );
  }

  if (resStatus === "validated") {
    if (isPayHoldNotes(res?.notes) && holdStillOpen(res?.hold_expires_at)) {
      return withWaitSecondary(
        {
          kind: "pay_hold",
          label: isTrialNotes(res?.notes) ? "Pay hold · trial" : "Pay hold (seat held)",
          tone: "pend",
          detail,
          secondary_label: null,
          secondary_tone: null,
        },
        waitFlag,
      );
    }
    if (isPayHoldNotes(res?.notes) && !holdStillOpen(res?.hold_expires_at)) {
      return {
        kind: "pay_hold_lapsed",
        label: "Pay hold lapsed",
        tone: "warn",
        detail,
        secondary_label: null,
        secondary_tone: null,
      };
    }
    if (isTrialNotes(res?.notes)) {
      if (isTrialPaidNotes(res?.notes)) {
        return withWaitSecondary(
          {
            kind: "trial",
            label: "Formal · trial",
            tone: "ok",
            detail,
            secondary_label: null,
            secondary_tone: null,
          },
          waitFlag,
        );
      }
      // Accepted / held trial but no paid marker — treat as admin hold pending contact.
      return {
        kind: "registered_trial_expired_admin_hold",
        label: "Registered · trial expired",
        tone: "pend",
        detail,
        secondary_label: "Slot hold by admin",
        secondary_tone: "warn",
      };
    }
    return withWaitSecondary(
      {
        kind: "formal",
        label: "Formal place",
        tone: "ok",
        detail,
        secondary_label: null,
        secondary_tone: null,
      },
      waitFlag,
    );
  }

  if (resStatus === "pending" || resStatus === "awaiting_payment") {
    const officeConfirm = /office_confirm_hold/i.test(notes);
    return {
      kind: officeConfirm ? "awaiting_tide" : "awaiting_payment",
      label: officeConfirm
        ? isTrialNotes(res?.notes)
          ? "Awaiting Tide · trial"
          : "Awaiting Tide (Mark paid)"
        : isTrialNotes(res?.notes)
          ? "Pay hold · trial"
          : "Pay hold (30 min)",
      tone: "pend",
      detail,
      secondary_label: null,
      secondary_tone: null,
    };
  }

  if (resStatus === "expired") {
    if (/admin_hold|accepted_by_admin/i.test(notes)) {
      return {
        kind: "registered_trial_expired_admin_hold",
        label: "Registered · trial expired",
        tone: "pend",
        detail,
        secondary_label: "Slot hold by admin",
        secondary_tone: "warn",
      };
    }
    return {
      kind: "expired",
      label: "Registered · trial expired",
      tone: "pend",
      detail,
      secondary_label: "Slot lost",
      secondary_tone: "urg",
    };
  }

  if (resStatus === "released") {
    return {
      kind: "released",
      label: "Registered · trial expired",
      tone: "pend",
      detail,
      secondary_label: "Slot lost",
      secondary_tone: "urg",
    };
  }

  // 2) Waiting list when they are not holding / in class.
  if (waitFlag) {
    return {
      kind: "waiting_list",
      label: "Waiting list",
      tone: "info",
      detail,
      secondary_label: null,
      secondary_tone: null,
    };
  }

  if (bookingStatus === "booking_completed") {
    return {
      kind: "formal",
      label: "Formal place",
      tone: "ok",
      detail,
      secondary_label: null,
      secondary_tone: null,
    };
  }

  // 3) Registered form only — no live seat.
  return none;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: {
    participant_name?: string;
    limit?: number;
    include_consents?: boolean;
    form_type?: string;
    form_types?: string[];
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const participantFilter = String(body.participant_name || "").trim();
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
  const includeConsents = body.include_consents === true;

  const ALLOWED = new Set([
    "client_registration",
    "climbing_registration",
    "annual_consents",
  ]);
  let formTypes: string[] = [];
  if (includeConsents) {
    formTypes = [];
  } else if (Array.isArray(body.form_types) && body.form_types.length) {
    formTypes = body.form_types
      .map((t) => String(t || "").trim().toLowerCase())
      .filter((t) => ALLOWED.has(t));
  } else {
    const one = String(body.form_type || "").trim().toLowerCase();
    if (one === "climbing_registration" || one === "climbing") {
      formTypes = ["climbing_registration"];
    } else if (one === "client_registration" || one === "client" || one === "registration") {
      formTypes = ["client_registration"];
    } else if (one === "all_registrations" || one === "both") {
      formTypes = ["client_registration", "climbing_registration"];
    } else {
      formTypes = ["client_registration"];
    }
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = admin
    .from("portal_participant_documents")
    .select(
      "id, form_type, participant_name, participant_dob, parent_name, parent_email, parent_phone, pdf_storage_path, photo_storage_path, payload_json, status, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(includeConsents ? limit : Math.min(limit * 2, 500));

  if (!includeConsents) {
    query = query.in("form_type", formTypes.length ? formTypes : ["client_registration"]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-participant-documents-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  const rows = (data || []) as Omit<
    DocRow,
    | "pdf_signed_url"
    | "photo_signed_url"
    | "place_kind"
    | "place_label"
    | "place_tone"
    | "place_detail"
    | "place_secondary_label"
    | "place_secondary_tone"
    | "reservation_status"
    | "booking_status"
    | "client_status"
    | "in_class"
    | "on_waiting_list"
  >[];
  const filterNorm = participantFilter ? normalizeName(participantFilter) : "";

  const filtered = filterNorm
    ? rows.filter((r) => {
        const pn = normalizeName(r.participant_name);
        if (pn === filterNorm) return true;
        if (pn.includes(filterNorm) || filterNorm.includes(pn)) return true;
        const pnParts = pn.split(" ");
        const fParts = filterNorm.split(" ");
        return pnParts[0] === fParts[0] && (pnParts[1] || "") === (fParts[1] || "");
      })
    : rows;

  const capped = filtered.slice(0, limit);

  const fundingByDocId = new Map<string, string>();
  const finishTokenByDocId = new Set<string>();
  const docIds = capped.map((r) => String(r.id || "")).filter(Boolean);
  if (docIds.length) {
    const { data: tokens } = await admin
      .from("portal_booking_completion_tokens")
      .select("document_id, funding_code, status, choices_json, updated_at")
      .in("document_id", docIds)
      .order("updated_at", { ascending: false })
      .limit(800);
    for (const t of tokens || []) {
      const id = String(t.document_id || "");
      if (id) finishTokenByDocId.add(id);
    }
    const picked = pickFundingCodeFromTokens(tokens || []);
    for (const [id, code] of picked.entries()) fundingByDocId.set(id, code);
  }

  const emails = Array.from(
    new Set(
      capped
        .map((r) => emailNorm(String(r.parent_email || "")))
        .filter((e) => e.includes("@")),
    ),
  );
  const childNames = Array.from(
    new Set(capped.map((r) => normalizeName(r.participant_name)).filter(Boolean)),
  );

  const leadByEmail = new Map<
    string,
    { booking_status: string | null; client_status: string | null }
  >();
  if (emails.length) {
    const { data: leads } = await admin
      .from("portal_booking_leads")
      .select("email, email_norm, booking_status, client_status")
      .in("email_norm", emails)
      .limit(800);
    for (const lead of leads || []) {
      const key = emailNorm(String(lead.email_norm || lead.email || ""));
      if (!key) continue;
      leadByEmail.set(key, {
        booking_status: lead.booking_status != null ? String(lead.booking_status) : null,
        client_status: lead.client_status != null ? String(lead.client_status) : null,
      });
    }
  }

  const contactByChild = new Map<
    string,
    { in_class: boolean | null; on_waiting_list: boolean | null; child_display: string }
  >();
  if (childNames.length) {
    const { data: contacts } = await admin
      .from("portal_parent_contacts")
      .select("child_display, in_class, on_waiting_list")
      .limit(5000);
    for (const c of contacts || []) {
      const display = String(c.child_display || "");
      if (isMergedRetiredName(display)) continue;
      const key = normalizeName(display);
      if (!key) continue;
      if (
        !childNames.some(
          (n) => n === key || namesMatch(n, key) || key.includes(n) || n.includes(key),
        )
      ) {
        continue;
      }
      const next = {
        in_class: c.in_class === true ? true : c.in_class === false ? false : null,
        on_waiting_list:
          c.on_waiting_list === true ? true : c.on_waiting_list === false ? false : null,
        child_display: display,
      };
      const prev = contactByChild.get(key);
      // Prefer live in-class / non-retired over stale duplicate contacts.
      if (!prev || (next.in_class === true && prev.in_class !== true)) {
        contactByChild.set(key, next);
      }
    }
  }

  /** Latest reservation per email+child (prefer live statuses). */
  const reservationByKey = new Map<string, ReservationLite>();
  if (emails.length) {
    // Quote emails so @ / . are not parsed as PostgREST operators.
    const emailOr = emails
      .map((e) => `parent_email.ilike."${e.replace(/"/g, "")}"`)
      .join(",");
    const { data: reservations } = await admin
      .from("portal_booking_slot_reservations")
      .select(
        "status, participant_name, parent_email, service_name, venue, day_label, time_label, notes, hold_expires_at, updated_at",
      )
      .or(emailOr)
      .order("updated_at", { ascending: false })
      .limit(1200);

    const statusRank = (s: string): number => {
      const x = String(s || "").toLowerCase();
      if (x === "validated") return 50;
      if (x === "pending" || x === "awaiting_payment") return 40;
      if (x === "expired") return 20;
      if (x === "released") return 10;
      return 0;
    };

    for (const raw of reservations || []) {
      const em = emailNorm(String(raw.parent_email || ""));
      const who = normalizeName(String(raw.participant_name || ""));
      if (!em || !who) continue;
      const key = em + "|" + who;
      const candidate: ReservationLite = {
        status: raw.status != null ? String(raw.status) : null,
        participant_name: raw.participant_name != null ? String(raw.participant_name) : null,
        parent_email: raw.parent_email != null ? String(raw.parent_email) : null,
        service_name: raw.service_name != null ? String(raw.service_name) : null,
        venue: raw.venue != null ? String(raw.venue) : null,
        day_label: raw.day_label != null ? String(raw.day_label) : null,
        time_label: raw.time_label != null ? String(raw.time_label) : null,
        notes: raw.notes != null ? String(raw.notes) : null,
        hold_expires_at: raw.hold_expires_at != null ? String(raw.hold_expires_at) : null,
        updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
      };
      const prev = reservationByKey.get(key);
      if (!prev) {
        reservationByKey.set(key, candidate);
        continue;
      }
      const pr = statusRank(String(prev.status || ""));
      const cr = statusRank(String(candidate.status || ""));
      if (cr > pr) {
        reservationByKey.set(key, candidate);
        continue;
      }
      if (cr === pr) {
        const pt = Date.parse(String(prev.updated_at || "")) || 0;
        const ct = Date.parse(String(candidate.updated_at || "")) || 0;
        if (ct >= pt) reservationByKey.set(key, candidate);
      }
    }
  }

  function findReservation(
    email: string,
    participantName: string,
  ): ReservationLite | null {
    const em = emailNorm(email);
    const who = normalizeName(participantName);
    if (!em || !who) return null;
    const exact = reservationByKey.get(em + "|" + who);
    if (exact) return exact;
    for (const [k, v] of reservationByKey.entries()) {
      if (!k.startsWith(em + "|")) continue;
      const child = k.slice(em.length + 1);
      if (namesMatch(child, who)) return v;
    }
    return null;
  }

  const out: DocRow[] = [];
  for (const row of capped) {
    let pdfSigned: string | null = null;
    let photoSigned: string | null = null;
    if (row.pdf_storage_path) {
      const { data: pdfUrl } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.pdf_storage_path, 3600);
      pdfSigned = pdfUrl?.signedUrl ?? null;
    }
    if (row.photo_storage_path) {
      const { data: photoUrl } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.photo_storage_path, 3600);
      photoSigned = photoUrl?.signedUrl ?? null;
    }

    const em = emailNorm(String(row.parent_email || ""));
    const lead = em ? leadByEmail.get(em) : null;
    const childKey = normalizeName(row.participant_name);
    let contact = childKey ? contactByChild.get(childKey) : null;
    if (!contact && childKey) {
      for (const [k, v] of contactByChild.entries()) {
        if (isMergedRetiredName(v.child_display || k)) continue;
        if (namesMatch(k, childKey) || k.includes(childKey) || childKey.includes(k)) {
          contact = v;
          if (v.in_class === true) break;
        }
      }
    }

    const reservation = findReservation(String(row.parent_email || ""), row.participant_name);
    const place = derivePlace({
      payload_json: (row.payload_json || {}) as Record<string, unknown>,
      booking_status: lead?.booking_status ?? null,
      client_status: lead?.client_status ?? null,
      in_class: contact?.in_class ?? null,
      on_waiting_list: contact?.on_waiting_list ?? null,
      reservation,
    });
    const formChips = deriveFormChips({
      payload_json: (row.payload_json || {}) as Record<string, unknown>,
      reservation,
      funding_code: fundingByDocId.get(String(row.id)) || null,
      has_finish_token: finishTokenByDocId.has(String(row.id)),
    });

    out.push({
      ...row,
      pdf_signed_url: pdfSigned,
      photo_signed_url: photoSigned,
      place_kind: place.kind,
      place_label: place.label,
      place_tone: place.tone,
      place_detail: place.detail,
      place_secondary_label: place.secondary_label,
      place_secondary_tone: place.secondary_tone,
      place_chips: place.chips || null,
      form_chips: formChips.length ? formChips : null,
      reservation_status: reservation?.status ?? null,
      booking_status: lead?.booking_status ?? null,
      client_status: lead?.client_status ?? null,
      in_class: contact?.in_class ?? null,
      on_waiting_list: contact?.on_waiting_list ?? null,
    });
  }

  return portalAdminJson(200, {
    ok: true,
    documents: out,
    meta: {
      count: out.length,
      filtered: Boolean(filterNorm),
      form_scope: includeConsents ? "all" : formTypes.join(",") || "client_registration",
    },
  });
});
