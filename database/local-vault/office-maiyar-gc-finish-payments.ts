/**
 * Cancel accidental £1 probe payments, then schedule Maiyar 2×£350 GC.
 *   APPLY=1 npx -y deno run -A database/local-vault/office-maiyar-gc-finish-payments.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  gocardlessCreatePayment,
  gocardlessChargeDate,
  gocardlessRequest,
} from "../../supabase/functions/_shared/gocardless.ts";

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
loadEnv("local-secrets/edge-secrets.env");

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const MANDATE_ID = "MD01KMJKP22N55";
const PROBE_IDS = [
  "PM01XRB89GCCQCNR097311T1M9R5", // £1 Aug 20
  "PM01XRB89GNY99SFZG0E989KMYNE", // £1 Sep 1
];
/** Earliest valid Bacs date for this mandate as of 15 Aug 2026 probes. */
const CHARGE1 = Deno.env.get("CHARGE1") || "2026-08-20";
const CHARGE2 = "2026-10-26";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log("Cancel probe payments…");
for (const id of PROBE_IDS) {
  const res = await gocardlessRequest(
    "POST",
    `/payments/${encodeURIComponent(id)}/actions/cancel`,
    { data: {} },
    `cancel-probe-${id}`,
  );
  console.log(id, res.ok ? "cancelled" : `${res.error} ${res.detail}`);
}

const { data: shares } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, due_date, gocardless_payment_id, share_status",
  )
  .eq("contact_id", "48")
  .in("invoice_number", ["INV-P-0133", "INV-P-0361"]);
console.log("shares", shares);
console.log("Plan charge1", CHARGE1, "charge2", CHARGE2);

if (!APPLY) {
  console.log("Dry OK. APPLY=1 to schedule £350 payments.");
  Deno.exit(0);
}

for (const row of shares || []) {
  if (row.gocardless_payment_id) {
    console.log("SKIP", row.invoice_number, row.gocardless_payment_id);
    continue;
  }
  const isKeeper = row.invoice_number === "INV-P-0133";
  const amount = isKeeper ? 350 : Number(row.amount_gbp);
  const chargeDate = isKeeper ? CHARGE1 : CHARGE2;
  const created = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence: Math.round(amount * 100),
    description: `clubSENsational ${row.invoice_number}`.slice(0, 100),
    chargeDate,
    invoiceShareId: String(row.id),
    contactId: "48",
    invoiceNumber: String(row.invoice_number),
    idempotencyKey: `maiyar-gc-finish-${row.id}`,
  });
  if (!created.ok) {
    console.error("FAIL", row.invoice_number, created.error, created.detail);
    Deno.exit(1);
  }
  const chargeIso = gocardlessChargeDate(chargeDate);
  const patch: Record<string, unknown> = {
    gocardless_payment_id: created.data.id,
    gocardless_mandate_id: MANDATE_ID,
    updated_at: new Date().toISOString(),
  };
  if (isKeeper) {
    patch.due_date = chargeIso;
    patch.next_instalment_due = chargeIso;
    patch.payment_schedule = [
      {
        seq: 1,
        label: "Autumn term · 1st half",
        due_date: chargeIso,
        amount_gbp: 350,
        status: "pending",
      },
      {
        seq: 2,
        label: "Autumn term · 2nd half",
        due_date: CHARGE2,
        amount_gbp: 350,
        status: "pending",
      },
    ];
  }
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update(patch)
    .eq("id", row.id);
  if (error) throw error;
  console.log("OK", row.invoice_number, created.data.id, created.data.charge_date, `£${amount}`);
}

const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("participant_contact_id", "48")
  .eq("academic_year", "2026-27")
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (sub?.payload && typeof sub.payload === "object") {
  const payload = structuredClone(sub.payload) as Record<string, unknown>;
  const funding = (payload.funding && typeof payload.funding === "object"
    ? payload.funding
    : {}) as Record<string, unknown>;
  const choices = (funding.choices_2627 && typeof funding.choices_2627 === "object"
    ? funding.choices_2627
    : {}) as Record<string, unknown>;
  choices.payment_method_code = "gocardless";
  choices.payment_method_label = "Direct Payment (GoCardless)";
  funding.choices_2627 = choices;
  payload.funding = funding;
  const note = String(payload.office_note || "");
  if (!note.includes("GoCardless")) {
    payload.office_note =
      `${note} · 2026-08-15: switched bank_transfer → GoCardless (mandate ${MANDATE_ID}); GC 2×£350 (${CHARGE1} + ${CHARGE2}).`.trim();
  }
  await admin.from("portal_re_enrolment_submissions").update({ payload }).eq("id", sub.id);
  console.log("Reenrol payload → gocardless");
}

console.log(JSON.stringify({ ok: true, charge1: CHARGE1, charge2: CHARGE2 }, null, 2));
