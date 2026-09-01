/**
 * Office 17 Aug 2026 — GC mandate link + Rayan term invoices.
 *
 * Arthur Manners (193): Francesca completed setup → MD01KZ61QR4AH5QYTYG1GCNXNBHH
 *   (portal still showed pending). Link mandate + existing Multi-Activity PMs.
 * Arthur Morrissey (201): Father Michael's active MD003XP9JMQFP9 (not Jane's email).
 *   Link mandate + existing PMs; unhide spring/summer term keepers.
 * Rayan Thapa (261): MD003NNWMHXYWG already active; autumn INV-P-0117 + PMs exist.
 *   Stamp autumn; create spring + summer term invoices (monthly_term) + schedule PMs.
 *
 * Dry:
 *   npx -y deno run -A database/local-vault/office-gc-link-arthurs-rayan-terms.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-gc-link-arthurs-rayan-terms.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import {
  gocardlessChargeDate,
  gocardlessCreatePayment,
} from "../../supabase/functions/_shared/gocardless.ts";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { upsertMandateRow } from "../../supabase/functions/_shared/gocardless_portal.ts";
import type { InvoicePaymentScheduleRow } from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

type Share = {
  id: string;
  invoice_number: string;
  amount_gbp: number;
  due_date: string | null;
  share_status: string;
  payment_status: string;
  billing_term: string | null;
  payment_schedule: InvoicePaymentScheduleRow[] | null;
  gocardless_mandate_id: string | null;
  gocardless_payment_id: string | null;
  notes: string | null;
};

async function loadShares(contactId: string): Promise<Share[]> {
  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, amount_gbp, due_date, share_status, payment_status, billing_term, payment_schedule, gocardless_mandate_id, gocardless_payment_id, notes",
    )
    .eq("contact_id", contactId)
    .order("due_date");
  if (error) throw new Error(error.message);
  return (data || []) as Share[];
}

/** Match PM by amount (£) + charge date (YYYY-MM-DD). `payments[].amount` is in pence. */
function findPm(
  pms: Array<{ id: string; amount: number; charge_date: string; status: string }>,
  amountGbp: number,
  dueIso: string,
): string | null {
  const want = Math.round(amountGbp * 100);
  const due = String(dueIso || "").slice(0, 10);
  const active = pms.filter((p) =>
    !["cancelled", "customer_approval_denied", "charged_back", "failed"].includes(p.status)
  );
  const exact = active.find((p) => p.amount === want && p.charge_date === due);
  if (exact) return exact.id;
  /* GC sometimes shifts charge date by 1–3 days */
  const near = active.find((p) => {
    if (p.amount !== want) return false;
    const a = Date.parse(p.charge_date);
    const b = Date.parse(due);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= 4 * 86400000;
  });
  return near?.id || null;
}

async function linkFamily(opts: {
  contactId: string;
  label: string;
  mandateId: string;
  customerId: string;
  parentPersonId?: string | null;
  /** Ready term keepers to unhide if currently hidden */
  unhideInvoiceNumbers?: string[];
  payments: Array<{ id: string; amount: number; charge_date: string; status: string }>;
}) {
  console.log(`\n=== ${opts.label} (${opts.contactId}) → ${opts.mandateId}`);
  const shares = await loadShares(opts.contactId);

  if (APPLY) {
    await upsertMandateRow(admin, {
      contact_id: opts.contactId,
      parent_person_id: opts.parentPersonId || null,
      gocardless_mandate_id: opts.mandateId,
      gocardless_customer_id: opts.customerId,
      mandate_status: "active",
      billing_request_id: null,
      billing_request_flow_id: null,
      authorisation_url: null,
      last_error: null,
    });
    console.log("  mandate row → active");
  } else {
    console.log("  would upsert mandate active (clear pending BRF)");
  }

  for (const inv of shares) {
    if (String(inv.payment_status || "").toLowerCase() === "void") continue;
    const sched = Array.isArray(inv.payment_schedule) ? [...inv.payment_schedule] : [];
    let changed = false;
    let firstPm: string | null = inv.gocardless_payment_id;

    if (sched.length) {
      for (let i = 0; i < sched.length; i++) {
        const row = { ...sched[i] } as InvoicePaymentScheduleRow & {
          gocardless_payment_id?: string | null;
        };
        const due = String(row.due_date || "").slice(0, 10);
        const amt = Number(row.amount_gbp) || 0;
        const pm = findPm(opts.payments, amt, due);
        if (pm && row.gocardless_payment_id !== pm) {
          row.gocardless_payment_id = pm;
          sched[i] = row;
          changed = true;
          if (i === 0) firstPm = pm;
          console.log(`  ${inv.invoice_number} seq${row.seq} £${amt} ${due} → ${pm}`);
        } else if (!pm) {
          console.log(`  ${inv.invoice_number} seq${row.seq} £${amt} ${due} → NO PM MATCH`);
        } else if (i === 0 && !firstPm) {
          firstPm = pm;
        }
      }
    } else {
      const due = String(inv.due_date || "").slice(0, 10);
      const amt = Number(inv.amount_gbp) || 0;
      const pm = findPm(opts.payments, amt, due);
      if (pm && inv.gocardless_payment_id !== pm) {
        firstPm = pm;
        changed = true;
        console.log(`  ${inv.invoice_number} (tracker) £${amt} ${due} → ${pm}`);
      } else if (pm && !firstPm) {
        firstPm = pm;
      }
    }

    const shouldUnhide =
      (opts.unhideInvoiceNumbers || []).includes(inv.invoice_number) &&
      inv.share_status === "hidden";
    const needMandate = inv.gocardless_mandate_id !== opts.mandateId;
    if (!changed && !shouldUnhide && !needMandate) continue;

    const patch: Record<string, unknown> = {
      gocardless_mandate_id: opts.mandateId,
      payment_method_hint: "gocardless",
      updated_at: nowIso(),
    };
    if (firstPm) patch.gocardless_payment_id = firstPm;
    if (changed && sched.length) patch.payment_schedule = sched;
    if (shouldUnhide) {
      patch.share_status = "ready";
      console.log(`  ${inv.invoice_number} unhide → ready`);
    }

    if (APPLY) {
      const { error } = await admin
        .from("portal_parent_invoice_share")
        .update(patch)
        .eq("id", inv.id);
      if (error) throw new Error(`${inv.invoice_number}: ${error.message}`);
    } else {
      console.log(`  would patch ${inv.invoice_number}`, Object.keys(patch).join(","));
    }
  }
}

