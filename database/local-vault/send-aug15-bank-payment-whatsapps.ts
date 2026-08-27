/**
 * Chase / final reminder: first Autumn bank-transfer payment (due Sat 15 Aug 2026).
 * Only families whose Aug-15 instalment is still unpaid (not partial-with-1st-paid,
 * not pending bank confirm, not GC/LA).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-aug15-bank-payment-whatsapps.ts
 *
 * Send:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-aug15-bank-payment-whatsapps.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
  WHATSAPP_TEMPLATE_BODY_MAX,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";
import { aug15FirstObligationSettled } from "../../supabase/functions/_shared/portal_reenrol_release_unpaid_aug15.ts";

const CAMPAIGN_KIND = "autumn_bank_pay_final_20260814";
const PORTAL_URL = "https://www.clubsensational.org/parent";
const OUT_DIR = "database/local-vault/tmp";
const OUT_JSON = `${OUT_DIR}/aug15-bank-pay-chase-recipients.json`;
const OUT_REPORT = `${OUT_DIR}/aug15-bank-pay-chase-send-report.json`;

/** Wave from pay-waves canvas (bank · 15 Aug) — exclude already-paid at list time. */
const WAVE_INVS = [
  "INV-P-0131",
  "INV-P-0139",
  "INV-P-0148",
  "INV-P-0132",
  "INV-P-0014",
  "INV-P-0060",
  "INV-P-0083",
  "INV-P-0115",
  "INV-P-0342",
  "INV-P-0106",
  "INV-P-0134",
  "INV-P-0135",
  "INV-P-0093",
  "INV-P-0072",
  "INV-P-0121",
  "INV-P-0122",
  "INV-P-0133",
  "INV-P-0105",
  "INV-P-0138",
  "INV-P-0341",
  "INV-P-0109",
  "INV-P-0114",
  "INV-P-0098",
  "INV-P-0130",
  "INV-P-0116",
  "INV-P-0097", // Yamik — excluded below
  "INV-P-0145",
  "INV-P-0111",
  "INV-P-0094",
  "INV-P-0099",
];

/** Always exclude from send (office holds only). */
const EXCLUDE_INVOICE = new Set<string>([]);
const EXCLUDE_PARTICIPANT = [/yamik/i]; // Yamik 1st half already paid — keep out of reminders

/** Extra unpaid bank invoices to include if present (Assign / late). */
const EXTRA_LOOKUPS = [
  {
    label: "Patrick",
    childRe: /patrick/i,
    parentRe: /orla/i,
    // Autumn term only — do not chase crash-week INV-P-CRASH-* as Aug 15 Autumn due.
    requireAutumn: true,
  },
  { label: "Anas", childRe: /anas/i, parentRe: /heba/i, invoice: "INV-P-0340" },
];

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = readFileSync("local-secrets/secrets.env", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line
      ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "")
      : "";
  } catch {
    return "";
  }
}

function clean(v: unknown, n = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function firstName(display: string): string {
  const d = clean(display).replace(/\(.*?\)/g, "").trim();
  return d.split(/\s+/)[0] || "there";
}

function childLine(names: string[]): string {
  const kids = names.filter(Boolean);
  if (!kids.length) return "your child";
  if (kids.length === 1) return kids[0];
  if (kids.length === 2) return `${kids[0]} and ${kids[1]}`;
  return `${kids.slice(0, -1).join(", ")} and ${kids[kids.length - 1]}`;
}

function buildMessage(parentFirst: string, kids: string[]): string {
  return (
    `Hi ${parentFirst},\n\n` +
    `Final reminder: the first Autumn 2026/27 payment for ${childLine(kids)} is due by Saturday 15 August (end of day).\n\n` +
    `You’ll find the invoice in the Parent Portal:\n` +
    `${PORTAL_URL}\n\n` +
    `Once you’ve paid by bank transfer (or Card / Apple Pay), please tap the green I’ve paid by bank transfer button so we can confirm.\n\n` +
    `If payment is not completed by then, those places are released automatically from Sunday 16 August 00:00 and added to available slots on our Booking Portal. You can open it from your Parent Portal under the Booking portal button.\n\n` +
    `Thanks,\nclubSENsational`
  );
}

for (const key of [
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_PAYMENT",
  "META_WHATSAPP_TEMPLATE_LANG",
]) {
  if (!Deno.env.get(key)) {
    const value = secret(key);
    if (value) Deno.env.set(key, value);
  }
}

const send = Deno.args.includes("--send");
const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: contacts, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, child_first_name, parent_display, parent_first_name, parent_person_id, mobile, email",
  )
  .limit(8000);
