/** Google Workspace SMTP + WhatsApp/Twilio helpers for portal-parent-notify-send. */

export function normalizeParentPhoneE164(raw: string): string | null {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  // "+44 07…" / "4407…" (country code + trunk 0) → "447…"
  if (digits.startsWith("44") && digits.length >= 12) {
    let national = digits.slice(2);
    if (national.startsWith("0")) national = national.slice(1);
    digits = "44" + national;
  } else if (digits.startsWith("0") && digits.length >= 10) {
    // UK local mobile/landline without country code
    digits = "44" + digits.slice(1);
  }
  if (!/^[1-9]/.test(digits)) return null;
  return "+" + digits;
}

export function plainTextToHtml(
  text: string,
  opts?: { instructorPhotoUrl?: string; instructorPhotoName?: string },
): string {
  const esc = (s: string) => String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // Build real <p> paragraphs (blank lines -> paragraph gap, single \n -> <br>).
  // Outlook / Hotmail ignore white-space:pre-wrap, so rely on <p> margins + <br>.
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);
  const bodyHtml = paragraphs
    .map((para) => {
      const inner = esc(para).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 14px 0">${inner || "&nbsp;"}</p>`;
    })
    .join("");
  let html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">${bodyHtml}</div>`;
  const photo = normalizePublicPhotoUrl(String(opts?.instructorPhotoUrl || "").trim());
  if (photo) {
    const alt = esc(String(opts?.instructorPhotoName || "Instructor").trim() || "Instructor");
    html +=
      `<p style="margin:16px 0 0"><img src="${esc(photo)}" alt="${alt}" width="200" style="max-width:200px;height:auto;border-radius:12px;display:block;border:1px solid #e2e8f0" /></p>`;
  }
  return html;
}

export function normalizePublicPhotoUrl(raw: string): string {
  const u = String(raw || "").trim();
  if (!u) return "";
  if (/^https:\/\//i.test(u)) return u.replace(/\?.*$/, "");
  const origin = (Deno.env.get("PORTAL_PUBLIC_ORIGIN") ?? "").trim().replace(/\/$/, "") ||
    "https://portalvic.vercel.app";
  const path = u.charAt(0) === "/" ? u : `/${u.replace(/^\.?\/*/, "")}`;
  return `${origin}${path.replace(/\?.*$/, "")}`;
}

export function parentNotifyKindsWithInstructorPhoto(): Set<string> {
  return new Set(["instructor_change", "instructor_reassign", "makeup_scheduled"]);
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
  await smtpWriteAll(conn, new TextEncoder().encode(`${line}\r\n`));
}

/** conn.write may write fewer bytes than requested; loop until the buffer is fully sent. */
async function smtpWriteAll(conn: SmtpConn, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const n = await conn.write(bytes.subarray(offset));
    if (!Number.isFinite(n) || n <= 0) throw new Error("smtp_write_failed");
    offset += n;
  }
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
  instructorPhotoUrl?: string;
  instructorPhotoName?: string;
}): Promise<SendEmailResult> {
  const fromHeader = formatFromHeader(opts.config.from);
  const fromEnvelope = parseMailbox(opts.config.from).address || opts.config.user;
  const messageId = `portal-${crypto.randomUUID()}@${fromEnvelope.split("@")[1] || "clubsensational.org"}`;
  const boundary = `portal_${crypto.randomUUID().replace(/-/g, "")}`;
  const html = plainTextToHtml(opts.bodyText, {
    instructorPhotoUrl: opts.instructorPhotoUrl,
    instructorPhotoName: opts.instructorPhotoName,
  });
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
    await smtpWriteAll(
      conn,
      new TextEncoder().encode(dotStuff(`${headers.join("\r\n")}\r\n\r\n${body}`) + "\r\n.\r\n"),
    );
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

/** RFC 2045 — base64 attachment bodies must be wrapped to <=76 chars per line. */
function wrapBase64(b64: string): string {
  const clean = String(b64 || "").replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += 76) lines.push(clean.slice(i, i + 76));
  return lines.join("\r\n");
}

/**
 * Send an HTML email (optionally with a single base64 attachment, e.g. a PDF)
 * through the same Google Workspace SMTP used for parent notifications. Reuses
 * the SMTP_* secrets already configured for the portal — no Resend needed.
 */
