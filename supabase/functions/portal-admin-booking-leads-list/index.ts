// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-booking-leads-list
// Admin: Booking Portal OTP leads (name / email / phone / status).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

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
  const q = String(body.q || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit) || 150, 1), 400);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = admin
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, source, first_page_visited, services_viewed, booking_status, registration_status, client_status, marketing_consent, email_verified_at, last_activity_at, created_at, updated_at",
    )
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  if (clientStatus && clientStatus !== "all") {
    query = query.eq("client_status", clientStatus);
  }
  if (bookingStatus && bookingStatus !== "all") {
    query = query.eq("booking_status", bookingStatus);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-booking-leads-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  let leads = data || [];
  if (q) {
    leads = leads.filter((row) => {
      const blob = [
        row.parent_name,
        row.email,
        row.mobile,
        row.source,
        row.booking_status,
        row.client_status,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return blob.includes(q);
    });
  }

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

  leads = leads.map((row) => {
    const em = String(row.email || "").trim().toLowerCase();
    const doc = em ? docsByEmail[em] : null;
    return {
      ...row,
      form_pdf_url: doc?.pdf_signed_url || null,
      form_photo_url: doc?.photo_signed_url || null,
      form_participant_name: doc?.participant_name || null,
      form_submitted_at: doc?.submitted_at || null,
      form_type: doc?.form_type || null,
    };
  });

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
    },
  });
});
