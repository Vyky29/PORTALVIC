/**
 * Fix Haneef Yusuf INV-P-0103: Multi-Activity Sunday autumn is 13 sessions
 * (same Sundays as Adam INV-P-0104), not 14. Add visible dates + drop amount to £1560.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-net --allow-read \
 *     database/local-vault/patch-haneef-inv-p-0103-13-sessions.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE = "INV-P-0103";
const CONTACT_ID = "126";
const DATES =
  "Dates: 6, 13, 20, 27 Sept; 4, 11, 18 Oct; 8, 15, 22, 29 Nov; 6, 13 Dec";
const QTY = 13;
const UNIT = 120;
const AMOUNT = 1560;

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, quantity, unit_price_gbp, line_items, line_description, payment_schedule, vat_mode",
  )
  .eq("invoice_number", INVOICE)
  .maybeSingle();
if (error || !share) {
  console.error("invoice missing", error?.message);
  Deno.exit(1);
}

const prev = Array.isArray(share.line_items) && share.line_items[0]
  ? share.line_items[0] as Record<string, unknown>
  : {};

const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: String(prev.service_key || "MULTI_90"),
    description: String(prev.description || "Multi-Activity 90'"),
    detail: String(prev.detail || "Activity, Sunday - 12.30 to 2 pm"),
    dates: DATES,
    quantity: QTY,
    unit_price_gbp: UNIT,
    amount_gbp: AMOUNT,
    xero_item_code: (prev.xero_item_code as string | null | undefined) ?? "SC",
  },
];

const half = Math.round((AMOUNT / 2) * 100) / 100;
const schedule = Array.isArray(share.payment_schedule)
  ? (share.payment_schedule as Array<Record<string, unknown>>).map((row, i) => ({
    ...row,
    amount_gbp: i === 0 ? half : Math.round((AMOUNT - half) * 100) / 100,
  }))
  : [
    {
      seq: 1,
      label: "Autumn term · 1st half",
      status: "pending",
      due_date: "2026-08-15",
      amount_gbp: half,
    },
    {
      seq: 2,
      label: "Autumn term · 2nd half",
      status: "pending",
      due_date: "2026-10-26",
      amount_gbp: Math.round((AMOUNT - half) * 100) / 100,
    },
  ];

const funded = String(share.vat_mode || "") === "exempt";
const line_description = lineItemsToDescription(lineItems, { fundedProvision: funded });

console.log("before", {
  amount: share.amount_gbp,
  line: share.line_items,
  schedule: share.payment_schedule,
});
console.log("after", { amount: AMOUNT, lineItems, schedule, line_description });

if (!APPLY) {
  console.log("Dry run. Re-run with APPLY=1");
  Deno.exit(0);
}

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: AMOUNT,
    quantity: 1,
    unit_price_gbp: AMOUNT,
    line_items: lineItems,
    line_description,
    payment_schedule: schedule,
    updated_at: new Date().toISOString(),
  })
  .eq("id", share.id);
if (upErr) {
  console.error("update failed", upErr.message);
  Deno.exit(1);
}

const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", CONTACT_ID)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (sub?.payload) {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const slots = Array.isArray(payload.weekly_slots_snapshot)
    ? payload.weekly_slots_snapshot as Array<Record<string, unknown>>
    : [];
  let touched = false;
  for (const slot of slots) {
    const svc = String(slot.serviceType || slot.service || "");
    const time = String(slot.time || slot.timeSlot || "");
    if (!/MULTI/i.test(svc)) continue;
    if (!/Sunday|12\.30|12:30/i.test(time) && slots.length > 1) continue;
    const sessions = (slot.sessions || {}) as Record<string, number>;
    if (Number(sessions.autumn) === 14) {
      sessions.autumn = 13;
      sessions.annual = Number(sessions.spring || 0) + 13 + Number(sessions.summer || 0);
      slot.sessions = sessions;
      touched = true;
    }
  }
  if (touched) {
    const { error: subErr } = await admin
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", sub.id);
    if (subErr) console.error("submission patch failed", subErr.message);
    else console.log("submission autumn Multi-Activity 14 → 13");
  }
}

const pdf = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
console.log("pdf", pdf);
if (!pdf?.ok) Deno.exit(1);
console.log("OK", INVOICE, "→ 13 sessions · £1560 + dates");
