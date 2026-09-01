/**
 * Fix Anas Ismail INV-P-0340:
 * - Was wrong: Tue Aurora 6–6.30 · 7×£50 = £350
 * - Correct: Mon Northolt Dan 4.30–5 · 14 sessions £700 (full autumn)
 *   + £350 outstanding balance he still owes
 * - Format line_items like other reenrol INV-Ps (detail + Dates:)
 * - MADRE: clear Tue Aurora; place Anas on Mon Northolt 4.30–5 Dan
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-anas-inv-p-0340-monday-700-plus-350.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-anas-inv-p-0340-monday-700-plus-350.ts
 */
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  loadProductMap,
  slotTermSessionDates,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "7560101";
const INVOICE_ID = "bf69092f-21aa-46e5-b787-f84f5127fcba";
const INVOICE_NUMBER = "INV-P-0340";
const DUE = "2026-09-05";
const AQ = "Aquatic Activity";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function norm(v: unknown) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function timeKey(t: unknown) {
  return norm(t).toLowerCase().replace(/:/g, ".");
}
function isMon430(t: string) {
  return /^4\.?30\s*to\s*5(\.00)?$/.test(t) || /^16\.?30\s*to\s*17(\.00)?$/.test(t);
}
function isTue630(t: string) {
  return /^6(\.00)?\s*to\s*6\.30$/.test(t) || /^18(\.00)?\s*to\s*18\.30$/.test(t);
}

function loadAnasInfo(): string {
  for (const p of [
    "working_ui/portal/clients_info_embed.js",
    "working_ui/clients_info_embed.js",
  ]) {
    try {
      const ctx: Record<string, unknown> = { window: {} };
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(p, "utf8"), ctx);
      const win = ctx.window as {
        PORTAL_CLIENTS_INFO_ROWS?: Array<{ client_name?: string; client_info?: string }>;
      };
      const hit = (win.PORTAL_CLIENTS_INFO_ROWS || []).find((r) =>
        /anas/i.test(String(r.client_name || ""))
      );
      if (hit?.client_info) return String(hit.client_info);
    } catch {
      /* next */
    }
  }
  return "";
}

function findStaff(week: Record<string, unknown>, key: string) {
  const want = key.toLowerCase();
  const staff = (week.staff || {}) as Record<string, Record<string, unknown>>;
  // staff may be object map OR array
  if (Array.isArray(week.staff)) {
    return (week.staff as Array<Record<string, unknown>>).find((s) => {
      if (!s) return false;
      const k = String(s.staffKey || s.name || s.instructor || "").toLowerCase();
      return k === want || k.includes(want);
    });
  }
  return Object.entries(staff).find(([k, s]) => {
    if (!s) return false;
    return String(s.staffKey || k || "").toLowerCase() === want;
  })?.[1];
}

