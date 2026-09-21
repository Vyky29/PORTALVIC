/**
 * Yunis Hussein · INV-P-0462
 * Tide £350 on 18 Aug 2026 = Autumn flexi 1st half.
 * Parent only notified office via finish-booking WhatsApp today (2 Sep) — did not
 * mark paid. Apply partial + complete finish-booking so Parent Portal / MADRE / seat
 * are clean (in_class, token completed, reservation validated).
 *
 *   npx -y deno run -A database/local-vault/office-yunis-inv-p-0462-bank-350.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-yunis-inv-p-0462-bank-350.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { tryCompleteBookingAfterInvoicePayment } from "../../supabase/functions/_shared/portal_booking_finish.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0462";
const CONTACT_ID = "232";
const RECEIVED = 350;
const FACE = 700;
const PAID_AT = "2026-08-18T12:00:00.000Z";

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

const { data: row, error } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

if (error) throw new Error(error.message);
if (!row) throw new Error(`${INVOICE_NUMBER} not found for contact ${CONTACT_ID}`);

const { data: contactBefore } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, parent_display, in_class, parent_person_id")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

const { data: tokenBefore } = await admin
  .from("portal_booking_completion_tokens")
  .select("id, status, reservation_id")
  .eq("invoice_share_id", row.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", {
  payment_status: row.payment_status,
  amount_gbp: row.amount_gbp,
  amount_paid_gbp: row.amount_paid_gbp,
  parent_reported_paid_at: row.parent_reported_paid_at,
  parent_reported_method: row.parent_reported_method,
  schedule: row.payment_schedule,
  in_class: contactBefore?.in_class,
  token: tokenBefore,
});

const prev = Array.isArray(row.payment_schedule) ? row.payment_schedule : [];
const first = (prev.find((s: { seq?: number }) => Number(s.seq) === 1) || prev[0] ||
  {}) as Record<string, unknown>;
const second = (prev.find((s: { seq?: number }) => Number(s.seq) === 2) || prev[1] ||
  {}) as Record<string, unknown>;

const schedule = [
  {
    ...first,
    seq: 1,
    label: String(first.label || "Autumn term · 1st half"),
    due_date: String(first.due_date || "2026-09-02").slice(0, 10),
    amount_gbp: RECEIVED,
    status: "paid",
    paid_at: PAID_AT,
    paid_via: "office_bank",
    collect_via: first.collect_via || "bank_transfer",
  },
  {
    ...second,
    seq: 2,
    label: String(second.label || "Autumn term · 2nd half"),
    due_date: String(second.due_date || "2026-10-26").slice(0, 10),
    amount_gbp: FACE - RECEIVED,
    status: "pending",
    paid_at: null,
    paid_via: null,
    collect_via: second.collect_via || "bank_transfer",
  },
];

const noteLine =
  "Office 2 Sep 2026: bank £350 (18 Aug Tide) = Autumn flexi 1st half on INV-P-0462. " +
  "Parent notified via finish-booking WhatsApp today only — office Mark paid; 2nd half £350 due 26 Oct.";

const patch = {
  amount_gbp: FACE,
  amount_paid_gbp: RECEIVED,
  payment_status: "partial",
  paid_at: null,
  paid_via: null,
  next_instalment_due: "2026-10-26",
  payment_schedule: schedule,
  parent_reported_paid_at: null,
  parent_reported_method: null,
  parent_reported_ref: null,
  parent_reported_notes: null,
  notes: [String(row.notes || "").trim(), noteLine]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("AFTER plan", {
  payment_status: "partial",
  amount_paid_gbp: RECEIVED,
  next_instalment_due: "2026-10-26",
  schedule,
});

if (!APPLY) {
  console.log("Re-run with APPLY=1 to write + complete finish-booking + regen PDF.");
  Deno.exit(0);
}

const { error: updErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", row.id);
if (updErr) throw new Error(updErr.message);

const booking = await tryCompleteBookingAfterInvoicePayment(admin, String(row.id));
console.log("finish-booking complete", booking);

// Belt-and-braces: ensure in_class even if complete returned early.
await admin
  .from("portal_parent_contacts")
  .update({
    in_class: true,
    on_waiting_list: false,
    payment_method_label: "Bank transfer · Flexi (2 per term)",
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", CONTACT_ID);
await admin
  .from("portal_participants")
  .update({
    in_class: true,
    on_waiting_list: false,
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", CONTACT_ID);

const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);

const { data: afterInv } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, payment_status, amount_gbp, amount_paid_gbp, next_instalment_due, payment_schedule, parent_reported_paid_at",
  )
  .eq("id", row.id)
  .maybeSingle();
const { data: afterContact } = await admin
  .from("portal_parent_contacts")
  .select("in_class, on_waiting_list")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
const { data: afterToken } = await admin
  .from("portal_booking_completion_tokens")
  .select("id, status")
  .eq("invoice_share_id", row.id)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
const { data: afterRes } = tokenBefore?.reservation_id
  ? await admin
      .from("portal_booking_slot_reservations")
      .select("id, status, validated_at, hold_expires_at")
      .eq("id", tokenBefore.reservation_id)
      .maybeSingle()
  : { data: null };

console.log("AFTER", {
  invoice: afterInv,
  contact: afterContact,
  token: afterToken,
  reservation: afterRes,
});
