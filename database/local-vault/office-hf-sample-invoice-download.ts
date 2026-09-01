/**
 * Download one H&F monthly INV-P PDF for Victor to review.
 *   SAMPLE=INV-P-0308 npx -y deno run -A database/local-vault/office-hf-sample-invoice-download.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

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
  { auth: { persistSession: false } },
);

const SAMPLE = (Deno.env.get("SAMPLE") || "INV-P-0308").trim();
const OUT_DIR = "database/local-vault/private/hf-monthly-sample";

type Share = Record<string, unknown>;

let share: Share | null = null;
{
  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .eq("invoice_number", SAMPLE)
    .maybeSingle();
  if (error) throw error;
  share = data;
}
if (!share) {
  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .like("ready_by", "office_funder_2627_hf_month_2026-09_%")
    .neq("payment_status", "void")
    .order("invoice_number")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  share = data;
}
if (!share) throw new Error("No H&F monthly share found");

await ensureDir(OUT_DIR);

console.log("\n=== FACTURA MUESTRA (mensual H&F, tras refresh cabecera) ===\n");
console.log("INV-P:", share.invoice_number);
console.log("Cliente:", share.notes?.toString().match(/· ([^·]+) · office funder/)?.[1] || "(H&F LA)");
console.log("Mes:", share.reference_text);
console.log("Importe:", "£" + share.amount_gbp);
console.log("Vencimiento:", share.due_date);
console.log("Client ID:", "(en PDF / funding row)");
console.log("PO:", "(en PDF / funding row)");
console.log("Tipo:", share.ready_by);
console.log("\n--- Cabecera PDF (de notes [[hf:...]]) ---");
const hdr = String(share.notes || "").match(/\[\[hf:([^\]]+)\]\]/i);
if (hdr) {
  for (const part of hdr[1].split("|")) console.log(" ", part.replace("=", ": "));
} else console.log(" (sin marcador hf)");
console.log("\n--- Cuerpo factura (line_description) ---\n");
console.log(String(share.line_description || "").slice(0, 1200));

let pdfLocal = "";
if (share.document_id) {
  const { data: doc } = await admin
    .from("documents")
    .select("file_url")
    .eq("id", share.document_id)
    .maybeSingle();
  const storagePath = String(doc?.file_url || "");
  if (storagePath) {
    const { data: blob, error: dlErr } = await admin.storage
      .from("documents")
      .download(storagePath);
    if (dlErr) console.error("\nPDF download error:", dlErr.message);
    else {
      pdfLocal = `${OUT_DIR}/${share.invoice_number}-mensual-hf.pdf`;
      await Deno.writeFile(pdfLocal, new Uint8Array(await blob.arrayBuffer()));
      console.log("\nPDF guardado:", pdfLocal);
    }
  }
}

await Deno.writeTextFile(
  `${OUT_DIR}/LEEME.txt`,
  [
    "Factura mensual H&F de ejemplo (NO borrador anual).",
    "",
    `Archivo: ${share.invoice_number}-mensual-hf.pdf`,
    `Cliente: ver notes / admin`,
    `Importe: £${share.amount_gbp} · ${share.reference_text}`,
    "",
    "Si te gusta este formato -> dejamos las 77 mensuales como estan.",
    "Si no -> dime que cambiar o revertimos.",
    "",
    "Abrir PDF:",
    `  open "${pdfLocal || OUT_DIR + "/" + share.invoice_number + "-mensual-hf.pdf"}"`,
  ].join("\n"),
);

console.log("\nAbre el PDF con:");
console.log(`  open "${pdfLocal}"`);
