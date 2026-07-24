/**
 * Office alert when a new Booking Portal lead is created / first verifies.
 */
import {
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
} from "./portal_parent_messaging.ts";

function officeNotifyEmails(): string[] {
  const raw = String(
    Deno.env.get("BOOKING_LEAD_OFFICE_EMAIL") ||
      Deno.env.get("PORTAL_OFFICE_NOTIFY_EMAIL") ||
      "info@clubsensational.org",
  ).trim();
  return raw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
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
