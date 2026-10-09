/**
 * Climbing booking -> Everyone Active junior form, emailed to the office
 * so they can forward it to Virgin / Westway.
 * Parent signature is not invented. Contact and medical lines come from the
 * club registration that actually has the questionnaire.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "./portal_parent_messaging.ts";

const BUCKET = "participant-documents";

export type ClimbingMintItem = {
  name: string;
  bookingSummary?: string | null;
};

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function pdfSafe(v: unknown, max = 500): string {
  return clean(v, max)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitName(full: string): { first: string; last: string } {
  const parts = pdfSafe(full, 120).split(" ").filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function bit(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  if (Array.isArray(v)) return v.map((x) => clean(x, 300)).filter(Boolean).join(", ");
  return clean(v, 2000);
}

function questionnaireScore(payload: Record<string, unknown>): number {
  const keys = [
    "medical_conditions",
    "motivators",
    "allergies",
    "medication",
    "mobility",
    "parent_name",
    "participant_dob",
  ];
  return keys.reduce((n, k) => n + (bit(payload, k) ? 1 : 0), 0);
}

export function bookingLooksClimbing(booking: Record<string, unknown> | null | undefined): boolean {
  if (!booking) return false;
  const blob = [
    booking.service_name,
    booking.service,
    booking.venue,
    booking.slot_id,
    booking.service_id,
    booking.activity,
  ].map((x) => clean(x, 80).toLowerCase()).join(" ");
  return /climb|westway/.test(blob);
}

function bookingSummaryFrom(booking: Record<string, unknown> | null | undefined): string {
  if (!booking) return "";
  return [booking.service_name || booking.service, booking.venue, booking.day, booking.time, booking.date_iso]
    .map((x) => clean(x, 40))
    .filter(Boolean)
    .join(" · ");
}

function medicalLine(payload: Record<string, unknown>): string {
  const parts = [
    bit(payload, "medical_conditions"),
    bit(payload, "allergies") ? `Allergies: ${bit(payload, "allergies")}` : "",
    bit(payload, "medication") ? `Medication: ${bit(payload, "medication")}` : "",
    bit(payload, "health_plan") === "Yes" && bit(payload, "health_plan_details")
      ? `Health plan: ${bit(payload, "health_plan_details")}`
      : "",
    bit(payload, "ehcp") ? `EHCP: ${bit(payload, "ehcp")}` : "",
  ].filter(Boolean);
  return parts.join(". ");
}

function officeEmails(): string[] {
  const raw = String(
    Deno.env.get("BOOKING_LEAD_OFFICE_EMAIL") ||
      Deno.env.get("PORTAL_OFFICE_NOTIFY_EMAIL") ||
      "info@clubsensational.org",
  ).trim();
  const list = raw.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes("@"));
  return list.length ? list : ["info@clubsensational.org"];
}

async function buildPdf(fields: Array<[string, string]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;

  function ensure(h: number) {
    if (y - h < 48) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
  }

  function draw(text: string, size: number, face: PDFFont, color = rgb(0.06, 0.09, 0.16)) {
    const lines = wrap(text, face, size, 500);
    for (const line of lines) {
      ensure(size + 4);
      page.drawText(line, { x: 48, y, size, font: face, color });
      y -= size + 4;
    }
  }

  draw("JUNIOR REGISTRATION FORM AND CLIMBING PARENTAL CONSENT", 12, bold, rgb(0.7, 0.1, 0.1));
  y -= 4;
  draw("Everyone Active / Westway. Filled by clubSENsational from the family registration.", 9, font);
  draw("The parent has not signed the Everyone Active consent on this copy.", 9, font);
  y -= 8;

  for (const [label, value] of fields) {
    if (!value) continue;
    draw(label, 9, bold);
    draw(value, 10, font);
    y -= 4;
  }

  return doc.save();
}

function wrap(text: string, face: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text, 4000).split(" ").filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (face.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function mintClimbingRegistrationForOffice(
  admin: SupabaseClient,
  item: ClimbingMintItem,
): Promise<{ ok: boolean; skipped?: string; id?: string; emailed?: boolean; error?: string }> {
  const name = clean(item.name, 120);
  if (!name) return { ok: false, error: "missing_name" };

  const { data: already } = await admin
    .from("portal_participant_documents")
    .select("id")
    .eq("form_type", "climbing_registration")
    .ilike("participant_name", name)
    .limit(1);
  if (already && already.length) return { ok: true, skipped: "already_sent", id: String(already[0].id) };

  const { data: docs } = await admin
    .from("portal_participant_documents")
    .select("participant_name, participant_dob, parent_name, parent_email, parent_phone, payload_json, submitted_at")
    .eq("form_type", "client_registration")
    .ilike("participant_name", name)
    .order("submitted_at", { ascending: false })
    .limit(8);

  const rows = Array.isArray(docs) ? docs : [];
  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  let climbingBooking: Record<string, unknown> | null = null;
  for (const row of rows) {
    const payload = row.payload_json && typeof row.payload_json === "object"
      ? row.payload_json as Record<string, unknown>
      : {};
    const score = questionnaireScore(payload);
    if (score > bestScore) {
      bestScore = score;
      best = { ...row, payload_json: payload };
    }
    const booking = payload.booking_request && typeof payload.booking_request === "object"
      ? payload.booking_request as Record<string, unknown>
      : null;
    if (!climbingBooking && bookingLooksClimbing(booking)) climbingBooking = booking;
  }
  if (!best || bestScore < 2) return { ok: false, error: "no_registration_questionnaire" };

  const payload = best.payload_json as Record<string, unknown>;
  const child = splitName(bit(payload, "participant_name") || name);
  const parent = splitName(bit(payload, "parent_name") || clean(best.parent_name, 120));
  const dob = bit(payload, "participant_dob") || clean(best.participant_dob, 20);
  const address = bit(payload, "parent_address");
  const postcode = bit(payload, "parent_postcode");
  const phone = bit(payload, "parent_phone") || clean(best.parent_phone, 40);
  const email = bit(payload, "parent_email") || clean(best.parent_email, 120);
  const summary = clean(item.bookingSummary, 180) || bookingSummaryFrom(climbingBooking) || "Climbing Activity · Westway";

  const fields: Array<[string, string]> = [
    ["Staff", "clubSENsational"],
    ["Booking", summary],
    ["Junior first name", child.first],
    ["Junior surname", child.last],
    ["Male/Female", bit(payload, "participant_gender")],
    ["Date of birth", dob],
    ["Address", address],
    ["Post code", postcode],
    ["Emergency number", phone],
    ["Email", email],
    ["School", bit(payload, "participant_school")],
    ["Medical history, including medication", medicalLine(payload)],
    ["Parent / guardian first name", parent.first],
    ["Parent / guardian surname", parent.last],
    ["Relationship", bit(payload, "relationship")],
    ["Guardian address", address],
    ["Guardian post code", postcode],
    ["Guardian mobile", phone],
    ["Guardian email", email],
    ["Emergency contact", parent.first ? `${parent.first} ${parent.last}`.trim() : ""],
    ["Emergency number", phone],
    ["Everyone Active consent signature", "Not signed on this copy"],
  ];

  const pdfBytes = await buildPdf(fields);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = pdfSafe(name, 60).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || "participant";
  const pdfPath = `climbing_registration/${stamp}_${safe}/form.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return { ok: false, error: "pdf_upload_failed" };

  const { data: inserted, error: insErr } = await admin
    .from("portal_participant_documents")
    .insert({
      form_type: "climbing_registration",
      participant_name: name,
      participant_dob: dob || null,
      parent_name: bit(payload, "parent_name") || clean(best.parent_name, 120) || null,
      parent_email: email || null,
      parent_phone: phone || null,
      pdf_storage_path: pdfPath,
      payload_json: {
        source: "registration_for_virgin",
        booking_summary: summary,
        junior_first_name: child.first,
        junior_surname: child.last,
        participant_name: name,
      },
      status: "new",
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { ok: false, error: "save_failed" };

  const smtp = readParentNotifySmtpConfig();
  const tos = officeEmails();
  let emailed = false;
  if (smtp) {
    let binary = "";
    const chunk = 0x2000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const sent = await sendEmailWithAttachmentViaSmtp({
      config: smtp,
      to: tos,
      subject: `Climbing registration for Virgin · ${name}`,
      html:
        `<p>Climbing registration for <strong>${escapeHtml(name)}</strong>, filled from the club registration so it can be sent to Virgin / Westway.</p>` +
        `<p>Place: ${escapeHtml(summary)}</p>` +
        `<p>The parent has not signed the Everyone Active consent on this copy. The PDF is attached.</p>`,
      attachment: {
        filename: `${safe}_climbing_registration.pdf`,
        contentBase64: btoa(binary),
        mimeType: "application/pdf",
      },
    });
    emailed = !!sent.ok;
    if (!sent.ok) console.warn("[climbing-reg] email", sent.error);
  }

  return { ok: true, id: String(inserted.id), emailed };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
