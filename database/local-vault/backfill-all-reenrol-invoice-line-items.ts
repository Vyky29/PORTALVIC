/**
 * Backfill: give every re-enrolment invoice per-service Xero line items
 * (description + session detail + qty/unit) like Serine's INV-P-0087, then
 * regenerate PDFs.
 *
 * - Groups each contact's non-void re-enrolment invoices by term (from the
 *   reference text), rebuilds full-term service lines from the re-enrolment
 *   weekly-slots snapshot, and splits them across the term's instalments.
 * - Uses catalog pricing when the snapshot totals don't match what was
 *   invoiced (e.g. Eiji's mis-parsed Multi-Activity price).
 * - A +£1.50 per-instalment gap becomes an explicit GoCardless fee line;
 *   other gaps (family credits) are left for the PDF's adjustment row.
 *
 * Dry run (default):
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/backfill-all-reenrol-invoice-line-items.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/backfill-all-reenrol-invoice-line-items.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildReenrolTermLineItems,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { unitPriceFor, type ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
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
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function termFromReference(ref: string): TermKey | null {
  const s = String(ref || "").toLowerCase();
  if (/\(autumn\)|autumn term/.test(s)) return "autumn";
  if (/\(spring\)|spring term/.test(s)) return "spring";
  if (/\(summer\)|summer term/.test(s)) return "summer";
  return null;
}

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, payment_status, billing_term, vat_mode, line_items, reference_text, created_at",
  )
  .eq("created_via", "reenrolment")
  .neq("payment_status", "void")
  .order("created_at", { ascending: true })
  .limit(300);
if (error) throw error;

const pending = (shares || []).filter(
  (r) => !Array.isArray(r.line_items) || r.line_items.length === 0,
);
console.log(`${pending.length} re-enrolment invoice(s) without line items.`);

const productMap = await loadProductMap(admin);

// contact → { slots, weeklyChoices }
const subCache = new Map<
  string,
  { slots: ParsedSlot[]; weeklyChoices: Record<string, { choice?: string }> | null } | null
>();

async function submissionForContact(contactId: string) {
  if (subCache.has(contactId)) return subCache.get(contactId)!;
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
  const choicesRaw = payload?.choices as Record<string, unknown> | undefined;
  const weekly =
    choicesRaw && typeof choicesRaw === "object" && choicesRaw.weekly &&
      typeof choicesRaw.weekly === "object"
      ? (choicesRaw.weekly as Record<string, { choice?: string }>)
      : null;
  const out = slots.length ? { slots, weeklyChoices: weekly } : null;
  subCache.set(contactId, out);
  return out;
}

/**
 * Contacts whose snapshot mis-priced specific services (parser bug at submit
 * time). Key: contact_id → service-type match → forced per-session price.
 * Eiji (39): Multi-Activity stored at £80/session; agreed price is £120 (as Hazem).
 */
const SLOT_PRICE_OVERRIDES: Record<string, Array<{ match: RegExp; unit: number }>> = {
  "39": [{ match: /MULTI|S&C|MA/i, unit: 120 }],
};

function overriddenSlots(contactId: string, slots: ParsedSlot[]): ParsedSlot[] {
  const overrides = SLOT_PRICE_OVERRIDES[contactId];
  if (!overrides) return slots;
  return slots.map((slot) => {
    if (!slot || slot.isDayCentre) return slot;
    const rule = overrides.find((o) => o.match.test(String(slot.serviceType || "")));
    if (!rule) return slot;
    const s = slot.sessions || { autumn: 0, spring: 0, summer: 0, annual: 0 };
    return {
      ...slot,
      pricePerSession: rule.unit,
      termTotals: {
        autumn: round2((s.autumn || 0) * rule.unit),
        spring: round2((s.spring || 0) * rule.unit),
        summer: round2((s.summer || 0) * rule.unit),
        annual: round2((s.annual || 0) * rule.unit),
      },
    };
  });
}

/** Slots with term totals recomputed from catalog per-session prices. */
function catalogRepricedSlots(slots: ParsedSlot[]): ParsedSlot[] {
  return slots.map((slot) => {
    if (!slot || slot.isDayCentre) return slot;
    const unit = unitPriceFor(slot.serviceType || "", slot.durationMin || 30);
    if (!Number.isFinite(unit) || !unit || unit <= 0) return slot;
    const s = slot.sessions || { autumn: 0, spring: 0, summer: 0, annual: 0 };
    return {
      ...slot,
      pricePerSession: unit,
      termTotals: {
        autumn: round2((s.autumn || 0) * unit),
        spring: round2((s.spring || 0) * unit),
        summer: round2((s.summer || 0) * unit),
        annual: round2((s.annual || 0) * unit),
      },
    };
  });
}

function linesTotal(lines: PortalInvoiceLineItem[]): number {
  return round2(lines.reduce((s, l) => s + l.amount_gbp, 0));
}

/** How far the term's invoice amounts sit from an equal split of `total` (allowing +£1.50 GC fee). */
function deviation(total: number, amounts: number[]): number {
  const k = amounts.length;
  if (!k || total <= 0) return Number.POSITIVE_INFINITY;
  const base = round2(total / k);
  return amounts.reduce(
    (s, a) => s + Math.min(Math.abs(a - base), Math.abs(a - (base + 1.5))),
    0,
  );
}

