/**
 * Office backfill — Ahmad Bouz Alasal / Mhd Malaz Bouz Alasal
 *
 * Parent completed Client Registration on 3 Aug 2026 (phone PDF screenshot).
 * Server never received the upload (PDF downloaded before submit confirmed).
 * This inserts the registration document + soft slot hold + marks the lead submitted,
 * then notifies the office (same path as a live form submit).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-backfill-ahmad-malaz-registration.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-backfill-ahmad-malaz-registration.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { notifyOfficeRegistrationSubmitted } from "../../supabase/functions/_shared/portal_booking_lead_office_notify.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const BUCKET = "participant-documents";
const LEAD_ID = "80a37043-baf5-4acc-a7f8-879d5d7fe10e";

const PARENT = {
  name: "Ahmad Bouz Alasal",
  relationship: "Father",
  phone: "+447492250684",
  /** Lead email (OTP) — double s */
  email: "ahmedbozalassal@gmail.com",
  /** Email printed on parent phone PDF — single s */
  emailOnPdf: "ahmedbozalasal@gmail.com",
  address: "183 Townmead Road",
  postcode: "SW6 2JX",
};

const PARTICIPANT = {
  name: "Mhd Malaz Bouz Alasal",
  dob: "2003-04-11",
  dobDisplay: "11/04/2003",
  gender: "Male",
  school: "None",
};

const SLOT = {
  from: "bookingportal",
  slot_id: "live-aquatic-acton-wednesday-16-00-4-00-4-30",
  service_id: "aquatic-acton",
  service_name: "Aquatic Activity",
  venue: "Acton",
  day: "Wednesday",
  time: "4.00 – 4.30",
  activity: "Aquatic",
  booking_mode: null as string | null,
  week_id: null as string | null,
  block_id: null as string | null,
  date_iso: null as string | null,
  pack: null as string | null,
};

/** Submitted stamp on phone PDF (UK local) → store as UTC-ish ISO */
const SUBMITTED_AT = "2026-08-03T08:36:46.000Z";

const PAYLOAD = {
  source: "office_backfill_parent_phone_pdf",
  office_note:
    "Backfill 11 Aug 2026 from parent phone PDF screenshot (Submit downloaded PDF before club upload succeeded on 3 Aug).",
  parent_name: PARENT.name,
  parent_phone: PARENT.phone,
  parent_email: PARENT.email,
  parent_email_on_pdf: PARENT.emailOnPdf,
  parent_address: PARENT.address,
  parent_postcode: PARENT.postcode,
  participant_name: PARTICIPANT.name,
  participant_dob: PARTICIPANT.dobDisplay,
  relationship: PARENT.relationship,
  participant_gender: PARTICIPANT.gender,
  participant_school: PARTICIPANT.school,
  ehcp: "Yes",
  ehcp_details: "Autism and learning difficulties",
  social_worker: "Yes",
  social_worker_contact: "Grace.Dewey@lbhf.gov.uk",
  motivators: "Swimming",
  dislikes:
    "Physical touch (for support is ok, but from a complete stranger is a no). Take something away from him is a no for him. And he cares for his stuff if he knows you and you are trying to give it to him is ok but take it away he will start yelling to leave it.",
  medication: "None",
  allergies: "None",
  medical_conditions: "None",
  health_plan: "No",
  health_plan_details: "",
  triggers:
    "Being told no / denied access; Fatigue or hunger; Physical proximity or touch",
  strategies:
    "Preferred toy or object; Quiet space or break; Supportive adult staying nearby",
  behaviour_notes: "None",
  support_regulated: "1to1",
  support_dysregulated: "Requires continuous supervision when distressed",
  expressive_comm:
    "Mainly communicates through behaviour; Verbal – limited words or scripts",
  understand_instructions: "Verbal + gestures",
  comm_strategies: "None",
  mobility: "Walks independently",
  personal_care: "",
  task_engagement: "",
  transitions: "",
  risk_awareness: "",
  anything_else: "",
  booking_request: SLOT,
};

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