export async function sendEmailWithAttachmentViaSmtp(opts: {
  config: ParentNotifySmtpConfig;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  fromOverride?: string;
  attachment?: { filename: string; contentBase64: string; mimeType?: string };
}): Promise<SendEmailResult> {
  const recipients = (opts.to || []).map((r) => String(r || "").trim()).filter(Boolean);
  if (!recipients.length) return { ok: false, error: "smtp_no_recipients" };

  const fromRaw = String(opts.fromOverride || "").trim() || opts.config.from;
  const fromHeader = formatFromHeader(fromRaw);
  const fromEnvelope = parseMailbox(opts.config.from).address || opts.config.user;
  const messageId = `portal-${crypto.randomUUID()}@${fromEnvelope.split("@")[1] || "clubsensational.org"}`;
  const mixedBoundary = `portal_mix_${crypto.randomUUID().replace(/-/g, "")}`;
  const altBoundary = `portal_alt_${crypto.randomUUID().replace(/-/g, "")}`;

  const headers = [
    `From: ${fromHeader}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
  ];
  if (opts.replyTo) headers.push(`Reply-To: ${opts.replyTo}`);

  const altPart = [
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.html,
    `--${altBoundary}--`,
    "",
  ].join("\r\n");

  let body: string;
  if (opts.attachment && opts.attachment.contentBase64) {
    const mime = opts.attachment.mimeType || "application/pdf";
    const fname = opts.attachment.filename || "attachment.pdf";
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    body = [
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      altPart,
      `--${mixedBoundary}`,
      `Content-Type: ${mime}; name="${fname}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${fname}"`,
      "",
      wrapBase64(opts.attachment.contentBase64),
      `--${mixedBoundary}--`,
      "",
    ].join("\r\n");
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    body = altPart;
  }

  let conn: SmtpConn | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let carry: { value: string } | null = null;
  try {
    const session = await smtpConnect(opts.config);
    conn = session.conn;
    reader = session.reader;
    carry = session.carry;

    await smtpCommand(conn, reader, carry, `MAIL FROM:<${fromEnvelope}>`);
    for (const rcpt of recipients) {
      const addr = parseMailbox(rcpt).address || rcpt;
      await smtpCommand(conn, reader, carry, `RCPT TO:<${addr}>`);
    }
    await smtpCommand(conn, reader, carry, "DATA", 354, 354);
    await smtpWriteAll(
      conn,
      new TextEncoder().encode(dotStuff(`${headers.join("\r\n")}\r\n\r\n${body}`) + "\r\n.\r\n"),
    );
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
  instructorPhotoUrl?: string;
  instructorPhotoName?: string;
  /** Reply in-thread when parent messaged within the 24h session window. */
  contextWaId?: string;
};

/** Resolve Meta template name for parent notify kind (env fallback chain). */
export function resolveParentNotifyWhatsappTemplate(kind: string): string {
  const k = String(kind || "").trim().toLowerCase();
  // Session text (not template) — required for replies in an open WhatsApp conversation.
  // Free-form staff chat uses staff_message; cold staff outbound uses staff_contact_update.
  if (
    k === "custom" ||
    k === "reply" ||
    k === "whatsapp_reply" ||
    k === "staff_message"
  ) {
    return "";
  }
  if (k === "staff_contact_update" || k === "staff_update") {
    const staffTpl = (Deno.env.get("PORTAL_STAFF_WHATSAPP_TEMPLATE") ?? "").trim();
    if (staffTpl) return staffTpl;
    return (Deno.env.get("PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE") ?? "").trim();
  }
  // Other staff_* kinds stay free-form unless listed above.
  if (k.startsWith("staff_")) {
    return "";
  }
  const byKind: Record<string, string> = {
    weekly_note: "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_WEEKLY_NOTE",
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

/** Flatten + cap for Meta Utility {{1}} (same rules as parent cold outbound).
 * Meta error 132005 ("Translated text too long") fires when {{1}} is near 1024
 * and the approved template already has static lines + a translated locale.
 * Keep well under 1024 so EN→other languages still fit. */
export const WHATSAPP_TEMPLATE_BODY_MAX = 700;

export function flattenWhatsappTemplateBody(body: string, max = WHATSAPP_TEMPLATE_BODY_MAX): string {
  // Meta {{1}} rejects raw newlines; keep paragraph breaks as " · " so login
  // blocks (PIN, name, URL) stay readable instead of one run-on sentence.
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/\n{2,}/g, " · ")
    .replace(/\n/g, " · ")
    .replace(/ {5,}/g, "    ")
    .replace(/\s{2,}/g, " ")
    .replace(/(?: · ){2,}/g, " · ")
    .trim()
    .slice(0, max);
}

function whatsappTemplateBodyParam(body: string, template: string): string {
  let text = String(body || "").trim();
  if (template !== "hello_world") {
    text = text.replace(/\n*Thank you,\s*\nClubSENsational\s*$/i, "").trim();
  }
  // Meta template {{1}} rejects newlines/tabs and 5+ consecutive spaces.
  return flattenWhatsappTemplateBody(text, WHATSAPP_TEMPLATE_BODY_MAX);
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

function whatsappPhotoHeaderEnabled(): boolean {
  return ((Deno.env.get("PORTAL_PARENT_NOTIFY_WHATSAPP_PHOTO_HEADER") ?? "").trim()
    .toLowerCase() === "true");
}

async function sendWhatsappImageMessage(
  phoneId: string,
  token: string,
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<SendWhatsappResult> {
  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl },
  };
  const cap = String(caption || "").trim();
  if (cap) {
    (payload.image as Record<string, string>).caption = cap.slice(0, 1024);
  }
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
      return { ok: false, error: `whatsapp_image_${res.status}: ${text.slice(0, 400)}` };
    }
    let parsed: { messages?: Array<{ id?: string }> } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    const id = String(parsed.messages?.[0]?.id || "");
    return id ? { ok: true, id, channel: "whatsapp" } : {
      ok: false,
      error: "whatsapp_image_missing_message_id",
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Native “edit sent bubble” is NOT supported for Cloud API business messages.
 * Meta only exposes mark-as-read via `message_id` + `status: "read"` on /messages;
 * posting `message_id` + `type: "text"` fails with “status is required”.
 * Edit/revoke webhooks are for Coexistence (user edits in the WhatsApp Business app).
 *
 * Callers should send a free-text correction that quotes the original wamid
 * (`context.message_id`) instead of pretending to rewrite the old bubble.
 */
export async function editParentWhatsappTextMessage(
  messageId: string,
  _body: string,
): Promise<SendWhatsappResult> {
  const waId = String(messageId || "").trim();
  if (!waId || waId.startsWith("app:")) return { ok: false, error: "whatsapp_edit_missing_id" };
  return { ok: false, error: "whatsapp_edit_unsupported" };
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
    const contextId = String(opts?.contextWaId || "").trim();
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: body.slice(0, 4096) },
    };
    if (contextId) {
      payload.context = { message_id: contextId };
    }
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
      const photoUrl = normalizePublicPhotoUrl(String(opts?.instructorPhotoUrl || "").trim());
      const kind = String(opts?.kind || "").trim().toLowerCase();
      if (photoUrl && parentNotifyKindsWithInstructorPhoto().has(kind)) {
        const img = await sendWhatsappImageMessage(
          phoneId,
          token,
          to,
          photoUrl,
          String(opts?.instructorPhotoName || "").trim() || undefined,
        );
        if (!img.ok) {
          console.warn("[portal-parent-notify] whatsapp image after text failed", img.error);
        }
      }
      return { ok: true, id, channel: "whatsapp" };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  const paramText = whatsappTemplateBodyParam(body, template);
  if (!paramText) {
    return { ok: false, error: "whatsapp_empty_template_body" };
  }

  const photoUrl = normalizePublicPhotoUrl(String(opts?.instructorPhotoUrl || "").trim());
  const kind = String(opts?.kind || "").trim().toLowerCase();
  const usePhotoHeader = photoUrl &&
    parentNotifyKindsWithInstructorPhoto().has(kind) &&
    whatsappPhotoHeaderEnabled();

  let lastErr = "whatsapp_send_failed";
  for (const lang of whatsappTemplateLangCandidates(preferredLang)) {
    const headerAttempts = usePhotoHeader ? [true, false] : [false];
    for (const withHeader of headerAttempts) {
      const tpl: Record<string, unknown> = {
        name: template,
        language: { code: lang },
      };
      if (template !== "hello_world") {
        const components: Array<Record<string, unknown>> = [];
        if (withHeader && photoUrl) {
          components.push({
            type: "header",
            parameters: [{ type: "image", image: { link: photoUrl } }],
          });
        }
        components.push({
          type: "body",
          parameters: [{ type: "text", text: paramText }],
        });
        tpl.components = components;
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
          if (withHeader && /1320|header|component/i.test(text)) {
            continue;
          }
          if (String(text).includes("132001") || String(text).includes("does not exist in the translation")) {
            break;
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
          break;
        }
        if (photoUrl && parentNotifyKindsWithInstructorPhoto().has(kind) && !withHeader) {
          const img = await sendWhatsappImageMessage(phoneId, token, to, photoUrl);
          if (!img.ok) {
            console.warn("[portal-parent-notify] whatsapp image follow-up failed", img.error);
          }
        }
        return { ok: true, id, channel: "whatsapp" };
      } catch (e) {
        lastErr = String(e);
      }
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
