/**
 * Tom Eriksson (89) · INV-P-0349
 * Paid £700 bank while still on flexi (£350+£350); only 1st half was marked.
 * Switch plan → term_3 (one-off per term) and apply £700 paid.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-tom-flexi-to-term-paid-700.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-tom-flexi-to-term-paid-700.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  applyPaidAmountAcrossSchedule,
  rebuildTermPaymentSchedule,
} from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";
import { REENROL_ACADEMIC_YEAR } from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "89";
const INV = "INV-P-0349";
const PAID = 700;
const PLAN = "term_3";
const PLAN_LABEL = "One-off payment (term)";

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

const now = new Date().toISOString();

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, billing_term, notes, contact_id",
  )
  .eq("invoice_number", INV)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (invErr) throw invErr;
if (!inv) throw new Error(`Missing ${INV}`);

const { data: sub, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (subErr) throw subErr;
if (!sub?.id) throw new Error("Missing reenrol submission");

const fresh = rebuildTermPaymentSchedule({
  scheduleCode: PLAN,
  billingTerm: inv.billing_term || "autumn",
  totalGbp: Number(inv.amount_gbp) || PAID,
});
const applied = applyPaidAmountAcrossSchedule(fresh, {
  amountGbp: PAID,
  paidAt: now,
  paidVia: "admin",
});

const payload = structuredClone(sub.payload || {}) as Record<string, unknown>;
const funding = (payload.funding && typeof payload.funding === "object"
  ? payload.funding
  : {}) as Record<string, unknown>;
const choices = (funding.choices_2627 && typeof funding.choices_2627 === "object"
  ? funding.choices_2627
  : {}) as Record<string, unknown>;
choices.payment_schedule_code = PLAN;
choices.payment_schedule_label = PLAN_LABEL;
choices.billing_schedule = PLAN;
funding.choices_2627 = choices;
payload.funding = funding;
payload.office_note = `${String(payload.office_note || "")} · ${now.slice(0, 10)}: Tide £700 while flexi — switched to term_3; INV-P-0349 settled paid.`.trim();

console.log("Plan:");
console.log("  schedule", inv.payment_schedule);
console.log("  →", applied);
console.log("  status", inv.payment_status, "→", applied.payment_status);
console.log("  paid", inv.amount_paid_gbp, "→", applied.amount_paid_gbp);
if (!APPLY) {
  console.log("Dry run only. APPLY=1 to write.");
  Deno.exit(0);
}

const { error: upSub } = await admin
  .from("portal_re_enrolment_submissions")
  .update({ payload })
  .eq("id", sub.id);
if (upSub) throw upSub;

const note = `${String(inv.notes || "")} · Office ${now.slice(0, 10)} · plan → term_3 · apply paid £700 (bank full autumn).`.trim();
const { error: upInv } = await admin
  .from("portal_parent_invoice_share")
  .update({
    payment_schedule: applied.schedule,
    amount_paid_gbp: applied.amount_paid_gbp,
    payment_status: applied.payment_status,
    next_instalment_due: applied.next_instalment_due,
    paid_at: applied.payment_status === "paid" ? now : null,
    paid_via: applied.payment_status === "paid" ? "admin" : null,
    notes: note.slice(0, 800),
    updated_at: now,
  })
  .eq("id", inv.id);
if (upInv) throw upInv;

const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
console.log("Updated", INV, "pdf", regen.ok ? "ok" : regen.error);