/* ---------- Rayan spring / summer ---------- */

const RAYAN = {
  contactId: "261",
  parentPersonId: "" as string,
  mandateId: "MD003NNWMHXYWG",
  customerId: "CU004Z71H6APVM",
  autumnPm: {
    "2026-09-01": "PM01XQHK4XK08WHHZWBYM4H32XYG",
    "2026-10-01": "PM01XQHK6F8EZGM80BWRQDGHN63F",
    "2026-11-02": "PM01XQHK95FVNA1XNKGKG9CW508Z",
    "2026-12-01": "PM01XQHKA7763M4BPY6NPG1H3G07",
  } as Record<string, string>,
};

function splitEven(total: number, n: number): number[] {
  const base = Math.floor((total * 100) / n) / 100;
  const parts = Array.from({ length: n }, () => base);
  const sum = round2(parts.reduce((a, b) => a + b, 0));
  parts[parts.length - 1] = round2(parts[parts.length - 1] + (total - sum));
  return parts;
}

async function ensureRayanTerms() {
  console.log("\n=== Rayan Thapa (261)");
  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("contact_id, parent_person_id, child_display, parent_display, email, mobile")
    .eq("contact_id", RAYAN.contactId)
    .limit(1)
    .maybeSingle();
  if (!contact) throw new Error("Rayan contact missing");
  RAYAN.parentPersonId = String(contact.parent_person_id || "");

  const shares = await loadShares(RAYAN.contactId);
  const autumn = shares.find((s) => s.invoice_number === "INV-P-0117");
  if (!autumn) throw new Error("INV-P-0117 missing");

  /* Stamp autumn schedule with existing PMs + mandate */
  const autumnSched = (Array.isArray(autumn.payment_schedule) ? autumn.payment_schedule : []).map(
    (row) => {
      const due = String(row.due_date || "").slice(0, 10);
      let pm = RAYAN.autumnPm[due] || null;
      if (!pm && due.startsWith("2026-11")) pm = RAYAN.autumnPm["2026-11-02"];
      return pm
        ? { ...row, gocardless_payment_id: pm, status: row.status || "pending" }
        : row;
    },
  );
  console.log(
    "  autumn schedule PMs",
    autumnSched.map((r) =>
      `${r.due_date}:${(r as { gocardless_payment_id?: string }).gocardless_payment_id || "—"}`
    ),
  );

  if (APPLY) {
    await upsertMandateRow(admin, {
      contact_id: RAYAN.contactId,
      parent_person_id: RAYAN.parentPersonId || null,
      gocardless_mandate_id: RAYAN.mandateId,
      gocardless_customer_id: RAYAN.customerId,
      mandate_status: "active",
      billing_request_id: null,
      billing_request_flow_id: null,
      authorisation_url: null,
      last_error: null,
    });
    const { error } = await admin
      .from("portal_parent_invoice_share")
      .update({
        gocardless_mandate_id: RAYAN.mandateId,
        gocardless_payment_id: RAYAN.autumnPm["2026-09-01"],
        payment_schedule: autumnSched,
        payment_method_hint: "gocardless",
        updated_at: nowIso(),
      })
      .eq("id", autumn.id);
    if (error) throw new Error(error.message);
    console.log("  INV-P-0117 stamped");
  } else {
    console.log("  would stamp INV-P-0117 + mandate");
  }

  const terms: Array<{
    term: "spring" | "summer";
    face: number;
    months: Array<{ label: string; due: string }>;
  }> = [
    {
      term: "spring",
      face: 554.5, /* 550 + 3×£1.50 */
      months: [
        { label: "January 2027", due: "2027-01-01" },
        { label: "February 2027", due: "2027-02-01" },
        { label: "March 2027", due: "2027-03-01" },
      ],
    },
    {
      term: "summer",
      face: 656, /* 650 + 4×£1.50 */
      months: [
        { label: "April 2027", due: "2027-04-01" },
        { label: "May 2027", due: "2027-05-01" },
        { label: "June 2027", due: "2027-06-01" },
        { label: "July 2027", due: "2027-07-01" },
      ],
    },
  ];

  const ownerUserId = await resolvePortalInvoiceOwnerUserId(admin);
  const existingTerms = new Set(
    shares.map((s) => String(s.billing_term || "").toLowerCase()),
  );

  for (const t of terms) {
    if (existingTerms.has(t.term)) {
      console.log(`  ${t.term} already has invoice — skip create`);
      continue;
    }
    const parts = splitEven(t.face, t.months.length);
    const schedule: InvoicePaymentScheduleRow[] = t.months.map((m, i) => ({
      seq: i + 1,
      label: `Payment · ${m.label}`,
      amount_gbp: parts[i],
      due_date: m.due,
      status: "pending",
      paid_at: null,
      paid_via: null,
    }));
    console.log(
      `  create ${t.term} £${t.face} sched`,
      schedule.map((s) => `£${s.amount_gbp}@${s.due_date}`).join(", "),
    );

    if (!APPLY) continue;

    const created = await createPortalFamilyInvoice(admin, {
      contactId: RAYAN.contactId,
      ownerUserId,
      title: `Invoice — Rayan Thapa · ${t.term === "spring" ? "Spring" : "Summer"} term 26/27`,
      amountGbp: t.face,
      dueDateIso: t.months[0].due,
      lineDescription:
        `30' Aquatic Activity · ${t.term === "spring" ? "Spring" : "Summer"} 26/27 · Admin Fee (GoCardless)\n\nDirect Payment (GoCardless) · ${t.months.length} monthly instalments · £1.50 collection fee per charge.`,
      reference: `Rayan Thapa · ${t.term} 26/27`,
      paymentMethodHint: "gocardless",
      billingTerm: t.term,
      paymentSchedule: schedule,
      shareStatus: "ready",
      readyBy: "office_gc_link_arthurs_rayan_terms_20260817",
      vatMode: "vat_20",
      createdVia: "reenrolment",
      notes: "Office 17 Aug 2026 · monthly_term GC (1 invoice / term).",
    });
    if (!created.ok) throw new Error(`create ${t.term}: ${created.error}`);
    const invId = String(created.invoice?.id || "");
    const invNo = String(created.invoiceNumber || "");
    if (!invId) throw new Error(`create ${t.term}: missing invoice id`);

    const schedOut: Array<InvoicePaymentScheduleRow & { gocardless_payment_id?: string }> = [];
    let firstPm: string | null = null;
    for (const row of schedule) {
      const createdPm = await gocardlessCreatePayment({
        mandateId: RAYAN.mandateId,
        amountPence: Math.round(Number(row.amount_gbp) * 100),
        description: `clubSENsational ${invNo} · ${row.label}`.slice(0, 100),
        chargeDate: gocardlessChargeDate(String(row.due_date)),
        invoiceShareId: invId,
        contactId: RAYAN.contactId,
        invoiceNumber: invNo,
        idempotencyKey: `rayan-${t.term}-seq${row.seq}-${invId}`,
      });
      if (!createdPm.ok) {
        throw new Error(`${invNo} seq${row.seq}: ${createdPm.error} ${createdPm.detail}`);
      }
      const pmId = createdPm.data.id;
      if (!firstPm) firstPm = pmId;
      schedOut.push({ ...row, gocardless_payment_id: pmId });
      console.log(`    PM ${pmId} £${row.amount_gbp} ${row.due_date}`);
    }

    const { error: upErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        gocardless_mandate_id: RAYAN.mandateId,
        gocardless_payment_id: firstPm,
        payment_schedule: schedOut,
        next_instalment_due: t.months[0].due,
        updated_at: nowIso(),
      })
      .eq("id", invId);
    if (upErr) throw new Error(upErr.message);

    try {
      await regeneratePortalInvoiceSharePdf(admin, invId);
    } catch (e) {
      console.warn("  pdf", e);
    }
    console.log(`  ${invNo} ready`);
  }
}

