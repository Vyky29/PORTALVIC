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
  booking_status: string | null;
  client_status: string | null;
  in_class: boolean | null;
  on_waiting_list: boolean | null;
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

/** Formal place | Waiting list | Registered only — office triage for Registration forms. */
function derivePlace(row: {
  payload_json: Record<string, unknown> | null;
  booking_status: string | null;
  client_status: string | null;
  in_class: boolean | null;
  on_waiting_list: boolean | null;
}): { kind: string; label: string; tone: string } {
  const payload = asRecord(row.payload_json) || {};
  const br = asRecord(payload.booking_request);
  const bookingStatus = String(row.booking_status || "").toLowerCase();
  const clientStatus = String(row.client_status || "").toLowerCase();

  const waitFromPayload =
    truthyFlag(payload.waiting_list) ||
    truthyFlag(payload.on_waiting_list) ||
    truthyFlag(br?.waiting_list) ||
    truthyFlag(br?.join_waiting_list) ||
    String(br?.mode || "").toLowerCase() === "waiting_list" ||
    String(br?.booking_mode || "").toLowerCase() === "waiting_list";

  if (row.on_waiting_list === true || bookingStatus === "waiting_list" || waitFromPayload) {
    return { kind: "waiting_list", label: "Waiting list", tone: "info" };
  }

  if (row.in_class === true || bookingStatus === "booking_completed") {
    return { kind: "formal", label: "Formal place", tone: "ok" };
  }

  const hasSlot =
    !!br &&
    !!(
      br.slot_id ||
      br.service_name ||
      br.service ||
      br.service_id ||
      br.venue ||
      br.day ||
      br.time
    );

  if (hasSlot || payload.existing_client_confirm === true) {
    return { kind: "formal", label: "Formal place", tone: "ok" };
  }

  if (
    clientStatus === "registered" ||
    bookingStatus === "registration_submitted" ||
    bookingStatus === "registration_started" ||
    bookingStatus === "exploring_services" ||
    bookingStatus === "new_lead"
  ) {
    return { kind: "registered_only", label: "Registered only", tone: "pend" };
  }

  return { kind: "registered_only", label: "Registered only", tone: "pend" };
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
    { in_class: boolean | null; on_waiting_list: boolean | null }
  >();
  if (childNames.length) {
    const { data: contacts } = await admin
      .from("portal_parent_contacts")
      .select("child_display, in_class, on_waiting_list")
      .limit(5000);
    for (const c of contacts || []) {
      const key = normalizeName(String(c.child_display || ""));
      if (!key) continue;
      if (!childNames.some((n) => n === key || key.includes(n) || n.includes(key))) continue;
      contactByChild.set(key, {
        in_class: c.in_class === true ? true : c.in_class === false ? false : null,
        on_waiting_list: c.on_waiting_list === true ? true : c.on_waiting_list === false ? false : null,
      });
    }
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
        if (k.includes(childKey) || childKey.includes(k)) {
          contact = v;
          break;
        }
      }
    }

    const place = derivePlace({
      payload_json: (row.payload_json || {}) as Record<string, unknown>,
      booking_status: lead?.booking_status ?? null,
      client_status: lead?.client_status ?? null,
      in_class: contact?.in_class ?? null,
      on_waiting_list: contact?.on_waiting_list ?? null,
    });

    out.push({
      ...row,
      pdf_signed_url: pdfSigned,
      photo_signed_url: photoSigned,
      place_kind: place.kind,
      place_label: place.label,
      place_tone: place.tone,
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
