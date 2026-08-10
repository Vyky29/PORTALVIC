/**
 * Amber Stephens (63) · Nicole — move Wed Aquatic 6–6.30 → 5.30–6.
 * Update MADRE (Luliya · Northolt), re-enrol snapshot, client_payments,
 * paid INV-P-0102 line text + regenerate PDF for re-download.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/patch-amber-wed-530.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/patch-amber-wed-530.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { writeFileSync, mkdirSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "63";
const SUBMISSION_ID = "5229abdc-ff09-4fec-86d5-8db6fb342324";
const INVOICE_NUMBER = "INV-P-0102";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const CRASH_FROM = "2026-07-20";
const FROM_TIME = "6 to 6.30";
const TO_TIME = "5.30 to 6";

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

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function timeKey(t: string): string {
  return norm(t).toLowerCase().replace(/:/g, ".");
}

function isAmber(name: string): boolean {
  const n = norm(name).toLowerCase();
  return n === "amber" || n.indexOf("amber ") === 0 || n.indexOf("amber") === 0;
}

function isOpenSeat(name: string): boolean {
  const n = norm(name).toUpperCase();
  return !n || n === "NO PARTICIPANT" || n === "CLOSED";
}

const report: Record<string, unknown> = { apply: APPLY };

// --- MADRE ---
const { data: madreRow, error: madreErr } = await admin
  .from("portal_madre_document")
  .select("revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (madreErr || !madreRow) throw new Error(`madre: ${madreErr?.message || "missing"}`);
const prevRev = Number(madreRow.revision) || 0;
const doc = structuredClone(madreRow.document) as {
  weeks?: Array<Record<string, unknown>>;
  meta?: { notes?: string[] };
};
const madreLog: string[] = [];

for (const week of doc.weeks || []) {
  const list = Array.isArray(week.staff)
    ? (week.staff as Array<Record<string, unknown>>)
    : (Object.values((week.staff as Record<string, unknown>) || {}) as Array<
      Record<string, unknown>
    >);
  for (const st of list) {
    if (!st) continue;
    const sk = norm(st.staffKey || st.name).toLowerCase();
    for (const day of (st.days as Array<Record<string, unknown>>) || []) {
      if (!day) continue;
      const iso = norm(day.sessionDate).slice(0, 10);
      if (iso && iso >= CRASH_FROM) continue;
      if (!/wed/i.test(norm(day.weekday))) continue;

      const slots = (day.slots as Array<Record<string, unknown>>) || [];
      let amberSlot: Record<string, unknown> | null = null;
      let targetSlot: Record<string, unknown> | null = null;
      for (const slot of slots) {
        if (!slot) continue;
        if (!/aquatic/i.test(norm(slot.service))) continue;
        if (!/northolt/i.test(norm(slot.venue))) continue;
        // Prefer Luliya line (current home); allow same staff holding Amber at 6.
        if (sk !== "lulia" && sk !== "luliya") continue;
        const t = timeKey(String(slot.time_slot || ""));
        if (isAmber(String(slot.client_name || "")) && (t === "6 to 6.30" || t === "6 to 6.30pm")) {
          amberSlot = slot;
        }
        if (t === "5.30 to 6" || t === "5.30 to 6.00") targetSlot = slot;
      }
      if (!amberSlot) continue;
      if (!targetSlot) {
        madreLog.push(`${iso} ${sk}: Amber at 6 but no 5.30 slot — SKIP`);
        continue;
      }
      const targetClient = norm(targetSlot.client_name);
      if (isAmber(targetClient)) {
        madreLog.push(`${iso} ${sk}: already at 5.30`);
        // clear old 6 if still Amber somehow
        if (amberSlot !== targetSlot) {
          amberSlot.client_name = "NO PARTICIPANT";
          amberSlot.participant_info = "";
        }
        continue;
      }
      if (!isOpenSeat(targetClient)) {
        madreLog.push(`${iso} ${sk}: 5.30 occupied by ${targetClient} — SKIP`);
        continue;
      }
      targetSlot.client_name = "Amber";
      targetSlot.participant_info = amberSlot.participant_info || "";
      amberSlot.client_name = "NO PARTICIPANT";
      amberSlot.participant_info = "";
      madreLog.push(`${iso} ${sk}: Amber 6 to 6.30 → 5.30 to 6 (was ${targetClient || "empty"})`);
    }
  }
}

report.madre = { prevRev, log: madreLog };
console.log("MADRE", JSON.stringify(report.madre, null, 2));

// --- Re-enrol submission ---
const { data: sub } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, payload")
  .eq("id", SUBMISSION_ID)
  .maybeSingle();
if (!sub) throw new Error("submission missing");
const payload = structuredClone(sub.payload || {}) as Record<string, unknown>;
const slotsSnap = Array.isArray(payload.weekly_slots_snapshot)
  ? (payload.weekly_slots_snapshot as Array<Record<string, unknown>>)
  : [];
for (const s of slotsSnap) {
  if (!s) continue;
  const t = timeKey(String(s.timeSlot || ""));
  if (t === "6 to 6.30" || /6 to 6\.30/.test(String(s.displayLabel || ""))) {
    s.timeSlot = TO_TIME;
    s.displayLabel = "30' Aquatic Activity - 5.30 to 6 pm, Wednesdays";
    s.venue = s.venue || "Northolt";
  }
}
payload.office_note =
  String(payload.office_note || "") +
  (String(payload.office_note || "").trim() ? " · " : "") +
  "Office 10 Aug 2026: Amber Wed Aquatic moved 6–6.30 → 5.30–6 (Northolt).";
payload.weekly_slots_snapshot = slotsSnap;
report.submission = { id: SUBMISSION_ID, slots: slotsSnap };
console.log("Submission slots →", JSON.stringify(slotsSnap, null, 2));

// --- client_payments ---
const { data: cp } = await admin
  .from("client_payments")
  .select("client_key, data")
  .eq("client_key", "amber")
  .maybeSingle();
const cpData = { ...(cp?.data || {}) } as Record<string, unknown>;
const prevServices = String(cpData.Services || "");
cpData.Services = "30' Aquatic Activity, Wednesday - 5.30 to 6";
report.client_payments = { before: prevServices, after: cpData.Services };
console.log("client_payments", report.client_payments);

// --- Invoice INV-P-0102 ---
const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, line_items, line_description, payment_status, amount_gbp")
  .eq("invoice_number", INVOICE_NUMBER)
  .maybeSingle();
if (invErr || !inv) throw new Error(`invoice: ${invErr?.message || "missing"}`);
const lineItems = (Array.isArray(inv.line_items) ? inv.line_items : []).map((l) => {
  const row = { ...(l as PortalInvoiceLineItem) };
  const detail = String(row.detail || "");
  row.detail = detail
    .replace(/6 to 6\.30\s*pm/gi, "5.30 to 6 pm")
    .replace(/6 to 6\.30/gi, "5.30 to 6");
  if (!/5\.30 to 6/i.test(row.detail) && /wednesday/i.test(detail + " " + row.description)) {
    row.detail = "Wednesday 5.30 to 6 pm";
  }
  return row;
}) as PortalInvoiceLineItem[];
const lineDescription = lineItemsToDescription(lineItems, { fundedProvision: false });
report.invoice = {
  id: inv.id,
  number: inv.invoice_number,
  payment_status: inv.payment_status,
  before: inv.line_description,
  after: lineDescription,
  line_items: lineItems,
};
console.log("Invoice", INVOICE_NUMBER, inv.payment_status);
console.log("  before:", inv.line_description);
console.log("  after:", lineDescription);

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1");
  Deno.exit(0);
}

const moved = madreLog.filter((l) => l.includes("→")).length;
if (moved) {
  doc.meta = doc.meta || {};
  doc.meta.notes = Array.isArray(doc.meta.notes) ? doc.meta.notes : [];
  doc.meta.notes.push(
    `rev ${prevRev + 1}: Amber Wed Aquatic Luliya Northolt 6–6.30 → 5.30–6 (Nicole paid INV-P-0102; PDF regenerated)`,
  );
  const { data: madreOut, error: madrePutErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: prevRev + 1,
      updated_at: new Date().toISOString(),
      updated_by: OFFICE_USER,
    })
    .eq("term_key", "summer-2026")
    .eq("revision", prevRev)
    .select("revision")
    .maybeSingle();
  if (madrePutErr || !madreOut) {
    throw new Error(`madre patch: ${madrePutErr?.message || "revision conflict"}`);
  }
  report.madreNextRev = madreOut.revision;
  console.log("MADRE", prevRev, "→", madreOut.revision);
} else {
  console.log("MADRE: no seat moves (already done or skipped)");
}

{
  const { error } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", SUBMISSION_ID);
  if (error) throw new Error(`submission: ${error.message}`);
  console.log("Submission updated");
}

{
  const { error } = await admin
    .from("client_payments")
    .update({ data: cpData })
    .eq("client_key", "amber");
  if (error) throw new Error(`client_payments: ${error.message}`);
  console.log("client_payments updated");
}

{
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      line_items: lineItems,
      line_description: lineDescription,
      updated_at: new Date().toISOString(),
      notes: [
        String((inv as { notes?: string }).notes || "").trim(),
        "Office 10 Aug 2026: time corrected to Wed 5.30–6 pm; PDF regenerated after move.",
      ]
        .filter(Boolean)
        .join(" · "),
    })
    .eq("id", inv.id);
  if (error) throw new Error(`invoice update: ${error.message}`);
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
  report.pdf = regen;
  console.log("PDF regen", regen);
}

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/patch-amber-wed-530-report.json",
  JSON.stringify(report, null, 2),
);
console.log("Report → database/local-vault/tmp/patch-amber-wed-530-report.json");
