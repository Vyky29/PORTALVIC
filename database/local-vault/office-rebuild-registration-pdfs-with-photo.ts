/**
 * Office rebuild — client registration PDFs that reached us without the photo.
 *
 * Two rows in Documents -> Registration forms were created by hand because the
 * parent's upload never reached the server:
 *
 *   1. "TBC (Rawda Said)"  -> real form is Yusuf Harzi (parent pasted it 13 Aug 2026).
 *      Only a 5-line provisional stub was stored, no participant data, no photo.
 *   2. "Mhd Malaz Bouz Alasal" -> office reconstruction had the full text but no photo.
 *
 * This rebuilds both PDFs in the same shape the live form produces (logo, sections,
 * participant photo beside the participant block), uploads the photo so the Photo
 * column works, and points the document rows at the new files.
 *
 *   npx -y deno run -A database/local-vault/office-rebuild-registration-pdfs-with-photo.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-rebuild-registration-pdfs-with-photo.ts
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CLUBSENSATIONAL_LOGO_PNG_B64 } from "../../supabase/functions/_shared/clubsensational_logo_b64.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const BUCKET = "participant-documents";
const ASSETS = "/Users/victor/.cursor/projects/Users-victor-cursor-PORTALVIC/assets";
const PREVIEW_DIR = "database/local-vault/tmp/reg-pdfs";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/* ---------------------------------------------------------------- PDF ---- */

type Row = [string, string];
type Section = { title: string; rows: Row[]; withPhoto?: boolean };
type RegistrationPdfInput = {
  submittedLabel: string;
  subtitle?: string;
  sections: Section[];
  photoPng?: Uint8Array | null;
};

/** WinAnsi-safe: the club forms are typed on phones, so smart punctuation shows up. */
function ascii(s: string): string {
  return String(s ?? "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00b7/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of ascii(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) cur = next;
      else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [""];
}

async function buildRegistrationPdf(input: RegistrationPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.4, 0.42, 0.46);
  const brand = rgb(0.13, 0.47, 0.75);

  const PW = 595.28;
  const PH = 841.89;
  const M = 48;
  const RIGHT = PW - M;
  const BODY = 9;
  const LINE = 13;

  let page: PDFPage = pdf.addPage([PW, PH]);
  let y = PH - M;

  function newPage() {
    page = pdf.addPage([PW, PH]);
    y = PH - M;
  }
  function need(h: number) {
    if (y - h < M + 24) newPage();
  }

  const logo = await pdf.embedPng(b64ToBytes(CLUBSENSATIONAL_LOGO_PNG_B64));
  const logoBox = 46;
  const lScale = Math.min(logoBox / logo.width, logoBox / logo.height);
  page.drawImage(logo, {
    x: M,
    y: y - logo.height * lScale,
    width: logo.width * lScale,
    height: logo.height * lScale,
  });
  y -= logo.height * lScale + 18;

  page.drawText(ascii("ClubSENsational - Client Registration"), {
    x: M,
    y,
    size: 16,
    font: bold,
    color: brand,
  });
  y -= 20;
  page.drawText(ascii(`Submitted: ${input.submittedLabel}`), {
    x: M,
    y,
    size: 9,
    font: bold,
    color: ink,
  });
  y -= 14;
  if (input.subtitle) {
    for (const l of wrapLines(input.subtitle, font, 8, RIGHT - M)) {
      page.drawText(l, { x: M, y, size: 8, font, color: muted });
      y -= 11;
    }
  }
  y -= 8;

  // Photo sits to the right of the Participant block, like the live form.
  const photo = input.photoPng ? await pdf.embedPng(input.photoPng) : null;
  const PHOTO_W = 130;
  const PHOTO_H = 150;

  for (const section of input.sections) {
    need(46);
    page.drawText(ascii(section.title), { x: M, y, size: 12, font: bold, color: brand });
    y -= 17;

    let textRight = RIGHT;
    let photoBottom = -1;
    if (section.withPhoto && photo) {
      const boxX = RIGHT - PHOTO_W;
      const boxY = y - PHOTO_H + 10;
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: PHOTO_W,
        height: PHOTO_H,
        borderColor: rgb(0.62, 0.78, 0.9),
        borderWidth: 1.2,
        color: rgb(1, 1, 1),
      });
      const iScale = Math.min((PHOTO_W - 8) / photo.width, (PHOTO_H - 8) / photo.height);
      const dw = photo.width * iScale;
      const dh = photo.height * iScale;
      page.drawImage(photo, {
        x: boxX + (PHOTO_W - dw) / 2,
        y: boxY + (PHOTO_H - dh) / 2,
        width: dw,
        height: dh,
      });
      textRight = boxX - 16;
      photoBottom = boxY;
    }

    for (const [label, value] of section.rows) {
      const text = `${label}: ${value || "None"}`;
      const max = (photoBottom > 0 && y > photoBottom ? textRight : RIGHT) - M;
      const lines = wrapLines(text, font, BODY, max);
      for (const l of lines) {
        need(LINE);
        page.drawText(l, { x: M, y, size: BODY, font, color: ink });
        y -= LINE;
      }
    }
    if (photoBottom > 0 && y > photoBottom) y = photoBottom;
    y -= 12;
  }

  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(ascii(`Page ${i + 1} of ${pages.length}`), {
      x: RIGHT - 60,
      y: 28,
      size: 8,
      font,
      color: muted,
    });
  }
  return pdf.save();
}

