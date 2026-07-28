/**
 * Ensure Sat/Sun autumn reenrolment slots = 13 sessions, and fix ready invoices
 * that still have Multi-Activity (or any weekend line) at 14 without correct dates.
 *
 * Already fixed earlier: INV-P-0103 (Haneef).
 * Remaining ready: INV-P-0079, INV-P-0083, INV-P-0094 (+ submissions 39/40/68/97).
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-net --allow-read \
 *     database/local-vault/patch-weekend-autumn-13-sessions.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { lineItemsToDescription } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const EXPECTED = 13;
const SUN_DATES =
  "Dates: 6, 13, 20, 27 Sept; 4, 11, 18 Oct; 8, 15, 22, 29 Nov; 6, 13 Dec";
const SAT_DATES =
  "Dates: 5, 12, 19, 26 Sept; 3, 10, 17 Oct; 7, 14, 21, 28 Nov; 5, 12 Dec";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PORTAL_SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function weekendDay(blob: string): "sunday" | "saturday" | null {
  const s = blob.toLowerCase();
  if (/\bsunday\b|\bsun\b/.test(s)) return "sunday";
  if (/\bsaturday\b|\bsat\b/.test(s)) return "saturday";
  return null;
}

function rescaleSchedule(
  schedule: Array<Record<string, unknown>> | null | undefined,
  oldTotal: number,
  newTotal: number,
) {
  if (!Array.isArray(schedule) || !schedule.length || !(oldTotal > 0)) {
    const half = round2(newTotal / 2);
    return [
      {
        seq: 1,
        label: "Autumn term · 1st half",
        status: "pending",
        due_date: "2026-08-15",
        amount_gbp: half,
      },
      {
        seq: 2,
        label: "Autumn term · 2nd half",
        status: "pending",
        due_date: "2026-10-26",
        amount_gbp: round2(newTotal - half),
      },
    ];
  }
  const scaled = schedule.map((row) => {
    const amt = Number(row.amount_gbp) || 0;
    return {
      ...row,
      amount_gbp: round2((amt / oldTotal) * newTotal),
    };
  });
  const sum = round2(scaled.reduce((s, r) => s + Number(r.amount_gbp), 0));
  const drift = round2(newTotal - sum);
  if (Math.abs(drift) >= 0.01 && scaled.length) {
    scaled[scaled.length - 1].amount_gbp = round2(
      Number(scaled[scaled.length - 1].amount_gbp) + drift,
    );
  }
  return scaled;
}

// --- 1) Fix submissions (latest per contact) ---
const { data: subs, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id,participant_contact_id,submitted_at,payload")
  .order("submitted_at", { ascending: false });
if (subErr) throw subErr;

const latest = new Map<string, (typeof subs extends (infer T)[] | null ? T : never)>();
for (const row of subs || []) {
  const cid = String(row.participant_contact_id);
  if (!latest.has(cid)) latest.set(cid, row);
}

let subPatched = 0;
for (const [cid, row] of latest) {
  const payload = structuredClone(row.payload || {}) as Record<string, unknown>;
  const slots = Array.isArray(payload.weekly_slots_snapshot)
    ? payload.weekly_slots_snapshot as Array<Record<string, unknown>>
    : [];
  let touched = false;
  for (const slot of slots) {
    const blob = `${slot.day || ""} ${slot.weekday || ""} ${slot.time || ""} ${slot.timeSlot || ""} ${slot.serviceType || ""} ${slot.service || ""}`;
    const day = weekendDay(blob);
    if (!day) continue;
    const sessions = { ...(slot.sessions as Record<string, number> || {}) };
    if (Number(sessions.autumn) === EXPECTED) continue;
    if (!(Number(sessions.autumn) > 0)) continue;
    console.log(`submission contact ${cid}: ${day} ${slot.serviceType || slot.service} autumn ${sessions.autumn} → ${EXPECTED}`);
    sessions.autumn = EXPECTED;
    sessions.annual = Number(sessions.spring || 0) + EXPECTED + Number(sessions.summer || 0);
    slot.sessions = sessions;
    touched = true;
  }
  if (!touched) continue;
  subPatched++;
  if (!APPLY) continue;
  const { error } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", row.id);
  if (error) console.error("sub update failed", cid, error.message);
}

// --- 2) Fix ready autumn invoices ---
const { data: invoices, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,invoice_number,contact_id,amount_gbp,unit_price_gbp,line_items,line_description,payment_schedule,vat_mode,payment_status",
  )
  .eq("billing_term", "autumn")
  .eq("share_status", "ready")
  .neq("payment_status", "void");
if (invErr) throw invErr;

let invPatched = 0;
for (const inv of invoices || []) {
  const lines = Array.isArray(inv.line_items)
    ? structuredClone(inv.line_items) as Array<Record<string, unknown>>
    : [];
  let changed = false;
  for (const ln of lines) {
    const day = weekendDay(`${ln.description || ""} ${ln.detail || ""}`);
    if (!day) continue;
    const expectedDates = day === "sunday" ? SUN_DATES : SAT_DATES;
    const qty = Number(ln.quantity);
    const unit = Number(ln.unit_price_gbp) || 0;
    const datesNow = ln.dates == null ? "" : String(ln.dates);
    if (qty === EXPECTED && datesNow === expectedDates) continue;
    // Only rewrite whole-term integer session lines (skip monthly fractional shares if any sneak in)
    if (!Number.isInteger(qty) || qty < 10) continue;
    console.log(
      `${inv.invoice_number}: ${ln.description} qty ${qty} → ${EXPECTED}; dates → set`,
    );
    ln.quantity = EXPECTED;
    if (unit > 0) ln.amount_gbp = round2(EXPECTED * unit);
    ln.dates = expectedDates;
    changed = true;
  }
  if (!changed) continue;

  const newTotal = round2(lines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
  const oldTotal = Number(inv.amount_gbp) || newTotal;
  const schedule = rescaleSchedule(
    inv.payment_schedule as Array<Record<string, unknown>> | null,
    oldTotal,
    newTotal,
  );
  const funded = String(inv.vat_mode || "") === "exempt";
  const line_description = lineItemsToDescription(
    lines.map((l) => ({
      service_key: String(l.service_key || ""),
      description: String(l.description || ""),
      detail: l.detail == null ? null : String(l.detail),
      dates: l.dates == null ? null : String(l.dates),
      quantity: Number(l.quantity),
      unit_price_gbp: Number(l.unit_price_gbp),
      amount_gbp: Number(l.amount_gbp),
      xero_item_code: (l.xero_item_code as string | null | undefined) ?? null,
    })),
    { fundedProvision: funded },
  );

  console.log(`  total ${oldTotal} → ${newTotal}`);
  invPatched++;
  if (!APPLY) continue;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: newTotal,
      unit_price_gbp: newTotal,
      quantity: 1,
      line_items: lines,
      line_description,
      payment_schedule: schedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id);
  if (upErr) {
    console.error("invoice update failed", inv.invoice_number, upErr.message);
    continue;
  }
  const pdf = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
  console.log("  pdf", inv.invoice_number, pdf?.ok ? "ok" : pdf);
}

console.log(
  APPLY
    ? `Applied: submissions ${subPatched}, invoices ${invPatched}`
    : `Dry run: would patch submissions ${subPatched}, invoices ${invPatched}. Re-run APPLY=1`,
);
