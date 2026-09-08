/**
 * Aydaan (Leila): today only Luliya covers Aurora's Acton Aquatic 5.30-6.
 * Roberto is the standing/term instructor path for reallocation note; today Luliya does the shift.
 *
 * Dry:  npx -y deno run -A database/local-vault/send-aydaan-luliya-cover-20260908.ts
 * Send: npx -y deno run -A database/local-vault/send-aydaan-luliya-cover-20260908.ts --send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMessageViaWhatsapp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = Deno.args.includes("--send");
const KIND = "aydaan_luliya_cover_aurora_20260908";
const CONTACT_ID = "125";
const PARENT_URL = "https://www.clubsensational.org/parent";
const OUT = "database/local-vault/tmp/aydaan-luliya-cover-20260908.json";

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

const { data: contact, error: cErr } = await admin
  .from("portal_parent_contacts")
  .select(
    "parent_display, parent_first_name, child_first_name, email, mobile, parent_person_id",
  )
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (cErr) throw cErr;
if (!contact) throw new Error("contact_missing");

const parentFirst =
  String(contact.parent_first_name || "Leila").trim().split(/\s+/)[0] || "Leila";
const childLogin = String(contact.child_first_name || "Aydaan").trim() || "Aydaan";
const phone = normalizeParentPhoneE164(String(contact.mobile || ""));
const parentPersonId = String(contact.parent_person_id || "").trim();
if (!phone) throw new Error("bad_phone");
if (!parentPersonId) throw new Error("missing_parent_person_id");

const { data: cred, error: credErr } = await admin
  .from("portal_parent_portal_credentials")
  .select("pin_display")
  .eq("parent_person_id", parentPersonId)
  .maybeSingle();
if (credErr) throw credErr;
const pin = String(cred?.pin_display || "").trim();
if (!/^\d{4}$/.test(pin)) throw new Error("pin_missing");

const body = asciiBody(
  `Hi ${parentFirst},\n\n` +
    `A quick note for today (Tuesday 8 Sep): we have reallocated a few participants because one instructor is not available for the first session.\n\n` +
    `Aydaan's Aquatic at Acton is still 5.30 to 6. Roberto is the instructor for the term book, but today Luliya is covering the shift. You can see Luliya under Participant's team in the Family Portal. We hope Aurora recovers for next week.\n\n` +
    `Family Portal:\n${PARENT_URL}\n\n` +
    `Login:\n- Child's first name: ${childLogin}\n- Family PIN: ${pin}\n\n` +
    `Thanks,\nOffice | clubSENsational`,
);

const flat = flattenWhatsappTemplateBody(body);
mkdirSync("database/local-vault/tmp", { recursive: true });

console.log(
  JSON.stringify(
    {
      mode: SEND ? "SEND" : "DRY",
      kind: KIND,
      parent: parentFirst,
      child: "Aydaan",
      phone_tail: phone.slice(-4),
      flat_len: flat.length,
    },
    null,
    2,
  ),
);
console.log(body.replace(pin, "****"));

if (flat.length > 700) {
  console.error("Body too long for cold template:", flat.length);
}

if (!SEND) {
  writeFileSync(OUT, JSON.stringify({ mode: "DRY", flat_len: flat.length }, null, 2));
  Deno.exit(0);
}

const { data: prior } = await admin
  .from("portal_parent_notify_log")
  .select("id")
  .eq("kind", KIND)
  .eq("parent_phone", phone)
  .in("whatsapp_status", ["sent", "delivered", "read"])
  .limit(1);
if (prior?.length) {
  console.log("SKIP already_sent");
  Deno.exit(0);
}

const result = await sendParentMessageViaWhatsapp(phone, flat, {
  kind: "contact_update",
});
await admin.from("portal_parent_notify_log").insert({
  sent_by_email: "system@clubsensational.org",
  kind: KIND,
  channel: "whatsapp",
  parent_phone: phone,
  parent_email: contact.email || null,
  parent_name: contact.parent_display || parentFirst,
  subject: "Aydaan — Luliya covers today (Aurora)",
  body_text: body,
  whatsapp_status: result.ok ? "sent" : "failed",
  whatsapp_message_id: result.ok ? result.id : null,
  error_detail: result.ok ? null : result.error,
  meta: {
    campaign: KIND,
    contact_id: CONTACT_ID,
    cover_today: "Luliya",
    term_instructor_note: "Roberto",
  },
});

writeFileSync(
  OUT,
  JSON.stringify(
    { mode: "SEND", ok: result.ok, id: result.id, error: result.error, flat_len: flat.length },
    null,
    2,
  ),
);
console.log(result.ok ? `SENT ${result.id}` : `FAIL ${result.error}`);
