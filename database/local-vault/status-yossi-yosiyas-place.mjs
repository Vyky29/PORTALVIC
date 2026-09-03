/**
 * Status: Yosiyas vs Yossi registration Place + contacts/reservations/invoices.
 *   node database/local-vault/status-yossi-yosiyas-place.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  process.env.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: docs, error: dErr } = await admin
  .from("portal_participant_documents")
  .select(
    "id, submitted_at, form_type, participant_name, parent_name, parent_email, status, payload_json",
  )
  .or("participant_name.ilike.%yossi%,participant_name.ilike.%yosiyas%,participant_name.ilike.%sium%")
  .order("submitted_at", { ascending: false });
if (dErr) throw dErr;

const { data: contacts } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, parent_display, in_class, on_waiting_list, funding_label, payment_method_label, updated_at",
  )
  .or("child_display.ilike.%yossi%,child_display.ilike.%yosiyas%,child_display.ilike.%sium%");

const { data: parts } = await admin
  .from("portal_participants")
  .select("contact_id, display_name, in_class, on_waiting_list")
  .or("display_name.ilike.%yossi%,display_name.ilike.%yosiyas%,display_name.ilike.%sium%");

const { data: res } = await admin
  .from("portal_booking_slot_reservations")
  .select(
    "id, status, participant_name, parent_email, service_name, venue, day_label, time_label, notes, hold_expires_at, document_id, updated_at",
  )
  .or("participant_name.ilike.%yossi%,participant_name.ilike.%yosiyas%,participant_name.ilike.%sium%")
  .order("updated_at", { ascending: false });

const { data: invs, error: iErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, payment_status, amount_paid_gbp, booking_slot, booking_venue, notes, updated_at",
  )
  .or("notes.ilike.%yossi%,notes.ilike.%yosiyas%,notes.ilike.%sium%")
  .order("updated_at", { ascending: false })
  .limit(20);
if (iErr) console.warn("invs", iErr.message);

const contactIds = [...new Set((contacts || []).map((c) => c.contact_id))];
let invsByContact = [];
if (contactIds.length) {
  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, contact_id, amount_gbp, payment_status, amount_paid_gbp, booking_slot, booking_venue, notes, updated_at",
    )
    .in("contact_id", contactIds)
    .order("updated_at", { ascending: false });
  if (error) console.warn("invsByContact", error.message);
  else invsByContact = data || [];
}

console.log(
  JSON.stringify(
    {
      docs: (docs || []).map((d) => ({
        id: d.id,
        submitted_at: d.submitted_at,
        form_type: d.form_type,
        participant_name: d.participant_name,
        parent_name: d.parent_name,
        parent_email: d.parent_email,
        status: d.status,
        office_place: d.payload_json?.office_place || null,
        nhs_referral: d.payload_json?.nhs_referral || null,
      })),
      contacts,
      parts,
      res,
      invs,
      invsByContact,
    },
    null,
    2,
  ),
);
