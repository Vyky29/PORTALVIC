/**
 * Read only. For every office funder INV-P (ready_by office_funder_...), compare LA bill-to + client ID/PO
 * resolved without vs with the ready_by funder key. Lists only invoices that change.
 *
 *   npx -y deno run -A database/local-vault/office-funder-key-billto-diff-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  funderClientKeyFromReadyBy,
  resolveLaFunderBillTo,
  resolveParticipantInvoiceFunding,
} from "../../supabase/functions/_shared/portal_invoice_funding.ts";

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

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, contact_id, ready_by, payment_method_hint, payment_status")
  .like("ready_by", "office_funder_%")
  .eq("payment_method_hint", "la_funded")
  .neq("payment_status", "void");
if (error) throw error;

const names = new Map<string, string>();
const cids = [...new Set((rows || []).map((r) => r.contact_id))];
const { data: pax } = await admin.from("portal_participants").select("contact_id, display_name, first_name, last_name").in("contact_id", cids);
for (const p of pax || []) names.set(p.contact_id, p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" "));

const cache = new Map<string, string>();
let changed = 0;
for (const r of rows || []) {
  const key = funderClientKeyFromReadyBy(r.ready_by);
  if (!key) continue;
  const displayName = names.get(r.contact_id) || r.contact_id;
  const sig = async (k: string | null) => {
    const ck = `${r.contact_id}|${k}`;
    if (cache.has(ck)) return cache.get(ck)!;
    const b = await resolveLaFunderBillTo(admin, { contactId: r.contact_id, displayName, funderClientKey: k });
    const f = await resolveParticipantInvoiceFunding(admin, { contactId: r.contact_id, displayName, funderClientKey: k });
    const s = `${b.name} | ${f.clientId} | ${f.po}`;
    cache.set(ck, s);
    return s;
  };
  const before = await sig(null);
  const after = await sig(key);
  if (before !== after) {
    changed++;
    console.log(`${r.invoice_number} (${r.payment_status}) key ${key}\n   before: ${before}\n   after:  ${after}`);
  }
}
console.log(`funder INV-Ps checked: ${(rows || []).length}, changed: ${changed}`);
