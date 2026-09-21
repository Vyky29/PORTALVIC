// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-contact-update
// Update carer / contact / address / registration / funding labels on portal_parent_contacts.
// Also: { action: "directory" } → lightweight contact phone directory for Family Messages.
// Also: { action: "create" } → new parent contact + portal_participants row.

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
      .select(
        "contact_id, parent_person_id, child_display, parent_display, mobile, in_class, on_waiting_list, funding_label",
      )
      .limit(8000);
    if (error) {
      console.error("[portal-admin-parent-contact-update] directory", error.message);
      return portalAdminJson(500, { ok: false, error: "directory_failed" });
    }
    // Keep every co-parent row (same child, different mobile) — do not collapse by contact_id.
    const contacts = (data || []).map((row) => ({
      contact_id: String(row.contact_id || "").trim(),
      parent_person_id: String(row.parent_person_id || "").trim(),
      child_display: String(row.child_display || "").trim(),
      parent_display: String(row.parent_display || "").trim(),
      mobile: String(row.mobile || "").trim(),
      in_class: row.in_class === true,
      on_waiting_list: row.on_waiting_list === true,
      funding_label: String(row.funding_label || "").trim(),
    })).filter((row) => row.contact_id || row.child_display || row.mobile);
    return portalAdminJson(200, { ok: true, contacts });
  }

  if (action === "create") {
    const childDisplay = clean(body.child_display, 200);
    const parentDisplay = clean(body.parent_display, 200);
    if (!childDisplay) {
      return portalAdminJson(400, { ok: false, error: "child_required" });
    }
    if (!parentDisplay) {
      return portalAdminJson(400, { ok: false, error: "carer_required" });
    }
    const mobileRaw = clean(body.mobile, 40);
    if (!mobileRaw) {
      return portalAdminJson(400, { ok: false, error: "mobile_required" });
    }
    const mobile = normalizeMobileForStore(mobileRaw);
    if (!mobile) {
      return portalAdminJson(400, { ok: false, error: "mobile_invalid" });
    }
    const dobIso = parseUkDateToIso(body.dob) || parseUkDateToIso(body.dob_iso);
    if (clean(body.dob, 20) || clean(body.dob_iso, 20)) {
      if (!dobIso) {
        return portalAdminJson(400, { ok: false, error: "dob_invalid" });
      }
    }
    const registrationIso =
      parseUkDateToIso(body.registration_date) || new Date().toISOString().slice(0, 10);
    const parentNames = splitParentName(parentDisplay);
    const childParts = childDisplay.split(/\s+/).filter(Boolean);
    const childFirst = childParts[0] || childDisplay;
    const childLast = childParts.length > 1 ? childParts.slice(1).join(" ") : "";
    const bookingStatus = clean(body.booking_status, 40).toLowerCase();
    const onWaitingList = bookingStatus === "waiting_list";
    const inClass = !onWaitingList;

    const { data: idRows, error: idErr } = await admin
      .from("portal_parent_contacts")
      .select("contact_id")
      .limit(8000);
    if (idErr) {
      console.error("[portal-admin-parent-contact-update] create ids", idErr.message);
      return portalAdminJson(500, { ok: false, error: "allocate_failed" });
    }
    let maxN = 396;
    for (const row of idRows || []) {
      const n = Number(String(row.contact_id || "").trim());
      if (Number.isFinite(n) && n > 0 && n < 10000 && n > maxN) maxN = n;
    }
    const contactId = String(maxN + 1);
    const parentPersonId = "portal-" + contactId;

    const { data: existingChild } = await admin
      .from("portal_participants")
      .select("contact_id, display_name")
      .ilike("display_name", childDisplay)
      .limit(1)
      .maybeSingle();
    if (existingChild?.contact_id) {
      return portalAdminJson(409, {
        ok: false,
        error: "child_exists",
        message: "A participant named " + childDisplay + " already exists (contact " +
          existingChild.contact_id + ").",
        existing_contact_id: existingChild.contact_id,
      });
    }

    const contactRow = {
      contact_id: contactId,
      parent_person_id: parentPersonId,
      child_display: childDisplay,
      child_first_name: childFirst || null,
      child_last_name: childLast || null,
      parent_display: parentDisplay,
      parent_first_name: parentNames.first || null,
      parent_last_name: parentNames.last || null,
      email: clean(body.email, 200) || null,
      mobile,
      address_line1: clean(body.address_line1, 200) || null,
      address_line2: clean(body.address_line2, 200) || null,
      city: clean(body.city, 120) || null,
      postcode: clean(body.postcode, 40) || null,
      dob_iso: dobIso,
      in_class: inClass,
      on_waiting_list: onWaitingList,
      registration_date: registrationIso,
      funding_label: clean(body.funding_label, 200) || null,
      payment_method_label: clean(body.payment_method_label, 200) || null,
      updated_at: new Date().toISOString(),
    };

    const { data: createdContact, error: insErr } = await admin
      .from("portal_parent_contacts")
      .insert(contactRow)
      .select(
        "contact_id,parent_person_id,parent_display,parent_first_name,parent_last_name,child_display,child_first_name,child_last_name,email,mobile,address_line1,address_line2,city,postcode,dob_iso,in_class,on_waiting_list,registration_date,funding_label,payment_method_label,updated_at",
      )
      .maybeSingle();
    if (insErr || !createdContact) {
      console.error("[portal-admin-parent-contact-update] create contact", insErr?.message);
      return portalAdminJson(500, {
        ok: false,
        error: "create_failed",
        message: insErr?.message || "insert_failed",
      });
    }

    const { error: paxErr } = await admin.from("portal_participants").upsert(
      {
        contact_id: contactId,
        display_name: childDisplay,
        first_name: childFirst || null,
        last_name: childLast || null,
        dob_iso: dobIso,
        parent_person_id: parentPersonId,
        in_class: inClass,
        on_waiting_list: onWaitingList,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" },
    );
    if (paxErr) {
      console.error("[portal-admin-parent-contact-update] create participant", paxErr.message);
      await admin.from("portal_parent_contacts").delete().eq("contact_id", contactId).eq(
        "parent_person_id",
        parentPersonId,
      );
      return portalAdminJson(500, {
        ok: false,
        error: "participant_create_failed",
        message: paxErr.message,
      });
    }

    return portalAdminJson(200, {
      ok: true,
      contact: createdContact,
      contact_id: contactId,
      parent_person_id: parentPersonId,
    });
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
