/**
 * NHS + H&F monthly INV-Ps and Ealing annual INV-Ps: due dates a mes vencido.
 *
 * - Service month September → due 1 October (etc.)
 * - Ealing: one annual INV-P, 11 BACS instalments each due the month after
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-funder-dues-mes-vencido.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-funder-dues-mes-vencido.ts
 * Regen PDFs for ready rows:
 *   APPLY=1 REGEN_PDF=1 npx -y deno run -A database/local-vault/office-funder-dues-mes-vencido.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const REGEN_PDF = (Deno.env.get("REGEN_PDF") || "") === "1";

const MONTHS_11: Array<{ label: string; ym: string; dueIso: string }> = [
  { label: "September 2026", ym: "2026-09", dueIso: "2026-10-01" },
  { label: "October 2026", ym: "2026-10", dueIso: "2026-11-01" },
  { label: "November 2026", ym: "2026-11", dueIso: "2026-12-01" },
  { label: "December 2026", ym: "2026-12", dueIso: "2027-01-01" },
  { label: "January 2027", ym: "2027-01", dueIso: "2027-02-01" },
  { label: "February 2027", ym: "2027-02", dueIso: "2027-03-01" },
  { label: "March 2027", ym: "2027-03", dueIso: "2027-04-01" },
  { label: "April 2027", ym: "2027-04", dueIso: "2027-05-01" },
  { label: "May 2027", ym: "2027-05", dueIso: "2027-06-01" },
  { label: "June 2027", ym: "2027-06", dueIso: "2027-07-01" },
  { label: "July 2027", ym: "2027-07", dueIso: "2027-08-01" },
];

const YM_TO_DUE = Object.fromEntries(MONTHS_11.map((m) => [m.ym, m.dueIso]));

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function splitEqualAcrossMonths(totalGbp: number, n: number): number[] {
  const count = Math.max(1, Math.round(n) || 1);
  const total = round2(totalGbp);
  if (total <= 0) return Array.from({ length: count }, () => 0);
  const per = round2(total / count);
  const out = Array.from({ length: count }, () => per);
  const head = round2(per * (count - 1));
  out[count - 1] = round2(total - head);
  return out;
}

function noteLine(prev: string, line: string): string {
  const base = String(prev || "").trim();
  if (base.includes("mes vencido")) return base.slice(0, 2000);
  return [base, line].filter(Boolean).join("\n").slice(0, 2000);
}

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, ready_by, due_date, next_instalment_due, amount_gbp, payment_schedule, share_status, notes, payment_status",
  )
  .neq("payment_status", "void")
  .or(
    "ready_by.like.office_funder_2627_nhs_month_%,ready_by.like.office_funder_2627_hf_month_%,ready_by.like.office_funder_2627_ealing_year_%",
  );

if (error) throw new Error(error.message);

console.log(APPLY ? "APPLY" : "DRY RUN", `rows=${(rows || []).length}`);

let patched = 0;
let skipped = 0;
let pdfOk = 0;
let pdfFail = 0;

for (const row of rows || []) {
  const readyBy = String(row.ready_by || "");
  const monthMatch = readyBy.match(/_(?:nhs|hf)_month_(\d{4}-\d{2})_/);
  const isEaling = /_ealing_year_/.test(readyBy);

  let dueIso = "";
  let schedule: Array<Record<string, unknown>> = [];

  if (monthMatch) {
    const ym = monthMatch[1];
    dueIso = YM_TO_DUE[ym] || "";
    if (!dueIso) {
      console.warn("skip unknown ym", row.invoice_number, ym);
      skipped += 1;
      continue;
    }
    const prevSched = Array.isArray(row.payment_schedule) ? row.payment_schedule : [];
    const first = (prevSched[0] || {}) as Record<string, unknown>;
    const label =
      String(first.label || "").trim() ||
      `${MONTHS_11.find((m) => m.ym === ym)?.label || ym} · funder invoice`;
    schedule = [
      {
        ...first,
        seq: 1,
        label,
        due_date: dueIso,
        amount_gbp: Number(first.amount_gbp) || Number(row.amount_gbp) || 0,
        status: String(first.status || "pending"),
        paid_at: first.paid_at ?? null,
        paid_via: first.paid_via ?? null,
      },
    ];
  } else if (isEaling) {
    const amounts = splitEqualAcrossMonths(Number(row.amount_gbp) || 0, MONTHS_11.length);
    schedule = MONTHS_11.map((m, i) => ({
      seq: i + 1,
      label: `${m.label} · Ealing BACS`,
      due_date: m.dueIso,
      amount_gbp: amounts[i] || 0,
      status: "pending",
      collect_via: "bank_transfer",
      paid_at: null,
      paid_via: null,
    }));
    dueIso = MONTHS_11[0].dueIso;
  } else {
    skipped += 1;
    continue;
  }

  const curDue = String(row.due_date || "").slice(0, 10);
  const curNext = String(row.next_instalment_due || "").slice(0, 10);
  const curSched0 = Array.isArray(row.payment_schedule) && row.payment_schedule[0]
    ? String((row.payment_schedule[0] as { due_date?: string }).due_date || "").slice(0, 10)
    : "";
  const ealingNeedsSched = isEaling &&
    (!Array.isArray(row.payment_schedule) || row.payment_schedule.length < 11);

  if (curDue === dueIso && curNext === dueIso && curSched0 === dueIso && !ealingNeedsSched) {
    skipped += 1;
    continue;
  }

  console.log(
    `${row.invoice_number} ${readyBy.slice(0, 56)} due ${curDue || "—"} → ${dueIso}` +
      (isEaling ? ` · ${schedule.length} instalments` : ""),
  );

  if (!APPLY) {
    patched += 1;
    continue;
  }

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      due_date: dueIso,
      next_instalment_due: dueIso,
      payment_schedule: schedule,
      notes: noteLine(
        String(row.notes || ""),
        "Office 2 Sep 2026: funder dues a mes vencido (NHS/H&F invoice; Ealing per instalment).",
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (upErr) {
    console.error("FAIL", row.invoice_number, upErr.message);
    continue;
  }
  patched += 1;

  if (REGEN_PDF && String(row.share_status) === "ready") {
    const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
    if (regen.ok) {
      pdfOk += 1;
      console.log("  PDF ok", regen.pdfStoragePath);
    } else {
      pdfFail += 1;
      console.error("  PDF fail", (regen as { error?: string }).error);
    }
  }
}

console.log(`\npatched=${patched} skipped=${skipped} pdfOk=${pdfOk} pdfFail=${pdfFail}`);
if (!APPLY) console.log("Re-run with APPLY=1 (and optionally REGEN_PDF=1).");
