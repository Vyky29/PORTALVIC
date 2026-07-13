// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-contact-update
// Update carer / contact / address / registration / funding labels on portal_parent_contacts.
// Also: { action: "directory" } → lightweight contact phone directory for Family Messages.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function parseUkDateToIso(v: unknown): string | null {
  const s = clean(v, 20);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function splitParentName(display: string): { first: string; last: string } {
  const parts = clean(display, 200).split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Prefer E.164 (+447…) when parseable; otherwise keep cleaned raw. */
function normalizeMobileForStore(raw: unknown): string | null {
  const cleaned = clean(raw, 40);
  if (!cleaned) return null;
  return normalizeParentPhoneE164(cleaned) || cleaned;
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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = clean(body.action, 40).toLowerCase();
  if (action === "directory") {
    const { data, error } = await admin
      .from("portal_parent_contacts")
      .select("contact_id, child_display, parent_display, mobile")
      .limit(5000);
    if (error) {
      console.error("[portal-admin-parent-contact-update] directory", error.message);
      return portalAdminJson(500, { ok: false, error: "directory_failed" });
    }
    const contacts = (data || []).map((row) => ({
      contact_id: String(row.contact_id || "").trim(),
      child_display: String(row.child_display || "").trim(),
      parent_display: String(row.parent_display || "").trim(),
      mobile: String(row.mobile || "").trim(),
    })).filter((row) => row.contact_id || row.child_display);
    return portalAdminJson(200, { ok: true, contacts });
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) {
    return portalAdminJson(400, { ok: false, error: "contact_id_required" });
  }

  const parentDisplay = clean(body.parent_display, 200);
  if (!parentDisplay) {
    return portalAdminJson(400, { ok: false, error: "carer_required" });
  }
  const names = splitParentName(parentDisplay);
  const registrationIso = parseUkDateToIso(body.registration_date);
  if (clean(body.registration_date, 20) && !registrationIso) {
    return portalAdminJson(400, { ok: false, error: "registration_date_invalid" });
  }

  const patch: Record<string, unknown> = {
    parent_display: parentDisplay,
    parent_first_name: names.first || null,
    parent_last_name: names.last || null,
    mobile: normalizeMobileForStore(body.mobile),
    email: clean(body.email, 200) || null,
    address_line1: clean(body.address_line1, 200) || null,
    address_line2: clean(body.address_line2, 200) || null,
    city: clean(body.city, 120) || null,
    postcode: clean(body.postcode, 40) || null,
    funding_label: clean(body.funding_label, 200) || null,
    payment_method_label: clean(body.payment_method_label, 200) || null,
    updated_at: new Date().toISOString(),
  };
  if (registrationIso) patch.registration_date = registrationIso;
  else if (body.clear_registration_date === true) patch.registration_date = null;

  const { data: existing, error: loadErr } = await admin
    .from("portal_parent_contacts")
    .select("id,contact_id,mobile")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (loadErr) {
    console.error("[portal-admin-parent-contact-update] load", loadErr.message);
    return portalAdminJson(500, { ok: false, error: "load_failed" });
  }
  if (!existing) {
    return portalAdminJson(404, { ok: false, error: "contact_not_found" });
  }

  const { data: updated, error: upErr } = await admin
    .from("portal_parent_contacts")
    .update(patch)
    .eq("contact_id", contactId)
    .select(
      "contact_id,parent_display,parent_first_name,parent_last_name,email,mobile,address_line1,address_line2,city,postcode,registration_date,funding_label,payment_method_label,updated_at,child_display",
    )
    .maybeSingle();
  if (upErr) {
    console.error("[portal-admin-parent-contact-update] update", upErr.message);
    return portalAdminJson(500, { ok: false, error: "update_failed", message: upErr.message });
  }

  return portalAdminJson(200, {
    ok: true,
    contact: updated,
    previous_mobile: existing.mobile || null,
  });
});
