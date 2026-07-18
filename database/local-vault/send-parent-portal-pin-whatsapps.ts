/**
 * Send Family portal PIN messages:
 *  - WhatsApp (template) when mobile on file
 *  - Email when no usable mobile
 *  - Thanks copy if already re-enrolled 2026/27; pending copy otherwise
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-parent-portal-pin-whatsapps.ts
 *
 * Send:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/send-parent-portal-pin-whatsapps.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  plainTextToHtml,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const CAMPAIGN_KIND = "family_portal_pin_20260718";
const PORTAL_URL = "https://www.clubsensational.org/parent";
const OUT_JSON = "database/local-vault/tmp/parent-portal-pin-whatsapps.json";
const OUT_REPORT = "database/local-vault/tmp/parent-portal-pin-send-report.json";
/** Only families with a child on the live roster in this window (current clients). */
const ROSTER_SINCE_DAYS = 14;
/** Always exclude these contact_ids even if still flagged in_class. */
const EXCLUDE_CONTACT_IDS = new Set(["144", "394", "216"]); // Haider, Rhys, Matthias

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

function parentFirst(display: string, first?: string): string {
  if (first && String(first).trim()) return String(first).trim().split(/\s+/)[0];
  const d = String(display || "").trim().replace(/\(.*?\)/g, "").trim();
  return d.split(/\s+/)[0] || "there";
}

function childLoginName(childDisplay: string, childFirst?: string): string {
  if (childFirst && String(childFirst).trim()) return String(childFirst).trim().split(/\s+/)[0];
  return String(childDisplay || "").trim().split(/\s+/)[0] || "your child";
}

function isDemoRow(row: {
  parent_person_id?: string;
  contact_id?: string;
  email?: string;
  parent?: string;
}): boolean {
  const blob = `${row.parent_person_id || ""} ${row.contact_id || ""} ${row.email || ""} ${row.parent || ""}`
    .toLowerCase();
  if (blob.includes("elia-matilla-demo") || blob.includes("parent-victor-matilla-demo")) return true;
  if (blob.includes("parent-elia-test") || blob.includes("victor.matilla.demo@")) return true;
  if (/\(test\b/.test(blob) || /\btest\s*·/.test(blob)) return true;
  if (/\b(test|demo)\b/.test(blob) && /matilla|elia/.test(blob)) return true;
  return false;
}

function buildMessage(opts: {
  parentFirst: string;
  loginNames: string[];
  pin: string;
  multiChild: boolean;
  reEnrolled: boolean;
}): { variant: "thanks" | "pending"; wa: string } {
  const loginLine = opts.loginNames.join(" / ");
  const samePin = opts.multiChild
    ? "\n\nSame PIN works for every child on your account."
    : "";
  if (opts.reEnrolled) {
    const wa =
      `Hi ${opts.parentFirst} — thank you for re-enrolling for 2026/27.\n\n` +
      `For easier access, Family portal login no longer uses date of birth. We’ve switched to a personal family PIN (you can change it anytime after signing in).\n\n` +
      `Open the portal:\n${PORTAL_URL}\n\n` +
      `LOGIN DETAILS\nChild’s first name: ${loginLine}\nFamily PIN: ${opts.pin}` +
      `${samePin}\n\n` +
      `Crash courses are still open to book in the portal if you need them.\n\n` +
      `Any problem, reply here.`;
    return { variant: "thanks", wa };
  }
  const wa =
    `Hi ${opts.parentFirst} — quick update on your Family portal login.\n\n` +
    `For easier access we’ve switched to a personal family PIN (you can change it anytime after signing in). Date of birth is no longer used to sign in.\n\n` +
    `Open the portal:\n${PORTAL_URL}\n\n` +
    `LOGIN DETAILS\nChild’s first name: ${loginLine}\nFamily PIN: ${opts.pin}` +
    `${samePin}\n\n` +
    `Please re-enrol for 2026/27 by Wed 22 July. Crash courses are open now.\n\n` +
    `Any problem, reply here.`;
  return { variant: "pending", wa };
}

function emailSubject(variant: "thanks" | "pending"): string {
  return variant === "thanks"
    ? "Thank you for re-enrolling — your Family portal PIN"
    : "Your Family portal PIN — please re-enrol by 22 July";
}

for (const key of [
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
  "META_WHATSAPP_TEMPLATE_LANG",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
]) {
  if (!Deno.env.get(key)) {
    const value = secret(key);
    if (value) Deno.env.set(key, value);
  }
}

const send = Deno.args.includes("--send");
const includeDemo = Deno.args.includes("--include-demo");

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: creds, error: credsErr } = await admin
  .from("portal_parent_portal_credentials")
  .select("parent_person_id, pin_display, updated_at")
  .order("updated_at", { ascending: false });
