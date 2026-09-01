/**
 * Create Autumn 26/27 funder INV-Ps (PDF) for LA sheet clients (LA managed / NHS)
 * so Family invoices / re-enrolments shows PDF · Hide · Mark paid like private rows.
 *
 * - payment_method_hint = la_funded (parent hub never lists these)
 * - share_status = ready (admin actions match private invoices)
 * - One INV-P per client_payments pack with autumn > 0
 * - Client ID / PO from sheet; bill-to = funder
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-la-nhs-autumn-funder-invp.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-la-nhs-autumn-funder-invp.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  namesMatch,
  paymentRowToContext,
  REENROL_ACADEMIC_YEAR,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
/** Day Centre NHS/LA packs can be £10k–£50k/term — opt in explicitly. */
const INCLUDE_DAY_CENTRE = (Deno.env.get("INCLUDE_DAY_CENTRE") || "") === "1";
const READY_PREFIX = "office_la_nhs_autumn_2627";
const DUE_DATE = "2026-09-15";
const INVOICE_DATE = "2026-07-29";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clean(v: unknown, max = 120): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function pickClientId(data: Record<string, unknown>): string {
  return clean(
    data["Client Id"] || data["Client ID"] || data.client_id || data.clientId,
    80,
  );
}
function pickPo(data: Record<string, unknown>): string {
  return clean(data.PO || data.po || data["PO Number"] || data.po_number, 80);
}

function termTotalsFromCtx(ctx: ReturnType<typeof paymentRowToContext>) {
  let autumn = 0;
  let spring = 0;
  let summer = 0;
  let annual = 0;
  for (const slot of [...(ctx.weeklySlots || []), ...(ctx.dayCentreSlots || [])]) {
    autumn += num(slot.termTotals?.autumn);
    spring += num(slot.termTotals?.spring);
    summer += num(slot.termTotals?.summer);
    annual += num(slot.termTotals?.annual);
  }
  return {
    autumn: round2(autumn),
    spring: round2(spring),
    summer: round2(summer),
    annual: round2(annual || autumn + spring + summer),
  };
}

function dayCentreLineItems(
  slots: ParsedSlot[],
  term: "autumn" | "spring" | "summer",
): PortalInvoiceLineItem[] {
  const out: PortalInvoiceLineItem[] = [];
  for (const slot of slots || []) {
    if (!slot?.isDayCentre) continue;
    const amount = round2(num(slot.termTotals?.[term]));
    if (amount <= 0) continue;
    const sessions = num(slot.sessions?.[term]) || 1;
    const unit = round2(amount / sessions);
    out.push({
      service_key: "DAY_CENTRE",
      description: clean(slot.displayLabel || slot.serviceType || "Day Centre", 160) ||
        "Day Centre",
      detail: `Autumn term ${REENROL_ACADEMIC_YEAR.replace("-", "/")} · funded provision`,
      dates: "",
      quantity: sessions,
      unit_price_gbp: unit,
      amount_gbp: amount,
      xero_item_code: null,
    });
  }
  return out;
}

function markerFor(clientKey: string): string {
  return `${READY_PREFIX}_${clientKey}`;
}

const { data: laRows, error: laErr } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, parent_name, data, sheet")
  .eq("sheet", "LA");
if (laErr) throw new Error(laErr.message);

const { data: contacts, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, child_first_name, child_last_name, funding_label, in_class",
  )
  .eq("in_class", true)
  .limit(500);
if (cErr) throw new Error(cErr.message);

const contactList = (contacts || [])
  .map((c) => {
    const child =
      clean(c.child_display, 120) ||
      [c.child_first_name, c.child_last_name].filter(Boolean).join(" ").trim();
    return {
      contact_id: clean(c.contact_id, 120),
      child,
      funding_label: clean(c.funding_label, 120),
    };
  })
  .filter((c) => c.contact_id && c.child);

const { data: shares } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, contact_id, invoice_number, amount_gbp, billing_term, payment_method_hint, ready_by, notes, created_via",
  )
  .neq("payment_status", "void");

const sharesByContact = new Map<string, typeof shares>();
for (const s of shares || []) {
  const cid = clean(s.contact_id, 120);
  if (!cid) continue;
  const list = sharesByContact.get(cid) || [];
  list.push(s);
  sharesByContact.set(cid, list);
}

type PlanRow = {
  clientKey: string;
  clientName: string;
  contactId: string;
  fundingLabel: string;
  autumn: number;
  annual: number;
  weeklySlots: ParsedSlot[];
  dayCentreSlots: ParsedSlot[];
  clientId: string;
  po: string;
  marker: string;
  skipReason: string | null;
  existingInv: string | null;
};

const plans: PlanRow[] = [];
const seenClientKeys = new Set<string>();