if (cErr) throw cErr;
const contactById = new Map((contacts || []).map((c) => [clean(c.contact_id), c]));

const { data: invRows, error: iErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, payment_method_hint, amount_gbp, amount_paid_gbp, parent_reported_paid_at, line_description, notes, created_via, payment_schedule, due_date, next_instalment_due",
  )
  .in("invoice_number", WAVE_INVS);
if (iErr) throw iErr;

type Target = {
  invoice_number: string;
  contact_id: string;
  child: string;
  parent: string;
  parent_first: string;
  mobile: string;
  email: string;
  amount_gbp: number;
  source: string;
};

function isChaseable(row: {
  payment_status?: string | null;
  payment_method_hint?: string | null;
  parent_reported_paid_at?: string | null;
  payment_schedule?: unknown;
  amount_paid_gbp?: number | string | null;
  due_date?: string | null;
  next_instalment_due?: string | null;
}): boolean {
  const st = clean(row.payment_status).toLowerCase();
  const hint = clean(row.payment_method_hint).toLowerCase();
  if (st === "paid" || st === "void" || st === "cancelled") return false;
  // Already told us they paid — office validating; do not chase again.
  if (row.parent_reported_paid_at || st === "pending_confirmation") return false;
  if (hint === "gocardless" || hint === "la_funded") return false;
  // First Aug-15 instalment already settled (flexi half / one-off).
  if (aug15FirstObligationSettled(row)) return false;
  return st === "unpaid" || st === "partial";
}

function childFromContact(cid: string, fallback = ""): string {
  const c = contactById.get(clean(cid));
  return clean(c?.child_first_name || c?.child_display || fallback, 80) || "your child";
}

function parentFromContact(cid: string): { parent: string; parent_first: string; mobile: string; email: string } {
  const c = contactById.get(clean(cid));
  const parent = clean(c?.parent_display || "", 120) || "Parent";
  const parent_first = clean(c?.parent_first_name || "", 40) || firstName(parent);
  return {
    parent,
    parent_first,
    mobile: clean(c?.mobile || "", 40),
    email: clean(c?.email || "", 120),
  };
}

const targets: Target[] = [];
const seenInv = new Set<string>();

for (const row of invRows || []) {
  const inv = clean(row.invoice_number);
  if (!inv || seenInv.has(inv)) continue;
  // Prefer non-void when duplicates (e.g. INV-P-0109)
  if (clean(row.payment_status).toLowerCase() === "void") continue;
  if (EXCLUDE_INVOICE.has(inv)) continue;
  if (!isChaseable(row)) continue;
  const cid = clean(row.contact_id);
  if (!cid) continue;
  const child = childFromContact(cid);
  if (EXCLUDE_PARTICIPANT.some((re) => re.test(child))) continue;
  const p = parentFromContact(cid);
  seenInv.add(inv);
  targets.push({
    invoice_number: inv,
    contact_id: cid,
    child: firstName(child),
    parent: p.parent,
    parent_first: p.parent_first,
    mobile: p.mobile,
    email: p.email,
    amount_gbp: Number(row.amount_gbp) || 0,
    source: "wave",
  });
}

