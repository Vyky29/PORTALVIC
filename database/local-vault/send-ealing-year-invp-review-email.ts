/**
 * Email Ealing 2026/27 year INV-P PDFs to office for manual forwarding.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/send-ealing-year-invp-review-email.ts
 *
 * Optional:
 *   TO=info@clubsensational.org
 *   OUT_DIR=database/local-vault/private/ealing-year-invp-review
 */
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  plainTextToHtml,
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const TO = (Deno.env.get("TO") || "info@clubsensational.org").trim();
const OUT_DIR =
  Deno.env.get("OUT_DIR") ||
  "database/local-vault/private/ealing-year-invp-review";

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

function invNumFromName(name: string): number {
  const m = name.match(/^INV-P-(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function clientKeyFromName(name: string): string {
  const parts = name.replace(/\.pdf$/i, "").split("__");
  return parts.length > 1 ? parts.slice(1).join("__") : name;
}

const dirEntries: Array<{ name: string }> = [];
for await (const entry of Deno.readDir(OUT_DIR)) {
  if (entry.isFile && entry.name.toLowerCase().endsWith(".pdf")) {
    dirEntries.push({ name: entry.name });
  }
}

const byClient = new Map<string, { name: string; inv: number }>();
for (const { name } of dirEntries) {
  const inv = invNumFromName(name);
  if (!inv) continue;
  const client = clientKeyFromName(name);
  const prev = byClient.get(client);
  if (!prev || inv > prev.inv) byClient.set(client, { name, inv });
}

const picked = [...byClient.values()].sort((a, b) => a.inv - b.inv);
if (!picked.length) {
  console.error(`No PDFs found in ${OUT_DIR}.`);
  Deno.exit(1);
}

console.log(`Found ${picked.length} Ealing year INV-P PDFs:`);
for (const p of picked) console.log(`  ${p.name}`);

if (!APPLY) {
  console.log(`\nDry run. Re-run with APPLY=1 to email → ${TO}`);
  Deno.exit(0);
}

const smtp = readParentNotifySmtpConfig();
if (!smtp?.host) {
  console.error("SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS in secrets).");
  Deno.exit(1);
}

const attachments = await Promise.all(
  picked.map(async (p) => {
    const bytes = await Deno.readFile(join(OUT_DIR, p.name));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return {
      filename: p.name,
      contentBase64: btoa(bin),
      mimeType: "application/pdf",
    };
  }),
);

const bodyText =
  `Ealing 2026/27 year invoices (Care in Finance / CWD).\n\n` +
  `Each PDF covers Autumn + Spring + Summer on one invoice (total sessions on the lines).\n\n` +
  `Please forward manually to Ealing as needed.\n\n` +
  picked.map((p) => `• ${p.name.replace(/\.pdf$/i, "").replace(/__/g, " · ")}`).join("\n") +
  `\n\nGenerated ${new Date().toISOString()}\n`;

const mail = await sendEmailWithAttachmentViaSmtp({
  config: smtp,
  to: [TO],
  subject: `Ealing 2026/27 year invoices (${picked.length}) — manual send`,
  html: plainTextToHtml(bodyText),
  replyTo: "info@clubsensational.org",
  attachments,
});

if (!mail.ok) {
  console.error("Email failed:", mail.error);
  Deno.exit(1);
}

console.log(`\nEmailed ${attachments.length} PDFs → ${TO}`);
