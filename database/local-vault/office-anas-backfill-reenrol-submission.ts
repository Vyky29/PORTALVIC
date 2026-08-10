/**
 * Office backfill - Anas Ismail (7560101) - Heba Aboueita (7560102)
 *
 * Inserts a portal_re_enrolment_submissions row matching INV-P-0340:
 * keep Tue Acton Aurora Aquatic 6-6.30 (30'). Does NOT create invoices.
 *
 * Dry run (default):
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-backfill-reenrol-submission.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-backfill-reenrol-submission.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SESSION_COUNTS } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

/** DB column check only allows link | parent_portal; office marker lives in payload.source */
const ROW_SOURCE = "link";
const PAYLOAD_SOURCE = "office_backfill";

const PARTICIPANT_CONTACT_ID = "7560101";
const PARENT_PERSON_ID = "7560102";
const PARTICIPANT_NAME = "Anas Ismail";
const PARENT_FIRST = "Heba";
const PARENT_LAST = "Aboueita";
/** Canonical academic_year value in portal_re_enrolment_submissions */
const ACADEMIC_YEAR = "2026-27";
const INVOICE_NUMBER = "INV-P-0340";

const OFFICE_NOTE =
  "Office backfill 10 Aug 2026 - Heba/Anas: keep Tue Acton Aurora Aquatic 6-6.30 (matches INV-P-0340). No new invoice created.";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const sessions = { ...SESSION_COUNTS.weekday }; // autumn 14 / spring 11 / summer 13 / annual 38
const pricePerSession = 50;
const termTotals = {
  autumn: sessions.autumn * pricePerSession,
  spring: sessions.spring * pricePerSession,
  summer: sessions.summer * pricePerSession,
  annual: sessions.annual * pricePerSession,
};

const weeklySlot = {
  id: "pub-0",
  raw: "30' AQUATIC ACTIVITY (Tuesday)",
  serviceType: "AQUATIC ACTIVITY",
  durationMin: 30,
  day: "Tuesday",
  venue: "Acton",
  instructor: "AURORA",
  isWeekend: false,
  isDayCentre: false,
  pricePerSession,
  timeSlot: "6 to 6.30",
  sessions,
  termTotals,
  displayLabel: "30' Aquatic Activity - 6 to 6.30 pm, Tuesdays (Acton - Aurora)",
};

const payload = {
  source: PAYLOAD_SOURCE,
  not_continuing: false,
  office_note: OFFICE_NOTE,
  linked_invoice_number: INVOICE_NUMBER,
  choices: {
    weekly: {
      "pub-0": { choice: "keep", alternative: null },
    },
    day_centre: null,
    enrolment_cadence: "term_by_term",
    enrolment_cadence_label: "Term by term - confirm Autumn 26/27 now",
  },
  weekly_slots_snapshot: [weeklySlot],
  term_totals: termTotals,
  funding: {
    choices_2627: {
      billing_mode: "private",
      funding_code: "privately_funded",
      funding_label: "Privately",
      auto_continue: false,
      admin_fee_total: 0,
      admin_fee_reason: null,
      billing_schedule: "term_flexi",
      admin_fee_applies: false,
      enrolment_cadence: "term_by_term",
      invoice_type_code: "vat_included",
      invoice_type_label: "Includes 20% VAT (in price)",
      advance_buffer_gbp: null,
      auto_continue_note:
        "We will ask you to confirm before each term. Invoices are created for the current term only.",
      payment_method_code: "bank_transfer",
      payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
      payment_schedule_code: "term_flexi",
      payment_schedule_label: "Flexi term - 2 payments per term",
      estimated_annual_total: termTotals.annual,
      enrolment_cadence_label: "Term by term - confirm before each term",
      estimated_total_with_admin_fee: null,
      advance_buffer_note: null,
      advance_buffer_lines: null,
      advance_buffer_sessions_per_service: null,
    },
    current_2526: {
      funding: "Privately",
      invoice_type: "Parent (20% included invoice)",
      payment_method: "Bank Transfer / Card / Apple Pay",
      invoice_type_code: "vat_20",
    },
  },
  declarations: {
    accurate: true,
    terms: true,
    office_proxy: true,
  },
};