const sortedLaRows = [...(laRows || [])].sort((a, b) => {
  const ta = String((a.data as Record<string, unknown> | null)?.Term || "").toLowerCase();
  const tb = String((b.data as Record<string, unknown> | null)?.Term || "").toLowerCase();
  const score = (t: string) =>
    /autumn/.test(t) && /26/.test(t) ? 0 : /autumn/.test(t) ? 1 : /summer/.test(t) ? 3 : 2;
  return score(ta) - score(tb);
});

for (const row of sortedLaRows) {
  const clientKey = clean(row.client_key, 80);
  if (!clientKey) continue;
  if (/inflation|uplift/i.test(clientKey)) continue;
  if (seenClientKeys.has(clientKey)) continue;

  const ctx = paymentRowToContext(row as Record<string, unknown>);
  const weeklySlots = (ctx.weeklySlots || []) as ParsedSlot[];
  const dayCentreSlots = (ctx.dayCentreSlots || []) as ParsedSlot[];
  const hasWeekly = weeklySlots.some((s) => num(s.termTotals?.autumn) > 0);
  const hasDc = dayCentreSlots.some((s) => num(s.termTotals?.autumn) > 0);

  // Default: ASW / weekend weekly packs only (matches re-enrolments LA cards like Aboodi).
  // Day Centre: INCLUDE_DAY_CENTRE=1
  if (!hasWeekly && hasDc && !INCLUDE_DAY_CENTRE) {
    plans.push({
      clientKey,
      clientName: clean(ctx.clientName || row.client_name, 120),
      contactId: "",
      fundingLabel: "",
      autumn: termTotalsFromCtx(ctx).autumn,
      annual: termTotalsFromCtx(ctx).annual,
      weeklySlots,
      dayCentreSlots,
      clientId: pickClientId((row.data || {}) as Record<string, unknown>),
      po: pickPo((row.data || {}) as Record<string, unknown>),
      marker: markerFor(clientKey),
      skipReason: "day_centre_needs_INCLUDE_DAY_CENTRE=1",
      existingInv: null,
    });
    seenClientKeys.add(clientKey);
    continue;
  }

  const useWeeklyOnly = hasWeekly && !(INCLUDE_DAY_CENTRE && hasDc);
  const slotsForTotals = useWeeklyOnly
    ? { weeklySlots, dayCentreSlots: [] as ParsedSlot[] }
    : { weeklySlots, dayCentreSlots };
  const totals = termTotalsFromCtx({
    ...ctx,
    weeklySlots: slotsForTotals.weeklySlots,
    dayCentreSlots: slotsForTotals.dayCentreSlots,
  } as ReturnType<typeof paymentRowToContext>);
  if (totals.autumn <= 0) continue;
  seenClientKeys.add(clientKey);

  const clientName = clean(ctx.clientName || row.client_name, 120);
  let matched: (typeof contactList)[0] | null = null;
  for (const c of contactList) {
    if (namesMatch(clientName, c.child) || namesMatch(c.child, clientName)) {
      matched = c;
      break;
    }
  }
  if (!matched) {
    plans.push({
      clientKey,
      clientName,
      contactId: "",
      fundingLabel: "",
      autumn: totals.autumn,
      annual: totals.annual,
      weeklySlots: slotsForTotals.weeklySlots,
      dayCentreSlots: slotsForTotals.dayCentreSlots,
      clientId: pickClientId((row.data || {}) as Record<string, unknown>),
      po: pickPo((row.data || {}) as Record<string, unknown>),
      marker: markerFor(clientKey),
      skipReason: "no_contact_match",
      existingInv: null,
    });
    continue;
  }

  const marker = markerFor(clientKey);
  const existing = (sharesByContact.get(matched.contact_id) || []).find((s) => {
    if (clean(s.payment_method_hint, 40) !== "la_funded") return false;
    if (clean(s.ready_by, 120) === marker) return true;
    if (String(s.notes || "").includes(marker)) return true;
    if (
      clean(s.billing_term, 20) === "autumn" &&
      Math.abs(num(s.amount_gbp) - totals.autumn) < 0.02
    ) {
      return true;
    }
    return false;
  });

  plans.push({
    clientKey,
    clientName,
    contactId: matched.contact_id,
    fundingLabel: matched.funding_label,
    autumn: totals.autumn,
    annual: totals.annual,
    weeklySlots: slotsForTotals.weeklySlots,
    dayCentreSlots: slotsForTotals.dayCentreSlots,
    clientId: pickClientId((row.data || {}) as Record<string, unknown>),
    po: pickPo((row.data || {}) as Record<string, unknown>),
    marker,
    skipReason: existing ? "already_has_autumn_invp" : null,
    existingInv: existing ? clean(existing.invoice_number, 40) : null,
  });
}

