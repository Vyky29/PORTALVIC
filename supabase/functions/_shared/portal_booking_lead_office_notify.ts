/**
 * Office alert when a new Booking Portal lead is created / first verifies,
 * or when a Client / Climbing registration form is submitted for review.
 */
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
  sendParentEmailViaSmtp,
} from "./portal_parent_messaging.ts";
import { adminPushOpenBase } from "./portal_webpush_util.ts";

function officeNotifyEmails(): string[] {
  const defaults = [
    "info@clubsensational.org",
    "victor@clubsensational.org",
  ];
  const raw = String(
    Deno.env.get("BOOKING_LEAD_OFFICE_EMAIL") ||
      Deno.env.get("PORTAL_OFFICE_NOTIFY_EMAIL") ||
      "",
  ).trim();
  const fromEnv = raw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of [...fromEnv, ...defaults]) {
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(
      null,
      Array.from(slice) as unknown as number[],
    );
  }
  return btoa(binary);
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function registrationReviewUrl(): string {
  const adminBase = adminPushOpenBase().replace(/\/$/, "");
  const origin = String(Deno.env.get("PORTAL_PUBLIC_ORIGIN") || "")
    .trim()
    .replace(/\/$/, "");
  const base =
    adminBase ||
    (origin ? `${origin}/admin_dashboard.html` : "");
  if (!base) return "";
  if (/[?&]view=/.test(base)) return base;
  return base.includes("?")
    ? `${base}&view=portal_participant_documents`
    : `${base}?view=portal_participant_documents`;
}