/* ---------- payments lists (from GC live pull earlier) ---------- */

const MANNERS_PMS = [
  { id: "PM01XQEPX853AQZ2PH2R4YQSME8H", amount: 39150, charge_date: "2026-09-01", status: "pending_submission" },
  { id: "PM01XQEPYA9QD7CJEPQ47ATCCWTQ", amount: 39150, charge_date: "2026-10-01", status: "pending_submission" },
  { id: "PM01XQEPZ1T2BABNTTW8ABRFFB1P", amount: 39150, charge_date: "2026-11-02", status: "pending_submission" },
  { id: "PM01XQEPZY185TS3K6RCRG9H06K2", amount: 39150, charge_date: "2026-12-01", status: "pending_submission" },
  { id: "PM01XQEQ1GZ22RDZKEHAAE6MYJ5D", amount: 36150, charge_date: "2027-01-04", status: "pending_submission" },
  { id: "PM01XQEQ2RN9C54BC51BZH0ZFJZT", amount: 36150, charge_date: "2027-02-01", status: "pending_submission" },
  { id: "PM01XQEQ3X9G1JWNA2A3C2SE3CHW", amount: 36150, charge_date: "2027-03-01", status: "pending_submission" },
  { id: "PM01XQEQ5P4A2XGQG5KH6XF6JEW4", amount: 44150, charge_date: "2027-04-01", status: "pending_submission" },
  { id: "PM01XQEQ6S67BF62ZDV9DDDKK5WW", amount: 44150, charge_date: "2027-05-04", status: "pending_submission" },
  { id: "PM01XQEQ7WGX61471M2GTHSH1Y2Y", amount: 44150, charge_date: "2027-06-01", status: "pending_submission" },
];