if (credsErr) throw credsErr;

const { data: contacts, error: contactsErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "parent_person_id, parent_display, parent_first_name, child_display, child_first_name, contact_id, email, mobile, in_class",
  )
  .limit(5000);
if (contactsErr) throw contactsErr;

const rosterSince = new Date();
rosterSince.setUTCDate(rosterSince.getUTCDate() - ROSTER_SINCE_DAYS);
const rosterSinceIso = rosterSince.toISOString().slice(0, 10);
const { data: rosterRows, error: rosterErr } = await admin
  .from("portal_roster_rows")
  .select("client_name, session_date")
  .gte("session_date", rosterSinceIso)
  .limit(8000);
if (rosterErr) throw rosterErr;

function normToken(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)[0] || "";
}

const currentRosterFirstNames = new Set<string>();
for (const r of rosterRows || []) {
  const n = String(r.client_name || "").trim();
  if (!n || /^(home|manager|no participant)$/i.test(n)) continue;
  const tok = normToken(n);
  if (tok) currentRosterFirstNames.add(tok);
}
console.log(JSON.stringify({
  roster_since: rosterSinceIso,
  current_roster_first_names: [...currentRosterFirstNames].sort(),
}, null, 2));

const { data: submissions, error: subErr } = await admin
  .from("portal_re_enrolment_submissions")
  .select("parent_person_id, participant_contact_id, submitted_at")
  .eq("academic_year", "2026-27")
  .not("submitted_at", "is", null)
  .limit(5000);
if (subErr) throw subErr;

const reEnrolledParents = new Set<string>();
const reEnrolledContacts = new Set<string>();
for (const s of submissions || []) {
  if (s.parent_person_id) reEnrolledParents.add(String(s.parent_person_id));
  if (s.participant_contact_id) reEnrolledContacts.add(String(s.participant_contact_id));
}

const { data: prior, error: priorErr } = await admin
  .from("portal_parent_notify_log")
  .select("parent_phone, parent_email, whatsapp_status, email_status, meta")
  .eq("kind", CAMPAIGN_KIND)
  .limit(5000);
if (priorErr) throw priorErr;

const alreadyPhone = new Set<string>();
const alreadyEmail = new Set<string>();
for (const p of prior || []) {
  const waOk = ["sent", "delivered", "read"].includes(String(p.whatsapp_status || ""));
  const emOk = ["sent", "delivered"].includes(String(p.email_status || ""));
  if (waOk && p.parent_phone) {
    const e164 = normalizeParentPhoneE164(String(p.parent_phone));
    if (e164) alreadyPhone.add(e164);
  }
  if (emOk && p.parent_email) alreadyEmail.add(String(p.parent_email).trim().toLowerCase());
}

type Kid = { display: string; login: string; contactId: string };
type Family = {
  parent_person_id: string;
  parent: string;
  parent_first: string;
  pin: string;
  mobile: string;
  email: string;
  kids: Kid[];
  contact_ids: string[];
  re_enrolled: boolean;
  variant: "thanks" | "pending";
  wa: string;
  wa_flat: string;
  channel: "whatsapp" | "email" | "skip";
  skip_reason?: string;
};

