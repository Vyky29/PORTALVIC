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

const n = Deno.args[0] || "INV-P-0079";
const { data: share } = await admin
  .from("portal_parent_invoice_share")
  .select("document_id, invoice_number, line_items, line_description")
  .eq("invoice_number", n)
  .maybeSingle();
if (!share) throw new Error("not found");
const { data: doc } = await admin
  .from("documents")
  .select("file_url")
  .eq("id", share.document_id)
  .maybeSingle();
const { data: blob, error } = await admin.storage.from("documents").download(String(doc!.file_url));
if (error) throw error;
await Deno.writeFile(`database/local-vault/tmp/${n}.pdf`, new Uint8Array(await blob!.arrayBuffer()));
console.log("saved", `database/local-vault/tmp/${n}.pdf`);
console.log(JSON.stringify(share.line_items, null, 2));
