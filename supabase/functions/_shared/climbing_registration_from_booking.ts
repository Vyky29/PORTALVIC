/**
 * Climbing booking -> Everyone Active junior form, emailed to the office
 * so they can forward it to Virgin / Westway.
 * Parent signature is not invented. Contact and medical lines come from the
 * club registration that actually has the questionnaire.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "npm:pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "./portal_parent_messaging.ts";

const BUCKET = "participant-documents";

export type ClimbingMintItem = {
  name: string;
  bookingSummary?: string | null;
  /** Rebuild and email again when a climbing form already exists. */
  force?: boolean;
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

type SupervisorArt = {
  label: string;
  sig: string;
  photo: string;
};

const SUPERVISORS: Array<{ keys: string[]; art: SupervisorArt }> = [
  { keys: ["alex"], art: { label: "Alex S", sig: "climbing_instructor_signatures/alex-signature.png", photo: "staff_photos/alex.png" } },
  { keys: ["bismark"], art: { label: "Bismark G", sig: "climbing_instructor_signatures/bismark-signature.png", photo: "staff_photos/bismark.png" } },
  { keys: ["carlos"], art: { label: "Carlos H", sig: "climbing_instructor_signatures/carlos-signature.png", photo: "staff_photos/carlos.png" } },
  { keys: ["javier", "javi"], art: { label: "Javi A", sig: "climbing_instructor_signatures/javi-signature.png", photo: "staff_photos/javi.png" } },
  { keys: ["andres"], art: { label: "Andres B", sig: "climbing_instructor_signatures/andres-signature.png", photo: "staff_photos/andres.png" } },
];

function supervisorFromText(text: string): SupervisorArt | null {
  const blob = pdfSafe(text, 400).toLowerCase();
  for (const row of SUPERVISORS) {
    if (row.keys.some((k) => new RegExp(`\\b${k}\\b`).test(blob))) return row.art;
  }
  return null;
}

