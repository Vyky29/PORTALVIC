/**
 * One-off: add session day/time/venue detail to existing re-enrolment invoice
 * line items, then regenerate their PDFs.
 *
 * Run: npx -y deno run --allow-env --allow-read --allow-net \
 *   database/local-vault/backfill-reenrol-line-item-details.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  serviceKeyFromSlot,
  slotSessionDetail,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import type { ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line
      ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "")
      : "";
  } catch {
    return "";
  }
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, line_items")
  .eq("created_via", "reenrolment")
  .order("created_at", { ascending: true })
  .limit(200);
if (error) throw error;

const targets = (shares || []).filter(
  (row) => Array.isArray(row.line_items) && row.line_items.length > 0,
);
console.log(`${targets.length} re-enrolment invoice(s) with line items.`);

// contact_id → service_key → detail
const detailCache = new Map<string, Map<string, string>>();

async function detailsForContact(contactId: string): Promise<Map<string, string>> {
  const cached = detailCache.get(contactId);
  if (cached) return cached;
  const out = new Map<string, string>();
  const { data: subs } = await admin
    .from("portal_re_enrolment_submissions")
    .select("payload, submitted_at")
    .eq("participant_contact_id", contactId)
    .order("submitted_at", { ascending: false })
    .limit(1);
  const payload = subs?.[0]?.payload as Record<string, unknown> | undefined;
  const slots = Array.isArray(payload?.weekly_slots_snapshot)
    ? (payload.weekly_slots_snapshot as ParsedSlot[])
    : [];
  for (const slot of slots) {
    if (!slot || slot.isDayCentre) continue;
    const key = serviceKeyFromSlot(slot);
    const detail = slotSessionDetail(slot);
    if (!detail) continue;
    const prev = out.get(key);
    out.set(key, prev && !prev.includes(detail) ? `${prev} · ${detail}` : prev || detail);
  }
  detailCache.set(contactId, out);
  return out;
}

let updated = 0;
for (const share of targets) {
  const contactId = String(share.contact_id || "");
  if (!contactId) continue;
  const details = await detailsForContact(contactId);
  if (!details.size) {
    console.log(share.invoice_number, "no slot snapshot — skipped");
    continue;
  }
  let changed = false;
  const lineItems = (share.line_items as Array<Record<string, unknown>>).map((ln) => {
    const key = String(ln.service_key || "");
    const detail = details.get(key);
    if (detail && String(ln.detail || "") !== detail) {
      changed = true;
      return { ...ln, detail };
    }
    return ln;
  });
  if (!changed) {
    console.log(share.invoice_number, "already up to date");
    continue;
  }
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({ line_items: lineItems, updated_at: new Date().toISOString() })
    .eq("id", share.id);
  if (upErr) {
    console.log(share.invoice_number, "update failed:", upErr.message);
    continue;
  }
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log(share.invoice_number, regen.ok ? "detail added + PDF regenerated" : `regen failed: ${regen.error}`);
  if (regen.ok) updated += 1;
}
console.log(`Done — ${updated} invoice(s) updated.`);
