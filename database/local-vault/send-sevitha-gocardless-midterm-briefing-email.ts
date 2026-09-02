/**
 * Email Sevitha / office briefing: finish-booking GoCardless mid-term (pro-rata + bank + GC).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/send-sevitha-gocardless-midterm-briefing-email.ts
 *
 * Optional: TO=info@clubsensational.org
 */
import {
  plainTextToHtml,
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const TO = (Deno.env.get("TO") || "info@clubsensational.org").trim();
const DOC_PATH =
  Deno.env.get("DOC_PATH") ||
  "docs/office-briefing-finish-booking-gocardless-midterm-2026-09.md";

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
loadEnvFile("database/local-vault/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const docText = Deno.readTextFileSync(DOC_PATH);
const encoder = new TextEncoder();
const contentBase64 = btoa(
  Array.from(encoder.encode(docText), (b) => String.fromCharCode(b)).join(""),
);

const subject =
  "Office briefing: Finish booking + GoCardless mid-term (pro-rata, bank + DD on the 1sts)";

const bodyText = [
  "Hi Sevitha,",
  "",
  "Please find attached a short English briefing on how finish-booking works when families join mid-term and choose GoCardless.",
  "",
  "Key points:",
  "1) Only remaining sessions are billed (pro-rata).",
  "2) GoCardless collections stay on the 1st of each month for everyone (one batch / fees).",
  "3) If they finish after this month's 1st: they pay this month's share by bank transfer NOW, and also set up GoCardless for later months.",
  "4) Office role for the bank part: check Tide, mark paid, then send PIN. No need to walk them through payment choices beyond accepting the place.",
  "",
  "Full detail is in the attached file.",
  "",
  "Thanks,",
  "Portal / Victor",
].join("\n");

console.log(`To: ${TO}`);
console.log(`Subject: ${subject}`);
console.log(`Attachment: ${DOC_PATH} (${docText.length} chars)`);

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1 to send.");
  Deno.exit(0);
}

const smtp = readParentNotifySmtpConfig();
if (!smtp) {
  console.error("SMTP not configured (need SMTP_HOST / SMTP_USER / SMTP_PASS).");
  Deno.exit(1);
}

const mail = await sendEmailWithAttachmentViaSmtp({
  config: smtp,
  to: [TO],
  subject,
  html: plainTextToHtml(bodyText),
  replyTo: "info@clubsensational.org",
  attachment: {
    filename: "finish-booking-gocardless-midterm-briefing-2026-09.md",
    contentBase64,
    mimeType: "text/markdown; charset=UTF-8",
  },
});

if (!mail.ok) {
  console.error("Send failed:", mail.error, mail.detail || "");
  Deno.exit(1);
}

console.log("Sent OK →", TO);