/** Split full-term lines into one instalment (1/k), rounding to the largest line. */
function instalmentLines(
  termLines: PortalInvoiceLineItem[],
  k: number,
): PortalInvoiceLineItem[] {
  const out = termLines.map((l) => {
    const amount = round2(l.amount_gbp / k);
    const qty = Math.max(0.01, round2(l.quantity / k));
    return {
      ...l,
      quantity: qty,
      amount_gbp: amount,
      unit_price_gbp: round4(amount / qty),
    };
  });
  const wantTotal = round2(linesTotal(termLines) / k);
  const diff = round2(wantTotal - linesTotal(out));
  if (Math.abs(diff) >= 0.01 && out.length) {
    const big = out.reduce((a, b) => (a.amount_gbp >= b.amount_gbp ? a : b));
    big.amount_gbp = round2(big.amount_gbp + diff);
    big.unit_price_gbp = round4(big.amount_gbp / big.quantity);
  }
  return out;
}

// Group pending invoices per contact+term.
const groups = new Map<string, typeof pending>();
for (const row of pending) {
  const term = termFromReference(String(row.reference_text || ""));
  if (!term) {
    console.log(row.invoice_number, "— no term in reference, skipped:", row.reference_text);
    continue;
  }
  const key = `${row.contact_id}|${term}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(row);
}

let updated = 0;
let failed = 0;

for (const [key, rows] of groups) {
  const [contactId, term] = key.split("|") as [string, TermKey];
  const sub = await submissionForContact(contactId);
  if (!sub) {
    console.log(`c${contactId} ${term}: no re-enrolment snapshot — skipped (${rows.map((r) => r.invoice_number).join(", ")})`);
    continue;
  }
  const vatMode: PortalInvoiceVatMode =
    String(rows[0].vat_mode || "").toLowerCase() === "exempt" ? "exempt" : "vat_20";

  const baseSlots = overriddenSlots(contactId, sub.slots);
  const snapLines = buildReenrolTermLineItems({
    slots: baseSlots,
    weeklyChoices: sub.weeklyChoices,
    term,
    vatMode,
    productMap,
  });
  const catLines = buildReenrolTermLineItems({
    slots: catalogRepricedSlots(baseSlots),
    weeklyChoices: sub.weeklyChoices,
    term,
    vatMode,
    productMap,
  });
  if (!snapLines.length && !catLines.length) {
    console.log(`c${contactId} ${term}: no service lines — skipped`);
    continue;
  }

  const amounts = rows.map((r) => Number(r.amount_gbp));
  const devSnap = deviation(linesTotal(snapLines), amounts);
  const devCat = deviation(linesTotal(catLines), amounts);
  const useCatalog = devCat + 0.005 < devSnap;
  const termLines = useCatalog ? catLines : snapLines;
  const k = rows.length;
  const perInvoice = instalmentLines(termLines, k);
  const baseTotal = linesTotal(perInvoice);

  console.log(
    `c${contactId} ${term}: ${k} invoice(s) · term lines £${linesTotal(termLines)} ` +
      `(${useCatalog ? "catalog reprice" : "snapshot"}; dev snap ${devSnap.toFixed(2)} vs cat ${devCat.toFixed(2)})`,
  );

  // If the group's regular instalments carry the +£1.50 GoCardless fee, put the
  // fee line on every invoice — a credit-reduced one then shows the exact credit.
  const groupHasGcFee = rows.some(
    (r) => Math.abs(round2(Number(r.amount_gbp) - baseTotal) - 1.5) < 0.02,
  );

  for (const row of rows) {
    const amount = round2(Number(row.amount_gbp));
    let diff = round2(amount - baseTotal);
    const lines = perInvoice.map((l) => ({ ...l }));
    if (groupHasGcFee) {
      lines.push({
        service_key: "GC_FEE",
        description: "Direct Payment (GoCardless) fee",
        detail: null,
        quantity: 1,
        unit_price_gbp: 1.5,
        amount_gbp: 1.5,
        xero_item_code: null,
      });
      diff = round2(diff - 1.5);
    }
    if (Math.abs(diff) >= 0.01) {
      console.log(
        `  ${row.invoice_number}: £${amount} vs lines £${baseTotal} (diff ${diff}) — PDF adjustment row will cover it`,
      );
    }
    console.log(
      `  ${row.invoice_number} £${amount}:`,
      lines
        .map((l) => `${l.description} ×${l.quantity} = £${l.amount_gbp}`)
        .join(" | "),
    );
    if (!APPLY) continue;
    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        line_items: lines,
        billing_term: row.billing_term || term,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) {
      console.log(`  ${row.invoice_number}: update failed — ${upErr.message}`);
      failed += 1;
      continue;
    }
    const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
    if (regen.ok) {
      updated += 1;
      console.log(`  ${row.invoice_number}: line items saved + PDF regenerated`);
    } else {
      failed += 1;
      console.log(`  ${row.invoice_number}: PDF regen failed — ${regen.error}`);
    }
  }
}

console.log(APPLY ? `Done — ${updated} updated, ${failed} failed.` : "Dry run only — set APPLY=1 to write.");
