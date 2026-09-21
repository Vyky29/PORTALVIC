/**
 * Keep Yossi (contact 230). Rename registration form Yosiyas → Yossi so Place
 * matches validated reservation + in_class. Soft-retire dup contact 401 name
 * so it no longer steals Place matching.
 *
 * Dry:  node database/local-vault/office-yossi-keep-one-place.mjs
 * Apply: APPLY=1 node database/local-vault/office-yossi-keep-one-place.mjs
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

const APPLY = process.env.APPLY === "1";
const DOC_ID = "54dcbd92-6914-406c-b9b9-e4ef5cbb7091";
const KEEP = "230";
const DUP = "401";
const RES_ID = "897e5812-5d77-4e58-91a9-a5fd98ac698b";
const NOTE = "Office 2026-09-03: keep Yossi only; rename Yosiyas registration → Yossi for Place.";

const admin = createClient(
  process.env.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const now = new Date().toISOString();
const log = [];

const { data: doc, error: docErr } = await admin
  .from("portal_participant_documents")
  .select("id, participant_name, parent_name, parent_email, payload_json, status")
  .eq("id", DOC_ID)
  .maybeSingle();
if (docErr || !doc) throw new Error(docErr?.message || "doc missing");

log.push(`doc ${DOC_ID}: ${doc.participant_name} → Yossi Sium`);

const payload =
  doc.payload_json && typeof doc.payload_json === "object" && !Array.isArray(doc.payload_json)
    ? { ...doc.payload_json }
    : {};
payload.participant_name = "Yossi Sium";
payload.office_place = "in_class";
payload.aka_yosiyas = true;
payload.merged_note = NOTE;

if (APPLY) {
  const { error } = await admin
    .from("portal_participant_documents")
    .update({
      participant_name: "Yossi Sium",
      payload_json: payload,
    })
    .eq("id", DOC_ID);
  if (error) throw new Error(`doc update: ${error.message}`);
}

const { data: res } = await admin
  .from("portal_booking_slot_reservations")
  .select("id, status, participant_name, notes, document_id")
  .eq("id", RES_ID)
  .maybeSingle();
log.push(
  `reservation ${RES_ID}: ${res?.participant_name} status=${res?.status} doc=${res?.document_id}`,
);
if (APPLY && res) {
  const notes = [String(res.notes || "").trim(), NOTE].filter(Boolean).join("|").slice(0, 500);
  const { error } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      participant_name: "Yossi Sium",
      document_id: DOC_ID,
      notes,
      updated_at: now,
    })
    .eq("id", RES_ID);
  if (error) throw new Error(`res update: ${error.message}`);
}

const { data: c230 } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, in_class")
  .eq("contact_id", KEEP)
  .maybeSingle();
const { data: c401 } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, in_class")
  .eq("contact_id", DUP)
  .maybeSingle();
log.push(`keep ${KEEP} ${c230?.child_display} in_class=${c230?.in_class}`);
log.push(`dup ${DUP} ${c401?.child_display} in_class=${c401?.in_class}`);

if (APPLY && c230) {
  const { error } = await admin
    .from("portal_parent_contacts")
    .update({
      child_display: "Yossi Sium",
      in_class: true,
      on_waiting_list: false,
      updated_at: now,
    })
    .eq("contact_id", KEEP);
  if (error) throw new Error(`contact 230: ${error.message}`);
}
if (APPLY && c401) {
  const { error } = await admin
    .from("portal_parent_contacts")
    .update({
      child_display: "ZZZ merged retired · was Yosiyas (→230 Yossi)",
      in_class: false,
      on_waiting_list: false,
      updated_at: now,
    })
    .eq("contact_id", DUP);
  if (error) throw new Error(`contact 401: ${error.message}`);
}

if (APPLY) {
  await admin
    .from("portal_participants")
    .update({
      display_name: "Yossi Sium",
      in_class: true,
      on_waiting_list: false,
      updated_at: now,
    })
    .eq("contact_id", KEEP);
  await admin
    .from("portal_participants")
    .update({
      display_name: "ZZZ merged retired · was Yosiyas (→230 Yossi)",
      in_class: false,
      on_waiting_list: false,
      updated_at: now,
    })
    .eq("contact_id", DUP);
}

const { data: invs, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, payment_status, amount_gbp, amount_paid_gbp, notes")
  .or(`contact_id.eq.${KEEP},contact_id.eq.${DUP}`)
  .order("updated_at", { ascending: false })
  .limit(10);
if (invErr) log.push(`invs error: ${invErr.message}`);
else log.push(`invoices: ${JSON.stringify(invs || [])}`);

if (APPLY && invs?.length) {
  for (const inv of invs) {
    if (String(inv.contact_id) === DUP) {
      const notes = [String(inv.notes || "").trim(), NOTE].filter(Boolean).join(" · ").slice(0, 2000);
      const { error } = await admin
        .from("portal_parent_invoice_share")
        .update({ contact_id: KEEP, notes, updated_at: now })
        .eq("id", inv.id);
      if (error) log.push(`inv move fail ${inv.invoice_number}: ${error.message}`);
      else log.push(`invoice ${inv.invoice_number} ${DUP} → ${KEEP}`);
    }
  }
}

console.log(JSON.stringify({ APPLY, log }, null, 2));