async function buildPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;
  const left = 40;
  const maxW = 515;
  const lineH = 13;

  const draw = (text: string, size = 10, isBold = false) => {
    const f = isBold ? bold : font;
    const words = String(text || "").split(/\s+/);
    let line = "";
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(trial, size) > maxW && line) {
        if (y < 50) {
          page = doc.addPage([595, 842]);
          y = 800;
        }
        page.drawText(line, { x: left, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
        y -= lineH;
        line = w;
      } else {
        line = trial;
      }
    }
    if (line) {
      if (y < 50) {
        page = doc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(line, { x: left, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
      y -= lineH;
    }
  };

  const section = (title: string) => {
    y -= 8;
    draw(title, 12, true);
    y -= 2;
  };

  const row = (k: string, v: string) => draw(`${k}: ${v || "—"}`, 10, false);

  draw("ClubSENsational – Client Registration", 16, true);
  draw(`Office reconstruction from parent phone PDF · original stamp ${SUBMITTED_AT}`, 9);
  draw(`Lead id: ${LEAD_ID}`, 9);
  y -= 6;

  section("1. Requested booking slot");
  row("Service", SLOT.service_name);
  row("Venue", SLOT.venue);
  row("Day", SLOT.day);
  row("Time", SLOT.time);
  row("Slot id", SLOT.slot_id);

  section("2. Parent / guardian");
  row("Name", PARENT.name);
  row("Relationship", PARENT.relationship);
  row("Phone", PARENT.phone);
  row("Email (lead / OTP)", PARENT.email);
  row("Email (on phone PDF)", PARENT.emailOnPdf);
  row("Address", PARENT.address);
  row("Postcode", PARENT.postcode);

  section("3. Participant");
  row("Name", PARTICIPANT.name);
  row("Date of birth", PARTICIPANT.dobDisplay);
  row("Gender", PARTICIPANT.gender);
  row("School / college / residential", PARTICIPANT.school);
  draw("Photo: see parent phone PDF / ask family to re-send if needed for ID file.", 9);

  section("4. Medical & support plans");
  row("EHCP", PAYLOAD.ehcp);
  row("EHCP details", PAYLOAD.ehcp_details);
  row("Social worker", PAYLOAD.social_worker);
  row("Social worker contact", PAYLOAD.social_worker_contact);
  row("Motivators", PAYLOAD.motivators);
  row("Dislikes", PAYLOAD.dislikes);
  row("Medication", PAYLOAD.medication);
  row("Allergies", PAYLOAD.allergies);
  row("Medical conditions", PAYLOAD.medical_conditions);
  row("Health / emergency plan", PAYLOAD.health_plan);

  section("5. Behaviour");
  row("Triggers", PAYLOAD.triggers);
  row("Regulation strategies", PAYLOAD.strategies);
  row("Additional notes", PAYLOAD.behaviour_notes);
  row("Support when regulated", PAYLOAD.support_regulated);
  row("Support when dysregulated", PAYLOAD.support_dysregulated);

  section("6. Communication");
  row("Expressive communication", PAYLOAD.expressive_comm);
  row("Understands instructions", PAYLOAD.understand_instructions);
  row("Preferred strategies", PAYLOAD.comm_strategies);

  section("7. Independence");
  row("Mobility", PAYLOAD.mobility);
  draw(
    "Remaining independence fields were below the fold on the phone screenshot — confirm with family if needed.",
    9,
  );

  return await doc.save();
}

async function main() {
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
  }

  const { data: existing } = await admin
    .from("portal_participant_documents")
    .select("id, submitted_at, status, pdf_storage_path")
    .eq("participant_name", PARTICIPANT.name)
    .ilike("parent_email", "%bozal%")
    .limit(5);

  console.log("Existing docs for Malaz:", existing || []);

  const { data: lead } = await admin
    .from("portal_booking_leads")
    .select("id, parent_name, email, mobile, booking_status, registration_status, client_status")
    .eq("id", LEAD_ID)
    .maybeSingle();
  console.log("Lead:", lead);

  if (!APPLY) {
    console.log("Dry run only. Re-run with APPLY=1 to insert.");
    return;
  }

  if ((existing || []).length) {
    console.log("Already have document(s) — skipping insert. Will still refresh lead + notify if needed.");
  }

  let documentId: string | null = (existing && existing[0]?.id) || null;
  let pdfPath: string | null = (existing && existing[0]?.pdf_storage_path) || null;

  if (!documentId) {
    const pdfBytes = await buildPdfBytes();
    const stamp = "2026-08-03T08-36-46";
    const prefix = `client_registration/${stamp}_Mhd_Malaz_Bouz_Alasal_office_backfill`;
    pdfPath = `${prefix}/form.pdf`;

    const { error: upErr } = await admin.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) {
      console.error("pdf upload", upErr.message);
      Deno.exit(1);
    }

    const { data: row, error: insErr } = await admin
      .from("portal_participant_documents")
      .insert({
        form_type: "client_registration",
        participant_name: PARTICIPANT.name,
        participant_dob: PARTICIPANT.dob,
        parent_name: PARENT.name,
        parent_email: PARENT.email,
        parent_phone: PARENT.phone,
        pdf_storage_path: pdfPath,
        photo_storage_path: null,
        payload_json: PAYLOAD,
        status: "new",
        submitted_at: SUBMITTED_AT,
      })
      .select("id, submitted_at")
      .single();

    if (insErr || !row) {
      console.error("insert", insErr?.message);
      await admin.storage.from(BUCKET).remove([pdfPath]);
      Deno.exit(1);
    }
    documentId = String(row.id);
    console.log("Inserted document", documentId);
  }

  const holdExpires = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pendingHolds } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, status")
    .eq("slot_id", SLOT.slot_id)
    .eq("status", "pending")
    .ilike("parent_email", PARENT.email);

  if (!(pendingHolds || []).length) {
    const { data: hold, error: holdErr } = await admin
      .from("portal_booking_slot_reservations")
      .insert({
        slot_id: SLOT.slot_id,
        service_id: SLOT.service_id,
        service_name: SLOT.service_name,
        venue: SLOT.venue,
        day_label: SLOT.day,
        time_label: SLOT.time,
        activity: SLOT.activity,
        document_id: documentId,
        participant_name: PARTICIPANT.name,
        parent_name: PARENT.name,
        parent_email: PARENT.email,
        parent_phone: PARENT.phone,
        status: "pending",
        hold_expires_at: holdExpires,
        notes: "office_backfill_from_parent_phone_pdf",
      })
      .select("id")
      .single();
    if (holdErr) console.warn("reservation", holdErr.message);
    else console.log("Hold", hold?.id);
  } else {
    console.log("Pending hold already exists", pendingHolds);
  }

  const nowIso = new Date().toISOString();
  const { error: leadErr } = await admin
    .from("portal_booking_leads")
    .update({
      booking_status: "registration_submitted",
      registration_status: "submitted",
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", LEAD_ID);
  if (leadErr) console.warn("lead update", leadErr.message);
  else console.log("Lead marked registration_submitted");

  await notifyOfficeRegistrationSubmitted({
    documentId: String(documentId),
    formType: "client_registration",
    participantName: PARTICIPANT.name,
    parentName: PARENT.name,
    parentEmail: PARENT.email,
    parentPhone: PARENT.phone,
    leadId: LEAD_ID,
    slotHeld: true,
    bookingSummary: `${SLOT.service_name} · ${SLOT.venue} · ${SLOT.day} · ${SLOT.time}`,
  });
  console.log("Office notify sent (email/push if configured).");
  console.log("Done. Admin → Participant documents → Accept when ready.");
}

await main();
