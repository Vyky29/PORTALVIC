/**
 * Send Roberto Reali settlement briefing via email (SMTP) + WhatsApp (Meta).
 *
 * Contacts from staff_profiles (not invented):
 *   email_personal = rob.rea04@gmail.com
 *   phone_e164     = +447827567963
 *
 *   npx -y deno run --node-modules-dir=auto --allow-env --allow-read --allow-net \
 *     --allow-write --allow-run --allow-sys \
 *     database/local-vault/send-roberto-settlement-email-wa.ts
 *
 *   APPLY=1 ...   # actually send
 */
import puppeteer from "npm:puppeteer-core@24.10.0";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
  sendParentMessageViaWhatsapp,
  normalizeParentPhoneE164,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";
import {
  uploadWhatsappMediaBinary,
  sendWhatsappMediaById,
} from "../../supabase/functions/_shared/portal_whatsapp_media.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const TO_EMAIL = (Deno.env.get("TO") || "rob.rea04@gmail.com").trim();
const TO_PHONE_RAW = (Deno.env.get("TO_PHONE") || "+447827567963").trim();
const CHROME =
  Deno.env.get("CHROME_PATH") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function loadEnvFile(filePath: string) {
  try {
    for (const line of Deno.readTextFileSync(filePath).split(/\r?\n/)) {
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
loadEnvFile("database/local-vault/secrets.env");

const ROOT = Deno.cwd();
const HTML_PATH = path.join(ROOT, "docs/finance/roberto-cobrado-briefing-2026.html");
const OUT_DIR = path.join(ROOT, "database/local-vault/tmp/roberto-settlement");
mkdirSync(OUT_DIR, { recursive: true });

const SUBJECT = "Settlement / Liquidazione - July-August 2026";
const SETTLEMENT = "£4,447.34";

const emailHtml = [
  "<p>Ciao Roberto,</p>",
  "<p>Ti inviamo il documento di <strong>liquidazione / settlement</strong> aggiornato al 29 luglio 2026.</p>",
  `<p><strong>Importo a pagare: ${SETTLEMENT}</strong></p>`,
  "<p>In allegato trovi:</p>",
  "<ul>",
  "<li>il briefing HTML (con pulsanti <strong>EN / ES / IT</strong> in alto per cambiare lingua)</li>",
  "<li>una versione PDF dello stesso documento</li>",
  "</ul>",
  "<p>Riepilogo breve:</p>",
  "<ul>",
  "<li>Contratto £26k / 32 h/sett — Agosto incluso (pro-rata 12 mesi)</li>",
  "<li>Overclaim netto compensato con extras 17–31 luglio</li>",
  `<li>Saldo settlement: <strong>${SETTLEMENT}</strong></li>`,
  "</ul>",
  "<p><em>EN/ES:</em> Open the attached HTML and use the language buttons (EN / ES / IT) at the top. / Abre el HTML adjunto y usa los botones de idioma arriba.</p>",
  "<p>Se hai domande, rispondi pure a questa email.</p>",
  "<p>Grazie,<br>clubSENsational — Office</p>",
].join("\n");

const waBody =
  `Ciao Roberto,\n\n` +
  `LIQUIDAZIONE / SETTLEMENT (agg. 29 lug 2026)\n\n` +
  `Importo a pagare: ${SETTLEMENT}\n\n` +
  `Ti abbiamo inviato per email il briefing completo (HTML + PDF) con pulsanti EN/ES/IT.\n` +
  `Qui sotto trovi anche il PDF in allegato WhatsApp (se la sessione lo permette).\n\n` +
  `Riepilogo: contratto £26k/32h (Agosto incluso); overclaim compensato con extras 17–31 lug; saldo ${SETTLEMENT}.\n\n` +
  `Grazie,\nclubSENsational — Office`;

console.log("Generating PDF from", HTML_PATH);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

const pdfFilename = "Roberto-Reali-Liquidazione-Settlement-2026.pdf";
const htmlFilename = "roberto-cobrado-briefing-2026.html";
let pdfBytes: Uint8Array;
let pdfPath: string;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1600, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(HTML_PATH).href, {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  // Prefer Italian for the print/PDF
  await page.evaluate(() => {
    const btn = document.querySelector('.lang-btn[data-lang="it"]') as HTMLButtonElement | null;
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  pdfBytes = new Uint8Array(
    await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    }),
  );
  pdfPath = path.join(OUT_DIR, pdfFilename);
  writeFileSync(pdfPath, pdfBytes);
  console.log("PDF written", pdfPath, pdfBytes.length, "bytes");
} finally {
  await browser.close();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

const htmlBytes = new Uint8Array(readFileSync(HTML_PATH));
const htmlB64 = bytesToBase64(htmlBytes);
const pdfB64 = bytesToBase64(pdfBytes);

const smtp = readParentNotifySmtpConfig();
const mailFromAddr =
  (Deno.env.get("PORTAL_MAIL_FROM") || "").trim() || "admin@clubsensational.org";
const fromHeader = mailFromAddr.includes("<")
  ? mailFromAddr
  : `clubSENsational <${mailFromAddr}>`;
const replyTo =
  (Deno.env.get("PORTAL_MAIL_REPLY_TO") || "").trim() || "info@clubsensational.org";

const phone = normalizeParentPhoneE164(TO_PHONE_RAW);

const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  apply: APPLY,
  to_email: TO_EMAIL,
  to_phone: phone,
  from: fromHeader,
  replyTo,
  subject: SUBJECT,
  settlement: SETTLEMENT,
  pdfPath,
  pdfBytes: pdfBytes.length,
  email: null as null | Record<string, unknown>,
  whatsapp_text: null as null | Record<string, unknown>,
  whatsapp_pdf: null as null | Record<string, unknown>,
};

if (!smtp) {
  console.error("SMTP not configured (SMTP_HOST/USER/PASS)");
  writeFileSync(path.join(OUT_DIR, "send-report.json"), JSON.stringify(report, null, 2));
  Deno.exit(1);
}

if (!APPLY) {
  console.log("Dry run — set APPLY=1 to send email + WhatsApp");
  console.log(JSON.stringify({
    to_email: TO_EMAIL,
    to_phone: phone,
    from: fromHeader,
    subject: SUBJECT,
    pdfBytes: pdfBytes.length,
    waPreview: waBody.slice(0, 200) + "…",
  }, null, 2));
  writeFileSync(path.join(OUT_DIR, "send-report.json"), JSON.stringify(report, null, 2));
  Deno.exit(0);
}

// --- Email ---
const mail = await sendEmailWithAttachmentViaSmtp({
  config: smtp,
  to: [TO_EMAIL],
  subject: SUBJECT,
  html: emailHtml,
  replyTo,
  fromOverride: fromHeader,
  attachments: [
    {
      filename: htmlFilename,
      contentBase64: htmlB64,
      mimeType: "text/html; charset=utf-8",
    },
    {
      filename: pdfFilename,
      contentBase64: pdfB64,
      mimeType: "application/pdf",
    },
  ],
});
report.email = {
  ok: !!mail.ok,
  id: mail.ok ? mail.id : undefined,
  error: mail.ok ? undefined : mail.error,
};
console.log("EMAIL", report.email);

// --- WhatsApp text (template) ---
if (!phone) {
  report.whatsapp_text = { ok: false, error: "no_phone" };
  report.whatsapp_pdf = { ok: false, error: "no_phone" };
} else {
  const waText = await sendParentMessageViaWhatsapp(phone, waBody, {
    kind: "staff_contact_update",
  });
  report.whatsapp_text = {
    ok: !!waText.ok,
    id: waText.ok ? waText.id : undefined,
    error: waText.ok ? undefined : waText.error,
  };
  console.log("WA TEXT", report.whatsapp_text);

  // --- WhatsApp PDF document (needs open session; try anyway after template) ---
  await new Promise((r) => setTimeout(r, 800));
  const uploaded = await uploadWhatsappMediaBinary(
    pdfBytes,
    "application/pdf",
    pdfFilename,
  );
  if (!uploaded.ok) {
    report.whatsapp_pdf = { ok: false, error: uploaded.error };
    console.log("WA PDF upload", report.whatsapp_pdf);
  } else {
    const waPdf = await sendWhatsappMediaById(phone, "document", uploaded.id, {
      caption: `Liquidazione ${SETTLEMENT} — PDF (IT). Dettaglio completo anche via email.`,
      filename: pdfFilename,
      contextWaId: waText.ok ? waText.id : undefined,
    });
    report.whatsapp_pdf = {
      ok: !!waPdf.ok,
      id: waPdf.ok ? waPdf.id : undefined,
      error: waPdf.ok ? undefined : waPdf.error,
      mediaId: uploaded.id,
    };
    console.log("WA PDF", report.whatsapp_pdf);
  }
}

writeFileSync(path.join(OUT_DIR, "send-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const emailOk = !!(report.email as { ok?: boolean })?.ok;
const waOk = !!(report.whatsapp_text as { ok?: boolean })?.ok;
if (!emailOk || !waOk) Deno.exit(1);
