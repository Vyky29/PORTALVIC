/**
 * Rav / Kabir — one reply about £50 vs £75 climbing trial + fresh finish link.
 * WhatsApp body kept well under Meta template {{1}} max (700).
 *
 * Dry:  npx -y deno run -A database/local-vault/office-resend-kabir-sran-trial-finish-link.ts
 * Send once (WA + email): SEND=1 npx -y deno run -A database/local-vault/office-resend-kabir-sran-trial-finish-link.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  finishBookingUrl,
  mintFinishBookingToken,
} from "../../supabase/functions/_shared/portal_booking_finish.ts";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
  WHATSAPP_TEMPLATE_BODY_MAX,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const SEND = (Deno.env.get("SEND") || "") === "1";
const DOC_ID = "4d54e7c9-7b5c-4b65-8012-0abf73f38ac8";
const RES_ID = "523de083-caf0-45f8-adda-7c5c6bb11560";
const KIND = "kabir_climbing_trial_price_reply";

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

/** Short flat body for Meta contact_update {{1}} (must stay << 700). */
function waBody(url: string): string {
  return (
    `Hi Rav — sorry about the £50 on the link; that was a system error (aquatic rate). ` +
    `Climbing 1 hour / trial is £75. Card/Apple Pay is about £77.93 so we still net £75; bank transfer is £75 (then email/WhatsApp us a screenshot). ` +
    `Finish Kabir's trial (Westway · Sun 6 Sep · 12–1): ${url}`
  );
}

function emailBody(url: string): string {
  return [
    `Hi Rav,`,
    ``,
    `Thanks for your message — and sorry about the confusion on the amount.`,
    ``,
    `Climbing (1 hour): normal session £75 · trial also £75.`,
    `The £50 on the earlier link was a system error (aquatic rate). That is fixed.`,
    ``,
    `Card / Apple Pay: about £77.93 (so after card fees we still receive £75).`,
    `Bank transfer: £75 — then please email or WhatsApp a photo/screenshot so we can confirm.`,
    ``,
    `Finish Kabir's trial booking (Westway · Sunday 6 Sep · 12.00–1.00):`,
    url,
    ``,
    `Thanks,`,
    `clubSENsational`,
  ].join("\n");
}

async function main() {
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const { data: prior } = await admin
    .from("portal_parent_notify_log")
    .select("id, created_at, whatsapp_status, email_status")
    .eq("kind", KIND)
    .order("created_at", { ascending: false })
    .limit(1);
  if (prior?.length) {
    console.log("ALREADY SENT once — refusing duplicate.", prior[0]);
    Deno.exit(0);
  }

  const { data: doc, error } = await admin
    .from("portal_participant_documents")
    .select("id, participant_name, parent_name, parent_email, parent_phone, status")
    .eq("id", DOC_ID)
    .maybeSingle();
  if (error) throw error;
  if (!doc) throw new Error("document_not_found");

  let leadId: string | null = null;
  const emailAddr = String(doc.parent_email || "").trim().toLowerCase();
  if (emailAddr) {
    const { data: lead } = await admin
      .from("portal_booking_leads")
      .select("id")
      .eq("email_norm", emailAddr)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = lead?.id ? String(lead.id) : null;
  }

  const holdUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error: holdErr } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "awaiting_payment",
      released_at: null,
      hold_expires_at: holdUntil,
      updated_at: new Date().toISOString(),
    })
    .eq("id", RES_ID);
  if (holdErr) throw holdErr;

  await admin
    .from("portal_booking_completion_tokens")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("document_id", DOC_ID)
    .in("status", [
      "pending",
      "funding_saved",
      "scope_saved",
      "choices_saved",
      "awaiting_payment",
      "la_office",
    ]);

  const minted = await mintFinishBookingToken(admin, {
    leadId,
    documentId: DOC_ID,
    reservationId: RES_ID,
  });
  const url = finishBookingUrl(minted.rawToken);
  const wa = waBody(url);
  const flat = flattenWhatsappTemplateBody(wa);
  const mailText = emailBody(url);

  console.log("wa_flat_len", flat.length, "/ max", WHATSAPP_TEMPLATE_BODY_MAX);
  console.log("wa_flat:\n", flat);
  console.log("\nemail:\n", mailText);

  if (flat.length > WHATSAPP_TEMPLATE_BODY_MAX) {
    throw new Error(`whatsapp_body_too_long:${flat.length}`);
  }

  if (!SEND) {
    console.log("\nDry run. Re-run with SEND=1 for one WhatsApp + one email.");
    return;
  }

  const phone = normalizeParentPhoneE164(String(doc.parent_phone || ""));
  let waResult: { ok: boolean; id?: string; channel?: string; error?: string } = {
    ok: false,
    error: phone ? undefined : "no_phone",
  };
  if (phone) {
    waResult = await sendParentMobileMessage(phone, wa, { kind: "contact_update" });
  }

  let emailOk = false;
  const smtp = readParentNotifySmtpConfig();
  if (smtp && emailAddr && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)) {
    const mail = await sendParentEmailViaSmtp({
      config: smtp,
      to: emailAddr,
      subject: `Climbing trial price · Kabir Sran`,
      text: mailText,
    });
    emailOk = mail.ok;
    if (!mail.ok) console.warn("email failed", mail.error);
  }

  await admin.from("portal_parent_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "system@clubsensational.org",
    kind: KIND,
    channel: emailOk && waResult.ok ? "both" : waResult.ok ? "whatsapp" : emailOk ? "email" : "whatsapp",
    client_display: doc.participant_name,
    parent_name: doc.parent_name,
    parent_email: emailAddr,
    parent_phone: phone,
    subject: `Climbing trial price · Kabir Sran`,
    body_text: wa,
    message_type: "text",
    email_status: emailOk ? "sent" : emailAddr ? "failed" : "skipped",
    whatsapp_status: waResult.ok ? "sent" : phone ? "failed" : "skipped",
    whatsapp_message_id: waResult.ok ? waResult.id || null : null,
    error_detail: waResult.ok ? null : waResult.error || null,
    meta: {
      source: "office_kabir_price_reply",
      once: true,
      finish_token_id: minted.tokenId,
      wa_flat_len: flat.length,
    },
  });

  console.log("RESULT", { emailOk, waOk: waResult.ok, waError: waResult.error, waId: waResult.id });
  if (!waResult.ok) Deno.exit(1);
}

main().catch((e) => {
  console.error(e);
  Deno.exit(1);
});
