// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-booking-leads-list
// Admin: Booking Portal OTP leads (name / email / phone / status).
// Clarifies portal visitors vs office email-interest imports (not real visits).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

type VisitKind = "trial" | "term";

function bookingKindFrom(notes: string, mode: string | null): VisitKind | "" {
  const n = String(notes || "");
  const m = String(mode || "").toLowerCase();
  if (/booking_kind\s*=\s*trial|\breleased_post_trial\b|\btrial_paid\b|\btrial_hold\b/i.test(n) || m === "trial") {
    return "trial";
  }
  if (/booking_kind\s*=\s*term/i.test(n) || m === "term") return "term";
  if (/ops_synced|booking_paid/i.test(n) && !/trial/i.test(n)) return "term";
  return "";
}

function nameKey(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Outcome is what this visit did: Only looked, Waiting list, Trial, Term.
 * Type is who they were: new visitor, known without the parent portal, or ACTIVE.
 */
async function attachLeadVisit(admin: ReturnType<typeof createClient>, leads: Record<string, unknown>[]) {
  const emails = [
    ...new Set(
      leads.map((r) => String(r.email || "").trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const byEmail = new Map<string, { at: number; kind: VisitKind; notes: string }[]>();
  const byName = new Map<string, { at: number; kind: VisitKind; notes: string }[]>();
  if (emails.length) {
    const { data, error } = await admin
      .from("portal_booking_slot_reservations")
      .select("parent_email, parent_name, notes, booking_mode, created_at")
      .gte("created_at", "2026-08-01")
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) {
      console.warn("[portal-admin-booking-leads-list] reservations", error.message);
    } else {
      const want = new Set(emails);
      for (const row of data || []) {
        const kind = bookingKindFrom(String(row.notes || ""), row.booking_mode || null);
        if (!kind) continue;
        const at = new Date(String(row.created_at || "")).getTime();
        if (!Number.isFinite(at)) continue;
        const hit = { at, kind, notes: String(row.notes || "") };
        const em = String(row.parent_email || "").trim().toLowerCase();
        if (em && want.has(em)) {
          const list = byEmail.get(em) || [];
          list.push(hit);
          byEmail.set(em, list);
        }
        const nk = nameKey(row.parent_name);
        if (nk) {
          const list = byName.get(nk) || [];
          list.push(hit);
          byName.set(nk, list);
        }
      }
    }
  }

  return leads.map((lead) => {
    const em = String(lead.email || "").trim().toLowerCase();
    const rows = (byEmail.get(em) || byName.get(nameKey(lead.parent_name)) || [])
      .slice()
      .sort((a, b) => a.at - b.at);
    const visitAt = new Date(String(lead.last_activity_at || lead.created_at || "")).getTime();
    const windowMs = 48 * 60 * 60 * 1000;
    const inVisit = (at: number) =>
      Number.isFinite(visitAt) && at >= visitAt - windowMs && at <= visitAt + 6 * 60 * 60 * 1000;
    const latestVisit = rows.filter((r) => inVisit(r.at)).pop();
    const prior = rows.filter((r) => !inVisit(r.at));
    const book = String(lead.booking_status || "").toLowerCase();
    const client = String(lead.client_status || "").toLowerCase();
    const source = String(lead.source || "").toLowerCase();
    const parentPortal = source.includes("parent portal") && lead.asked_otp !== true;

    let visit_outcome: "looked" | "waiting" | "trial" | "term" = "looked";
    if (latestVisit?.kind === "trial") visit_outcome = "trial";
    else if (latestVisit?.kind === "term") visit_outcome = "term";
    else if (book === "waiting_list" || client === "waiting_list") visit_outcome = "waiting";

    const priorTrial = prior.some((r) => r.kind === "trial");
    const priorPlace = prior.some((r) => r.kind === "term" && /ops_synced|booking_paid/i.test(r.notes));
    const formAt = new Date(String(lead.form_submitted_at || "")).getTime();
    const formBefore = Number.isFinite(formAt) && Number.isFinite(visitAt) && formAt < visitAt - windowMs;

    let person_type: "new" | "registered" | "active" = "new";
    let person_bucket = "";
    if (priorPlace) {
      person_type = "active";
    } else if (priorTrial) {
      person_type = "registered";
      person_bucket = "TRIAL";
    } else if ((book === "waiting_list" || client === "waiting_list") && (formBefore || prior.length)) {
      person_type = "registered";
      person_bucket = "WAITING LIST";
    } else if (formBefore) {
      person_type = "registered";
      person_bucket = "REGISTERED";
    } else if (client === "active_client" && visit_outcome === "looked") {
      person_type = "active";
    } else if (parentPortal && visit_outcome === "looked") {
      person_type = "active";
    }

    return { ...lead, visit_outcome, person_type, person_bucket };
  });
}

function isEmailInterestImport(row: {
  source?: unknown;
  privacy_notice_version?: unknown;
  first_page_visited?: unknown;
}): boolean {
  const src = String(row.source || "").toLowerCase();
  const priv = String(row.privacy_notice_version || "").toLowerCase();
  const page = String(row.first_page_visited || "").toLowerCase();
  return (
    src.includes("email interest") ||
    priv.includes("email-interest-import") ||
    page.includes("email interest")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: {
    client_status?: string;
    booking_status?: string;
    track_status?: string;
    origin?: string;
    q?: string;
    limit?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const clientStatus = String(body.client_status || "").trim().toLowerCase();
  const bookingStatus = String(body.booking_status || "").trim().toLowerCase();
  const trackStatus = String(body.track_status || "").trim().toLowerCase();
  const origin = String(body.origin || "portal").trim().toLowerCase();
  const q = String(body.q || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit) || 150, 1), 400);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Global truth counts (not limited to the current page). */
  const [
    { count: portalVisitorsTotal },
    { count: leadsAll },
    { count: emailInterestImported },
    { count: portalOtpVerified },
  ] = await Promise.all([
    admin
      .from("portal_booking_service_sessions")
      .select("id", { count: "exact", head: true }),
    admin.from("portal_booking_leads").select("id", { count: "exact", head: true }),
    admin
      .from("portal_booking_leads")
      .select("id", { count: "exact", head: true })
      .ilike("source", "%Email Interest%"),
    admin
      .from("portal_booking_leads")
      .select("id", { count: "exact", head: true })
      .not("email_verified_at", "is", null)
      .not("source", "ilike", "%Email Interest%"),
  ]);

  const emailImportN = emailInterestImported || 0;
  const allLeadsN = leadsAll || 0;
  const portalContactRows = Math.max(0, allLeadsN - emailImportN);

  let query = admin
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, source, first_page_visited, privacy_notice_version, services_viewed, booking_status, registration_status, client_status, marketing_consent, enquiry_notes, activity_interest, track_status, outreach_joined_at, email_verified_at, last_activity_at, created_at, updated_at",
    )
    .order("last_activity_at", { ascending: false })
    .limit(Math.min(limit * 3, 800));

  if (clientStatus && clientStatus !== "all") {
    query = query.eq("client_status", clientStatus);
  }
  if (bookingStatus && bookingStatus !== "all") {
    query = query.eq("booking_status", bookingStatus);
  }
  if (trackStatus === "outreach") {
    query = query.not("outreach_joined_at", "is", null);
  } else if (trackStatus && trackStatus !== "all") {
    query = query.eq("track_status", trackStatus);
  }
  if (origin === "email_interest") {
    query = query.or(
      "source.ilike.%Email Interest%,source.ilike.%Office potential%,outreach_joined_at.not.is.null",
    );
  } else if (origin === "portal") {
    query = query
      .not("source", "ilike", "%Email Interest%")
      .not("source", "ilike", "%Office potential%");
  } else if (origin === "potential") {
    query = query.ilike("source", "%Office potential%");
  } else if (origin === "outreach") {
    query = query.not("outreach_joined_at", "is", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-booking-leads-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  let leads = (data || []).map((row) => ({
    ...row,
    origin: isEmailInterestImport(row) ? "email_interest" : "portal",
  }));

  if (q) {
    leads = leads.filter((row) => {
      const blob = [
        row.parent_name,
        row.email,
        row.mobile,
        row.source,
        row.booking_status,
        row.client_status,
        row.track_status,
        row.enquiry_notes,
        row.activity_interest,
        row.origin,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return blob.includes(q);
    });
  }

  leads = leads.slice(0, limit);

  /* Attach newest registration PDF/photo per parent email (Participant documents). */
  const emails = [
    ...new Set(
      leads
        .map((r) => String(r.email || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  /** @type {Record<string, { pdf_signed_url: string | null, photo_signed_url: string | null, participant_name: string | null, submitted_at: string | null, form_type: string | null }>} */
  const docsByEmail = {};
  if (emails.length) {
    const { data: docs, error: docsErr } = await admin
      .from("portal_participant_documents")
      .select(
        "parent_email, participant_name, form_type, pdf_storage_path, photo_storage_path, submitted_at",
      )
      .order("submitted_at", { ascending: false })
      .limit(400);
    if (docsErr) {
      console.warn("[portal-admin-booking-leads-list] docs", docsErr.message);
    } else {
      const emailSet = new Set(emails);
      for (const doc of docs || []) {
        const em = String(doc.parent_email || "").trim().toLowerCase();
        if (!em || !emailSet.has(em) || docsByEmail[em]) continue;
        let pdfSigned = null;
        let photoSigned = null;
        if (doc.pdf_storage_path) {
          const { data: pdfUrl } = await admin.storage
            .from("participant-documents")
            .createSignedUrl(doc.pdf_storage_path, 3600);
          pdfSigned = pdfUrl?.signedUrl ?? null;
        }
        if (doc.photo_storage_path) {
          const { data: photoUrl } = await admin.storage
            .from("participant-documents")
            .createSignedUrl(doc.photo_storage_path, 3600);
          photoSigned = photoUrl?.signedUrl ?? null;
        }
        docsByEmail[em] = {
          pdf_signed_url: pdfSigned,
          photo_signed_url: photoSigned,
          participant_name: doc.participant_name || null,
          submitted_at: doc.submitted_at || null,
          form_type: doc.form_type || null,
        };
      }
    }
  }

  const leadIds = leads.map((r) => String(r.id || "")).filter(Boolean);
  const askedOtp = new Set<string>();
  if (leadIds.length) {
    const { data: otps, error: otpErr } = await admin
      .from("portal_booking_lead_otps")
      .select("lead_id")
      .in("lead_id", leadIds);
    if (otpErr) {
      console.warn("[portal-admin-booking-leads-list] otps", otpErr.message);
    } else {
      for (const otp of otps || []) {
        const id = String(otp.lead_id || "");
        if (id) askedOtp.add(id);
      }
    }
  }

  leads = leads.map((row) => {
    const em = String(row.email || "").trim().toLowerCase();
    const doc = em ? docsByEmail[em] : null;
    return {
      ...row,
      asked_otp: askedOtp.has(String(row.id || "")),
      form_pdf_url: doc?.pdf_signed_url || null,
      form_photo_url: doc?.photo_signed_url || null,
      form_participant_name: doc?.participant_name || null,
      form_submitted_at: doc?.submitted_at || null,
      form_type: doc?.form_type || null,
    };
  });

  leads = await attachLeadVisit(admin, leads);

  const since24 = Date.now() - 24 * 60 * 60 * 1000;
  const new24h = leads.filter((r) => {
    const t = new Date(String(r.created_at || "")).getTime();
    return Number.isFinite(t) && t >= since24;
  }).length;
  const verifiedN = leads.filter((r) => !!r.email_verified_at).length;
  const prospective = leads.filter((r) => r.client_status === "prospective").length;
  const regStarted = leads.filter(
    (r) =>
      r.registration_status === "started" ||
      r.registration_status === "submitted",
  ).length;

  return portalAdminJson(200, {
    ok: true,
    leads,
    meta: {
      total: leads.length,
      new_24h: new24h,
      verified: verifiedN,
      prospective,
      registration_started: regStarted,
      /* Global clarification (ignore current filter/page). */
      portal_visitors_total: portalVisitorsTotal || 0,
      portal_otp_contacts: portalContactRows,
      portal_otp_verified: portalOtpVerified || 0,
      email_interest_imported: emailImportN,
      leads_all_rows: allLeadsN,
      origin_filter: origin || "portal",
    },
  });
});