// Patrick / Anas extras
const extrasFound: Record<string, unknown> = {};
for (const ex of EXTRA_LOOKUPS) {
  let q = admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, contact_id, payment_status, payment_method_hint, amount_gbp, amount_paid_gbp, parent_reported_paid_at, line_description, notes, billing_term, payment_schedule, due_date, next_instalment_due",
    )
    .in("payment_status", ["unpaid", "partial", "pending_confirmation"])
    .limit(50);
  if (ex.invoice) {
    q = admin
      .from("portal_parent_invoice_share")
      .select(
        "id, invoice_number, contact_id, payment_status, payment_method_hint, amount_gbp, amount_paid_gbp, parent_reported_paid_at, line_description, notes, billing_term, payment_schedule, due_date, next_instalment_due",
      )
      .eq("invoice_number", ex.invoice)
      .limit(5);
  }
  const { data: extraRows } = await q;
  function isAutumnish(r: Record<string, unknown>): boolean {
    if (!(ex as { requireAutumn?: boolean }).requireAutumn) return true;
    const inv = clean(r.invoice_number).toUpperCase();
    if (inv.includes("CRASH")) return false;
    const term = clean(r.billing_term).toLowerCase();
    if (term.includes("autumn") || term.includes("2026") || term.includes("term")) return true;
    // Standard INV-P-#### family invoices (not crash codes)
    return /^INV-P-\d{4,}$/i.test(inv);
  }

  let hit = (extraRows || []).find((r) => {
    if (!isChaseable(r)) return false;
    if (!isAutumnish(r as Record<string, unknown>)) return false;
    const cid = clean(r.contact_id);
    const c = contactById.get(cid);
    const child = clean(c?.child_display || c?.child_first_name || r.line_description || "");
    const parent = clean(c?.parent_display || "");
    if (ex.invoice && clean(r.invoice_number) === ex.invoice) return true;
    return ex.childRe.test(child) && (!ex.parentRe || ex.parentRe.test(parent));
  });
  if (!hit && !ex.invoice) {
    // name search via contacts
    const cHit = (contacts || []).find((c) =>
      ex.childRe.test(clean(c.child_display || c.child_first_name)) &&
      (!ex.parentRe || ex.parentRe.test(clean(c.parent_display || "")))
    );
    if (cHit) {
      const { data: byContact } = await admin
        .from("portal_parent_invoice_share")
        .select(
          "id, invoice_number, contact_id, payment_status, payment_method_hint, amount_gbp, amount_paid_gbp, parent_reported_paid_at, line_description, notes, billing_term, payment_schedule, due_date, next_instalment_due",
        )
        .eq("contact_id", cHit.contact_id)
        .in("payment_status", ["unpaid", "partial", "pending_confirmation"])
        .order("created_at", { ascending: false })
        .limit(10);
      hit = (byContact || []).find((r) =>
        isChaseable(r) &&
        !EXCLUDE_INVOICE.has(clean(r.invoice_number)) &&
        isAutumnish(r as Record<string, unknown>)
      ) || undefined;
      extrasFound[ex.label + "_note"] = {
        contact_id: cHit.contact_id,
        unpaid_seen: (byContact || []).map((r) => ({
          inv: r.invoice_number,
          st: r.payment_status,
          amt: r.amount_gbp,
        })),
      };
    }
  }
  extrasFound[ex.label] = hit
    ? {
      invoice: hit.invoice_number,
      status: hit.payment_status,
      hint: hit.payment_method_hint,
      contact_id: hit.contact_id,
      amount: hit.amount_gbp,
    }
    : { found: false, reason: (ex as { requireAutumn?: boolean }).requireAutumn ? "no_autumn_unpaid_bank" : "not_found" };

  if (hit && isChaseable(hit)) {
    const inv = clean(hit.invoice_number);
    if (seenInv.has(inv) || EXCLUDE_INVOICE.has(inv)) continue;
    const cid = clean(hit.contact_id);
    const child = childFromContact(cid, ex.label);
    if (EXCLUDE_PARTICIPANT.some((re) => re.test(child))) continue;
    const p = parentFromContact(cid);
    seenInv.add(inv);
    targets.push({
      invoice_number: inv,
      contact_id: cid,
      child: firstName(child),
      parent: p.parent,
      parent_first: p.parent_first,
      mobile: p.mobile,
      email: p.email,
      amount_gbp: Number(hit.amount_gbp) || 0,
      source: `extra:${ex.label}`,
    });
  }
}

// Group by E164 phone (one WA per parent phone)
type Family = {
  parent: string;
  parent_first: string;
  mobile: string;
  e164: string | null;
  email: string;
  kids: string[];
  invoices: string[];
  contact_ids: string[];
  sources: string[];
  channel: "whatsapp" | "skip";
  skip_reason?: string;
  wa: string;
  wa_flat: string;
  over700: boolean;
};

const byPhone = new Map<string, Family>();
const noPhone: Family[] = [];

for (const t of targets) {
  const e164 = normalizeParentPhoneE164(t.mobile);
  const key = e164 || `nop:${t.contact_id}`;
  let fam = byPhone.get(key);
  if (!fam) {
    fam = {
      parent: t.parent,
      parent_first: t.parent_first,
      mobile: t.mobile,
      e164,
      email: t.email,
      kids: [],
      invoices: [],
      contact_ids: [],
      sources: [],
      channel: e164 ? "whatsapp" : "skip",
      skip_reason: e164 ? undefined : "no_mobile",
      wa: "",
      wa_flat: "",
      over700: false,
    };
    byPhone.set(key, fam);
    if (!e164) noPhone.push(fam);
  }
  if (!fam.kids.includes(t.child)) fam.kids.push(t.child);
  if (!fam.invoices.includes(t.invoice_number)) fam.invoices.push(t.invoice_number);
  if (!fam.contact_ids.includes(t.contact_id)) fam.contact_ids.push(t.contact_id);
  if (!fam.sources.includes(t.source)) fam.sources.push(t.source);
}