const byParent = new Map<string, {
  parent: string;
  parent_first: string;
  email: string;
  mobile: string;
  kids: Kid[];
  contact_ids: Set<string>;
}>();

for (const c of contacts || []) {
  const pid = String(c.parent_person_id || "").trim();
  if (!pid) continue;
  let fam = byParent.get(pid);
  if (!fam) {
    fam = {
      parent: String(c.parent_display || "").trim(),
      parent_first: parentFirst(String(c.parent_display || ""), String(c.parent_first_name || "")),
      email: String(c.email || "").trim().toLowerCase(),
      mobile: String(c.mobile || "").trim(),
      kids: [],
      contact_ids: new Set(),
    };
    byParent.set(pid, fam);
  }
  if (!fam.parent && c.parent_display) fam.parent = String(c.parent_display).trim();
  if (!fam.email && c.email) fam.email = String(c.email).trim().toLowerCase();
  if (!fam.mobile && c.mobile) fam.mobile = String(c.mobile).trim();
  const cid = String(c.contact_id || "").trim();
  if (cid) fam.contact_ids.add(cid);
  const login = childLoginName(String(c.child_display || ""), String(c.child_first_name || ""));
  const display = String(c.child_display || login).trim();
  if (login && !fam.kids.some((k) => k.login.toLowerCase() === login.toLowerCase())) {
    fam.kids.push({ display, login, contactId: cid });
  }
}

const families: Family[] = [];
for (const cred of creds || []) {
  const pid = String(cred.parent_person_id || "").trim();
  const pin = String(cred.pin_display || "").trim();
  if (!pid || !/^\d{4}$/.test(pin)) continue;
  const meta = byParent.get(pid);
  if (!meta || !meta.kids.length) continue;

  const contactIds = [...meta.contact_ids];
  const reEnrolled =
    reEnrolledParents.has(pid) ||
    contactIds.some((cid) => reEnrolledContacts.has(cid));

  const built = buildMessage({
    parentFirst: meta.parent_first,
    loginNames: meta.kids.map((k) => k.login),
    pin,
    multiChild: meta.kids.length > 1,
    reEnrolled,
  });

  const e164 = normalizeParentPhoneE164(meta.mobile);
  let channel: Family["channel"] = "whatsapp";
  let skip_reason: string | undefined;
  if (!e164) {
    if (meta.email) channel = "email";
    else {
      channel = "skip";
      skip_reason = "no_mobile_no_email";
    }
  }

  if (!includeDemo && isDemoRow({
    parent_person_id: pid,
    contact_id: contactIds[0],
    email: meta.email,
    parent: meta.parent,
  })) {
    channel = "skip";
    skip_reason = "demo";
  }

  if (contactIds.some((cid) => EXCLUDE_CONTACT_IDS.has(cid))) {
    channel = "skip";
    skip_reason = "excluded_former_client";
  }

  const onCurrentRoster = meta.kids.some((k) => {
    const tok = normToken(k.login) || normToken(k.display);
    return tok && currentRosterFirstNames.has(tok);
  });
  if (!onCurrentRoster && channel !== "skip") {
    channel = "skip";
    skip_reason = "not_on_recent_roster";
  }

  if (channel === "whatsapp" && e164 && alreadyPhone.has(e164)) {
    channel = "skip";
    skip_reason = "already_sent_whatsapp";
  }
  if (channel === "email" && meta.email && alreadyEmail.has(meta.email)) {
    channel = "skip";
    skip_reason = "already_sent_email";
  }

  families.push({
    parent_person_id: pid,
    parent: meta.parent,
    parent_first: meta.parent_first,
    pin,
    mobile: meta.mobile,
    email: meta.email,
    kids: meta.kids,
    contact_ids: contactIds,
    re_enrolled: reEnrolled,
    variant: built.variant,
    wa: built.wa,
    wa_flat: flattenWhatsappTemplateBody(built.wa),
    channel,
    skip_reason,
  });
}

