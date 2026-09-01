/**
 * Download current ready (non-void) INV-P PDFs from Storage into
 * database/local-vault/private/invoice-pdfs-good/ (gitignored).
 *
 *   npx --yes deno run -A database/local-vault/download-good-invoice-pdfs.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const OUT = "database/local-vault/private/invoice-pdfs-good";
const BUCKET = "documents";

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

await ensureDir(OUT);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, document_id, payment_status, updated_at")
  .eq("share_status", "ready")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

const rows = shares || [];
const docIds = rows.map((r) => String(r.document_id || "")).filter(Boolean);
const docsById = new Map<string, { file_url: string | null; title: string | null }>();

for (let i = 0; i < docIds.length; i += 100) {
  const chunk = docIds.slice(i, i + 100);
  const { data: docs, error: dErr } = await admin
    .from("documents")
    .select("id, file_url, title")
    .in("id", chunk);
  if (dErr) throw dErr;
  for (const d of docs || []) {
    docsById.set(String(d.id), {
      file_url: d.file_url ? String(d.file_url) : null,
      title: d.title ? String(d.title) : null,
    });
  }
}

const report: Array<{
  inv: string;
  ok: boolean;
  path?: string;
  bytes?: number;
  detail?: string;
}> = [];

for (const share of rows) {
  const inv = String(share.invoice_number || share.id).trim();
  const doc = docsById.get(String(share.document_id || ""));
  const storagePath = doc?.file_url ? String(doc.file_url) : "";
  if (!storagePath) {
    report.push({ inv, ok: false, detail: "missing_file_url" });
    console.error("FAIL", inv, "missing_file_url");
    continue;
  }
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
  if (dlErr || !blob) {
    report.push({ inv, ok: false, detail: dlErr?.message || "download_failed" });
    console.error("FAIL", inv, dlErr?.message || "download_failed");
    continue;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const safeInv = inv.replace(/[^\w.-]+/g, "_");
  const fileName = `${safeInv}.pdf`;
  const outPath = join(OUT, fileName);
  await Deno.writeFile(outPath, bytes);
  report.push({ inv, ok: true, path: outPath, bytes: bytes.byteLength });
  console.log("OK", inv, bytes.byteLength);
}

const ok = report.filter((r) => r.ok);
const fail = report.filter((r) => !r.ok);
const manifest = {
  downloaded_at: new Date().toISOString(),
  out_dir: OUT,
  ok_n: ok.length,
  fail_n: fail.length,
  fails: fail,
  files: ok.map((r) => ({ inv: r.inv, path: r.path, bytes: r.bytes })),
};
await Deno.writeTextFile(join(OUT, "_manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ok_n: ok.length, fail_n: fail.length, out: OUT }, null, 2));