async function patchMadre(anasInfo: string) {
  const { data: rows, error } = await admin
    .from("portal_madre_document")
    .select("term_key,revision,document")
    .eq("term_key", "summer-2026")
    .single();
  if (error || !rows) throw new Error(`madre: ${error?.message || "missing"}`);
  const prevRev = Number(rows.revision) || 0;
  const doc = structuredClone(rows.document) as {
    weeks?: Array<Record<string, unknown>>;
    meta?: { notes?: string[] };
  };
  const log: string[] = [];

  for (const week of doc.weeks || []) {
    // Clear wrong Tue Aurora 6–6.30 Anas → NO PARTICIPANT
    const aurora = findStaff(week, "aurora");
    if (aurora) {
      for (const day of (aurora.days as Array<Record<string, unknown>>) || []) {
        if (norm(day.weekday) !== "Tuesday") continue;
        const iso = norm(day.sessionDate).slice(0, 10);
        for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
          if (!/acton/i.test(norm(s.venue))) continue;
          if (!isTue630(timeKey(s.time_slot))) continue;
          if (!/anas/i.test(norm(s.client_name))) continue;
          s.client_name = "NO PARTICIPANT";
          log.push(`${iso} Aurora Tue Acton 6–6.30 Anas → NO PARTICIPANT`);
        }
      }
    }

    // Place Anas on Mon Northolt Dan 4.30–5
    const dan = findStaff(week, "dan") || findStaff(week, "daniel");
    if (!dan) continue;
    for (const day of (dan.days as Array<Record<string, unknown>>) || []) {
      if (norm(day.weekday) !== "Monday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      // Prefer standing / pre-crash + any autumn-ish; patch all Mon Dan Northolt 4.30
      for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
        if (!/northolt/i.test(norm(s.venue))) continue;
        if (!isMon430(timeKey(s.time_slot))) continue;
        const svc = norm(s.service);
        if (svc && !/aquatic|swim/i.test(svc)) continue;
        const before = norm(s.client_name) || "(empty)";
        s.client_name = "Anas";
        s.service = AQ;
        s.venue = "Northolt";
        s.time_slot = "4.30 to 5";
        s.instructors = "DAN";
        if (!norm(s.area)) s.area = "Teaching Pool";
        if (anasInfo) s.participant_info = anasInfo;
        log.push(`${iso} Dan Mon Northolt 4.30–5 ${before} → Anas`);
      }
    }
  }

  if (!log.length) return { prevRev, nextRev: prevRev, log };
  if (!APPLY) {
    console.log("[dry] MADRE would patch", log.length, "rows");
    console.log(log.slice(0, 8).join("\n"));
    return { prevRev, nextRev: prevRev, log };
  }
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Anas → Mon Northolt Dan 4.30–5; clear wrong Tue Aurora 6–6.30`,
  );
  const { data: out, error: upErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: prevRev + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("term_key", "summer-2026")
    .eq("revision", prevRev)
    .select("revision")
    .single();
  if (upErr || !out) throw new Error(`madre update: ${upErr?.message || "failed"}`);
  return { prevRev, nextRev: out.revision, log };
}

const anasInfo = loadAnasInfo();
const productMap = await loadProductMap(admin);
const dates = slotTermSessionDates("autumn", "Monday", 14) ||
  "Dates: 7, 14, 21, 28 Sept; 5, 12, 19 Oct; 2, 9, 16, 23, 30 Nov; 7, 14 Dec";

const termQty = 14;
const termUnit = 50;
const termAmt = termQty * termUnit; // 700
const arrearsAmt = 350;
const totalAmt = termAmt + arrearsAmt; // 1050

const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_30",
    description: "Aquatic Activity 30'",
    detail: "Monday 4.30 to 5 pm · Northolt",
    dates,
    quantity: termQty,
    unit_price_gbp: termUnit,
    amount_gbp: termAmt,
    xero_item_code: xeroItemCodeForService(productMap, "AQUATIC_30", "vat_20"),
  },
  {
    service_key: "BALANCE",
    description: "Outstanding balance",
    detail: "Previous amount owed",
    dates: null,
    quantity: 1,
    unit_price_gbp: arrearsAmt,
    amount_gbp: arrearsAmt,
    xero_item_code: null,
  },
];
const description = lineItemsToDescription(lineItems, { fundedProvision: false });

console.log("Anas Ismail · Heba — fix INV-P-0340");
console.log("Place: Monday 4.30–5 Aquatic · Northolt · Dan");
console.log("Term:", termQty, "×", termUnit, "=", termAmt, "+", arrearsAmt, "arrears =", totalAmt);
console.log("Dates:", dates);
console.log("Desc preview:", description.slice(0, 280));

const madre = await patchMadre(anasInfo);
console.log("MADRE", {
  prevRev: madre.prevRev,
  nextRev: madre.nextRev,
  rows: madre.log.length,
});

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const { data: updated, error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: totalAmt,
    due_date: DUE,
    vat_mode: "vat_20",
    line_description: description,
    reference_text: "Autumn term 26/27",
    quantity: termQty,
    unit_price_gbp: termUnit,
    billing_term: "autumn",
    line_items: lineItems,
    payment_schedule: [
      {
        seq: 1,
        label: "Autumn term + outstanding balance",
        status: "pending",
        due_date: DUE,
        amount_gbp: totalAmt,
      },
    ],
    next_instalment_due: DUE,
    notes:
      "Corrected 10 Aug 2026 — Mon Northolt Dan 4.30–5 · 14×£50=£700 autumn + £350 outstanding = £1,050. Private VAT included. Was wrongly Tue Aurora 7×£50.",
    ready_by: "office_anas_mon_430_700_plus_350",
    updated_at: now,
  })
  .eq("id", INVOICE_ID)
  .select("id, invoice_number, amount_gbp")
  .maybeSingle();
if (upErr || !updated) throw new Error(upErr?.message || "invoice update failed");

await admin
  .from("documents")
  .update({
    title: `Invoice — Anas Ismail · Autumn term 26/27`,
    related_date: DUE,
  })
  .eq(
    "id",
    (
      await admin
        .from("portal_parent_invoice_share")
        .select("document_id")
        .eq("id", INVOICE_ID)
        .maybeSingle()
    ).data?.document_id || "",
  );

const regen = await regeneratePortalInvoiceSharePdf(admin, INVOICE_ID);
if (!regen.ok) console.warn("PDF regen failed:", regen.error);
else console.log("PDF regenerated:", regen.pdfStoragePath);

console.log("Done:", INVOICE_NUMBER, "£" + totalAmt);
void CONTACT_ID;
