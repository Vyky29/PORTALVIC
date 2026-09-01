/**
 * Vithura Pakeerathan (367) · Yalini — Autumn INV-P-0116
 * Full term was 14×£50 = £700. Family only has £600 → enrol first 12 sessions (£600).
 *
 * Dry:  npx -y deno run -A database/local-vault/office-vithura-12-sessions-600.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-vithura-12-sessions-600.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  formatGroupedSessionDates,
  lineItemsToDescription,
  remainingTermSessionDates,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "367";
const INV = "INV-P-0116";
const SESSIONS = 12;
const UNIT = 50;
const TOTAL = SESSIONS * UNIT; // 600
const DUE = "2026-08-15";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, payment_status, amount_paid_gbp, line_items, line_description, payment_schedule, notes, vat_mode, quantity, unit_price_gbp",
  )
  .eq("invoice_number", INV)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (invErr) throw invErr;
if (!inv) throw new Error(`${INV} missing`);
if (String(inv.payment_status).toLowerCase() === "paid") {
  throw new Error(`${INV} already paid — refuse rewrite`);
}
if (Number(inv.amount_paid_gbp) > 0) {
  throw new Error(`${INV} has amount_paid_gbp=${inv.amount_paid_gbp}`);
}

const allWed = remainingTermSessionDates("autumn", "Wednesday", "2026-08-01");
const first12 = allWed.slice(0, SESSIONS);
const datesLabel =
  formatGroupedSessionDates(first12) ||
  "9, 16, 23, 30 Sept; 7, 14, 21 Oct; 4, 11, 18, 25 Nov; 2 Dec";

const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_30",
    description: "Aquatic Activity 30'",
    detail: "Wednesday 4.30 to 5 pm",
    dates: datesLabel,
    quantity: SESSIONS,
    unit_price_gbp: UNIT,
    amount_gbp: TOTAL,
    xero_item_code: "SW",
  },
];
const lineDescription =
  lineItemsToDescription(lineItems, { fundedProvision: false }) +
  `\n\nOffice: first ${SESSIONS} Autumn sessions only (family budget £${TOTAL}; full term was 14).`;

const schedule = [
  {
    seq: 1,
    label: "Autumn · first 12 sessions",
    due_date: DUE,
    amount_gbp: TOTAL,
    status: "pending" as const,
    paid_at: null,
    paid_via: null,
  },
];

const noteLine =
  `Office 15 Aug 2026: enrol first ${SESSIONS} sessions only · ${SESSIONS}×£${UNIT}=£${TOTAL} (was 14×£50=£700). Remaining Autumn dates not invoiced until further funding.`;

console.log(APPLY ? "APPLY" : "DRY");
console.log("BEFORE", {
  amount: inv.amount_gbp,
  qty: (inv.line_items as Array<{ quantity?: number }>)?.[0]?.quantity,
  dates: (inv.line_items as Array<{ dates?: string }>)?.[0]?.dates,
});
console.log("AFTER", { amount: TOTAL, sessions: SESSIONS, dates: datesLabel });
console.log("catalog Wed count", allWed.length, "using first", first12.length);

if (!APPLY) {
  console.log("Dry OK. APPLY=1 to write + regen PDF.");
  Deno.exit(0);
}

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: TOTAL,
    quantity: SESSIONS,
    unit_price_gbp: UNIT,
    line_items: lineItems,
    line_description: lineDescription,
    payment_schedule: schedule,
    due_date: DUE,
    next_instalment_due: DUE,
    reference_text: "Autumn 26/27 · first 12 sessions",
    notes: [String(inv.notes || "").trim(), noteLine].filter(Boolean).join("\n").slice(0, 2000),
    updated_at: new Date().toISOString(),
  })
  .eq("id", inv.id);
if (upErr) throw upErr;

const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (sub?.payload && typeof sub.payload === "object") {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const termTotals = (payload.term_totals && typeof payload.term_totals === "object"
    ? payload.term_totals
    : {}) as Record<string, unknown>;
  termTotals.autumn = TOTAL;
  // Keep spring/summer/annual for reference but note partial autumn
  payload.term_totals = termTotals;
  const note = String(payload.office_note || "");
  payload.office_note =
    `${note} · 2026-08-15: validated first ${SESSIONS} Autumn sessions only (£${TOTAL}); INV-P-0116 reduced from £700.`.trim();
  const { error: pErr } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", sub.id);
  if (pErr) throw pErr;
  console.log("Reenrol office_note + autumn total updated");
}

const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, amount_gbp, payment_status, line_items, payment_schedule, reference_text",
  )
  .eq("id", inv.id)
  .maybeSingle();
console.log("AFTER row", JSON.stringify(after, null, 2));