const row = {
  academic_year: ACADEMIC_YEAR,
  participant_contact_id: PARTICIPANT_CONTACT_ID,
  participant_name: PARTICIPANT_NAME,
  parent_first_name: PARENT_FIRST,
  parent_last_name: PARENT_LAST,
  parent_person_id: PARENT_PERSON_ID,
  source: ROW_SOURCE,
  payload,
};

console.log("=== Anas Ismail re-enrol backfill (submission only) ===");
console.log(JSON.stringify({
  APPLY,
  academic_year_label: "2026/27",
  academic_year_db: ACADEMIC_YEAR,
  row_source: ROW_SOURCE,
  payload_source: PAYLOAD_SOURCE,
  participant_contact_id: PARTICIPANT_CONTACT_ID,
  parent_person_id: PARENT_PERSON_ID,
  participant_name: PARTICIPANT_NAME,
  parent: `${PARENT_FIRST} ${PARENT_LAST}`,
  linked_invoice: INVOICE_NUMBER,
  create_invoices: false,
  keep_slot: {
    day: weeklySlot.day,
    venue: weeklySlot.venue,
    instructor: weeklySlot.instructor,
    timeSlot: weeklySlot.timeSlot,
    serviceType: weeklySlot.serviceType,
    durationMin: weeklySlot.durationMin,
    choice: "keep",
  },
  choices_weekly: payload.choices.weekly,
  weekly_slots_snapshot: payload.weekly_slots_snapshot,
  not_continuing: payload.not_continuing,
  term_totals: payload.term_totals,
}, null, 2));

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, amount_gbp, payment_status, share_status, line_items, line_description")
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", PARTICIPANT_CONTACT_ID)
  .maybeSingle();
if (invErr) throw new Error(`invoice lookup: ${invErr.message}`);
console.log("\nINV-P-0340 check:", JSON.stringify({
  found: !!inv,
  amount_gbp: inv?.amount_gbp,
  payment_status: inv?.payment_status,
  share_status: inv?.share_status,
  line_items: inv?.line_items,
}, null, 2));

const { data: existing, error: exErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, submitted_at, source, academic_year")
  .eq("participant_contact_id", PARTICIPANT_CONTACT_ID)
  .eq("academic_year", ACADEMIC_YEAR);
if (exErr) throw new Error(`existing subs: ${exErr.message}`);
console.log("\nExisting submissions:", JSON.stringify(existing || [], null, 2));

if (!APPLY) {
  console.log("\nDry run only. Would INSERT portal_re_enrolment_submissions with row above.");
  console.log("Re-run with APPLY=1 to insert. No invoices will be created.");
  Deno.exit(0);
}

if (existing?.length) {
  const id = existing[0].id;
  const { data: updated, error } = await admin
    .from("portal_re_enrolment_submissions")
    .update({
      participant_name: PARTICIPANT_NAME,
      parent_first_name: PARENT_FIRST,
      parent_last_name: PARENT_LAST,
      parent_person_id: PARENT_PERSON_ID,
      payload,
    })
    .eq("id", id)
    .select("id, submitted_at")
    .single();
  if (error || !updated) throw new Error(`update: ${error?.message}`);
  console.log("\nUPDATED existing submission id:", updated.id, "submitted_at:", updated.submitted_at);
  Deno.exit(0);
}

const { data: inserted, error: insErr } = await admin
  .from("portal_re_enrolment_submissions")
  .insert(row)
  .select("id, submitted_at, academic_year, source, participant_contact_id, parent_person_id")
  .single();
if (insErr || !inserted) throw new Error(`insert: ${insErr?.message}`);
console.log("\nINSERTED submission:", JSON.stringify(inserted, null, 2));
console.log("submission_id:", inserted.id);
