/**
 * Read only. Where does Amar-Rai's authority client ID live (expect Ealing 626186; "130" seen on INV-P-0330)?
 * client_payments rows, contact / participant rows, his funder INV-Ps.
 *
 *   npx -y deno run -A database/local-vault/office-amar-rai-client-id-scan-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function loadEnv(path: string) {
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
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const idish = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => /client.?id|cfk|^po$|funder|ref/i.test(k) || /\b(130|626186)\b/.test(String(v))));

const { data: cp } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, sheet, data, imported_at")
  .or("client_key.ilike.%amar%,client_name.ilike.%amar%");
console.log("client_payments:");
for (const r of cp || []) console.log(`  ${r.id} | ${r.client_key} | ${r.client_name} | ${r.sheet} | ${JSON.stringify(idish(r.data as Record<string, unknown>))}`);

const { data: pax } = await admin
  .from("portal_participants")
  .select("*")
  .or("display_name.ilike.%amar%,first_name.ilike.%amar%");
console.log("portal_participants:");
const contactIds: string[] = [];
for (const p of pax || []) {
  contactIds.push(p.contact_id);
  console.log(`  ${p.contact_id} | ${p.display_name} | ${JSON.stringify(idish(p as Record<string, unknown>))}`);
}

if (contactIds.length) {
  const { data: pc } = await admin.from("portal_parent_contacts").select("*").in("contact_id", contactIds);
  console.log("portal_parent_contacts:");
  for (const c of pc || []) console.log(`  ${c.contact_id} | ${c.funding_label} | ${JSON.stringify(idish(c as Record<string, unknown>))}`);

  const { data: inv } = await admin
    .from("portal_parent_invoice_share")
    .select("invoice_number, payment_status, share_status, payment_method_hint, reference_text, ready_by, xero_invoice_id, line_description, notes")
    .in("contact_id", contactIds)
    .order("invoice_number");
  console.log("invoices:");
  for (const i of inv || []) {
    const blob = `${i.line_description || ""} ${i.notes || ""}`;
    const ids = [...blob.matchAll(/client'?s? ?id:?\s*([A-Z0-9]+)/gi)].map((m) => m[1]);
    console.log(
      `  ${i.invoice_number} | ${i.reference_text} | ${i.payment_status}/${i.share_status} | ${i.payment_method_hint} | xero ${i.xero_invoice_id ? "yes" : "-"} | ids in text ${JSON.stringify(ids)} | ${i.ready_by}`,
    );
  }
}