/* --------------------------------------------------------------- data ---- */

type Job = {
  key: string;
  matchPdfPath: string;
  newParticipantName?: string;
  photoAsset: string;
  prefix: string;
  submittedLabel: string;
  subtitle?: string;
  sections: Section[];
  bookingRequest: Record<string, string>;
  noteLine: string;
};

const JOBS: Job[] = [
  {
    key: "Yusuf Harzi (was TBC / Rawda Said)",
    matchPdfPath: "client_registration/2026-08-12T18-38-51_Rawda_Said_office_provisional/form.pdf",
    newParticipantName: "Yusuf Harzi",
    photoAsset: `${ASSETS}/Screenshot_2026-08-13_at_20.05.33-f4320bb2-33aa-4660-a4fb-40f1aef314c4.png`,
    prefix: "client_registration/2026-08-12T18-14-22_Yusuf_Harzi_office_rebuild",
    submittedLabel: "12/08/2026, 18:14:22",
    subtitle:
      "Office rebuild 14 Aug 2026 from the registration form the family supplied - the original upload never reached the server.",
    sections: [
      {
        title: "Requested booking slot",
        rows: [
          ["Service", "Aquatic Activity"],
          ["Venue", "Acton"],
          ["Day", "Monday"],
          ["Time", "5.00 - 5.30"],
          ["Slot id", "live-aquatic-acton-monday-17-00-5-00-5-30"],
        ],
      },
      {
        title: "Parent / guardian",
        rows: [
          ["Name", "Rawda Said"],
          ["Relationship", "Mother"],
          ["Phone", "07476407735"],
          ["Email", "rawda_said@yahoo.co.uk"],
          ["Address", "Flat 8, Kendall House, 199 Warwick Road, London, England"],
          ["Postcode", "W14 8PU"],
        ],
      },
      {
        title: "Participant",
        withPhoto: true,
        rows: [
          ["Name", "Yusuf Harzi"],
          ["Date of birth", "17/09/2016"],
          ["Gender", "Male"],
          ["School / college / residential", "Marlborough primary school"],
        ],
      },
      {
        title: "Medical & support plans",
        rows: [
          ["EHCP", "Yes"],
          [
            "EHCP details",
            "Full 27-page EHC Plan supplied by the family (RBKC, version 5, final 15/07/2024). Autism with speech, language and communication needs, plus ADHD affecting focus and attention. Full plan held on the participant file.",
          ],
          ["Social worker", "No"],
          ["Motivators", "Watching tv, computers, iPads, going out with dad, going out in general"],
          ["Dislikes", "None"],
          ["Medication", "Methylphenidate 10 mg"],
          ["Allergies", "Asthma"],
          ["Medical conditions", "Autism and ADHD"],
          ["Health / emergency plan", "No"],
        ],
      },
      {
        title: "Behaviour",
        rows: [
          ["Triggers", "Loud or unexpected noise; Transitions or changes to routine"],
          [
            "Regulation strategies",
            "Movement / space to pace or jump; Visual support; Supportive adult staying nearby",
          ],
          ["Additional notes", "None"],
          ["Support when regulated", "1to1"],
          ["Support when dysregulated", "Needs adult nearby and occasional guidance"],
        ],
      },
      {
        title: "Communication",
        rows: [
          ["Expressive communication", "Verbal - limited words or scripts"],
          ["Understands instructions", "Verbal instructions only"],
          ["Preferred strategies", "None"],
        ],
      },
      {
        title: "Independence",
        rows: [
          ["Mobility", "Walks independently"],
          ["Personal care", "Fully independent"],
          ["Task engagement", "Can follow a simple routine independently"],
          ["Transitions", "Adapts easily to change"],
          ["Risk awareness", "Understands basic safety rules"],
          ["Anything else", "None"],
        ],
      },
    ],
    bookingRequest: {
      service_name: "Aquatic Activity",
      venue: "Acton",
      day: "Monday",
      time: "5.00 - 5.30",
      slot_id: "live-aquatic-acton-monday-17-00-5-00-5-30",
    },
    noteLine:
      "Office 14 Aug 2026: rebuilt from the family's registration form (participant Yusuf Harzi, was recorded as TBC) with participant photo.",
  },
  {
    key: "Mhd Malaz Bouz Alasal",
    matchPdfPath:
      "client_registration/2026-08-03T08-36-46_Mhd_Malaz_Bouz_Alasal_office_backfill/form.pdf",
    photoAsset: `${ASSETS}/image-cc780e45-0642-4aa8-b822-817248fdf213.png`,
    prefix: "client_registration/2026-08-03T08-36-46_Mhd_Malaz_Bouz_Alasal_office_rebuild",
    submittedLabel: "03/08/2026, 09:36:46",
    subtitle:
      "Office rebuild 14 Aug 2026 from the parent's phone PDF - the original upload never reached the server. Photo supplied by the father.",
    sections: [
      {
        title: "Requested booking slot",
        rows: [
          ["Service", "Aquatic Activity"],
          ["Venue", "Acton"],
          ["Day", "Wednesday"],
          ["Time", "4.00 - 4.30"],
          ["Slot id", "live-aquatic-acton-wednesday-16-00-4-00-4-30"],
        ],
      },
      {
        title: "Parent / guardian",
        rows: [
          ["Name", "Ahmad Bouz Alasal"],
          ["Relationship", "Father"],
          ["Phone", "+447492250684"],
          ["Email (lead / OTP)", "ahmedbozalassal@gmail.com"],
          ["Email (on phone PDF)", "ahmedbozalasal@gmail.com"],
          ["Address", "183 Townmead Road"],
          ["Postcode", "SW6 2JX"],
        ],
      },
      {
        title: "Participant",
        withPhoto: true,
        rows: [
          ["Name", "Mhd Malaz Bouz Alasal"],
          ["Date of birth", "11/04/2003"],
          ["Gender", "Male"],
          ["School / college / residential", "None"],
        ],
      },
      {
        title: "Medical & support plans",
        rows: [
          ["EHCP", "Yes"],
          ["EHCP details", "Autism and learning difficulties"],
          ["Social worker", "Yes"],
          ["Social worker contact", "Grace.Dewey@lbhf.gov.uk"],
          ["Motivators", "Swimming"],
          [
            "Dislikes",
            "Physical touch (for support is ok, but from a complete stranger is a no). Take something away from him is a no for him. And he cares for his stuff if he knows you and you are trying to give it to him is ok but take it away he will start yelling to leave it.",
          ],
          ["Medication", "None"],
          ["Allergies", "None"],
          ["Medical conditions", "None"],
          ["Health / emergency plan", "No"],
        ],
      },
      {
        title: "Behaviour",
        rows: [
          [
            "Triggers",
            "Being told no / denied access; Fatigue or hunger; Physical proximity or touch",
          ],
          [
            "Regulation strategies",
            "Preferred toy or object; Quiet space or break; Supportive adult staying nearby",
          ],
          ["Additional notes", "None"],
          ["Support when regulated", "1to1"],
          ["Support when dysregulated", "Requires continuous supervision when distressed"],
        ],
      },
      {
        title: "Communication",
        rows: [
          [
            "Expressive communication",
            "Mainly communicates through behaviour; Verbal - limited words or scripts",
          ],
          ["Understands instructions", "Verbal + gestures"],
          ["Preferred strategies", "None"],
        ],
      },
      {
        title: "Independence",
        rows: [
          ["Mobility", "Walks independently"],
          [
            "Anything else",
            "Remaining independence fields were below the fold on the phone screenshot - confirm with family if needed.",
          ],
        ],
      },
    ],
    bookingRequest: {
      service_name: "Aquatic Activity",
      venue: "Acton",
      day: "Wednesday",
      time: "4.00 - 4.30",
      slot_id: "live-aquatic-acton-wednesday-16-00-4-00-4-30",
    },
    noteLine:
      "Office 14 Aug 2026: rebuilt PDF with the participant photo supplied by the father.",
  },
];

