/**
 * Ealing 2026/27 year INV-Ps (3 terms on one invoice) — local review first.
 *
 * Lists / downloads PDFs for office review. Does NOT email unless APPLY=1.
 *
 * Dry-run (list only):
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-ealing-year-invp-review.ts
 *
 * Download PDFs locally:
 *   DOWNLOAD=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-ealing-year-invp-review.ts
 *
 * Email PDFs to info@ (after you have reviewed the folder):
 *   APPLY=1 DOWNLOAD=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-ealing-year-invp-review.ts
 *
 * Optional:
 *   TO=info@clubsensational.org
 *   OUT_DIR=database/local-vault/private/ealing-year-invp-review
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DOWNLOAD = (Deno.env.get("DOWNLOAD") || "") === "1" || APPLY;
const TO = (Deno.env.get("TO") || "info@clubsensational.org").trim();
const OUT_DIR =
  Deno.env.get("OUT_DIR") ||
  "database/local-vault/private/ealing-year-invp-review";
const BUCKET = "documents";
const READY_LIKE = "%ealing_year%";

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
loadEnvFile("database/local-vault/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clean(v: unknown, max = 160): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

type Line = Record<string, unknown>;

function sessionCount(lines: Line[]): number {
  return lines.reduce((n, li) => {
    const q = num(li.quantity ?? li.qty ?? li.sessions);
    return n + (q > 0 ? q : 0);
  }, 0);
}

function linePreview(lines: Line[]): string {
  return lines
    .slice(0, 8)
    .map((li) => {
      const desc = clean(li.description || li.detail || "", 80);
      const q = num(li.quantity ?? li.qty);
      const amt = num(li.amount_gbp ?? li.amount);
      return `${desc}${q ? ` x${q}` : ""}${amt ? ` £${amt}` : ""}`;
    })
    .join(" · ");
}

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, share_status, payment_status, ready_by, billing_term, amount_gbp, line_items, line_description, document_id, contact_id, created_at, updated_at, payment_schedule, reference_text, notes",
  )
  .ilike("ready_by", READY_LIKE)
  .order("invoice_number");
if (error) throw new Error(error.message);

const rows = (shares || []).filter((r) => {
  const st = clean(r.share_status, 40).toLowerCase();
  const pay = clean(r.payment_status, 40).toLowerCase();
  return st === "ready" && pay !== "void";
});

const contactIds = [...new Set(rows.map((r) => clean(r.contact_id, 80)).filter(Boolean))];
const nameByContact = new Map<string, string>();
for (let i = 0; i < contactIds.length; i += 80) {
  const chunk = contactIds.slice(i, i + 80);
  const { data: contacts, error: cErr } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, child_display, child_first_name, child_last_name")
    .in("contact_id", chunk);
  if (cErr) throw new Error(cErr.message);
  for (const c of contacts || []) {
    const name =
      clean(c.child_display, 120) ||
      [c.child_first_name, c.child_last_name].filter(Boolean).join(" ").trim();
    if (c.contact_id && name) nameByContact.set(String(c.contact_id), name);
  }
}

console.log(`\nEaling year INV-Ps (ready, non-void): ${rows.length}`);
console.log(`Marker filter: ready_by ilike '${READY_LIKE}'`);
console.log(`Mode: ${APPLY ? "EMAIL" : DOWNLOAD ? "DOWNLOAD" : "LIST"} → ${TO}\n`);

if (!rows.length) {
  console.log(
    "No ready Ealing year INV-Ps found. Run office-la-nhs-schedule-invps-fix.ts (dry-run then APPLY=1) first.",
  );
  Deno.exit(0);
}

type Downloaded = {
  inv: string;
  client: string;
  total: number;
  sessions: number;
  path: string;
  bytes: number;
  readyBy: string;
};

const downloaded: Downloaded[] = [];
const docIds = rows.map((r) => clean(r.document_id, 80)).filter(Boolean);
const docsById = new Map<string, { file_url: string | null }>();
for (let i = 0; i < docIds.length; i += 80) {
  const chunk = docIds.slice(i, i + 80);
  const { data: docs, error: dErr } = await admin
    .from("documents")
    .select("id, file_url")
    .in("id", chunk);
  if (dErr) throw new Error(dErr.message);
  for (const d of docs || []) {
    docsById.set(String(d.id), { file_url: d.file_url ? String(d.file_url) : null });
  }
}

if (DOWNLOAD) await ensureDir(OUT_DIR);

for (const share of rows) {
  const inv = clean(share.invoice_number || share.id, 80);
  const client =
    nameByContact.get(clean(share.contact_id, 80)) ||
    clean(share.reference_text, 120) ||
    "(contact)";
  const lines = Array.isArray(share.line_items) ? (share.line_items as Line[]) : [];
  const sessions = sessionCount(lines);
  const total = num(share.amount_gbp);
  const sched = Array.isArray(share.payment_schedule) ? share.payment_schedule.length : 0;
  console.log(
    [
      inv,
      client,
      `£${total}`,
      `sessions=${sessions}`,
      `lines=${lines.length}`,
      `bacs_rows=${sched}`,
      clean(share.ready_by, 100),
    ].join(" | "),
  );
  if (lines.length) console.log(`   ${linePreview(lines)}`);
  else if (share.line_description) console.log(`   ${clean(share.line_description, 200)}`);

  if (!DOWNLOAD) continue;

  const doc = docsById.get(clean(share.document_id, 80));
  const storagePath = doc?.file_url ? String(doc.file_url) : "";
  if (!storagePath) {
    console.error(`  FAIL ${inv} missing_file_url`);
    continue;
  }
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
  if (dlErr || !blob) {
    console.error(`  FAIL ${inv} ${dlErr?.message || "download_failed"}`);
    continue;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const safeClient = client.replace(/[^\w.-]+/g, "_").slice(0, 40) || "client";
  const safeInv = inv.replace(/[^\w.-]+/g, "_");
  const fileName = `${safeInv}__${safeClient}.pdf`;
  const outPath = join(OUT_DIR, fileName);
  await Deno.writeFile(outPath, bytes);
  downloaded.push({
    inv,
    client,
    total,
    sessions,
    path: outPath,
    bytes: bytes.byteLength,
    readyBy: clean(share.ready_by, 120),
  });
  console.log(`  OK → ${outPath} (${bytes.byteLength} bytes)`);
}

const manifest = {
  generated_at: new Date().toISOString(),
  out_dir: OUT_DIR,
  count: downloaded.length,
  apply_email: APPLY,
  to: TO,
  rows: downloaded,
};
if (DOWNLOAD) {
  await Deno.writeTextFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`\nWrote ${downloaded.length} PDFs → ${OUT_DIR}`);
  console.log(`Manifest → ${join(OUT_DIR, "manifest.json")}`);
}

if (!APPLY) {
  console.log(
    "\nReview the PDFs locally. When happy:\n  APPLY=1 DOWNLOAD=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write database/local-vault/office-ealing-year-invp-review.ts",
  );
  Deno.exit(0);
}

if (!downloaded.length) {
  console.error("Nothing to email.");
  Deno.exit(1);
}

const smtp = readParentNotifySmtpConfig();
if (!smtp?.host) {
  console.error("SMTP not configured (parent notify / secrets).");
  Deno.exit(1);
}

const subject =
  `Ealing 2026/27 year invoices (${downloaded.length}) — 3 terms / total sessions`;
const body =
  `Please find attached the Ealing Care in Finance / CWD year INV-Ps for 2026/27.\n\n` +
  `Each PDF is one invoice covering Autumn + Spring + Summer (total sessions shown on the lines).\n\n` +
  downloaded
    .map(
      (d) =>
        `• ${d.inv} · ${d.client} · £${d.total} · ~${d.sessions} session units`,
    )
    .join("\n") +
  `\n\nGenerated ${manifest.generated_at}\n`;

const attachments = await Promise.all(
  downloaded.map(async (d) => ({
    filename: d.path.split("/").pop() || `${d.inv}.pdf`,
    contentType: "application/pdf",
    content: await Deno.readFile(d.path),
  })),
);

await sendEmailWithAttachmentViaSmtp({
  to: TO,
  subject,
  text: body,
  attachments,
});

console.log(`\nEmailed ${attachments.length} PDFs → ${TO}`);