const MORRISSEY_PMS = [
  { id: "PM01XQEKG0MFVX5XPQ7D7YD6FZHE", amount: 39150, charge_date: "2026-09-01", status: "pending_submission" },
  { id: "PM01XQEKHNMSXF6XJ5XACDVQXXHD", amount: 39150, charge_date: "2026-10-01", status: "pending_submission" },
  { id: "PM01XQEKK40386HSJ5NVDH0866P3", amount: 39150, charge_date: "2026-11-02", status: "pending_submission" },
  { id: "PM01XQEKMDHX6SYP7ZR699B1RXAV", amount: 39150, charge_date: "2026-12-01", status: "pending_submission" },
  { id: "PM01XQEKXN397WCJBG9BR7QYJC7B", amount: 36150, charge_date: "2027-01-04", status: "pending_submission" },
  { id: "PM01XQEKZC668AHQE59R4KA02DHC", amount: 36150, charge_date: "2027-02-01", status: "pending_submission" },
  { id: "PM01XQEMYM39PZ7QQ0EEE149KQXT", amount: 36150, charge_date: "2027-03-01", status: "pending_submission" },
  { id: "PM01XQEN0F4VKW8CBZWW5NENGTR3", amount: 44150, charge_date: "2027-04-01", status: "pending_submission" },
  { id: "PM01XQEN26F3ZDEFDTXA6MA653K8", amount: 44150, charge_date: "2027-05-04", status: "pending_submission" },
  { id: "PM01XQEN398YKVHK269WF4KMRXAT", amount: 44150, charge_date: "2027-06-01", status: "pending_submission" },
];

console.log(APPLY ? "APPLY mode" : "DRY RUN (APPLY=1 to write)");

await linkFamily({
  contactId: "193",
  label: "Arthur Manners / Francesca",
  mandateId: "MD01KZ61QR4AH5QYTYG1GCNXNBHH",
  customerId: "CU01M9MJVQS6N6WCWHZJ4BNR2CQT",
  parentPersonId: "3474090",
  unhideInvoiceNumbers: ["INV-P-0054", "INV-P-0057"],
  payments: MANNERS_PMS,
});

await linkFamily({
  contactId: "201",
  label: "Arthur Morrissey / Michael (father mandate)",
  mandateId: "MD003XP9JMQFP9",
  customerId: "CU005BX4E0WVCR",
  parentPersonId: "1338816",
  unhideInvoiceNumbers: ["INV-P-0091", "INV-P-0092"],
  payments: MORRISSEY_PMS,
});

await ensureRayanTerms();

console.log("\nDone.");
