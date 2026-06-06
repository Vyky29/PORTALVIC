/** Resend + WhatsApp/Twilio helpers for portal-parent-notify-send. */

export function normalizeParentPhoneE164(raw: string): string | null {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  // UK local mobile/landline without country code
  if (digits.startsWith("0") && digits.length >= 10) digits = "44" + digits.slice(1);
  if (!/^[1-9]/.test(digits)) return null;
  return "+" + digits;
}

export function plainTextToHtml(text: string): string {
  const esc = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;white-space:pre-wrap">${esc}</div>`;
}

export function maskPhoneForLog(phone: string): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length <= 4) return "***";
  return d.slice(0, 2) + "***" + d.slice(-2);
}

export function maskEmailForLog(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1) return "***";
  return e.slice(0, 2) + "***" + e.slice(at);
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendParentEmailViaResend(opts: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  bodyText: string;
}): Promise<SendEmailResult> {
  const payload: Record<string, unknown> = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    text: opts.bodyText,
    html: plainTextToHtml(opts.bodyText),
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `resend_${res.status}: ${text.slice(0, 400)}` };
    }
    let parsed: { id?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    return { ok: true, id: String(parsed.id || "") };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export type SendWhatsappResult =
  | { ok: true; id: string; channel: "whatsapp" | "sms" }
  | { ok: false; error: string };

export async function sendParentMessageViaWhatsapp(
  phoneE164: string,
  body: string,
): Promise<SendWhatsappResult> {
  const token = (Deno.env.get("META_WHATSAPP_TOKEN") ?? "").trim();
  const phoneId = (Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token || !phoneId) {
    return { ok: false, error: "whatsapp_not_configured" };
  }

  const to = phoneE164.replace(/^\+/, "");
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const template = (Deno.env.get("PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE") ?? "").trim();
  const lang = (Deno.env.get("META_WHATSAPP_TEMPLATE_LANG") ?? "en").trim() || "en";

  const payload = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: body.slice(0, 1024) }],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: body.slice(0, 4096) },
      };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `whatsapp_${res.status}: ${text.slice(0, 400)}` };
    }
    let parsed: { messages?: Array<{ id?: string }> } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    const id = String(parsed.messages?.[0]?.id || "");
    return { ok: true, id, channel: "whatsapp" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function sendParentMessageViaTwilioSms(
  phoneE164: string,
  body: string,
): Promise<SendWhatsappResult> {
  const sid = (Deno.env.get("TWILIO_ACCOUNT_SID") ?? "").trim();
  const tok = (Deno.env.get("TWILIO_AUTH_TOKEN") ?? "").trim();
  const from = (Deno.env.get("TWILIO_FROM_NUMBER") ?? "").trim();
  if (!sid || !tok || !from) {
    return { ok: false, error: "twilio_not_configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({
    To: phoneE164,
    From: from,
    Body: body.slice(0, 1600),
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${tok}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `twilio_${res.status}: ${text.slice(0, 400)}` };
    }
    let parsed: { sid?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    return { ok: true, id: String(parsed.sid || ""), channel: "sms" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function sendParentMobileMessage(
  phoneE164: string,
  body: string,
): Promise<SendWhatsappResult> {
  const wa = await sendParentMessageViaWhatsapp(phoneE164, body);
  if (wa.ok) return wa;
  const sms = await sendParentMessageViaTwilioSms(phoneE164, body);
  if (sms.ok) return sms;
  return { ok: false, error: wa.error || sms.error || "mobile_send_failed" };
}
