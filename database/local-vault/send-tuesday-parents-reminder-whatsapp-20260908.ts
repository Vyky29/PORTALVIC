/**
 * Tue 8 Sep Acton AS start reminders (8 families — Ikram/Fadi skipped).
 * Adam / Junaid / Anas: Aurora cover note (Roberto / Roberto / Javier).
 *
 * Dry:  npx -y deno run -A database/local-vault/send-tuesday-parents-reminder-whatsapp-20260908.ts
 * Send: npx -y deno run -A database/local-vault/send-tuesday-parents-reminder-whatsapp-20260908.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const CAMPAIGN = "tuesday_parents_reminder_20260908";
const PREVIEW_JSON =
  "database/local-vault/tmp/tuesday-parents-reminder-20260908-preview.json";
const OUT_DIR = "database/local-vault/tmp";

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

type Fam = {
  parent: string;
  login: string;
  pin: string;
  mobile: string;
  email: string;
  children: string[];
  days: string;
  body: string;
};

const pack = JSON.parse(readFileSync(PREVIEW_JSON, "utf8")) as {
  families: Fam[];
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function asciiBody(body: string): string {
  return String(body || "")
    .replace(/\u2022/g, "-")
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-");
}

mkdirSync(OUT_DIR, { recursive: true });

type ReportRow = {
  parent: string;
  children: string;
  phone: string | null;
  days: string;
  ok?: boolean;
  skipped?: string;
  id?: string;
  error?: string;
  flat_len?: number;
};

const report: ReportRow[] = [];

console.log(
  JSON.stringify(
    {
      mode: SEND ? "SEND" : "DRY",
      campaign: CAMPAIGN,
      families: pack.families.length,
    },
    null,
    2,
  ),
);

for (const fam of pack.families) {
  const body = asciiBody(fam.body);
  const phone = normalizeParentPhoneE164(fam.mobile);
  const children = (fam.children || []).join(", ");
  const flat = flattenWhatsappTemplateBody(body);
  console.log("\n---", children, phone?.slice(-4), "flat", flat.length);
  console.log(body.replace(fam.pin, "****"));

  if (!SEND) {
    report.push({
      parent: fam.parent,
      children,
      phone,
      days: fam.days,
      flat_len: flat.length,
    });
    continue;
  }
  if (!phone) {
    report.push({
      parent: fam.parent,
      children,
      phone: null,
      days: fam.days,
      skipped: "bad_phone",
    });
    continue;
  }

  const { data: prior } = await admin
    .from("portal_parent_notify_log")
    .select("id")
    .eq("kind", CAMPAIGN)
    .eq("parent_phone", phone)
    .in("whatsapp_status", ["sent", "delivered", "read"])
    .limit(1);
  if (prior?.length) {
    report.push({
      parent: fam.parent,
      children,
      phone,
      days: fam.days,
      skipped: "already_sent",
    });
    console.log("SKIP already_sent");
    continue;
  }

  const result = await sendParentMessageViaWhatsapp(phone, flat, {
    kind: "contact_update",
  });
  await admin.from("portal_parent_notify_log").insert({
    sent_by_email: "system@clubsensational.org",
    kind: CAMPAIGN,
    channel: "whatsapp",
    parent_phone: phone,
    parent_email: fam.email || null,
    parent_name: fam.parent,
    subject: `Tue start — ${children}`,
    body_text: body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: CAMPAIGN,
      children: fam.children,
      days: fam.days,
      login: fam.login,
    },
  });
  report.push({
    parent: fam.parent,
    children,
    phone,
    days: fam.days,
    ok: result.ok,
    id: result.ok ? result.id : undefined,
    error: result.ok ? undefined : result.error,
    flat_len: flat.length,
  });
  console.log(result.ok ? `SENT ${result.id}` : `FAIL ${result.error}`);
}

const out = `${OUT_DIR}/tuesday-parents-reminder-20260908-send-report.json`;
writeFileSync(out, JSON.stringify({ mode: SEND ? "SEND" : "DRY", report }, null, 2));
console.log("\nWrote", out);
