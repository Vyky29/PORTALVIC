/**
 * Linda Kaheh (338) — fix mistaken 10× monthly INV-Ps into
 * 1 invoice per term + monthly installments (GC trackers stay for webhook).
 *
 * Keepers: INV-P-0350 (autumn), INV-P-0354 (spring), INV-P-0357 (summer)
 * Hidden trackers: remaining INV-P-0351…0359 with
 *   "Consolidated payment tracker: <keeper_id>"
 * Existing GoCardless PMs stay on each row — no cancel/recreate.
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-linda-consolidate-gc-terms.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-linda-consolidate-gc-terms.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { buildReenrolmentInstalments } from "../../supabase/functions/_shared/reenrolment_auto_invoices.ts";
import {
  REENROL_ACADEMIC_YEAR,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "338";
const MARKER_PREFIX = "Consolidated payment tracker:";

/** First INV of each term = visible keeper; rest = hidden GC trackers. */
const GROUPS: Array<{
  term: "autumn" | "spring" | "summer";
  keeper: string;
  trackers: string[];
}> = [
  {
    term: "autumn",
    keeper: "INV-P-0350",
    trackers: ["INV-P-0351", "INV-P-0352", "INV-P-0353"],
  },
  {
    term: "spring",
    keeper: "INV-P-0354",
    trackers: ["INV-P-0355", "INV-P-0356"],
  },
  {
    term: "summer",
    keeper: "INV-P-0357",
    trackers: ["INV-P-0358", "INV-P-0359"],
  },
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
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("local-secrets/edge-secrets.env");

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function appendMarker(notes: unknown, targetId: string): string {
  const clean = String(notes || "")
    .replace(
      new RegExp(
        `\\n?${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[0-9a-f-]+`,
        "ig",
      ),
      "",
    )
    .trim();
  return [clean, `${MARKER_PREFIX} ${targetId}`].filter(Boolean).join("\n\n").slice(0, 800);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "30' AQUATIC ACTIVITY (Tuesday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 30,
    day: "Tuesday",
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: 50,
    sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
    termTotals: { autumn: 700, spring: 550, summer: 650, annual: 1900 },
    timeSlot: "5 to 5.30",
    venue: null,
    instructor: null,
    displayLabel: "30' Aquatic Activity - 5 to 5.30 pm, Tuesdays",
  },
];
const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
};
const termTotals = { autumn: 700, spring: 550, summer: 650, annual: 1900 };

const plan = buildReenrolmentInstalments({
  funding: {
    choices_2627: {
      billing_mode: "private",
      payment_method_code: "gocardless",
      payment_schedule_code: "monthly_10",
      enrolment_cadence: "whole_year",
      invoice_type_code: "vat_included",
    },
  },
  termTotals,
  participantName: "Linda Kaheh",
  academicYear: REENROL_ACADEMIC_YEAR,
});

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("Linda → 3 term invoices + monthly schedule (GC trackers keep PMs)");
for (const inv of plan.termInvoices) {
  console.log(
    `  plan ${inv.label}: £${inv.amountGbp} · ${inv.paymentSchedule.length} months`,
  );
}

const allNos = GROUPS.flatMap((g) => [g.keeper, ...g.trackers]);
const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, amount_gbp, due_date, payment_status, share_status, notes, reference_text, gocardless_payment_id, billing_term, payment_schedule, line_items",
  )
  .eq("contact_id", CONTACT_ID)
  .in("invoice_number", allNos);
if (error) throw error;
const byNo = new Map((shares || []).map((r) => [String(r.invoice_number), r]));

const report: Array<Record<string, unknown>> = [];
const productMap = APPLY ? await loadProductMap(admin) : null;