const families = [...byPhone.values()].map((f) => {
  f.wa = buildMessage(f.parent_first, f.kids);
  f.wa_flat = flattenWhatsappTemplateBody(f.wa);
  f.over700 = f.wa_flat.length > WHATSAPP_TEMPLATE_BODY_MAX;
  if (f.over700 && f.channel === "whatsapp") {
    f.channel = "skip";
    f.skip_reason = `over_${WHATSAPP_TEMPLATE_BODY_MAX}`;
  }
  return f;
});

mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  mode: send ? "send" : "dry_run",
  campaign: CAMPAIGN_KIND,
  extras: extrasFound,
  excluded: ["Yamik / INV-P-0097"],
  invoice_targets: targets.length,
  families: families.length,
  whatsapp: families.filter((f) => f.channel === "whatsapp").length,
  skip: families.filter((f) => f.channel === "skip").length,
  sample: families.find((f) => f.channel === "whatsapp")?.wa || families[0]?.wa,
  recipients: families.map((f) => ({
    parent: f.parent,
    kids: f.kids,
    invoices: f.invoices,
    mobile: f.mobile,
    e164: f.e164,
    channel: f.channel,
    skip_reason: f.skip_reason,
    sources: f.sources,
    flat_len: f.wa_flat.length,
  })),
};
writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

console.log(JSON.stringify({
  mode: payload.mode,
  extras: extrasFound,
  invoice_targets: targets.length,
  families: families.length,
  whatsapp: payload.whatsapp,
  skip: payload.skip,
  sample_flat_len: flattenWhatsappTemplateBody(payload.sample || "").length,
}, null, 2));

for (const f of families) {
  console.log(
    `${f.channel.toUpperCase()} | ${f.parent} | ${f.kids.join(" & ")} | ${f.invoices.join(",")}` +
      (f.skip_reason ? ` | ${f.skip_reason}` : ""),
  );
}

if (!send) {
  console.log(`\nDry run only. Re-run with --send to deliver. Wrote ${OUT_JSON}`);
  Deno.exit(0);
}

const report: Array<Record<string, unknown>> = [];
let waSent = 0;
let waFailed = 0;

for (let i = 0; i < families.length; i++) {
  const f = families[i];
  if (f.channel !== "whatsapp" || !f.e164) {
    report.push({ parent: f.parent, kids: f.kids, channel: "skip", reason: f.skip_reason });
    continue;
  }
  const result = await sendParentMessageViaWhatsapp(f.e164, f.wa, {
    kind: "payment_due",
  });
  const whatsappStatus = result.ok ? "sent" : "failed";
  await admin.from("portal_parent_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN_KIND,
    channel: "whatsapp",
    client_display: f.kids.join(", "),
    parent_name: f.parent,
    parent_email: f.email || null,
    parent_phone: f.e164,
    subject: "Autumn payment due 15 August — Parent Portal",
    body_text: f.wa,
    email_status: "skipped",
    whatsapp_status: whatsappStatus,
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN_KIND,
      kids: f.kids,
      invoices: f.invoices,
      contact_ids: f.contact_ids,
      sources: f.sources,
      portal_url: PORTAL_URL,
    },
  });
  if (result.ok) {
    waSent += 1;
    console.log(`WA OK ${i + 1}/${families.length} ${f.parent} → ${f.kids.join(" & ")}`);
    report.push({ parent: f.parent, kids: f.kids, invoices: f.invoices, ok: true });
  } else {
    waFailed += 1;
    console.error(`WA FAIL ${i + 1}/${families.length} ${f.parent}: ${result.error}`);
    report.push({
      parent: f.parent,
      kids: f.kids,
      invoices: f.invoices,
      ok: false,
      error: result.error,
    });
  }
  await new Promise((r) => setTimeout(r, 350));
}

const summary = {
  campaign: CAMPAIGN_KIND,
  extras: extrasFound,
  waSent,
  waFailed,
  skip: families.filter((f) => f.channel === "skip").length,
  report,
};
writeFileSync(OUT_REPORT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ waSent, waFailed, skip: summary.skip, report: OUT_REPORT }, null, 2));