async function loadPortalPng(rel: string): Promise<Uint8Array | null> {
  try {
    const local = new URL(`../../../working_ui/portal/${rel}`, import.meta.url);
    return await Deno.readFile(local);
  } catch {
    /* Deployed function has no working_ui tree. */
  }
  try {
    const res = await fetch(`https://portalvic.vercel.app/portal/${rel}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

type VirginForm = {
  staffName: string;
  juniorGender: string;
  juniorFirst: string;
  juniorSurname: string;
  juniorAddress: string;
  juniorDob: string;
  juniorPostcode: string;
  juniorEmergency: string;
  juniorMobile: string;
  juniorEmail: string;
  juniorMedical: string;
  guardianFirst: string;
  guardianSurname: string;
  guardianAddress: string;
  guardianPostcode: string;
  guardianMobile: string;
  guardianEmail: string;
  guardianEmergencyName: string;
  guardianEmergencyNumber: string;
  bookingName: string;
  supervisorName: string;
  logo: Uint8Array | null;
  signature: Uint8Array | null;
  photo: Uint8Array | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MM = 72 / 25.4;
const RED = rgb(198 / 255, 40 / 255, 40 / 255);
const GREY = rgb(232 / 255, 232 / 255, 232 / 255);
const LINE = rgb(80 / 255, 80 / 255, 80 / 255);
const YELLOW = rgb(1, 251 / 255, 230 / 255);
const BLACK = rgb(0, 0, 0);

function mm(n: number): number {
  return n * MM;
}

export async function buildVirginPdf(form: VirginForm): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  async function embed(bytes: Uint8Array | null): Promise<PDFImage | null> {
    if (!bytes || bytes.length < 4) return null;
    try {
      if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
    return null;
  }
  const logo = await embed(form.logo);
  const signature = await embed(form.signature);
  const photo = await embed(form.photo);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = 16;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = 16;
    paintLogo();
    y = 34;
  }

  function paintLogo() {
    if (!logo) return;
    page.drawImage(logo, { x: mm(144), y: PAGE_H - mm(30), width: mm(52), height: mm(20) });
  }

  function need(h: number) {
    if (y + h > 282) newPage();
  }

  function wrapText(text: string, face: PDFFont, size: number, widthMm: number): string[] {
    return wrap(text, face, size, mm(widthMm));
  }

  function textIn(x: number, top: number, w: number, h: number, value: string, face: PDFFont, size = 7) {
    const lines = wrapText(value, face, size, Math.max(w - 3, 8)).slice(0, Math.max(1, Math.floor((h - 1) / 3.2)));
    const block = lines.length * 3.2;
    let ty = top + (h - block) / 2 + 2.6;
    for (const line of lines) {
      page.drawText(line, {
        x: mm(x + 1.4),
        y: PAGE_H - mm(ty),
        size,
        font: face,
        color: BLACK,
      });
      ty += 3.2;
    }
  }

  function cell(x: number, w: number, h: number, value: string, label: boolean) {
    const filled = !label && pdfSafe(value, 20).length > 0;
    page.drawRectangle({
      x: mm(x),
      y: PAGE_H - mm(y + h),
      width: mm(w),
      height: mm(h),
      color: label ? GREY : (filled ? YELLOW : rgb(1, 1, 1)),
      borderColor: LINE,
      borderWidth: 0.4,
    });
    textIn(x, y, w, h, value, label ? bold : font, 7);
  }

  function row4(l1: string, v1: string, l2: string, v2: string, h = 6.2) {
    need(h);
    const c = 45.5;
    cell(14, c, h, l1, true);
    cell(14 + c, c, h, v1, false);
    cell(14 + c * 2, c, h, l2, true);
    cell(14 + c * 3, c, h, v2, false);
    y += h;
  }

  function row2(label: string, value: string, h = 6.2) {
    need(h);
    cell(14, 91, h, label, true);
    cell(105, 91, h, value, false);
    y += h;
  }

  function bar(label: string) {
    need(7);
    page.drawRectangle({
      x: mm(14),
      y: PAGE_H - mm(y + 7),
      width: mm(182),
      height: mm(7),
      color: rgb(216 / 255, 216 / 255, 216 / 255),
      borderColor: LINE,
      borderWidth: 0.4,
    });
    const size = 8;
    const width = bold.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: mm(14) + (mm(182) - width) / 2,
      y: PAGE_H - mm(y + 4.8),
      size,
      font: bold,
      color: BLACK,
    });
    y += 7;
  }

  function paragraph(value: string) {
    const lines = wrapText(value, font, 7, 180);
    const h = lines.length * 3.1 + 2;
    need(h);
    let ty = y + 3;
    for (const line of lines) {
      page.drawText(line, { x: mm(14), y: PAGE_H - mm(ty), size: 7, font, color: BLACK });
      ty += 3.1;
    }
    y += h;
  }

  function title(lines: string[]) {
    for (const line of lines) {
      page.drawText(line, { x: mm(14), y: PAGE_H - mm(y), size: 13, font: bold, color: RED });
      y += 6.2;
    }
    y += 2;
  }

  paintLogo();
  y = 18;
  title(["JUNIOR REGISTRATION FORM AND", "CLIMBING PARENTAL CONSENT", "FOR JUNIOR CLIMBING"]);
  page.drawLine({ start: { x: mm(14), y: PAGE_H - mm(y) }, end: { x: mm(196), y: PAGE_H - mm(y) }, thickness: 0.6, color: BLACK });
  y += 3;
  row4("Staff Name:", form.staffName, "Registration Number:", "");
  bar("(A) Junior");
  row4("Title:", "", "Male/Female:", form.juniorGender);
  row4("First Name:", form.juniorFirst, "Surname:", form.juniorSurname);
  row4("Address:", form.juniorAddress, "Date of Birth:", form.juniorDob, 11);
  row4("Post Code:", form.juniorPostcode, "In Case of Emergency Number:", form.juniorEmergency);
  row4("Mobile Tel. Number:", form.juniorMobile, "Email address:", form.juniorEmail);
  row2("Details of relevant medical history, including medication:", form.juniorMedical, 16);
  y += 2;
  paragraph("Collection - Any parent that brings their children to Westway for any activities must ensure that they collect them on time. Persistent late collections could be considered neglectful and a pattern developing will be recorded by the Duty Manager/Sports Manager. If the child is not picked up within 30 minutes on three occasions without a legitimate reason the Social Services will be called, the parent may be charged for the additional costs of looking after their child and the disruption to services.");
  y += 2;
  bar("(B) Parent/Legal Guardian");
  row4("Title:", "", "Male/Female:", "");
  row4("First Name:", form.guardianFirst, "Surname:", form.guardianSurname);
  row4("Address:", form.guardianAddress, "Date of Birth:", "", 11);
  row4("Post Code:", form.guardianPostcode, "Home Tel. Number:", "");
  row4("Mobile Tel. Number:", form.guardianMobile, "Email address:", form.guardianEmail);
  row4("In Case of Emergency Name:", form.guardianEmergencyName, "In Case of Emergency Number:", form.guardianEmergencyNumber);
  row2("Details of relevant medical history, including medication:", "", 10);
  y += 2;
  bar("Marketing and communication");
  row2("Guest passes / promotions:", "");
  row2("Partner offers:", "");
  row2("Data sharing Council/Westway:", "");
  row2("Preferred methods of communication:", "");
  row2("How did you hear about us?", "");
  y += 2;
  bar("Privacy");
  row2("Do you agree to Everyone Active holding your and your child's data?", "", 12);

  newPage();
  y = 34;
  title(["JUNIOR CLIMBING", "CONSENT"]);
  row2("BMC Participation Statement:", "");
  paragraph("The British Mountaineering Council recognises that climbing and mountaineering are activities with a risk of personal injury or death. Participants in these activities should be aware of and accept these risks, and be responsible for their own actions and involvement.");
  y += 2;
  page.drawText("PARENTAL CONSENT FOR INSTRUCTED SESSIONS", {
    x: mm(14), y: PAGE_H - mm(y), size: 9, font: bold, color: RED,
  });
  y += 6;
  paragraph("Please note that this form is only valid for one school year. Children must be 5 years and over. Name of the booking: " + (form.bookingName || "clubSENsational"));
  row2("Signature (Instructed):", "");
  row2("Date (Instructed):", "");
  y += 3;
  page.drawText("CASUAL CLIMBING NOVICE UNDER SUPERVISION (UNDER 18YRS)", {
    x: mm(14), y: PAGE_H - mm(y), size: 9, font: bold, color: RED,
  });
  y += 6;
  paragraph("Consent: I have read the participation statement and the Junior Climbing Recognition of Risk document. I consent to my child climbing at The Westway Sports Centre under the supervision of the climber named below.");
  row2("Signature of Parent/Legal Guardian:", "", 18);
  row2("Date:", "");
  need(18);
  cell(14, 91, 18, "Name of Supervisor:", true);
  page.drawRectangle({
    x: mm(105),
    y: PAGE_H - mm(y + 18),
    width: mm(91),
    height: mm(18),
    color: form.supervisorName ? YELLOW : rgb(1, 1, 1),
    borderColor: LINE,
    borderWidth: 0.4,
  });
  if (photo) {
    page.drawImage(photo, { x: mm(107), y: PAGE_H - mm(y + 16), width: mm(14), height: mm(14) });
    textIn(122, y, 72, 18, form.supervisorName, font, 9);
  } else {
    textIn(105, y, 91, 18, form.supervisorName, font, 9);
  }
  y += 18;
  need(18);
  cell(14, 91, 18, "Signature of supervisor:", true);
  page.drawRectangle({
    x: mm(105),
    y: PAGE_H - mm(y + 18),
    width: mm(91),
    height: mm(18),
    color: signature ? YELLOW : rgb(1, 1, 1),
    borderColor: LINE,
    borderWidth: 0.4,
  });
  if (signature) {
    page.drawImage(signature, { x: mm(108), y: PAGE_H - mm(y + 16), width: mm(50), height: mm(14) });
  }
  y += 22;
  page.drawText("PARENTAL CONSENT FOR JUNIOR TEST (14+ YEARS)", {
    x: mm(14), y: PAGE_H - mm(y), size: 9, font: bold, color: RED,
  });
  y += 6;
  row2("Unsupervised Top roping:", "");
  row2("Unsupervised Lead:", "");
  row2("Signature of Parent/Legal Guardian:", "");
  row2("Date:", "");

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
  const existingId = already && already.length ? String(already[0].id) : "";
  if (existingId && !item.force) return { ok: true, skipped: "already_sent", id: existingId };

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
  let instructorBlob = [
    summary,
    climbingBooking && climbingBooking.instructor,
    climbingBooking && climbingBooking.staff,
  ].map((x) => clean(x, 80)).join(" ");
  if (!supervisorFromText(instructorBlob)) {
    const { data: lines } = await admin
      .from("portal_participant_service_lines")
      .select("sessions")
      .ilike("client_name", name)
      .limit(4);
    const sessions = (Array.isArray(lines) ? lines : []).flatMap((row) =>
      Array.isArray(row.sessions) ? row.sessions as Array<Record<string, unknown>> : []
    );
    const climb = sessions.find((s) => /climb|westway/i.test(clean(s.service, 40) + " " + clean(s.venue, 40)));
    if (climb) instructorBlob += " " + clean(climb.instructor, 40);
  }
  const supervisor = supervisorFromText(instructorBlob);
  const [logo, signature, photo] = await Promise.all([
    loadPortalPng("everyone-active-logo.png"),
    supervisor ? loadPortalPng(supervisor.sig) : Promise.resolve(null),
    supervisor ? loadPortalPng(supervisor.photo) : Promise.resolve(null),
  ]);
  const dobUk = /^\d{4}-\d{2}-\d{2}$/.test(dob)
    ? `${dob.slice(8, 10)}/${dob.slice(5, 7)}/${dob.slice(0, 4)}`
    : dob;

  const pdfBytes = await buildVirginPdf({
    staffName: supervisor ? supervisor.label : "",
    juniorGender: bit(payload, "participant_gender"),
    juniorFirst: child.first,
    juniorSurname: child.last,
    juniorAddress: address,
    juniorDob: dobUk,
    juniorPostcode: postcode,
    juniorEmergency: phone,
    juniorMobile: phone,
    juniorEmail: email,
    juniorMedical: medicalLine(payload),
    guardianFirst: parent.first,
    guardianSurname: parent.last,
    guardianAddress: address,
    guardianPostcode: postcode,
    guardianMobile: phone,
    guardianEmail: email,
    guardianEmergencyName: `${parent.first} ${parent.last}`.trim(),
    guardianEmergencyNumber: phone,
    bookingName: summary || "clubSENsational",
    supervisorName: supervisor ? supervisor.label : "",
    logo,
    signature,
    photo,
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = pdfSafe(name, 60).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || "participant";
  const pdfPath = `climbing_registration/${stamp}_${safe}/form.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) return { ok: false, error: "pdf_upload_failed" };

  const docPayload = {
    source: "registration_for_virgin",
    booking_summary: summary,
    junior_first_name: child.first,
    junior_surname: child.last,
    participant_name: name,
  };
  let savedId = existingId;
  if (existingId) {
    const { error: updErr } = await admin
      .from("portal_participant_documents")
      .update({
        participant_dob: dob || null,
        parent_name: bit(payload, "parent_name") || clean(best.parent_name, 120) || null,
        parent_email: email || null,
        parent_phone: phone || null,
        pdf_storage_path: pdfPath,
        payload_json: docPayload,
      })
      .eq("id", existingId);
    if (updErr) return { ok: false, error: "save_failed" };
  } else {
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
        payload_json: docPayload,
        status: "new",
      })
      .select("id")
      .single();
    if (insErr || !inserted) return { ok: false, error: "save_failed" };
    savedId = String(inserted.id);
  }

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
        (item.force ? `<p>Updated copy. Use this place line.</p>` : "") +
        `<p>Place: ${escapeHtml(summary)}</p>` +
        `<p>This is the Everyone Active junior form (Virgin layout). The club supervisor name, signature and photo are on the consent page. The parent signature line is blank.</p>`,
      attachment: {
        filename: `${safe}_climbing_registration.pdf`,
        contentBase64: btoa(binary),
        mimeType: "application/pdf",
      },
    });
    emailed = !!sent.ok;
    if (!sent.ok) console.warn("[climbing-reg] email", sent.error);
  }

  return { ok: true, id: savedId, emailed };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