families.sort((a, b) => a.parent.localeCompare(b.parent));

const summary = {
  mode: send ? "SEND" : "DRY_RUN",
  campaign: CAMPAIGN_KIND,
  total: families.length,
  thanks: families.filter((f) => f.variant === "thanks").length,
  pending: families.filter((f) => f.variant === "pending").length,
  whatsapp: families.filter((f) => f.channel === "whatsapp").length,
  email: families.filter((f) => f.channel === "email").length,
  skip: families.filter((f) => f.channel === "skip").length,
  skip_reasons: families
    .filter((f) => f.channel === "skip")
    .reduce((acc: Record<string, number>, f) => {
      const k = f.skip_reason || "other";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  over700: families.filter((f) => f.wa_flat.length > 700).length,
};

writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      ...summary,
      rows: families.map((f) => ({
        parent_person_id: f.parent_person_id,
        parent: f.parent,
        parent_first: f.parent_first,
        children: f.kids.map((k) => k.display),
        login_names: f.kids.map((k) => k.login),
        contact_ids: f.contact_ids,
        pin: f.pin,
        mobile: f.mobile,
        email: f.email,
        multi_child: f.kids.length > 1,
        re_enrolled: f.re_enrolled,
        variant: f.variant,
        channel: f.channel,
        skip_reason: f.skip_reason || null,
        wa: f.wa,
        wa_flat: f.wa_flat,
        chars: f.wa_flat.length,
      })),
    },
    null,
    2,
  ),
);

console.log(JSON.stringify(summary, null, 2));
for (const f of families) {
  const dest = f.channel === "whatsapp"
    ? f.mobile
    : f.channel === "email"
    ? f.email
    : `(skip:${f.skip_reason})`;
  console.log(
    `${f.channel.toUpperCase()} ${f.variant.toUpperCase()} | ${f.parent} | ${dest} | login ${
      f.kids.map((k) => k.login).join("/")
    } | PIN ${f.pin}`,
  );
}

if (!send) {
  console.log(`\nDry run only. Re-run with --send to deliver. Wrote ${OUT_JSON}`);
  Deno.exit(0);
}

const smtp = readParentNotifySmtpConfig();
if (families.some((f) => f.channel === "email") && !smtp) {
  console.error("SMTP not configured but email recipients exist.");
  Deno.exit(1);
}

const report: Array<Record<string, unknown>> = [];
let waSent = 0;
let waFailed = 0;
let emSent = 0;
let emFailed = 0;

