// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
//
// staff-profile-otp-request
// -------------------------
// First step of the staff self-service profile update flow.
//
// Input  (POST JSON): { full_name: string, phone_number: string }
// Output (always 200): { ok: true, message: string }
//
// CRITICAL — anti-enumeration:
//   This endpoint MUST return the same generic success response regardless of
//   whether the (name, phone) pair matched a real staff member, so an attacker
//   cannot use it to discover who works for ClubSENsational.
//
// Behaviour:
//   - Always responds: "If the information matches our records, a verification
//     code will be sent."
//   - On match: generates a 6-digit OTP, stores its SHA-256 hash in
//     `staff_profile_update_otps` with a 10-minute expiry, sends it via
//     WhatsApp Cloud API (preferred), Twilio SMS (fallback), or just logs it
//     when neither provider is configured.
//   - Rate-limits: max 5 outstanding OTPs per staff_id per hour and per IP.
//
// Required env vars:
//   SUPABASE_URL                         (auto)
//   SUPABASE_SERVICE_ROLE_KEY            (auto)
//
// Optional env vars (provider config):
//   META_WHATSAPP_TOKEN                  Meta Cloud API access token
//   META_WHATSAPP_PHONE_NUMBER_ID        WhatsApp Business phone number ID
//   META_WHATSAPP_TEMPLATE_NAME          (optional) approved template name; if unset, uses text body
//   META_WHATSAPP_TEMPLATE_LANG          (optional) defaults to "en"
//   TWILIO_ACCOUNT_SID                   Twilio account SID
//   TWILIO_AUTH_TOKEN                    Twilio auth token
//   TWILIO_FROM_NUMBER                   Twilio sender (E.164) — sandbox or purchased
//
// If no provider env vars are set, the OTP is written to the function logs
// (Supabase → Functions → Logs) so a developer can finish the flow during
// integration. Never deploy to production without configuring a real channel.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENERIC_RESPONSE = {
  ok: true,
  message: "If the information matches our records, a verification code will be sent.",
};

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_PER_HOUR_PER_STAFF = 5;
const OTP_MAX_PER_HOUR_PER_IP = 12;

function jsonOk(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ...GENERIC_RESPONSE, ...extra }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim() || "";
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newOtpCode(): string {
  // 6-digit zero-padded numeric OTP. crypto.getRandomValues to avoid Math.random bias.
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, "0");
}

function maskPhoneForLog(p: string): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length <= 4) return "***" + digits;
  return digits.slice(0, 2) + "***" + digits.slice(-2);
}

async function sendViaWhatsapp(phoneE164: string, code: string): Promise<boolean> {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return false;
  const template = Deno.env.get("META_WHATSAPP_TEMPLATE_NAME") || "";
  const lang = Deno.env.get("META_WHATSAPP_TEMPLATE_LANG") || "en";
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: phoneE164.replace(/^\+/, ""),
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: code }],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: code }],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: phoneE164.replace(/^\+/, ""),
        type: "text",
        text: {
          body: `Your clubSENsational profile verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
        },
      };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn("[staff-profile-otp-request] WhatsApp send failed", r.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[staff-profile-otp-request] WhatsApp send error", e);
    return false;
  }
}

async function sendViaTwilioSms(phoneE164: string, code: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !tok || !from) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    To: phoneE164,
    From: from,
    Body: `Your clubSENsational profile verification code is ${code}. It expires in 10 minutes.`,
  });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${tok}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn("[staff-profile-otp-request] Twilio send failed", r.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[staff-profile-otp-request] Twilio send error", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Always reply with the generic message even if the request body is malformed,
  // to avoid leaking signal about validation outcomes.
  let body: { full_name?: unknown; phone_number?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonOk();
  }

  const fullName = String(body.full_name || "").trim();
  const phoneInput = String(body.phone_number || "").trim();
  if (!fullName || !phoneInput) return jsonOk();

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[staff-profile-otp-request] Missing SUPABASE env vars");
    return jsonOk(); // never leak server config to caller
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  // IP rate limit (do this BEFORE the identity match so we can't be used as a
  // free oracle even with the constant-time response).
  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("staff_profile_update_otps")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("ip_hash", ipHash);
    if ((count ?? 0) >= OTP_MAX_PER_HOUR_PER_IP) return jsonOk();
  }

  const { data: matchedId, error: matchErr } = await supabase.rpc(
    "staff_profile_match_identity",
    { p_full_name: fullName, p_phone: phoneInput },
  );
  if (matchErr) {
    console.error("[staff-profile-otp-request] match rpc error", matchErr);
    return jsonOk();
  }
  if (!matchedId) return jsonOk();

  // Per-staff rate limit
  const sinceStaff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: staffCount } = await supabase
    .from("staff_profile_update_otps")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", matchedId)
    .gte("created_at", sinceStaff);
  if ((staffCount ?? 0) >= OTP_MAX_PER_HOUR_PER_STAFF) return jsonOk();

  // Pull the canonical phone from the profile so we send to the on-file number,
  // not whatever the caller typed (defence-in-depth).
  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("phone_e164, full_name")
    .eq("id", matchedId)
    .maybeSingle();
  const destination = String(profile?.phone_e164 || "").trim();
  if (!destination) {
    console.warn("[staff-profile-otp-request] staff matched but has no phone_e164 on file", matchedId);
    return jsonOk();
  }

  const code = newOtpCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  // Invalidate any older outstanding OTPs for this staff member.
  await supabase
    .from("staff_profile_update_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("staff_id", matchedId)
    .is("consumed_at", null);

  // Pick channel — try WhatsApp first, then SMS, then log fallback.
  let channel: "whatsapp" | "sms" | "log" = "log";
  let sent = await sendViaWhatsapp(destination, code);
  if (sent) channel = "whatsapp";
  if (!sent) {
    sent = await sendViaTwilioSms(destination, code);
    if (sent) channel = "sms";
  }
  if (!sent) {
    console.log(
      "[staff-profile-otp-request] No SMS/WhatsApp provider configured. " +
        `staff_id=${matchedId} destination=${maskPhoneForLog(destination)} code=${code}`,
    );
  }

  const { error: insertErr } = await supabase.from("staff_profile_update_otps").insert({
    staff_id: matchedId,
    code_hash: codeHash,
    channel,
    destination,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });
  if (insertErr) {
    console.error("[staff-profile-otp-request] insert otp failed", insertErr);
  }

  return jsonOk();
});
