/**
 * One-off: rebuild visible re-enrolment term invoice service lines from the
 * submitted weekly-slot snapshot, add exact term dates, and regenerate PDFs.
 *
 * Dry run by default. Set APPLY=1 to update Portal.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildReenrolTermLineItems,
  loadProductMap,
  type PortalInvoiceLineItem,
  xeroItemCodeForService,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { unitPriceFor, type ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import type { PortalInvoiceVatMode } from "../../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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

type TermKey = "autumn" | "spring" | "summer";
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function termFromRow(row: Record<string, unknown>): TermKey | null {
  const s = `${row.billing_term || ""} ${row.reference_text || ""}`.toLowerCase();
  if (s.includes("autumn")) return "autumn";
  if (s.includes("spring")) return "spring";
  if (s.includes("summer")) return "summer";
  return null;
}
function linesTotal(lines: PortalInvoiceLineItem[]): number {
  return round2(lines.reduce((sum, line) => sum + Number(line.amount_gbp || 0), 0));
}

const SLOT_PRICE_OVERRIDES: Record<string, Array<{ match: RegExp; unit: number }>> = {
  "39": [{ match: /MULTI|S&C|MA/i, unit: 120 }],
};
function pricedSlots(contactId: string, slots: ParsedSlot[], catalog: boolean): ParsedSlot[] {
  const overrides = SLOT_PRICE_OVERRIDES[contactId] || [];
  return slots.map((slot) => {
    if (!slot || slot.isDayCentre) return slot;
    const override = overrides.find((rule) => rule.match.test(String(slot.serviceType || "")));
    const unit = override?.unit ||
      (catalog ? unitPriceFor(slot.serviceType || "", slot.durationMin || 30) : slot.pricePerSession);
    if (!Number.isFinite(Number(unit)) || Number(unit) <= 0) return slot;
    const sessions = slot.sessions || { autumn: 0, spring: 0, summer: 0, annual: 0 };
    return {
      ...slot,
      pricePerSession: Number(unit),
      termTotals: {
        autumn: round2(Number(sessions.autumn || 0) * Number(unit)),
        spring: round2(Number(sessions.spring || 0) * Number(unit)),
        summer: round2(Number(sessions.summer || 0) * Number(unit)),
        annual: round2(Number(sessions.annual || 0) * Number(unit)),
      },
    };
  });
}

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,invoice_number,contact_id,amount_gbp,billing_term,reference_text,vat_mode,line_items",
  )
  .eq("created_via", "reenrolment")
  .eq("share_status", "ready")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

const productMap = await loadProductMap(admin);
const submissionCache = new Map<string, {
  slots: ParsedSlot[];
  weeklyChoices: Record<string, { choice?: string }> | null;
} | null>();

async function submissionFor(contactId: string) {
  if (submissionCache.has(contactId)) return submissionCache.get(contactId)!;
  const { data } = await admin
    .from("portal_re_enrolment_submissions")
    .select("payload")
    .eq("participant_contact_id", contactId)
    .order("submitted_at", { ascending: false })
    .limit(1);
  const payload = data?.[0]?.payload as Record<string, unknown> | undefined;
  const slots = Array.isArray(payload?.weekly_slots_snapshot)
    ? payload.weekly_slots_snapshot as ParsedSlot[]
    : [];
  const choices = payload?.choices as Record<string, unknown> | undefined;
  const weeklyChoices =
    choices?.weekly && typeof choices.weekly === "object"
      ? choices.weekly as Record<string, { choice?: string }>
      : null;
  const result = slots.length ? { slots, weeklyChoices } : null;
  submissionCache.set(contactId, result);
  return result;
}

let updated = 0;
let skipped = 0;
let failed = 0;
for (const raw of shares || []) {
  const row = raw as Record<string, unknown>;
  const contactId = String(row.contact_id || "");
  const term = termFromRow(row);
  const submission = await submissionFor(contactId);
  if (!term || !submission) {
    console.log(`${row.invoice_number}: missing ${!term ? "term" : "submission"} — skipped`);
    skipped++;
    continue;
  }
  const vatMode: PortalInvoiceVatMode =
    String(row.vat_mode || "").toLowerCase() === "exempt" ? "exempt" : "vat_20";
  const existing = Array.isArray(row.line_items)
    ? row.line_items as PortalInvoiceLineItem[]
    : [];
  const existingServiceTotal = linesTotal(
    existing.filter((line) => line.service_key !== "GC_FEE" && line.service_key !== "CREDIT"),
  );
  const snapLines = buildReenrolTermLineItems({
    slots: pricedSlots(contactId, submission.slots, false),
    weeklyChoices: submission.weeklyChoices,
    term,
    vatMode,
    productMap,
  });
  const catalogLines = buildReenrolTermLineItems({
    slots: pricedSlots(contactId, submission.slots, true),
    weeklyChoices: submission.weeklyChoices,
    term,
    vatMode,
    productMap,
  });
  const useCatalog =
    Math.abs(linesTotal(catalogLines) - existingServiceTotal) + 0.005 <
      Math.abs(linesTotal(snapLines) - existingServiceTotal);
  const lines = (useCatalog ? catalogLines : snapLines).map((line) => ({ ...line }));

  const existingFee = existing.filter((line) => line.service_key === "GC_FEE");
  if (existingFee.length) {
    const qty = round2(existingFee.reduce((sum, line) => sum + Number(line.quantity || 0), 0));
    const amount = linesTotal(existingFee);
    lines.push({
      service_key: "GC_FEE",
      description: "Direct Payment (GoCardless) fee",
      detail: null,
      dates: null,
      quantity: qty,
      unit_price_gbp: qty ? round2(amount / qty) : 1.5,
      amount_gbp: amount,
      xero_item_code: xeroItemCodeForService(productMap.get("GC_FEE"), vatMode),
    });
  }
  const existingCredits = existing.filter((line) => line.service_key === "CREDIT");
  lines.push(...existingCredits.map((line) => ({ ...line })));

  console.log(
    `${row.invoice_number}: ${term} · ${lines.length} line(s) · ` +
      lines.map((line) => `${line.description} ×${line.quantity}`).join(" | "),
  );
  if (!APPLY) continue;
  const { error: updateError } = await admin
    .from("portal_parent_invoice_share")
    .update({ line_items: lines, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updateError) {
    console.log(`  update failed: ${updateError.message}`);
    failed++;
    continue;
  }
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
  if (!regen.ok) {
    console.log(`  PDF failed: ${regen.error}`);
    failed++;
  } else {
    updated++;
  }
}
console.log(
  APPLY
    ? `Done — ${updated} updated, ${skipped} skipped, ${failed} failed.`
    : `Dry run — ${shares?.length || 0} visible term invoice(s).`,
);