for (let i = 0; i < families.length; i++) {
  const f = families[i];
  if (f.channel === "skip") {
    report.push({
      parent: f.parent,
      variant: f.variant,
      channel: "skip",
      reason: f.skip_reason,
    });
    continue;
  }

  if (f.channel === "whatsapp") {
    const e164 = normalizeParentPhoneE164(f.mobile)!;
    const result = await sendParentMessageViaWhatsapp(e164, f.wa, {
      kind: "family_portal_pin",
    });
    const whatsappStatus = result.ok ? "sent" : "failed";
    await admin.from("portal_parent_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: CAMPAIGN_KIND,
      channel: "whatsapp",
      client_display: f.kids.map((k) => k.display).join(", "),
      parent_name: f.parent,
      parent_email: f.email || null,
      parent_phone: e164,
      subject: emailSubject(f.variant),
      body_text: f.wa,
      email_status: "skipped",
      whatsapp_status: whatsappStatus,
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: {
        campaign: CAMPAIGN_KIND,
        variant: f.variant,
        re_enrolled: f.re_enrolled,
        parent_person_id: f.parent_person_id,
        contact_ids: f.contact_ids,
        pin_sent: true,
      },
    });
    if (result.ok) {
      waSent += 1;
      console.log(`WA OK ${i + 1}/${families.length} ${f.parent} ${f.variant}`);
      report.push({ parent: f.parent, variant: f.variant, channel: "whatsapp", ok: true });
    } else {
      waFailed += 1;
      console.error(`WA FAIL ${i + 1}/${families.length} ${f.parent} ${result.error}`);
      // Fallback to email if available
      if (f.email && smtp) {
        const em = await sendParentEmailViaSmtp({
          config: smtp,
          to: f.email,
          subject: emailSubject(f.variant),
          bodyText: f.wa,
          replyTo: "info@clubsensational.org",
        });
        await admin.from("portal_parent_notify_log").insert({
          sent_by_user_id: null,
          sent_by_email: "system@clubsensational.org",
          kind: CAMPAIGN_KIND,
          channel: "email",
          client_display: f.kids.map((k) => k.display).join(", "),
          parent_name: f.parent,
          parent_email: f.email,
          parent_phone: e164,
          subject: emailSubject(f.variant),
          body_text: f.wa,
          email_status: em.ok ? "sent" : "failed",
          whatsapp_status: "failed",
          whatsapp_message_id: null,
          error_detail: em.ok ? `wa_failed_then_email:${result.error}` : `${result.error} | ${em.error}`,
          meta: {
            campaign: CAMPAIGN_KIND,
            variant: f.variant,
            re_enrolled: f.re_enrolled,
            parent_person_id: f.parent_person_id,
            fallback_from_whatsapp: true,
            html_preview: plainTextToHtml(f.wa).slice(0, 200),
          },
        });
        if (em.ok) {
          emSent += 1;
          console.log(`EMAIL FALLBACK OK ${f.parent}`);
          report.push({
            parent: f.parent,
            variant: f.variant,
            channel: "email_fallback",
            ok: true,
            wa_error: result.error,
          });
        } else {
          emFailed += 1;
          console.error(`EMAIL FALLBACK FAIL ${f.parent} ${em.error}`);
          report.push({
            parent: f.parent,
            variant: f.variant,
            channel: "email_fallback",
            ok: false,
            error: em.error,
          });
        }
      } else {
        report.push({
          parent: f.parent,
          variant: f.variant,
          channel: "whatsapp",
          ok: false,
          error: result.error,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 450));
    continue;
  }

  if (f.channel === "email" && smtp) {
    const em = await sendParentEmailViaSmtp({
      config: smtp,
      to: f.email,
      subject: emailSubject(f.variant),
      bodyText: f.wa,
      replyTo: "info@clubsensational.org",
    });
    await admin.from("portal_parent_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: CAMPAIGN_KIND,
      channel: "email",
      client_display: f.kids.map((k) => k.display).join(", "),
      parent_name: f.parent,
      parent_email: f.email,
      parent_phone: null,
      subject: emailSubject(f.variant),
      body_text: f.wa,
      email_status: em.ok ? "sent" : "failed",
      whatsapp_status: "skipped",
      whatsapp_message_id: null,
      error_detail: em.ok ? null : em.error,
      meta: {
        campaign: CAMPAIGN_KIND,
        variant: f.variant,
        re_enrolled: f.re_enrolled,
        parent_person_id: f.parent_person_id,
        reason: "no_mobile",
      },
    });
    if (em.ok) {
      emSent += 1;
      console.log(`EMAIL OK ${i + 1}/${families.length} ${f.parent} ${f.variant}`);
      report.push({ parent: f.parent, variant: f.variant, channel: "email", ok: true });
    } else {
      emFailed += 1;
      console.error(`EMAIL FAIL ${i + 1}/${families.length} ${f.parent} ${em.error}`);
      report.push({
        parent: f.parent,
        variant: f.variant,
        channel: "email",
        ok: false,
        error: em.error,
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const done = {
  done: true,
  campaign: CAMPAIGN_KIND,
  waSent,
  waFailed,
  emSent,
  emFailed,
  summary,
  report,
};
writeFileSync(OUT_REPORT, JSON.stringify(done, null, 2));
console.log(JSON.stringify({
  done: true,
  waSent,
  waFailed,
  emSent,
  emFailed,
  report_path: OUT_REPORT,
}, null, 2));