for (const g of GROUPS) {
  const keeper = byNo.get(g.keeper);
  const trackerRows = g.trackers.map((n) => byNo.get(n));
  if (!keeper || trackerRows.some((r) => !r)) {
    throw new Error(`missing shares for ${g.term}: ${g.keeper} / ${g.trackers.join(",")}`);
  }
  const planInv = plan.termInvoices.find((t) => t.term === g.term);
  if (!planInv) throw new Error(`no plan for ${g.term}`);

  const monthRows = [keeper, ...trackerRows.filter(Boolean)] as typeof shares;
  monthRows.sort((a, b) =>
    String(a!.due_date || "").localeCompare(String(b!.due_date || "")),
  );

  // Prefer live billed amounts (already on GC PMs) over recomputed plan.
  const schedule = monthRows.map((r, i) => {
    const planRow = planInv.paymentSchedule[i];
    const label =
      planRow?.label ||
      String(r!.reference_text || `Payment ${i + 1}`)
        .replace(/^.*·\s*/, "")
        .trim() ||
      `Payment ${i + 1}`;
    return {
      seq: i + 1,
      label,
      due_date: String(r!.due_date || planRow?.due_date || "").slice(0, 10),
      amount_gbp: round2(Number(r!.amount_gbp)),
      status: "pending" as const,
      paid_at: null as string | null,
      paid_via: null as string | null,
    };
  });
  const termAmount = round2(schedule.reduce((s, r) => s + r.amount_gbp, 0));
  const firstDue = schedule[0]?.due_date || planInv.dueDateIso;

  let lineItems = planInv.lineItems || [];
  let lineDescription = planInv.lineDescription || planInv.label;
  if (productMap) {
    lineItems = buildReenrolTermLineItems({
      slots: WEEKLY_SLOTS,
      weeklyChoices,
      term: g.term,
      vatMode: plan.vatMode,
      productMap,
    });
    // Scale programme lines to net of GC fees already in termAmount
    const gcFees = round2(schedule.length * 1.5);
    const net = round2(termAmount - gcFees);
    const progTotal = round2(
      lineItems.reduce((s, l) => s + Number(l.amount_gbp || 0), 0),
    );
    if (progTotal > 0 && Math.abs(progTotal - net) > 0.02) {
      const factor = net / progTotal;
      lineItems = lineItems.map((l) => {
        const amt = round2(Number(l.amount_gbp) * factor);
        const qty = Number(l.quantity) || 1;
        return {
          ...l,
          amount_gbp: amt,
          unit_price_gbp: qty ? round2(amt / qty) : amt,
        };
      });
    }
    lineDescription =
      lineItemsToDescription(lineItems, { fundedProvision: false }) +
      `\n\nDirect Payment (GoCardless) · ${schedule.length} monthly instalments · £1.50 collection fee per charge.`;
  }

  const patch = {
    amount_gbp: termAmount,
    amount_paid_gbp: 0,
    payment_status: "unpaid",
    due_date: firstDue,
    next_instalment_due: firstDue,
    payment_schedule: schedule,
    billing_term: g.term,
    reference_text: `${planInv.label} 26/27`,
    line_items: lineItems,
    line_description: lineDescription,
    quantity: 1,
    unit_price_gbp: termAmount,
    notes: appendMarker(
      `Office 14 Aug 2026 · Linda GC monthly_10 whole-year · consolidated to 1 invoice / term · mandate MD0040WYTJ3CXM`,
      keeper.id,
    ),
    share_status: "ready",
    payment_method_hint: "gocardless",
    updated_at: new Date().toISOString(),
  };

  console.log(
    `\n${g.term}: keep ${g.keeper} (£${termAmount}) · hide ${g.trackers.join(", ")}`,
  );
  for (const s of schedule) {
    console.log(`  ${s.seq}. ${s.label} £${s.amount_gbp} ${s.due_date}`);
  }

  if (!APPLY) {
    report.push({ term: g.term, keeper: g.keeper, amount: termAmount, schedule, dry: true });
    continue;
  }

  const { error: kErr } = await admin
    .from("portal_parent_invoice_share")
    .update(patch)
    .eq("id", keeper.id);
  if (kErr) throw new Error(`keeper ${g.keeper}: ${kErr.message}`);

  for (const t of trackerRows) {
    const { error: tErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        share_status: "hidden",
        ready_at: null,
        notes: appendMarker(t!.notes, keeper.id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", t!.id);
    if (tErr) throw new Error(`hide ${t!.invoice_number}: ${tErr.message}`);
  }

  const regen = await regeneratePortalInvoiceSharePdf(admin, keeper.id);
  if (!regen.ok) {
    console.warn(`PDF ${g.keeper}:`, regen.error);
  } else {
    console.log(`PDF ${g.keeper} ok`);
  }

  report.push({
    term: g.term,
    keeper: g.keeper,
    keeper_id: keeper.id,
    amount: termAmount,
    schedule,
    trackers: g.trackers,
    pdf: regen.ok,
  });
}

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/linda-consolidate-gc-terms.json",
  JSON.stringify({ at: new Date().toISOString(), apply: APPLY, report }, null, 2),
);
console.log(
  APPLY
    ? "\nDone. Report → database/local-vault/tmp/linda-consolidate-gc-terms.json"
    : "\nDry run OK. Re-run with APPLY=1 to write.",
);
