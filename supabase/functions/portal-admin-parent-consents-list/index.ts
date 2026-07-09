// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-consents-list
// Admin: photo marketing + medication + emergency consents per participant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

type ConsentRow = {
  contact_id: string;
  photo_consent: string;
  photo_consent_signed_at: string | null;
  photo_consent_signed_by_name: string;
  medication_at_centre_needed: string;
  medication_at_centre_details: string;
  medication_at_centre_signed_at: string | null;
  medication_at_centre_signed_by_name: string;
  emergency_treatment_consent?: string;
  emergency_treatment_signed_at?: string | null;
  emergency_treatment_signed_by_name?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  updated_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
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

  let body: { filter?: string; q?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const filter = clean(body.filter, 40).toLowerCase() || "pending";
  const q = clean(body.q, 120).toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit) || 300, 1), 500);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: participants, error: pErr } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, parent_person_id, in_class")
    .order("display_name", { ascending: true })
    .limit(limit);

  if (pErr) {
    console.error("[portal-admin-parent-consents-list] participants", pErr.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  const { data: consentRows, error: cErr } = await admin
    .from("portal_participant_parent_consents")
    .select(
      "contact_id, photo_consent, photo_consent_signed_at, photo_consent_signed_by_name, medication_at_centre_needed, medication_at_centre_details, medication_at_centre_signed_at, medication_at_centre_signed_by_name, emergency_treatment_consent, emergency_treatment_signed_at, emergency_treatment_signed_by_name, emergency_contact_name, emergency_contact_phone, updated_at",
    );

  if (cErr) {
    console.error("[portal-admin-parent-consents-list] consents", cErr.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  const byContact = new Map<string, ConsentRow>();
  for (const row of consentRows || []) {
    byContact.set(String(row.contact_id), row as ConsentRow);
  }

  const parentIds = Array.from(
    new Set(
      (participants || [])
        .map((p) => clean(p.parent_person_id, 120))
        .filter(Boolean),
    ),
  );

  const parentNameById = new Map<string, string>();
  if (parentIds.length) {
    const { data: parents } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id, parent_display, parent_first_name, parent_last_name")
      .in("parent_person_id", parentIds.slice(0, 400));
    for (const p of parents || []) {
      const id = clean(p.parent_person_id, 120);
      if (!id || parentNameById.has(id)) continue;
      const name =
        clean(p.parent_display, 120) ||
        [clean(p.parent_first_name, 60), clean(p.parent_last_name, 60)].filter(Boolean).join(" ");
      if (name) parentNameById.set(id, name);
    }
  }

  let photoPending = 0;
  let photoYes = 0;
  let photoNo = 0;
  let medPending = 0;
  let medYes = 0;
  let medNo = 0;
  let emergencyPending = 0;
  let emergencyYes = 0;
  let emergencyNo = 0;

  const entries = (participants || []).map((p) => {
    const contactId = clean(p.contact_id, 120);
    const c = byContact.get(contactId);
    const photo = clean(c?.photo_consent, 40) || "unknown";
    const med = clean(c?.medication_at_centre_needed, 40) || "unknown";
    const emergency = clean(c?.emergency_treatment_consent, 40) || "unknown";
    const emergencyName = clean(c?.emergency_contact_name, 120);
    const emergencyPhone = clean(c?.emergency_contact_phone, 40);
    const photoDone = photo !== "unknown" && !!c?.photo_consent_signed_at;
    const medDone = med !== "unknown" && !!c?.medication_at_centre_signed_at;
    const emergencyDone =
      emergency !== "unknown" &&
      !!c?.emergency_treatment_signed_at &&
      !!emergencyName &&
      !!emergencyPhone;

    if (!photoDone) photoPending += 1;
    else if (photo === "yes") photoYes += 1;
    else photoNo += 1;

    if (!medDone) medPending += 1;
    else if (med === "yes") medYes += 1;
    else medNo += 1;

    if (!emergencyDone) emergencyPending += 1;
    else if (emergency === "yes") emergencyYes += 1;
    else emergencyNo += 1;

    const display =
      clean(p.display_name, 120) ||
      [clean(p.first_name, 60), clean(p.last_name, 60)].filter(Boolean).join(" ") ||
      contactId;

    return {
      contact_id: contactId,
      participant_display: display,
      parent_person_id: clean(p.parent_person_id, 120),
      parent_display: parentNameById.get(clean(p.parent_person_id, 120)) || "",
      in_class: p.in_class == null ? null : !!p.in_class,
      photo_consent: photo === "internal_only" ? "no" : photo,
      photo_consent_signed_at: c?.photo_consent_signed_at || null,
      photo_consent_signed_by_name: clean(c?.photo_consent_signed_by_name, 120),
      photo_done: photoDone,
      medication_at_centre_needed: med,
      medication_at_centre_details: clean(c?.medication_at_centre_details, 2000),
      medication_at_centre_signed_at: c?.medication_at_centre_signed_at || null,
      medication_at_centre_signed_by_name: clean(c?.medication_at_centre_signed_by_name, 120),
      medication_done: medDone,
      emergency_treatment_consent: emergency,
      emergency_treatment_signed_at: c?.emergency_treatment_signed_at || null,
      emergency_treatment_signed_by_name: clean(c?.emergency_treatment_signed_by_name, 120),
      emergency_contact_name: emergencyName,
      emergency_contact_phone: emergencyPhone,
      emergency_done: emergencyDone,
      pending_count: (photoDone ? 0 : 1) + (medDone ? 0 : 1) + (emergencyDone ? 0 : 1),
      updated_at: c?.updated_at || null,
    };
  });

  let filtered = entries;
  if (filter === "pending") {
    filtered = entries.filter((e) => e.pending_count > 0);
  } else if (filter === "photo_yes") {
    filtered = entries.filter((e) => e.photo_done && e.photo_consent === "yes");
  } else if (filter === "photo_no") {
    filtered = entries.filter((e) => e.photo_done && e.photo_consent === "no");
  } else if (filter === "med_yes") {
    filtered = entries.filter((e) => e.medication_done && e.medication_at_centre_needed === "yes");
  } else if (filter === "emergency_pending") {
    filtered = entries.filter((e) => !e.emergency_done);
  } else if (filter === "complete") {
    filtered = entries.filter((e) => e.pending_count === 0);
  }

  if (q) {
    filtered = filtered.filter((e) => {
      const hay = (
        e.participant_display +
        " " +
        e.parent_display +
        " " +
        e.contact_id +
        " " +
        e.photo_consent_signed_by_name +
        " " +
        e.medication_at_centre_signed_by_name +
        " " +
        e.emergency_contact_name +
        " " +
        e.emergency_contact_phone
      ).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  filtered.sort((a, b) => {
    if (b.pending_count !== a.pending_count) return b.pending_count - a.pending_count;
    return String(a.participant_display).localeCompare(String(b.participant_display));
  });

  return portalAdminJson(200, {
    ok: true,
    entries: filtered,
    meta: {
      total_participants: entries.length,
      photo_pending: photoPending,
      photo_yes: photoYes,
      photo_no: photoNo,
      medication_pending: medPending,
      medication_yes: medYes,
      medication_no: medNo,
      emergency_pending: emergencyPending,
      emergency_yes: emergencyYes,
      emergency_no: emergencyNo,
      filter,
    },
  });
});