/* ---------------------------------------------------------------- run ---- */

mkdirSync(PREVIEW_DIR, { recursive: true });
console.log(APPLY ? "APPLY" : "DRY RUN");

for (const job of JOBS) {
  const { data: rows, error } = await admin
    .from("portal_participant_documents")
    .select("id, participant_name, parent_name, pdf_storage_path, photo_storage_path, payload_json, status")
    .eq("pdf_storage_path", job.matchPdfPath);
  if (error) throw new Error(error.message);
  const row = (rows || [])[0];
  if (!row) {
    console.error(`SKIP ${job.key}: no document row at ${job.matchPdfPath}`);
    continue;
  }

  if (!existsSync(job.photoAsset)) {
    console.error(`SKIP ${job.key}: photo asset missing ${job.photoAsset}`);
    continue;
  }
  const photoPng = new Uint8Array(readFileSync(job.photoAsset));

  const pdfBytes = await buildRegistrationPdf({
    submittedLabel: job.submittedLabel,
    subtitle: job.subtitle,
    sections: job.sections,
    photoPng,
  });

  const preview = `${PREVIEW_DIR}/REBUILD_${job.key.replace(/\W+/g, "_")}.pdf`;
  writeFileSync(preview, pdfBytes);

  console.log(
    `${job.key}\n  row ${row.id} (${row.participant_name}, status ${row.status})` +
      `\n  pdf ${pdfBytes.length} bytes -> ${job.prefix}/form.pdf` +
      `\n  photo ${photoPng.length} bytes -> ${job.prefix}/photo.png` +
      (job.newParticipantName ? `\n  rename participant -> ${job.newParticipantName}` : "") +
      `\n  preview ${preview}`,
  );

  if (!APPLY) continue;

  const pdfPath = `${job.prefix}/form.pdf`;
  const photoPath = `${job.prefix}/photo.png`;

  const up1 = await admin.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up1.error) throw new Error(`pdf upload: ${up1.error.message}`);

  const up2 = await admin.storage.from(BUCKET).upload(photoPath, photoPng, {
    contentType: "image/png",
    upsert: true,
  });
  if (up2.error) throw new Error(`photo upload: ${up2.error.message}`);

  const payload = {
    ...((row.payload_json || {}) as Record<string, unknown>),
    booking_request: job.bookingRequest,
    office_rebuild: job.noteLine,
  };
  const patch: Record<string, unknown> = {
    pdf_storage_path: pdfPath,
    photo_storage_path: photoPath,
    payload_json: payload,
  };
  if (job.newParticipantName) patch.participant_name = job.newParticipantName;

  const { error: updErr } = await admin
    .from("portal_participant_documents")
    .update(patch)
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);
  console.log(`  UPDATED row ${row.id}`);
}

if (!APPLY) console.log("\nRe-run with APPLY=1 to upload + update rows.");
