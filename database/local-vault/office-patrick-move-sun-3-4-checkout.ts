/**
 * Patrick Dhennin — move Autumn Climbing Sunday 12–1 (Alex) → 3–4 (Carlos),
 * regenerate INV-P-0346 PDF, and mint a live Stripe Checkout link for the
 * first Autumn half (£487.50 net + card fee) so Orla can pay without the portal.
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-patrick-move-sun-3-4-checkout.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-patrick-move-sun-3-4-checkout.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  stripeConfigured,
  stripeCreateCheckoutSession,
  stripeGrossUpFromGbp,
} from "../../supabase/functions/_shared/stripe_checkout.ts";
import { amountDueNow } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "7559001";
const INVOICE = "INV-P-0346";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const FROM_DETAIL = "Sunday · 12.00 – 1.00 · Westway · Alex";
const TO_DETAIL = "Sunday · 3.00 – 4.00 · Westway · Carlos";
const TO_TIME_SLOT = "3 to 4";
const FROM_TIME_RE =
  /^(12(\.00)?\s*(to|–|-)\s*1(\.00)?|12\.00\s*[–-]\s*1\.00)$/i;
const TO_TIME_RE = /^(3(\.00)?\s*(to|–|-)\s*4(\.00)?|3\.00\s*[–-]\s*4\.00)$/i;
const CRASH_FROM = "2026-07-20";
const CRASH_TO = "2026-07-31";
const PORTAL_ORIGIN = "https://www.clubsensational.org";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function timeKey(t: string): string {
  return norm(t).toLowerCase().replace(/:/g, ".");
}
function isPatrick(name: string): boolean {
  const n = norm(name).toLowerCase();
  return n === "patrick" || n.startsWith("patrick ");
}
function isOpenSeat(name: string): boolean {
  const n = norm(name).toUpperCase();
  return !n || n === "NO PARTICIPANT" || n === "CLOSED";
}
function staffList(week: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(week.staff)) return week.staff as Array<Record<string, unknown>>;
  return Object.values((week.staff as Record<string, unknown>) || {}) as Array<
    Record<string, unknown>
  >;
}

if (!stripeConfigured()) {
  console.error("STRIPE_SECRET_KEY must be sk_live_… for a real payment link.");
  Deno.exit(1);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log(APPLY ? "APPLY" : "DRY RUN");

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, amount_paid_gbp, payment_status, share_status, payment_schedule, line_items, line_description, notes, stripe_checkout_session_id, payment_link_url, payment_method_hint, document_id, billing_term",
  )
  .eq("invoice_number", INVOICE)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (invErr || !inv) throw new Error(`invoice: ${invErr?.message || "missing"}`);
if (Number(inv.amount_paid_gbp) > 0) {
  throw new Error(`${INVOICE} already has amount_paid_gbp=${inv.amount_paid_gbp}`);
}

const lineItems = (Array.isArray(inv.line_items) ? inv.line_items : []).map((raw) => {
  const row = { ...(raw as Record<string, unknown>) } as PortalInvoiceLineItem &
    Record<string, unknown>;
  row.detail = TO_DETAIL;
  return row;
}) as PortalInvoiceLineItem[];
const lineDescription = lineItemsToDescription(lineItems, { fundedProvision: false });
const dueNow = amountDueNow(inv);
const gross = stripeGrossUpFromGbp(dueNow);

console.log("\nBEFORE", {
  invoice: inv.invoice_number,
  status: inv.payment_status,
  amount: inv.amount_gbp,
  detail: (inv.line_items as Array<{ detail?: string }> | null)?.[0]?.detail,
  due_now: dueNow,
  charge_gbp: gross.charge_gbp,
  fee_gbp: gross.fee_gbp,
  existing_link: inv.payment_link_url,
  existing_stripe: inv.stripe_checkout_session_id,
});
console.log("AFTER detail →", TO_DETAIL);

/* ---------------- MADRE: free Alex 12–1, place Patrick on Carlos 3–4 ------- */
const { data: madreRow, error: madreErr } = await admin
  .from("portal_madre_document")
  .select("revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (madreErr || !madreRow) throw new Error(`madre: ${madreErr?.message || "missing"}`);
const prevRev = Number(madreRow.revision) || 0;
const doc = structuredClone(madreRow.document) as {
  weeks?: Array<Record<string, unknown>>;
  meta?: { notes?: string[] };
};

let patrickInfo = "";
for (const week of doc.weeks || []) {
  for (const st of staffList(week)) {
    if (!st) continue;
    for (const day of (st.days as Array<Record<string, unknown>>) || []) {
      for (const slot of (day.slots as Array<Record<string, unknown>>) || []) {
        if (!slot || !isPatrick(String(slot.client_name || ""))) continue;
        if (!/climb/i.test(norm(slot.service))) continue;
        if (slot.participant_info && !patrickInfo) {
          patrickInfo = String(slot.participant_info);
        }
      }
    }
  }
}

type DayHit = {
  iso: string;
  staffKey: string;
  day: Record<string, unknown>;
  slots: Array<Record<string, unknown>>;
};

/** Group Sunday Westway climb days by date so we can move Alex→Carlos across staff. */
const byIso = new Map<string, { alex?: DayHit; carlos?: DayHit; other: DayHit[] }>();
for (const week of doc.weeks || []) {
  for (const st of staffList(week)) {
    if (!st) continue;
    const sk = norm(st.staffKey || st.name).toLowerCase();
    for (const day of (st.days as Array<Record<string, unknown>>) || []) {
      if (!day || !/sun/i.test(norm(day.weekday))) continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (!iso || (iso >= CRASH_FROM && iso <= CRASH_TO)) continue;
      const slots = (day.slots as Array<Record<string, unknown>>) || [];
      const hasClimbWestway = slots.some(
        (s) => s && /climb/i.test(norm(s.service)) && /westway/i.test(norm(s.venue)),
      );
      if (!hasClimbWestway && sk !== "carlos" && sk !== "alex") continue;
      day.slots = slots;
      const hit: DayHit = { iso, staffKey: sk, day, slots };
      let bucket = byIso.get(iso);
      if (!bucket) {
        bucket = { other: [] };
        byIso.set(iso, bucket);
      }
      if (sk === "alex") bucket.alex = hit;
      else if (sk === "carlos") bucket.carlos = hit;
      else bucket.other.push(hit);
    }
  }
}

const madreLog: string[] = [];
for (const [iso, bucket] of [...byIso.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const alex = bucket.alex;
  const carlos = bucket.carlos;
  if (!alex && !carlos) continue;

  let fromSlot: Record<string, unknown> | null = null;
  if (alex) {
    for (const slot of alex.slots) {
      if (!slot || !/climb/i.test(norm(slot.service))) continue;
      const t = timeKey(String(slot.time_slot || ""));
      if (FROM_TIME_RE.test(t) && isPatrick(String(slot.client_name || ""))) {
        fromSlot = slot;
        break;
      }
    }
  }

  let toSlot: Record<string, unknown> | null = null;
  if (carlos) {
    for (const slot of carlos.slots) {
      if (!slot || !/climb/i.test(norm(slot.service))) continue;
      if (!/westway/i.test(norm(slot.venue))) continue;
      const t = timeKey(String(slot.time_slot || ""));
      if (!TO_TIME_RE.test(t)) continue;
      if (isPatrick(String(slot.client_name || ""))) {
        toSlot = slot;
        break;
      }
      if (isOpenSeat(String(slot.client_name || ""))) toSlot = slot;
    }
  }

  // Already on Carlos 3–4: only free Alex 12–1.
  if (toSlot && isPatrick(String(toSlot.client_name || ""))) {
    if (fromSlot) {
      fromSlot.client_name = "NO PARTICIPANT";
      madreLog.push(`${iso}: freed Alex 12–1 (Patrick already on Carlos 3–4)`);
    }
    continue;
  }

  if (!carlos) {
    madreLog.push(`${iso}: no Carlos Sunday block — SKIP`);
    continue;
  }

  if (!toSlot) {
    const template =
      fromSlot ||
      carlos.slots.find((s) => s && /climb/i.test(norm(s.service)) && /westway/i.test(norm(s.venue))) ||
      null;
    if (!template) {
      madreLog.push(`${iso}: cannot template a 3–4 seat — SKIP`);
      continue;
    }
    toSlot = {
      ...structuredClone(template),
      time_slot: TO_TIME_SLOT,
      client_name: "NO PARTICIPANT",
      instructors: "CARLOS",
    };
    carlos.slots.push(toSlot);
    madreLog.push(`${iso}: created Carlos 3–4 open seat`);
  }

  if (!isOpenSeat(String(toSlot.client_name || "")) && !isPatrick(String(toSlot.client_name || ""))) {
    madreLog.push(`${iso}: Carlos 3–4 occupied by ${toSlot.client_name} — SKIP`);
    continue;
  }

  toSlot.client_name = "Patrick";
  toSlot.instructors = "CARLOS";
  if (patrickInfo) toSlot.participant_info = patrickInfo;
  if (fromSlot) fromSlot.client_name = "NO PARTICIPANT";
  madreLog.push(
    `${iso}: Patrick → Carlos 3–4` + (fromSlot ? " (freed Alex 12–1)" : ""),
  );
}
console.log("\nMADRE plan:");
for (const l of madreLog) console.log("  -", l);
if (!madreLog.length) console.log("  (no Sunday climb seat changes detected)");

/* ---------------- service_lines ------------------------------------------ */
const { data: svcRows } = await admin
  .from("portal_participant_service_lines")
  .select("id, client_key, client_name, sessions, term_label")
  .eq("client_key", "patrick");
const svc = (svcRows || [])[0] || null;
let nextSessions: unknown = null;
if (svc) {
  const sessions = Array.isArray(svc.sessions) ? structuredClone(svc.sessions) : [];
  for (const s of sessions as Array<Record<string, unknown>>) {
    if (!/climb/i.test(norm(s.service))) continue;
    if (!/sun/i.test(norm(s.day))) continue;
    s.timeSlot = TO_TIME_SLOT;
    s.instructor = "CARLOS";
    s.venue = s.venue || "Westway";
  }
  nextSessions = sessions;
  console.log("\nservice_lines before", JSON.stringify(svc.sessions));
  console.log("service_lines after ", JSON.stringify(nextSessions));
}

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to write MADRE + invoice + Stripe Checkout.");
  Deno.exit(0);
}

/* APPLY */
if (madreLog.length) {
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Patrick Sunday Climb Westway 12–1 Alex → 3–4 Carlos (Orla request 14 Aug 2026; INV-P-0346 + Stripe link)`,
  );
  const { data: madreOut, error: madrePutErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: prevRev + 1,
      updated_at: new Date().toISOString(),
      updated_by: OFFICE_USER,
    })
    .eq("term_key", "summer-2026")
    .eq("revision", prevRev)
    .select("revision")
    .maybeSingle();
  if (madrePutErr || !madreOut) {
    throw new Error(`madre patch: ${madrePutErr?.message || "revision conflict"}`);
  }
  console.log("MADRE", prevRev, "→", madreOut.revision);
}

if (svc && nextSessions) {
  const { error } = await admin
    .from("portal_participant_service_lines")
    .update({
      sessions: nextSessions,
      updated_at: new Date().toISOString(),
      updated_by: OFFICE_USER,
    })
    .eq("id", svc.id);
  if (error) throw new Error(`service_lines: ${error.message}`);
  console.log("service_lines updated");
}

{
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      line_items: lineItems,
      line_description: lineDescription,
      payment_method_hint: "payment_link",
      updated_at: new Date().toISOString(),
      notes: [
        String(inv.notes || "").trim(),
        `Office 14 Aug 2026: Orla asked for Sunday 3–4 (Carlos). Moved from ${FROM_DETAIL} → ${TO_DETAIL}.`,
      ]
        .filter(Boolean)
        .join(" · "),
    })
    .eq("id", inv.id);
  if (error) throw new Error(`invoice update: ${error.message}`);
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
  console.log("PDF regen", regen);
}

const successUrl =
  `${PORTAL_ORIGIN}/parent?invoice_paid=1&view=invoices` +
  `&contact=${encodeURIComponent(CONTACT_ID)}` +
  `&invoice=${encodeURIComponent(String(inv.id))}`;
const cancelUrl =
  `${PORTAL_ORIGIN}/parent?invoice_cancel=1&view=invoices` +
  `&contact=${encodeURIComponent(CONTACT_ID)}` +
  `&invoice=${encodeURIComponent(String(inv.id))}`;

const productName =
  `Invoice ${INVOICE} — Patrick Dhennin Autumn Climbing 3–4` +
  (gross.fee_pence > 0 ? ` (incl. £${gross.fee_gbp.toFixed(2)} card fee)` : "");

const created = await stripeCreateCheckoutSession({
  amountPence: gross.charge_pence,
  currency: "gbp",
  productName,
  successUrl,
  cancelUrl,
  clientReferenceId: String(inv.id),
  metadata: {
    invoice_share_id: String(inv.id),
    contact_id: CONTACT_ID,
    invoice_number: INVOICE,
    office_minted: "patrick_sun_3_4_2026_08_14",
    net_gbp: String(dueNow),
    fee_gbp: String(gross.fee_gbp),
  },
});
if (!created.ok) {
  throw new Error(`stripe: ${created.error} ${created.detail || ""}`);
}

{
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      stripe_checkout_session_id: created.id,
      payment_link_url: created.url,
      payment_method_hint: "payment_link",
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id);
  if (error) throw new Error(`store checkout: ${error.message}`);
}

const msg =
  `Hi Orla,\n\n` +
  `Sorry the parent portal has been awkward — we've re-enrolled Patrick with the same details and moved him to the slot you asked for:\n\n` +
  `Sunday Climbing · 3.00–4.00 · Westway · with Carlos\n\n` +
  `Autumn first payment (flexi bank): £${dueNow.toFixed(2)}` +
  (gross.fee_gbp > 0
    ? ` (+ £${gross.fee_gbp.toFixed(2)} card fee if you pay by card) = £${gross.charge_gbp.toFixed(2)}`
    : "") +
  `\nInvoice ${INVOICE}\n\n` +
  `Pay here (Card / Apple Pay):\n${created.url}\n\n` +
  `If you prefer bank transfer instead, reply and we'll send the account details.\n\n` +
  `Thanks,\nclubSENsational`;

mkdirSync("database/local-vault/tmp", { recursive: true });
const report = {
  invoice: INVOICE,
  contact_id: CONTACT_ID,
  detail: TO_DETAIL,
  due_now_gbp: dueNow,
  charge_gbp: gross.charge_gbp,
  fee_gbp: gross.fee_gbp,
  checkout_session_id: created.id,
  payment_url: created.url,
  madre_log: madreLog,
  message_for_orla: msg,
};
writeFileSync(
  "database/local-vault/tmp/patrick-sun-3-4-checkout.json",
  JSON.stringify(report, null, 2),
);

console.log("\n=== PAYMENT LINK ===\n" + created.url);
console.log("\n=== MESSAGE FOR ORLA ===\n" + msg);
console.log("\nReport → database/local-vault/tmp/patrick-sun-3-4-checkout.json");
