/**
 * Cancel Aug-17 GoCardless payments for Margaretta / Romina (×2) / Nazaré
 * and recreate Sep-1 charges at £176.50. Sync portal invoice due + schedule.
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-reschedule-gc-aug17-to-sep1-17650.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-reschedule-gc-aug17-to-sep1-17650.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import {
  gocardlessChargeDate,
  gocardlessCreatePayment,
  gocardlessRequest,
} from "../../supabase/functions/_shared/gocardless.ts";
import {
  nextInstalmentDueDate,
  normalizePaymentSchedule,
} from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const NEW_DUE = "2026-09-01";
const AMOUNT_GBP = 176.5;
const AMOUNT_PENCE = Math.round(AMOUNT_GBP * 100);

const TARGETS: Array<{
  invoice_number: string;
  parentHint: string;
  paxHint: string;
}> = [
  { invoice_number: "INV-P-0028", parentHint: "Margaretta", paxHint: "Tyson" },
  { invoice_number: "INV-P-0042", parentHint: "Romina", paxHint: "Bediako" },
  { invoice_number: "INV-P-0046", parentHint: "Romina", paxHint: "Cayra" },
  { invoice_number: "INV-P-0038", parentHint: "Nazaré", paxHint: "Yuri" },
];

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

const url =
  Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("PORTAL_SUPABASE_URL") ||
  "https://cklpnwhlqsulpmkipmqb.supabase.co";
const key =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
  "";
if (!key) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
if (!Deno.env.get("GOCARDLESS_ACCESS_TOKEN")) {
  throw new Error("missing GOCARDLESS_ACCESS_TOKEN");
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cancelGcPayment(paymentId: string): Promise<{ ok: boolean; detail?: string }> {
  const res = await gocardlessRequest(
    "POST",
    `/payments/${encodeURIComponent(paymentId)}/actions/cancel`,
    {},
  );
  if (!res.ok) {
    if (/already.?cancelled|cancellation_failed|cannot be cancelled/i.test(String(res.detail || ""))) {
      return { ok: true, detail: res.detail };
    }
    return { ok: false, detail: res.detail || res.error };
  }
  return { ok: true };
}

async function getGcPayment(paymentId: string) {
  const res = await gocardlessRequest<{
    payments?: {
      id?: string;
      status?: string;
      amount?: number;
      charge_date?: string;
      description?: string;
      links?: { mandate?: string };
    };
  }>("GET", `/payments/${encodeURIComponent(paymentId)}`);
  if (!res.ok) return { ok: false as const, error: res.detail || res.error };
  return { ok: true as const, payment: res.data.payments || {} };
}

type ShareRow = {
  id: string;
  invoice_number: string;
  contact_id: string | number;
  amount_gbp: number;
  due_date: string | null;
  payment_status: string | null;
  payment_method_hint: string | null;
  gocardless_payment_id: string | null;
  gocardless_mandate_id: string | null;
  payment_schedule: unknown;
  reference_text: string | null;
  line_description: string | null;
};

const invNos = TARGETS.map((t) => t.invoice_number);
const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, due_date, payment_status, payment_method_hint, gocardless_payment_id, gocardless_mandate_id, payment_schedule, reference_text, line_description",
  )
  .in("invoice_number", invNos);
if (shErr) throw shErr;

const byInv = new Map((shares || []).map((s) => [String(s.invoice_number), s as ShareRow]));

console.log(APPLY ? "APPLY mode" : "DRY RUN (set APPLY=1 to write)");
console.log("Target amount £" + AMOUNT_GBP.toFixed(2) + " · new charge date " + NEW_DUE);
console.log("");

const plan: Array<{
  invoice_number: string;
  share: ShareRow;
  oldPm: string;
  mandateId: string;
  oldChargeDate: string;
  oldStatus: string;
  oldAmountPence: number;
}> = [];

for (const t of TARGETS) {
  const share = byInv.get(t.invoice_number);
  if (!share) {
    console.error("MISSING invoice", t.invoice_number);
    Deno.exit(1);
  }
  const oldPm = String(share.gocardless_payment_id || "").trim();
  let mandateId = String(share.gocardless_mandate_id || "").trim();
  let oldChargeDate = "";
  let oldStatus = "";
  let oldAmountPence = 0;

  console.log(
    "—",
    t.invoice_number,
    "·",
    t.paxHint,
    "/",
    t.parentHint,
    "· contact",
    share.contact_id,
    "·",
    String(share.reference_text || "").slice(0, 80),
  );
  console.log(
    "  portal: due=",
    share.due_date,
    "amount=",
    share.amount_gbp,
    "status=",
    share.payment_status,
    "hint=",
    share.payment_method_hint,
  );
  console.log("  portal: gc_pm=", oldPm || "(none)", "mandate=", mandateId || "(none)");

  const sched = normalizePaymentSchedule(share.payment_schedule);
  if (sched.length) {
    console.log(
      "  schedule:",
      sched
        .map((r) => `${r.due_date || "?"} £${r.amount_gbp} ${r.status}`)
        .join(" · "),
    );
  }

  if (oldPm) {
    const gc = await getGcPayment(oldPm);
    if (!gc.ok) {
      console.error("  GC lookup failed", oldPm, gc.error);
      Deno.exit(1);
    }
    oldChargeDate = String(gc.payment.charge_date || "");
    oldStatus = String(gc.payment.status || "");
    oldAmountPence = Number(gc.payment.amount || 0);
    if (!mandateId) mandateId = String(gc.payment.links?.mandate || "");
    console.log(
      "  GC live:",
      oldPm,
      "status=",
      oldStatus,
      "charge_date=",
      oldChargeDate,
      "amount_pence=",
      oldAmountPence,
      "mandate=",
      mandateId || "(none)",
    );
  } else {
    console.log("  GC live: no payment id on share — will create Sep-1 only");
  }

  if (!mandateId) {
    console.error("  no mandate — cannot create payment");
    Deno.exit(1);
  }

  plan.push({
    invoice_number: t.invoice_number,
    share,
    oldPm,
    mandateId,
    oldChargeDate,
    oldStatus,
    oldAmountPence,
  });
  console.log("");
}

if (!APPLY) {
  console.log("Dry run OK. Re-run with APPLY=1 to cancel Aug payments and create Sep-1 £176.50.");
  Deno.exit(0);
}

for (const row of plan) {
  const { share, oldPm, mandateId, invoice_number } = row;

  if (oldPm) {
    const cancelled = await cancelGcPayment(oldPm);
    console.log("GC cancel", invoice_number, oldPm, cancelled);
    if (!cancelled.ok) {
      console.error("cancel failed — abort", invoice_number, cancelled.detail);
      Deno.exit(1);
    }
  }

  const sched = normalizePaymentSchedule(share.payment_schedule);
  // Keep existing Sep–Dec plan; only force first pending instalment onto Sep-1 £176.50 if needed.
  const fixed = sched.map((r) => {
    const due = String(r.due_date || "").slice(0, 10);
    if (due === "2026-08-17") {
      return {
        ...r,
        due_date: NEW_DUE,
        amount_gbp: AMOUNT_GBP,
        label: "Payment 1 · September 2026 (Autumn)",
      };
    }
    return r;
  });
  const hasSepPending = fixed.some(
    (r) => String(r.due_date || "").slice(0, 10) === NEW_DUE && r.status === "pending",
  );
  const payment_schedule = hasSepPending
    ? fixed
    : [
        {
          seq: 1,
          label: "Payment 1 · September 2026 (Autumn)",
          due_date: NEW_DUE,
          amount_gbp: AMOUNT_GBP,
          status: "pending" as const,
        },
        ...fixed.map((r, i) => ({ ...r, seq: i + 2 })),
      ];

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      due_date: NEW_DUE,
      gocardless_payment_id: null,
      gocardless_mandate_id: mandateId,
      payment_method_hint: "gocardless",
      payment_schedule,
      next_instalment_due: nextInstalmentDueDate(payment_schedule),
      updated_at: now,
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("portal update failed", invoice_number, upErr.message);
    Deno.exit(1);
  }

  const created = await gocardlessCreatePayment({
    mandateId,
    amountPence: AMOUNT_PENCE,
    description: `clubSENsational ${invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(NEW_DUE),
    invoiceShareId: String(share.id),
    contactId: String(share.contact_id),
    invoiceNumber: invoice_number,
    idempotencyKey: `inv-${share.id}-sep1-17650-v1`,
  });
  if (!created.ok) {
    console.error("GC create failed", invoice_number, created.error, created.detail);
    Deno.exit(1);
  }

  const { error: pmErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      gocardless_payment_id: created.data.id,
      gocardless_mandate_id: mandateId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (pmErr) {
    console.error("GC id write failed", invoice_number, pmErr.message);
    Deno.exit(1);
  }

  console.log(
    "OK",
    invoice_number,
    "cancelled",
    oldPm || "(none)",
    "→",
    created.data.id,
    "charge",
    created.data.charge_date,
    `£${AMOUNT_GBP}`,
  );
}

console.log("\nDone: 4 GoCardless payments moved to 2026-09-01 @ £176.50");
