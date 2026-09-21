/**
 * ACAT Tue Day Centre start today (8 Sep) + Family PIN + unpaid invoice nudge.
 * Families: Jack Stratton (Veronica), Jack Walker (Francesca), Kate (Maire), Kamy (Faryaneh).
 *
 * Dry:  npx -y deno run -A database/local-vault/send-acat-tue-start-pin-20260908.ts
 * Send: npx -y deno run -A database/local-vault/send-acat-tue-start-pin-20260908.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const KIND = "acat_tue_start_pin_invoice_20260908";
const PARENT_URL = "https://www.clubsensational.org/parent";
const OUT = "database/local-vault/tmp/acat-tue-start-pin-20260908-report.json";

type Target = {
  contactId: string;
  parentPersonId: string;
  parentFirst: string;
  childLogin: string;
  childLabel: string;
  invoice: string;
  phoneFallback: string;
};

const TARGETS: Target[] = [
  {
    contactId: "170",
    parentPersonId: "5517161",
    parentFirst: "Veronica",
    childLogin: "Jack",
    childLabel: "Jack",
    invoice: "INV-P-0467",
    phoneFallback: "07803093911",
  },
  {
    contactId: "gap-jack-walker",
    parentPersonId: "gap-francesca-walker",
    parentFirst: "Francesca",
    childLogin: "Jack",
    childLabel: "Jack",
    invoice: "INV-P-0468",
    phoneFallback: "07718742339",
  },
  {
    contactId: "197",
    parentPersonId: "maire-fordham",
    parentFirst: "Maire",
    childLogin: "Kate",
    childLabel: "Kate",
    invoice: "INV-P-0469",
    phoneFallback: "07716878189",
  },
  {
    contactId: "199",
    parentPersonId: "faryaneh-akhavan",
    parentFirst: "Faryaneh",
    childLogin: "Kamy",
    childLabel: "Kamy",
    invoice: "INV-P-0470",
    phoneFallback: "07795181580",
  },
];

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

function asciiBody(body: string): string {
  return String(body || "")
    .replace(/\u2022/g, "-")
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-");
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
  throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
}

mkdirSync("database/local-vault/tmp", { recursive: true });

const report: Array<Record<string, unknown>> = [];

console.log(JSON.stringify({ mode: SEND ? "SEND" : "DRY", kind: KIND, n: TARGETS.length }, null, 2));

for (const t of TARGETS) {
  const { data: contact, error: cErr } = await admin
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, child_first_name, email, mobile, parent_person_id")
    .eq("contact_id", t.contactId)
    .maybeSingle();
  if (cErr) throw cErr;

  const parentFirst =
    String(contact?.parent_first_name || t.parentFirst).trim().split(/\s+/)[0] ||
    t.parentFirst;
  const childLogin = String(contact?.child_first_name || t.childLogin).trim() || t.childLogin;
  const phone = normalizeParentPhoneE164(
    String(contact?.mobile || t.phoneFallback || ""),
  );
  const parentPersonId = String(contact?.parent_person_id || t.parentPersonId).trim();

  const { data: cred, error: credErr } = await admin
    .from("portal_parent_portal_credentials")
    .select("pin_display")
    .eq("parent_person_id", parentPersonId)
    .maybeSingle();
  if (credErr) throw credErr;
  const pin = String(cred?.pin_display || "").trim();
  if (!/^\d{4}$/.test(pin)) {
    report.push({ child: t.childLabel, skipped: "pin_missing" });
    console.log("SKIP pin_missing", t.childLabel);
    continue;
  }

  const { data: inv } = await admin
    .from("portal_parent_invoice_share")
    .select("invoice_number, payment_status, amount_gbp, share_status")
    .eq("invoice_number", t.invoice)
    .maybeSingle();
  const invPay = String(inv?.payment_status || "").toLowerCase();
  const invReady = String(inv?.share_status || "").toLowerCase() === "ready";
  const unpaid = invPay === "unpaid" || invPay === "partial";

  const body = asciiBody(
    `Hi ${parentFirst},\n\n` +
      `${t.childLabel} starts with us today (Tuesday 8 September) for ACAT Day Centre 11-12 at SwimFarm.\n\n` +
      `Family portal (schedule, notes, invoices):\n` +
      `${PARENT_URL}\n\n` +
      `LOGIN DETAILS\nChild's first name: ${childLogin}\nFamily PIN: ${pin}\n\n` +
      (unpaid && invReady
        ? `Your Autumn ACAT invoice (${t.invoice}, £${Number(inv?.amount_gbp || 700)}) is ready in Invoices - tap the glowing Pay button to pay by card / Apple Pay or use the bank details shown.\n\n`
        : "") +
      `Thanks,\nOffice | clubSENsational`,
  );

  const flat = flattenWhatsappTemplateBody(body);
  console.log("\n---", t.childLabel, phone?.slice(-4), "flat", flat.length, "unpaid", unpaid);
  console.log(body.replace(pin, "****"));

  if (!SEND) {
    report.push({
      child: t.childLabel,
      parent: parentFirst,
      invoice: t.invoice,
      unpaid,
      flat_len: flat.length,
      dry: true,
    });
    continue;
  }
  if (!phone) {
    report.push({ child: t.childLabel, skipped: "bad_phone" });
    continue;
  }

  const { data: prior } = await admin
    .from("portal_parent_notify_log")
    .select("id")
    .eq("kind", KIND)
    .eq("parent_phone", phone)
    .in("whatsapp_status", ["sent", "delivered", "read"])
    .limit(1);
  if (prior?.length) {
    report.push({ child: t.childLabel, skipped: "already_sent" });
    console.log("SKIP already_sent");
    continue;
  }

  const result = await sendParentMessageViaWhatsapp(phone, flat, {
    kind: "contact_update",
  });
  await admin.from("portal_parent_notify_log").insert({
    sent_by_email: "system@clubsensational.org",
    kind: KIND,
    channel: "whatsapp",
    parent_phone: phone,
    parent_email: contact?.email || null,
    parent_name: contact?.parent_display || parentFirst,
    subject: `ACAT start today + PIN — ${t.childLabel}`,
    body_text: body,
    whatsapp_status: result.ok ? "sent" : "failed",
    whatsapp_message_id: result.ok ? result.id : null,
    error_detail: result.ok ? null : result.error,
    meta: {
      campaign: KIND,
      contact_id: t.contactId,
      child: t.childLabel,
      invoice: t.invoice,
      unpaid,
    },
  });
  report.push({
    child: t.childLabel,
    ok: result.ok,
    id: result.ok ? result.id : undefined,
    error: result.ok ? undefined : result.error,
    flat_len: flat.length,
  });
  console.log(result.ok ? `SENT ${result.id}` : `FAIL ${result.error}`);
}

writeFileSync(OUT, JSON.stringify({ mode: SEND ? "SEND" : "DRY", report }, null, 2));
console.log("\nWrote", OUT);
