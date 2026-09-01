/**
 * Anas Ismail (7560101) · Heba Aboueita
 * - MADRE: Tue Acton Aquatic Aurora 6–6.30 → Anas
 * - Invoice £350 unpaid (7 × £50 autumn aquatic 30') · Private VAT included
 *   (contact had no funding_label / no LA markers — treated as privately funded)
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-aurora-tue-630-invoice-350.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-aurora-tue-630-invoice-350.ts
 */
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  loadProductMap,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "7560101";
const PARENT_PERSON_ID = "7560102";
const DUE = "2026-09-05";
const READY_BY = "office_anas_aurora_tue_630_invoice_350";
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
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function norm(v: unknown) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeKey(t: unknown) {
  return norm(t)
    .toLowerCase()
    .replace(/:/g, ".");
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
      const win = ctx.window as { PORTAL_CLIENTS_INFO_ROWS?: Array<{ client_name?: string; client_info?: string }> };
      const rows = win.PORTAL_CLIENTS_INFO_ROWS || [];
      const hit = rows.find((r) => /anas/i.test(String(r.client_name || "")));
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
    const aurora = findStaff(week, "aurora");
    if (!aurora) continue;
    for (const day of (aurora.days as Array<Record<string, unknown>>) || []) {
      if (norm(day.weekday) !== "Tuesday") continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
        if (!/acton/i.test(norm(s.venue))) continue;
        const svc = norm(s.service);
        if (svc && !/aquatic|swim/i.test(svc)) continue;
        const t = timeKey(s.time_slot);
        if (!/^6(\.00)?\s*to\s*6\.30$/.test(t) && !/^18(\.00)?\s*to\s*18\.30$/.test(t)) {
          continue;
        }
        const before = norm(s.client_name) || "(empty)";
        s.client_name = "Anas";
        s.service = AQ;
        s.venue = "Acton";
        s.time_slot = "6 to 6.30";
        s.instructors = "AURORA";
        if (!norm(s.area)) s.area = "Teaching Pool";
        if (anasInfo) s.participant_info = anasInfo;
        log.push(`${iso} Aurora 6–6.30 ${before} → Anas`);
      }
    }
  }
  if (!log.length) return { prevRev, nextRev: prevRev, log };
  if (!APPLY) {
    console.log("[dry] MADRE would patch", log.length, "days", log.slice(0, 3));
    return { prevRev, nextRev: prevRev, log };
  }
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Aurora Tue Acton 6–6.30 → Anas (office place)`,
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
console.log("Anas Ismail (7560101) · Heba Aboueita");
console.log("Funding on file: (blank) → treating as PRIVATE · VAT included 20%");
console.log("Place: Tue 6–6.30 Aquatic · Acton · Aurora");
console.log("Invoice: £350 = 7 × £50 (autumn aquatic 30') · unpaid · due", DUE);
console.log("participant_info chars", anasInfo.length);

const madre = await patchMadre(anasInfo);
console.log("MADRE", { prevRev: madre.prevRev, nextRev: madre.nextRev, days: madre.log.length });

const qty = 7;
const unit = 50;
const amount = qty * unit;
const productMap = await loadProductMap(admin);
const lineItems: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_30",
    description: "Aquatic Activity 30' (1to1)",
    detail: "Autumn 26/27 · Tuesday 6.00–6.30pm · Acton · Aurora",
    dates: "Tue 6 to 6.30 · Acton",
    quantity: qty,
    unit_price_gbp: unit,
    amount_gbp: amount,
    xero_item_code: xeroItemCodeForService(productMap, "AQUATIC_30", "vat_20"),
  },
];
const description = lineItemsToDescription(lineItems, { fundedProvision: false });
console.log("Lines:", description.slice(0, 200));

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write MADRE + invoice + funding.");
  Deno.exit(0);
}

// Mark contact privately funded for future invoices.
await admin
  .from("portal_parent_contacts")
  .update({
    funding_label: "Privately",
    payment_method_label: "Bank Transfer / Card / Apple Pay",
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", CONTACT_ID);

const ownerUserId = await resolvePortalInvoiceOwnerUserId(admin, CONTACT_ID);
const created = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: amount,
  dueDateIso: DUE,
  invoiceDateIso: new Date().toISOString().slice(0, 10),
  vatMode: "vat_20",
  lineDescription: description,
  reference: "Autumn term 26/27",
  service: "Aquatic Activity",
  notes:
    "Office place · Tue 6–6.30 Acton Aurora · £350 (7×£50) · Private VAT included. Contact funding was blank — set Privately.",
  shareStatus: "ready",
  paymentMethodHint: "bank_transfer",
  createdVia: "portal",
  ownerUserId,
  readyBy: READY_BY,
  billingTerm: "autumn",
  lineItems,
  quantity: qty,
});
if (!created.ok) throw new Error(created.error);
console.log("Invoice", created.invoiceNumber, "doc", created.documentId);

// Family-visible open credit/charge note: ledger credit is money owed TO family.
// User asked for £350 he must PAY → that is the unpaid invoice above.
// Also record an admin note credit row? Skip — invoice is the payable.

try {
  await xeroHydrateRefreshFromDb(admin);
  const push = await pushPortalInvoiceShareToXero(admin, {
    invoiceNumber: created.invoiceNumber,
  });
  await xeroPersistRefreshToDb(admin);
  console.log("Xero push", push);
} catch (e) {
  console.warn("Xero push skipped/failed:", e);
}

console.log("Done.");
void PARENT_PERSON_ID;
