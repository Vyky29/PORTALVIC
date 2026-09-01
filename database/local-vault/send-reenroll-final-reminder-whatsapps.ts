/**
 * Final reminder: re-enrol by Wed 22 Jul (Private + Direct Payments, not yet submitted).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-reenroll-final-reminder-whatsapps.ts
 *
 * Send:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-reenroll-final-reminder-whatsapps.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN_KIND = "reenroll_final_reminder_20260721";
const PORTAL_URL = "https://www.clubsensational.org/parent";
const BOOKING_URL = "https://www.clubsensational.org/bookingportal";
const OUT_DIR = "database/local-vault/tmp";
const OUT_JSON = `${OUT_DIR}/reenroll-final-reminder-recipients.json`;
const OUT_REPORT = `${OUT_DIR}/reenroll-final-reminder-send-report.json`;

/** Exclude by participant display / sheet name (case-insensitive contains). */
const EXCLUDE_PARTICIPANT = [
  /^kirushy\b/i,
  /^kate\b/i,
  /\bkate\s*\(acat\)/i,
  /^kamy\b/i,
  /\bkamy\s*\(acat\)/i,
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
function norm(v: unknown): string {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(v: unknown): string[] {
  return norm(v).split(" ").filter(Boolean);
}
function firstTok(v: unknown): string {
  return tokens(v)[0] || "";
}
function parentFirst(display: string, first?: string): string {
  if (first && String(first).trim()) return String(first).trim().split(/\s+/)[0];
  const d = String(display || "").trim().replace(/\(.*?\)/g, "").trim();
  return d.split(/\s+/)[0] || "there";
}
function childFirst(display: string, first?: string): string {
  if (first && String(first).trim()) return String(first).trim().split(/\s+/)[0];
  return String(display || "").trim().split(/\s+/)[0] || "your child";
}
function nameMatch(a: string, b: string): boolean {
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  if (A.startsWith(B) || B.startsWith(A)) return true;
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length || ta[0] !== tb[0]) return false;
  if (ta.length === 1 || tb.length === 1) return true;
  const la = ta[ta.length - 1], lb = tb[tb.length - 1];
  return la.startsWith(lb) || lb.startsWith(la);
}
function isLaNhs(label: string, sheet: string): boolean {
  const L = clean(label).toLowerCase();
  const S = clean(sheet).toUpperCase();
  if (S === "LA") return true;
  if (L.includes("nhs")) return true;
  if (/(local authority|la funded|la invoice|commission|borough|council|hammersmith|fulham|ealing|brent|harrow|hillingdon|h&f|la manages)/.test(L)) {
    return true;
  }
  return false;
}
function isDirectPayment(label: string, sheet: string): boolean {
  const L = clean(label).toLowerCase();
  const S = clean(sheet).toUpperCase();
  if (S === "DIRECT_PAYMENTS") return true;
  if (/(direct payment|care package|ehcp|using money from la|parent · direct|parent \(exempt)/.test(L)) {
    return true;
  }
  return false;
}
function excludedParticipant(name: string): boolean {
  const n = clean(name);
  return EXCLUDE_PARTICIPANT.some((re) => re.test(n));
}

function buildMessage(parentFirstName: string, childNames: string[]): string {
  const kids = childNames.filter(Boolean);
  const childLine = kids.length === 0
    ? "your child"
    : kids.length === 1
    ? kids[0]
    : kids.length === 2
    ? `${kids[0]} and ${kids[1]}`
    : `${kids.slice(0, -1).join(", ")} and ${kids[kids.length - 1]}`;
  return (
    `Hi ${parentFirstName},\n\n` +
    `This is a final reminder to complete re-enrolment for September 2026/27 for ${childLine}.\n\n` +
    `Please finish it today or tomorrow (Tue 21 / Wed 22 July) in the Family Portal:\n` +
    `${PORTAL_URL}\n\n` +
    `Any slots still unconfirmed after Wednesday 22 July will be offered to the waiting list and on the website from Thursday 23 July:\n` +
    `${BOOKING_URL}\n\n` +
    `If you’ve already re-enrolled, thank you — you can ignore this message.\n\n` +
    `Thanks,\nclubSENsational`
  );
}

for (const key of [
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
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

const { data: pays, error: payErr } = await admin
  .from("client_payments")
  .select("sheet, client_key, client_name, parent_name, data")
  .limit(8000);
if (payErr) throw payErr;

const workbook: Array<{ sheet: string; child: string; parent: string; funding: string }> = [];
const seenWb = new Set<string>();
for (const r of pays || []) {
  const sheet = clean(r.sheet, 60);
  const child = clean(r.client_name, 120);
  const key = `${sheet}::${clean(r.client_key) || norm(child)}`;
  if (!child || seenWb.has(key)) continue;
  seenWb.add(key);
  const funding = clean(
    (r.data as Record<string, unknown>)?.Funding ||
      (r.data as Record<string, unknown>)?.["Funding route"] ||
      (r.data as Record<string, unknown>)?.Funder,
    120,
  );
  workbook.push({
    sheet,
    child,
    parent: clean(r.parent_name, 120) || "—",
    funding,
  });
}

const { data: subs } = await admin
  .from("portal_re_enrolment_submissions")
  .select("participant_contact_id, parent_person_id, submitted_at, payload")
  .eq("academic_year", "2026-27")
  .not("submitted_at", "is", null)
  .limit(5000);

const { data: contacts } = await admin
  .from("portal_parent_contacts")
  .select(
    "contact_id, child_display, child_first_name, parent_display, parent_first_name, parent_person_id, mobile, email, funding_label",
  )
  .limit(5000);

const contactById = new Map<string, (typeof contacts extends (infer T)[] | null ? T : never)>();
for (const c of contacts || []) contactById.set(clean(c.contact_id), c);

type Submitted = { contact_id: string; parent_person_id: string; child: string; parent: string };
const submittedPeople: Submitted[] = [];
for (const s of subs || []) {
  const c = contactById.get(clean(s.participant_contact_id));
  const p = (s.payload || {}) as Record<string, unknown>;
  submittedPeople.push({
    contact_id: clean(s.participant_contact_id),
    parent_person_id: clean(s.parent_person_id),
    child: clean(
      c?.child_display || c?.child_first_name || p.participant_display || p.child_name || p.display_name,
      120,
    ),
    parent: clean(c?.parent_display || p.parent_display || p.parent_name, 120),
  });
}

const { data: invs } = await admin
  .from("portal_parent_invoice_share")
  .select("contact_id, created_via, payment_method_hint")
  .in("created_via", ["reenrolment", "la_office_auto"])
  .limit(5000);
const hasInv = new Set((invs || []).map((i) => clean(i.contact_id)));
const laAutoIds = new Set(
  (invs || [])
    .filter((i) => i.created_via === "la_office_auto" || i.payment_method_hint === "la_funded")
    .map((i) => clean(i.contact_id)),
);

function findContact(child: string, parent: string) {
  const candidates = (contacts || []).filter((c) =>
    nameMatch(child, String(c.child_display || c.child_first_name || ""))
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const byParent = candidates.filter((c) =>
      nameMatch(parent, String(c.parent_display || "")) ||
      firstTok(parent) === firstTok(c.parent_display)
    );
    if (byParent.length === 1) return byParent[0];
    candidates.sort((a, b) =>
      clean(b.child_display).length - clean(a.child_display).length
    );
    return candidates[0];
  }
  return null;
}

function isSubmitted(child: string, parent: string, contact: ReturnType<typeof findContact>): boolean {
  if (contact && submittedPeople.some((s) => s.contact_id === clean(contact.contact_id))) {
    return true;
  }
  if (contact?.parent_person_id) {
    const kids = submittedPeople.filter((s) =>
      s.parent_person_id === clean(contact.parent_person_id)
    );
    if (kids.some((s) => nameMatch(child, s.child))) return true;
  }
  return submittedPeople.some((s) =>
    nameMatch(child, s.child) &&
    (nameMatch(parent, s.parent) || firstTok(parent) === firstTok(s.parent) || !parent || parent === "—")
  );
}

type MissingRow = {
  child: string;
  child_full: string;
  child_first: string;
  parent: string;
  parent_first: string;
  group: string;
  mobile: string;
  email: string;
  contact_id: string | null;
  parent_person_id: string | null;
};

const missing: MissingRow[] = [];
for (const row of workbook) {
  const sheetUp = row.sheet.toUpperCase();
  const contact = findContact(row.child, row.parent);
  const funding = clean(contact?.funding_label) || row.funding || "";
  const cid = clean(contact?.contact_id);
  const la = isLaNhs(funding, row.sheet) || (cid && laAutoIds.has(cid)) || sheetUp === "LA";
  const dp = !la && (sheetUp === "DIRECT_PAYMENTS" || isDirectPayment(funding, row.sheet));
  const priv = !la && !dp && sheetUp === "PARENTS";
  if (la || !(priv || dp)) continue;

  const childFull = clean(contact?.child_display) || row.child;
  if (excludedParticipant(childFull) || excludedParticipant(row.child)) continue;
  // Skip Elia / Victor demo private sheet if present
  if (/^elia$/i.test(row.child) && /victor/i.test(row.parent)) continue;

  const submitted = isSubmitted(row.child, row.parent, contact);
  const has_inv = cid ? hasInv.has(cid) : false;
  if (submitted || has_inv) continue;

  missing.push({
    child: row.child,
    child_full: childFull,
    child_first: childFirst(childFull, contact?.child_first_name || undefined),
    parent: clean(contact?.parent_display) || row.parent,
    parent_first: parentFirst(
      clean(contact?.parent_display) || row.parent,
      contact?.parent_first_name || undefined,
    ),
    group: dp ? "Direct Payments" : "Private",
    mobile: clean(contact?.mobile, 40),
    email: clean(contact?.email, 120),
    contact_id: cid || null,
    parent_person_id: clean(contact?.parent_person_id) || null,
  });
}

// Group by phone (or parent_person_id / parent name if no phone)
type Family = {
  key: string;
  parent: string;
  parent_first: string;
  mobile: string;
  email: string;
  kids: string[];
  child_fulls: string[];
  contact_ids: string[];
  group: string;
  channel: "whatsapp" | "skip";
  skip_reason?: string;
  wa: string;
  wa_flat: string;
};

const byKey = new Map<string, Family>();
for (const m of missing) {
  const e164 = normalizeParentPhoneE164(m.mobile);
  const key = e164
    ? `wa:${e164}`
    : m.parent_person_id
    ? `pid:${m.parent_person_id}`
    : `name:${norm(m.parent)}|${norm(m.parent_first)}`;
  let fam = byKey.get(key);
  if (!fam) {
    fam = {
      key,
      parent: m.parent,
      parent_first: m.parent_first,
      mobile: m.mobile,
      email: m.email,
      kids: [],
      child_fulls: [],
      contact_ids: [],
      group: m.group,
      channel: e164 ? "whatsapp" : "skip",
      skip_reason: e164 ? undefined : "no_mobile",
      wa: "",
      wa_flat: "",
    };
    byKey.set(key, fam);
  }
  if (!fam.kids.includes(m.child_first)) fam.kids.push(m.child_first);
  if (!fam.child_fulls.includes(m.child_full)) fam.child_fulls.push(m.child_full);
  if (m.contact_id && !fam.contact_ids.includes(m.contact_id)) {
    fam.contact_ids.push(m.contact_id);
  }
  if (m.group === "Direct Payments") fam.group = "Direct Payments";
}

const { data: prior } = await admin
  .from("portal_parent_notify_log")
  .select("parent_phone, whatsapp_status")
  .eq("kind", CAMPAIGN_KIND)
  .in("whatsapp_status", ["sent", "delivered", "read"])
  .limit(5000);
const already = new Set(
  (prior || [])
    .map((p) => normalizeParentPhoneE164(String(p.parent_phone || "")))
    .filter(Boolean) as string[],
);

const families = [...byKey.values()].map((f) => {
  const wa = buildMessage(f.parent_first, f.kids);
  f.wa = wa;
  f.wa_flat = flattenWhatsappTemplateBody(wa);
  const e164 = normalizeParentPhoneE164(f.mobile);
  if (f.channel === "whatsapp" && e164 && already.has(e164)) {
    f.channel = "skip";
    f.skip_reason = "already_sent";
  }
  return f;
}).sort((a, b) => a.parent.localeCompare(b.parent));

mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  campaign: CAMPAIGN_KIND,
  mode: send ? "SEND" : "DRY_RUN",
  generated_at: new Date().toISOString(),
  missing_participants: missing.length,
  families: families.length,
  whatsapp: families.filter((f) => f.channel === "whatsapp").length,
  skip: families.filter((f) => f.channel === "skip").length,
  over700: families.filter((f) => f.wa_flat.length > 700).length,
  sample: families.find((f) => f.channel === "whatsapp")?.wa || null,
  recipients: families.map((f) => ({
    channel: f.channel,
    skip_reason: f.skip_reason || null,
    parent: f.parent,
    parent_first: f.parent_first,
    kids: f.kids,
    group: f.group,
    mobile: f.mobile ? `…${String(normalizeParentPhoneE164(f.mobile) || "").slice(-4)}` : null,
    chars: f.wa_flat.length,
  })),
};
writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));

console.log(JSON.stringify({
  mode: payload.mode,
  missing_participants: payload.missing_participants,
  families: payload.families,
  whatsapp: payload.whatsapp,
  skip: payload.skip,
  over700: payload.over700,
  sample: payload.sample,
}, null, 2));

for (const f of families) {
  console.log(
    `${f.channel.toUpperCase()} | ${f.parent} | ${f.kids.join(" & ")} | ${f.group}` +
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
  if (f.channel !== "whatsapp") {
    report.push({ parent: f.parent, kids: f.kids, channel: "skip", reason: f.skip_reason });
    continue;
  }
  const e164 = normalizeParentPhoneE164(f.mobile)!;
  const result = await sendParentMessageViaWhatsapp(e164, f.wa, {
    kind: "reenroll_final_reminder",
  });
  const whatsappStatus = result.ok ? "sent" : "failed";
  await admin.from("portal_parent_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN_KIND,
    channel: "whatsapp",
    client_display: f.child_fulls.join(", "),
    parent_name: f.parent,
    parent_email: f.email || null,
    parent_phone: e164,
    subject: "Final reminder — re-enrol by Wed 22 July",
    body_text: f.wa,
    email_status: "skipped",
    whatsapp_status: whatsappStatus,
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN_KIND,
      kids: f.kids,
      contact_ids: f.contact_ids,
      group: f.group,
      portal_url: PORTAL_URL,
      booking_url: BOOKING_URL,
    },
  });
  if (result.ok) {
    waSent += 1;
    console.log(`WA OK ${i + 1}/${families.length} ${f.parent} → ${f.kids.join(" & ")}`);
    report.push({ parent: f.parent, kids: f.kids, channel: "whatsapp", ok: true });
  } else {
    waFailed += 1;
    console.error(`WA FAIL ${i + 1}/${families.length} ${f.parent}: ${result.error}`);
    report.push({
      parent: f.parent,
      kids: f.kids,
      channel: "whatsapp",
      ok: false,
      error: result.error,
    });
  }
  // gentle pacing for Meta
  await new Promise((r) => setTimeout(r, 350));
}

const summary = { campaign: CAMPAIGN_KIND, waSent, waFailed, skip: families.filter((f) => f.channel === "skip").length, report };
writeFileSync(OUT_REPORT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ waSent, waFailed, skip: summary.skip, report: OUT_REPORT }, null, 2));
