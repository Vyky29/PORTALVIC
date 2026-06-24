// Shared helpers for parent portal OTP + session Edge Functions.

export const parentPortalCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-parent-portal-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const PARENT_PORTAL_GENERIC_RESPONSE = {
  ok: true,
  message: "If the information matches our records, a verification code will be sent.",
};

export const PARENT_PORTAL_OTP_TTL_MS = 10 * 60 * 1000;
export const PARENT_PORTAL_SESSION_TTL_MS = 45 * 60 * 1000;
export const PARENT_PORTAL_OTP_MAX_ATTEMPTS = 5;
export const PARENT_PORTAL_OTP_MAX_PER_HOUR_PER_PARENT = 5;
export const PARENT_PORTAL_OTP_MAX_PER_HOUR_PER_IP = 12;

export function parentPortalJsonOk(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ...PARENT_PORTAL_GENERIC_RESPONSE, ...extra }), {
    status: 200,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

export function parentPortalJsonInvalid(status = 401) {
  return new Response(JSON.stringify({ ok: false, error: "invalid" }), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newOtpCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, "0");
}

export function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim() || "";
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}

export function maskPhoneForLog(p: string): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length <= 4) return "***" + digits;
  return digits.slice(0, 2) + "***" + digits.slice(-2);
}

export function normalizePhoneE164(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("44") && digits.length >= 11) return "+" + digits;
  if (digits.startsWith("0") && digits.length >= 10) return "+44" + digits.slice(1);
  if (digits.length === 10) return "+44" + digits;
  return "+" + digits;
}

export async function sendParentPortalOtpViaWhatsapp(phoneE164: string, code: string): Promise<boolean> {
  const token = Deno.env.get("META_WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return false;
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: phoneE164.replace(/^\+/, ""),
    type: "text",
    text: {
      body:
        `Your clubSENsational parent portal verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
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
      console.warn("[parent-portal-otp] WhatsApp send failed", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[parent-portal-otp] WhatsApp send error", e);
    return false;
  }
}

export async function sendParentPortalOtpViaTwilioSms(phoneE164: string, code: string): Promise<boolean> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !tok || !from) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    To: phoneE164,
    From: from,
    Body: `Your clubSENsational parent portal verification code is ${code}. It expires in 10 minutes.`,
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
      console.warn("[parent-portal-otp] Twilio send failed", r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[parent-portal-otp] Twilio send error", e);
    return false;
  }
}