export async function notifyOfficeNewBookingLead(opts: {
  leadId: string;
  parentName: string;
  email: string;
  mobile: string;
  source?: string;
  clientStatus?: string;
  event: "created" | "verified";
}): Promise<void> {
  const name = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.email || "").trim();
  const mobile = String(opts.mobile || "").trim();
  const source = String(opts.source || "Booking Page").trim();
  const status = String(opts.clientStatus || "prospective").trim();
  const eventLabel =
    opts.event === "verified"
      ? "verified OTP and unlocked the offer"
      : "requested a Booking Portal access code";

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  if (smtp && tos.length) {
    const subject =
      opts.event === "verified"
        ? `Booking lead verified · ${name}`
        : `New booking lead · ${name}`;
    const bodyText =
      `Booking Portal lead ${eventLabel}.\n\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Phone: ${mobile}\n` +
      `Source: ${source}\n` +
      `Client status: ${status}\n` +
      `Lead id: ${opts.leadId}\n\n` +
      `Open Admin → Enquiries & intake (Booking Portal leads).\n` +
      `— clubSENsational portal`;
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
      });
      if (!mail.ok) {
        console.warn(
          "[booking-lead-office-notify] email failed",
          to,
          mail.error,
        );
      }
    }
  } else {
    console.log(
      `[booking-lead-office-notify] ${opts.event} lead_id=${opts.leadId} name=${name} email=${email} mobile=${mobile}`,
    );
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret || !opts.leadId) return;

  try {
    const res = await fetch(
      `${baseUrl}/functions/v1/portal-push-dispatch-admin-alert`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-webhook-secret": secret,
        },
        body: JSON.stringify({
          type: "INSERT",
          table: "portal_booking_leads",
          record: {
            id: opts.leadId,
            parent_name: name,
            email,
            mobile,
            source,
            client_status: status,
            notify_event: opts.event,
            created_at: new Date().toISOString(),
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(
        "[booking-lead-office-notify] push failed",
        res.status,
        t.slice(0, 200),
      );
    }
  } catch (e) {
    console.warn("[booking-lead-office-notify] push error", e);
  }
}

/** Office alert when a Client Registration / Climbing form lands for review. */
export async function notifyOfficeRegistrationSubmitted(opts: {
  documentId: string;
  formType: string;
  participantName: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  leadId?: string | null;
  slotHeld?: boolean;
  bookingSummary?: string | null;
  /** Optional PDF bytes so office can open the form from the email. */
  pdfBytes?: Uint8Array | null;
  pdfFilename?: string | null;
}): Promise<void> {
  const participant = String(opts.participantName || "").trim() || "Participant";
  const parent = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.parentEmail || "").trim();
  const mobile = String(opts.parentPhone || "").trim();
  const formType = String(opts.formType || "client_registration").trim();
  const formLabel =
    formType === "climbing_registration"
      ? "Climbing registration"
      : "Client registration";
  const bookingLine = String(opts.bookingSummary || "").trim();
  const holdLine = opts.slotHeld
    ? "Selected session place is on a soft hold pending office review."
    : "";
  const reviewUrl = registrationReviewUrl();
  const pdfName =
    String(opts.pdfFilename || "").trim() ||
    `${formType}_${participant.replace(/\s+/g, "_").slice(0, 40)}.pdf`;

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  if (smtp && tos.length) {
    const subject = `${formLabel} submitted · ${participant} (${parent})`;
    const lines = [
      `${formLabel} received — review in Documents and Accept before confirming the place.`,
      "",
      `Participant: ${participant}`,
      `Parent: ${parent}`,
      `Email: ${email || "—"}`,
      `Phone: ${mobile || "—"}`,
    ];
    if (bookingLine) lines.push(`Requested slot: ${bookingLine}`);
    if (holdLine) lines.push(holdLine);
    lines.push(`Document id: ${opts.documentId}`);
    if (opts.leadId) lines.push(`Lead id: ${opts.leadId}`);
    lines.push("");
    if (reviewUrl) {
      lines.push(`Open Registration forms (validate / Accept):`);
      lines.push(reviewUrl);
      lines.push("");
    } else {
      lines.push(
        "Next: Admin → Documents → Registration forms → review PDF → Accept.",
      );
      lines.push("");
    }
    if (opts.pdfBytes && opts.pdfBytes.length) {
      lines.push("The submitted PDF is attached to this email.");
      lines.push("");
    }
    lines.push("— clubSENsational portal");
    const bodyText = lines.join("\n");

    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">` +
      `<p><strong>${escapeHtml(formLabel)}</strong> received — also saved under Documents → Registration forms for Accept / validate.</p>` +
      `<p>` +
      `Participant: <strong>${escapeHtml(participant)}</strong><br/>` +
      `Parent: ${escapeHtml(parent)}<br/>` +
      `Email: ${escapeHtml(email || "—")}<br/>` +
      `Phone: ${escapeHtml(mobile || "—")}` +
      (bookingLine ? `<br/>Requested slot: ${escapeHtml(bookingLine)}` : "") +
      (holdLine ? `<br/>${escapeHtml(holdLine)}` : "") +
      `</p>` +
      (reviewUrl
        ? `<p><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Open Registration forms</a></p>`
        : `<p>Admin → Documents → Registration forms → review PDF → Accept.</p>`) +
      (opts.pdfBytes && opts.pdfBytes.length
        ? `<p style="color:#64748b;font-size:13px">PDF attached.</p>`
        : "") +
      `<p style="color:#64748b;font-size:12px">Document id: ${escapeHtml(opts.documentId)}</p>` +
      `</div>`;

    const attachment =
      opts.pdfBytes && opts.pdfBytes.length
        ? {
          filename: pdfName.replace(/[^\w.\-]+/g, "_").slice(0, 120) ||
            "registration.pdf",
          contentBase64: bytesToBase64(opts.pdfBytes),
          mimeType: "application/pdf",
        }
        : undefined;

    const mail = await sendEmailWithAttachmentViaSmtp({
      config: smtp,
      to: tos,
      subject,
      html,
      replyTo: email || undefined,
      attachment,
    });
    if (!mail.ok) {
      console.warn("[registration-office-notify] email failed", mail.error);
      /* Fallback: plain text per recipient without attachment. */
      for (const to of tos) {
        const plain = await sendParentEmailViaSmtp({
          config: smtp,
          to,
          subject,
          bodyText,
          replyTo: email || undefined,
        });
        if (!plain.ok) {
          console.warn(
            "[registration-office-notify] plain email failed",
            to,
            plain.error,
          );
        }
      }
    } else {
      console.log(
        "[registration-office-notify] emailed",
        tos.join(","),
        "doc=",
        opts.documentId,
        attachment ? "with-pdf" : "no-pdf",
      );
    }
  } else {
    console.log(
      `[registration-office-notify] doc=${opts.documentId} participant=${participant} parent=${parent} email=${email} tos=${tos.join(",") || "none"} smtp=${smtp ? "yes" : "no"}`,
    );
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret) return;

  try {
    const res = await fetch(
      `${baseUrl}/functions/v1/portal-push-dispatch-admin-alert`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-webhook-secret": secret,
        },
        body: JSON.stringify({
          type: "INSERT",
          table: "portal_booking_leads",
          record: {
            id: opts.leadId || opts.documentId,
            parent_name: parent,
            email,
            mobile,
            source: formLabel,
            client_status: "prospective",
            notify_event: "registration_submitted",
            participant_name: participant,
            document_id: opts.documentId,
            created_at: new Date().toISOString(),
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(
        "[registration-office-notify] push failed",
        res.status,
        t.slice(0, 200),
      );
    }
  } catch (e) {
    console.warn("[registration-office-notify] push error", e);
  }
}
