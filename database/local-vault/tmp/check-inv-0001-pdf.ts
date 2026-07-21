import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: share } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, document_id")
  .eq("invoice_number", "INV-P-0001")
  .maybeSingle();
const { data: doc } = await admin
  .from("documents")
  .select("file_url")
  .eq("id", share!.document_id)
  .maybeSingle();
const dl = await admin.storage.from("documents").download(String(doc!.file_url));
if (dl.error) throw dl.error;
await Deno.writeFile(
  "database/local-vault/tmp/inv-p-0001.pdf",
  new Uint8Array(await dl.data.arrayBuffer()),
);
console.log("saved", doc!.file_url);
