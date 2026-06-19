/** Google Workspace SMTP + WhatsApp/Twilio helpers for portal-parent-notify-send. */

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

export type ParentNotifySmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function readParentNotifySmtpConfig(): ParentNotifySmtpConfig | null {
  const host = (Deno.env.get("SMTP_HOST") ?? "").trim();
  const portRaw = (Deno.env.get("SMTP_PORT") ?? "587").trim();
  const port = parseInt(portRaw, 10);
  const secure = ((Deno.env.get("SMTP_SECURE") ?? "false").trim().toLowerCase() ===
    "true");
  const user = (Deno.env.get("SMTP_USER") ?? "").trim();
  const pass = (Deno.env.get("SMTP_PASS") ?? "").trim();
  const from = (Deno.env.get("SMTP_FROM") ?? "").trim() || user;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
  };
}

function smtpBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function parseMailbox(raw: string): { display: string; address: string } {
  const trimmed = String(raw || "").trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { display: match[1].trim(), address: match[2].trim() };
  }
  return { display: "", address: trimmed };
}

function formatFromHeader(from: string): string {
  const box = parseMailbox(from);
  if (box.display && box.address) {
    return `"${box.display.replace(/"/g, '\\"')}" <${box.address}>`;
  }
  return box.address || from;
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${smtpBase64(subject)}?=`;
}

function dotStuff(data: string): string {
  return data
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

type SmtpConn = Deno.Conn | Deno.TlsConn;

async function smtpWrite(conn: SmtpConn, line: string): Promise<void> {
  await conn.write(new TextEncoder().encode(`${line}\r\n`));
}

async function smtpReadResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  carry: { value: string },
): Promise<{ code: number; text: string }> {
  const dec = new TextDecoder();
  while (true) {
    while (carry.value.includes("\r\n")) {
      const idx = carry.value.indexOf("\r\n");
      const line = carry.value.slice(0, idx);
      carry.value = carry.value.slice(idx + 2);
      if (line.length >= 4 && line[3] === "-") continue;
      const code = parseInt(line.slice(0, 3), 10);
      if (!Number.isFinite(code)) throw new Error(`smtp_bad_response:${line.slice(0, 120)}`);
      return { code, text: line };
    }
    const chunk = await reader.read();
    if (chunk.done) throw new Error("smtp_connection_closed");
    carry.value += dec.decode(chunk.value);
  }
}

async function smtpCommand(
  conn: SmtpConn,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  carry: { value: string },
  command: string,
  expectMin = 200,
  expectMax = 399,
): Promise<{ code: number; text: string }> {
  await smtpWrite(conn, command);
  const res = await smtpReadResponse(reader, carry);
  if (res.code < expectMin || res.code > expectMax) {
    throw new Error(`smtp_${res.code}:${res.text.slice(0, 200)}`);
  }
  return res;
}

async function smtpConnect(config: ParentNotifySmtpConfig): Promise<{
  conn: SmtpConn;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  carry: { value: string };
}> {
  const carry = { value: "" };
  let conn: SmtpConn;
  if (config.secure) {
    conn = await Deno.connectTls({ hostname: config.host, port: config.port });
  } else {
    conn = await Deno.connect({ hostname: config.host, port: config.port });
  }
  let reader = conn.readable.getReader();
  const greet = await smtpReadResponse(reader, carry);
  if (greet.code !== 220) throw new Error(`smtp_${greet.code}:${greet.text.slice(0, 200)}`);

  await smtpCommand(conn, reader, carry, "EHLO portal-parent-notify");

  if (!config.secure) {
    const tls = await smtpCommand(conn, reader, carry, "STARTTLS", 220, 220);
    if (tls.code !== 220) throw new Error(`smtp_starttls_failed:${tls.text.slice(0, 200)}`);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    conn = await Deno.startTls(conn, { hostname: config.host });
    reader = conn.readable.getReader();
    carry.value = "";
    await smtpCommand(conn, reader, carry, "EHLO portal-parent-notify");
  }

  await smtpCommand(conn, reader, carry, "AUTH LOGIN", 334, 334);
  await smtpCommand(conn, reader, carry, smtpBase64(config.user), 334, 334);
  await smtpCommand(conn, reader, carry, smtpBase64(config.pass), 235, 235);

  return { conn, reader, carry };
}

async function smtpClose(
  conn: SmtpConn,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  carry: { value: string },
): Promise<void> {
  try {
    await smtpCommand(conn, reader, carry, "QUIT", 200, 221);
  } catch {
    // ignore shutdown errors
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    try {
      conn.close();
    } catch {
      // ignore
    }
  }
}

export async function sendParentEmailViaSmtp(opts: {
  config: ParentNotifySmtpConfig;
  replyTo?: string;
  to: string;
  subject: string;
  bodyText: string;
}): Promise<SendEmailResult> {
  const fromHeader = formatFromHeader(opts.config.from);
  const fromEnvelope = parseMailbox(opts.config.from).address || opts.config.user;
  const messageId = `portal-${crypto.randomUUID()}@${fromEnvelope.split("@")[1] || "clubsensational.org"}`;
  const boundary = `portal_${crypto.randomUUID().replace(/-/g, "")}`;
  const html = plainTextToHtml(opts.bodyText);
  const headers = [
    `From: ${fromHeader}`,
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.bodyText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  let conn: SmtpConn | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let carry: { value: string } | null = null;

  try {
    const session = await smtpConnect(opts.config);
    conn = session.conn;
    reader = session.reader;
    carry = session.carry;

    await smtpCommand(conn, reader, carry, `MAIL FROM:<${fromEnvelope}>`);
    await smtpCommand(conn, reader, carry, `RCPT TO:<${opts.to}>`);
    await smtpCommand(conn, reader, carry, "DATA", 354, 354);
    await conn.write(new TextEncoder().encode(dotStuff(`${headers.join("\r\n")}\r\n\r\n${body}`) + "\r\n.\r\n"));
    const sent = await smtpReadResponse(reader, carry);
    if (sent.code < 200 || sent.code > 299) {
      return { ok: false, error: `smtp_${sent.code}:${sent.text.slice(0, 400)}` };
    }
    return { ok: true, id: messageId };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    if (conn && reader && carry) {
      await smtpClose(conn, reader, carry);
    }
  }
}

export type SendWhatsappResult =
  | { ok: true; id: string; channel: "whatsapp" | "sms" }
  | { ok: false; error: string };

export type WhatsappSendOptions = {
  templateName?: string;
  templateLang?: string;
  kind?: string;
};

/** Resolve Meta template name for parent notify kind (env fallback chain). */
export function resolveParentNotifyWhatsappTemplate(kind: string): string {
  const k = String(kind || "").trim().toLowerCase();
  const byKind: Record<string, string> = {
    payment_due: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_PAYMENT",
    instructor_change: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_INSTRUCTOR",
    instructor_reassign: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_INSTRUCTOR",
    absence_announced: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_ABSENCE",
    makeup_scheduled: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_MAKEUP",
    trial_scheduled: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_TRIAL",
    session_cancelled: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_CANCELLED",
    booking_confirmation: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_BOOKING",
  };
  const specificKey = byKind[k];
  if (specificKey) {
    const specific = (Deno.env.get(specificKey) ?? "").trim();
    if (specific) return specific;
  }
  return (Deno.env.get("PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE") ?? "").trim();
}

function whatsappTemplateBodyParam(body: string, template: string): string {
  let text = String(body || "").trim();
  if (template !== "hello_world") {
    text = text.replace(/\n*Thank you,\s*\nClubSENsational\s*$/i, "").trim();
  }
  // Meta template {{1}} rejects newlines/tabs and 5+ consecutive spaces.
  text = text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {5,}/g, "    ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.slice(0, 1024);
}

function whatsappTemplateLangCandidates(preferred: string): string[] {
  const base = String(preferred || "en").trim() || "en";
  const out: string[] = [];
  for (const code of [base, "en_US", "en", "en_GB"]) {
    const c = String(code || "").trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export async function sendParentMessageViaWhatsapp(
  phoneE164: string,
  body: string,
  opts?: WhatsappSendOptions,
): Promise<SendWhatsappResult> {
  const token = (Deno.env.get("META_WHATSAPP_TOKEN") ?? "").trim();
  const phoneId = (Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") ?? "").trim();
  if (!token || !phoneId) {
    return { ok: false, error: "whatsapp_not_configured" };
  }

  const to = phoneE164.replace(/^\+/, "");
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const template = (opts?.templateName ??
    resolveParentNotifyWhatsappTemplate(opts?.kind ?? "")).trim();
  const preferredLang = (opts?.templateLang ?? Deno.env.get("META_WHATSAPP_TEMPLATE_LANG") ??
    "en").trim() || "en";

  if (!template) {
    const payload = {
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

  const paramText = whatsappTemplateBodyParam(body, template);
  if (!paramText) {
    return { ok: false, error: "whatsapp_empty_template_body" };
  }

  let lastErr = "whatsapp_send_failed";
  for (const lang of whatsappTemplateLangCandidates(preferredLang)) {
    const tpl: Record<string, unknown> = {
      name: template,
      language: { code: lang },
    };
    if (template !== "hello_world") {
      tpl.components = [
        {
          type: "body",
          parameters: [{ type: "text", text: paramText }],
        },
      ];
    }
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: tpl,
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
        lastErr = `whatsapp_${res.status}: ${text.slice(0, 400)}`;
        if (String(text).includes("132001") || String(text).includes("does not exist in the translation")) {
          continue;
        }
        return { ok: false, error: lastErr };
      }
      let parsed: { messages?: Array<{ id?: string }> } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {};
      }
      const id = String(parsed.messages?.[0]?.id || "");
      if (!id) {
        lastErr = `whatsapp_${res.status}: missing_message_id`;
        continue;
      }
      return { ok: true, id, channel: "whatsapp" };
    } catch (e) {
      lastErr = String(e);
    }
  }
  return { ok: false, error: lastErr };
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
  opts?: WhatsappSendOptions,
): Promise<SendWhatsappResult> {
  const wa = await sendParentMessageViaWhatsapp(phoneE164, body, opts);
  if (wa.ok) return wa;
  const sms = await sendParentMessageViaTwilioSms(phoneE164, body);
  if (sms.ok) return sms;
  return { ok: false, error: wa.error || sms.error || "mobile_send_failed" };
}
