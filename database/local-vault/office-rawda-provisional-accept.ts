/**
 * Office: provisional Accept for Rawda Said — form PDF to follow later.
 * Creates a reviewed placeholder registration doc, advances the lead, mints
 * finish-booking link, and notifies parent (email + WhatsApp).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-rawda-provisional-accept.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-rawda-provisional-accept.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import {
  finishBookingUrl,
  mintFinishBookingToken,
  notifyParentFinishBooking,
} from "../../supabase/functions/_shared/portal_booking_finish.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const BUCKET = "participant-documents";
const LEAD_ID = "95ff0ad2-0996-4462-9bdc-2e6e35b66d39";

const PARENT = {
  name: "rawda Said",
  email: "rawda_said@yahoo.co.uk",
  phone: "+447476407735",
};

/** Child name unknown until office receives the form. */
const PARTICIPANT = {
  name: "TBC (Rawda Said)",
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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

async function buildPlaceholderPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.15, 0.2);
  const accent = rgb(0.18, 0.52, 0.7);
  let y = 780;
  const draw = (text: string, size = 11, f = font) => {
    page.drawText(text, { x: 50, y, size, font: f, color: ink });
    y -= size + 8;
  };
  draw("ClubSENsational — Client Registration", 16, bold);
  page.drawText("(office provisional)", {
    x: 50,
    y,
    size: 11,
    font: bold,
    color: accent,
  });
  y -= 28;
  draw(`Parent: ${PARENT.name}`);
  draw(`Email: ${PARENT.email}`);
  draw(`Mobile: ${PARENT.phone}`);
  draw(`Participant: ${PARTICIPANT.name}`);
  y -= 8;
  draw("Office note:", 11, bold);
  draw("Provisional Accept on 12 Aug 2026 so the family can finish booking.");
  draw("Full registration PDF + photo will be attached/updated when received.");
  draw("Lead had viewed Intensive Courses; slot to confirm with parent.");
  return await doc.save();
}

async function main() {
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
  }

  const { data: lead, error: leadErr } = await admin
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, booking_status, registration_status, client_status, services_viewed",
    )
    .eq("id", LEAD_ID)
    .maybeSingle();
  if (leadErr || !lead) {
    console.error("Lead not found", leadErr?.message);
    Deno.exit(1);
  }
  console.log("Lead:", lead);

  const { data: existing } = await admin
    .from("portal_participant_documents")
    .select("id, status, submitted_at, pdf_storage_path, participant_name")
    .ilike("parent_email", "%rawda_said%")
    .order("submitted_at", { ascending: false })
    .limit(5);
  console.log("Existing docs:", existing || []);

  if (!APPLY) {
    console.log("Dry run only. Re-run with APPLY=1 to accept + send finish link.");
    return;
  }

  const nowIso = new Date().toISOString();
  let documentId = existing?.[0]?.id ? String(existing[0].id) : null;

  if (!documentId) {
    const pdfBytes = await buildPlaceholderPdf();
    const stamp = nowIso.replace(/[:.]/g, "-").slice(0, 19);
    const prefix = `client_registration/${stamp}_Rawda_Said_office_provisional`;
    const pdfPath = `${prefix}/form.pdf`;
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
        participant_dob: null,
        parent_name: PARENT.name,
        parent_email: PARENT.email,
        parent_phone: PARENT.phone,
        pdf_storage_path: pdfPath,
        photo_storage_path: null,
        payload_json: {
          source: "office_provisional_accept",
          office_note:
            "Provisional Accept 12 Aug 2026 — full parent PDF/photo to follow. Finish-booking unlocked.",
          services_viewed: lead.services_viewed || ["intensive"],
          parent_name: PARENT.name,
          parent_email: PARENT.email,
          parent_phone: PARENT.phone,
          participant_name: PARTICIPANT.name,
        },
        status: "reviewed",
        reviewed_at: nowIso,
        submitted_at: nowIso,
      })
      .select("id")
      .single();

    if (insErr || !row) {
      console.error("insert doc", insErr?.message);
      await admin.storage.from(BUCKET).remove([pdfPath]);
      Deno.exit(1);
    }
    documentId = String(row.id);
    console.log("Inserted reviewed document", documentId);
  } else {
    const { error: updDoc } = await admin
      .from("portal_participant_documents")
      .update({
        status: "reviewed",
        reviewed_at: nowIso,
      })
      .eq("id", documentId);
    if (updDoc) console.warn("doc update", updDoc.message);
    else console.log("Marked existing doc reviewed", documentId);
  }

  const { error: leadUpdErr } = await admin
    .from("portal_booking_leads")
    .update({
      booking_status: "booking_started",
      registration_status: "submitted",
      client_status: "registered",
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", LEAD_ID);
  if (leadUpdErr) {
    console.error("lead update", leadUpdErr.message);
    Deno.exit(1);
  }
  console.log("Lead → booking_started / registered");

  const minted = await mintFinishBookingToken(admin, {
    leadId: LEAD_ID,
    documentId: String(documentId),
    reservationId: null,
  });
  const link = finishBookingUrl(minted.rawToken);
  console.log("Finish URL:", link);

  const notify = await notifyParentFinishBooking({
    parentName: PARENT.name,
    parentEmail: PARENT.email,
    parentPhone: PARENT.phone,
    participantName: PARTICIPANT.name,
    slotSummary: "Place to confirm with office (registration accepted)",
    rawToken: minted.rawToken,
    admin,
  });

  await admin
    .from("portal_booking_completion_tokens")
    .update({
      finish_link_sent_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", minted.tokenId);

  console.log("Notify:", notify);
  console.log("Done. Form PDF can be swapped later when Victor receives it.");
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