console.log(`\nLA/NHS Autumn funder INV-P plan (${plans.length} packs)\n`);
for (const p of plans) {
  const status = p.skipReason
    ? `SKIP ${p.skipReason}${p.existingInv ? ` (${p.existingInv})` : ""}`
    : "CREATE";
  console.log(
    [
      status.padEnd(36),
      (p.contactId || "—").padEnd(22),
      p.clientKey.padEnd(16),
      p.clientName.padEnd(26),
      `£${p.autumn.toFixed(2)}`.padStart(10),
      `CID ${p.clientId || "—"}`,
      `PO ${p.po || "—"}`,
    ].join(" "),
  );
}

const toCreate = plans.filter((p) => !p.skipReason);
console.log(`\nTo create: ${toCreate.length}`);
console.log(`Skip: ${plans.length - toCreate.length}`);

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to create INV-Ps + PDFs.");
  Deno.exit(0);
}

if (!toCreate.length) {
  console.log("Nothing to create.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner user id");
const productMap = await loadProductMap(admin);
await xeroHydrateRefreshFromDb(admin);

const created: Array<{ contactId: string; inv: string; amount: number; key: string }> =
  [];

for (const p of toCreate) {
  const weeklyChoices: Record<string, { choice: string; alternative: null }> = {};
  for (const slot of p.weeklySlots) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep", alternative: null };
  }

  let lineItems = buildReenrolTermLineItems({
    slots: p.weeklySlots,
    weeklyChoices,
    term: "autumn",
    vatMode: "exempt",
    productMap,
  });
  lineItems = lineItems.concat(dayCentreLineItems(p.dayCentreSlots, "autumn"));

  const amountFromLines = round2(
    lineItems.reduce((sum, li) => sum + num(li.amount_gbp), 0),
  );
  const amountGbp = amountFromLines > 0 ? amountFromLines : p.autumn;
  if (amountGbp <= 0) {
    console.log("SKIP zero amount after lines", p.clientKey);
    continue;
  }

  if (!lineItems.length) {
    lineItems = [
      {
        service_key: "FUNDED_PROVISION",
        description: clean(p.clientName, 120) + " · funded sessions",
        detail: `Autumn term ${REENROL_ACADEMIC_YEAR.replace("-", "/")} · LA/NHS sheet`,
        dates: "",
        quantity: 1,
        unit_price_gbp: amountGbp,
        amount_gbp: amountGbp,
        xero_item_code: null,
      },
    ];
  }

  const description = lineItemsToDescription(lineItems, { fundedProvision: true });
  const createdInv = await createPortalFamilyInvoice(admin, {
    contactId: p.contactId,
    amountGbp,
    dueDateIso: DUE_DATE,
    invoiceDateIso: INVOICE_DATE,
    vatMode: "exempt",
    lineDescription: description,
    reference: `Autumn term ${REENROL_ACADEMIC_YEAR.replace("-", "/")}`,
    service: "Afterschools / weekends · funded",
    notes:
      `${p.marker} · Office LA/NHS Autumn funder invoice · ${p.clientName} · ` +
      `${p.clientKey} · sheet totals Autumn £${p.autumn.toFixed(2)} / Year £${p.annual.toFixed(2)} · ` +
      `hidden from parent hub via la_funded`,
    title: `Invoice — ${p.clientName} · Autumn term`,
    shareStatus: "ready",
    paymentMethodHint: "la_funded",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: p.marker,
    billingTerm: "autumn",
    clientIdLabel: p.clientId || null,
    poLabel: p.po || null,
    quantity: lineItems.reduce((sum, li) => sum + (num(li.quantity) || 1), 0) || 1,
    paymentSchedule: [
      {
        seq: 1,
        label: "Autumn term · funder invoice",
        due_date: DUE_DATE,
        amount_gbp: amountGbp,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems,
  });

  if (!createdInv.ok) {
    console.error("FAIL", p.clientKey, createdInv.error);
    continue;
  }

  const shareId = String(createdInv.invoice?.id || "");
  console.log(
    `CREATED ${createdInv.invoiceNumber} · ${p.clientName} (${p.contactId}) · ${p.clientKey} · £${amountGbp.toFixed(2)}`,
  );
  created.push({
    contactId: p.contactId,
    inv: createdInv.invoiceNumber,
    amount: amountGbp,
    key: p.clientKey,
  });

  if (shareId) {
    const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
    console.log(
      "  Xero",
      pushed.ok ? "ok" : `fail: ${"error" in pushed ? pushed.error : "unknown"}`,
    );
  }
}

await xeroPersistRefreshToDb(admin);
console.log(`\nDone. Created ${created.length} Autumn funder INV-Ps.`);
for (const c of created) {
  console.log(`  ${c.inv} · ${c.key} · contact ${c.contactId} · £${c.amount.toFixed(2)}`);
}
