import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  const f = path.join(root, "local-secrets/secrets.env");
  if (existsSync(f)) {
    const line = readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const admin = createClient(
  readEnv("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: shares } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, document_id, reference_text")
  .eq("contact_id", "58")
  .order("created_at", { ascending: true });

for (const s of shares || []) {
  const { data: doc } = await admin
    .from("documents")
    .select("id, title, document_type")
    .eq("id", s.document_id)
    .maybeSingle();
  console.log(s.invoice_number, "|", s.reference_text, "| doc title:", doc?.title, "| type:", doc?.document_type);
}
