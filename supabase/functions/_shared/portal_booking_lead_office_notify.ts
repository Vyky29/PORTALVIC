/**
 * Office alert when a new Booking Portal lead is created / first verifies,
 * or when a Client / Climbing registration form is submitted for review.
 */
import {
  plainTextToHtml,
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
  sendParentEmailViaSmtp,
} from "./portal_parent_messaging.ts";
import {
  formatBookingClockRange,
  formatBookingDateLabel,
  venueEmailLabel,
  weekdayFromIso,
} from "./portal_booking_context.ts";
import { adminPushOpenBase } from "./portal_webpush_util.ts";
import {
  suggestedTransferReference,
  tideBankDetailsFromEnv,
} from "./tide_bank_details.ts";

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

function leadsReviewUrl(): string {
  const adminBase = adminPushOpenBase().replace(/\/$/, "");
  const base = adminBase || "https://portalvic.vercel.app/admin_dashboard.html";
  if (/[?&]view=/.test(base)) return base;
  return base.includes("?") ? `${base}&view=leads` : `${base}?view=leads`;
}

function reenrolmentsReviewUrl(): string {
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
    ? `${base}&view=reenrol_payments`
    : `${base}?view=reenrol_payments`;
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

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  if (smtp && tos.length) {
    const subject =
      opts.event === "verified"
        ? `Booking lead verified · ${name}`
        : `New booking lead · ${name}`;
    const headline =
      opts.event === "verified"
        ? `${name} entered the email code and can see the places.`
        : `${name} asked for a Booking Portal code. The places are not open yet.`;
    const bodyText =
      `${headline}\n\n` +
      `Name: ${name}\n` +
      `Email: ${email || "-"}\n` +
      `Phone: ${mobile || "-"}\n\n` +
      `LEADS:\n` +
      `${leadsReviewUrl()}`;
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
        replyFooter: "off",
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
  /** Requested place: service, then day/date/time, then venue. */
  place?: {
    service?: string | null;
    venue?: string | null;
    day?: string | null;
    dateIso?: string | null;
    time?: string | null;
    instructor?: string | null;
    trial?: boolean;
  } | null;
  existingClient?: boolean;
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
  const bookingSummary = String(opts.bookingSummary || "").trim();
  const isExistingShort = !!opts.existingClient ||
    bookingSummary.toUpperCase().includes("EXISTING CLIENT");
  const place = opts.place || null;
  const placeService = place
    ? [String(place.service || "").trim(), place.trial ? "trial" : ""].filter(Boolean).join(" ")
    : "";
  const placeDate = place ? formatBookingDateLabel(place.dateIso) : null;
  const placeWhen = place
    ? [
      [String(place.day || "").trim() || weekdayFromIso(place.dateIso), placeDate].filter(Boolean).join(", "),
      formatBookingClockRange(place.time),
    ].filter(Boolean).join(", ")
    : "";
  const placeVenue = place ? venueEmailLabel(place.venue) : "";
  const placeShortDate = place
    ? [weekdayFromIso(place.dateIso).slice(0, 3), placeDate ? placeDate.replace(/\s\d{4}$/, "") : ""]
      .filter(Boolean).join(" ")
    : "";
  const reviewUrl = registrationReviewUrl();
  const pdfName =
    String(opts.pdfFilename || "").trim() ||
    `${formType}_${participant.replace(/\s+/g, "_").slice(0, 40)}.pdf`;

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  if (smtp && tos.length) {
    const headline = isExistingShort
      ? "New place request"
      : formType === "climbing_registration"
      ? "New climbing registration"
      : "New registration";
    const subject = [headline, participant, placeService, placeShortDate].filter(Boolean).join(" · ");
    const lines = [
      `${headline}: ${participant}${isExistingShort ? " (already a client)" : ""}`,
      `Parent: ${parent}`,
      "",
    ];
    if (placeService) {
      lines.push("Wants to book (not paid yet):");
      lines.push(placeService.charAt(0).toUpperCase() + placeService.slice(1));
      if (placeWhen) lines.push(placeWhen);
      if (placeVenue) lines.push(placeVenue);
      lines.push("");
    } else if (bookingSummary) {
      lines.push(bookingSummary);
      lines.push("");
    }
    if (reviewUrl) {
      lines.push("REGISTRATION FORMS:");
      lines.push(reviewUrl);
    }
    const bodyText = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    const html = plainTextToHtml(bodyText);

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
          replyFooter: "off",
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
        bookingSummary ? `slot=${bookingSummary}` : "no-slot",
      );
    }
  } else {
    console.log(
      `[registration-office-notify] doc=${opts.documentId} participant=${participant} parent=${parent} email=${email} tos=${tos.join(",") || "none"} smtp=${smtp ? "yes" : "no"} summary=${bookingSummary || "-"}`,
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

/** Office alert when a family joins a Booking Portal full-slot waiting list. */
export async function notifyOfficeWaitlistJoin(opts: {
  entryId: string;
  leadId?: string | null;
  participantName: string;
  parentName: string;
  email: string;
  mobile: string;
  serviceLabel: string;
  dayName: string;
  timeLabel: string;
  venue: string;
  slotId: string;
  note?: string | null;
  alreadyJoined?: boolean;
}): Promise<void> {
  const participant = String(opts.participantName || "").trim() || "Participant";
  const parent = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.email || "").trim();
  const mobile = String(opts.mobile || "").trim();
  const service = String(opts.serviceLabel || "").trim() || "Session";
  const when = [opts.dayName, opts.timeLabel].map((x) => String(x || "").trim()).filter(Boolean).join(" · ");
  const venue = String(opts.venue || "").trim();
  const note = String(opts.note || "").trim();
  const eventLabel = opts.alreadyJoined
    ? "re-confirmed waiting list interest"
    : "joined a waiting list";

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  if (smtp && tos.length) {
    const subject = `Waiting list · ${participant} · ${service}`;
    const bodyText =
      `Booking Portal: family ${eventLabel}.\n\n` +
      `Participant: ${participant}\n` +
      `Parent / carer: ${parent}\n` +
      `Email: ${email}\n` +
      `Phone: ${mobile}\n` +
      `Service: ${service}\n` +
      `Slot: ${when || "—"}${venue ? ` · ${venue}` : ""}\n` +
      `Slot ref: ${opts.slotId}\n` +
      (note ? `Note: ${note}\n` : "") +
      `Entry id: ${opts.entryId}\n` +
      (opts.leadId ? `Lead id: ${opts.leadId}\n` : "") +
      `\nOpen Admin → Waiting list.\n` +
      `— clubSENsational portal`;
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
        replyFooter: "off",
      });
      if (!mail.ok) {
        console.warn("[waitlist-office-notify] email failed", to, mail.error);
      }
    }
  } else {
    console.log(
      `[waitlist-office-notify] entry=${opts.entryId} participant=${participant} service=${service} email=${email}`,
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
          table: "portal_waitlist_entries",
          record: {
            id: opts.entryId,
            lead_id: opts.leadId || null,
            parent_name: parent,
            email,
            mobile,
            participant_name: participant,
            service_label: service,
            slot_id: opts.slotId,
            notify_event: opts.alreadyJoined ? "already_joined" : "joined",
            created_at: new Date().toISOString(),
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(
        "[waitlist-office-notify] push failed",
        res.status,
        t.slice(0, 200),
      );
    }
  } catch (e) {
    console.warn("[waitlist-office-notify] push error", e);
  }
}

/** Office alert when a parent pays an invoice via Stripe (card / Apple Pay). */
export async function notifyOfficeStripePaymentReceived(opts: {
  invoiceShareId: string;
  invoiceNumber: string | null;
  participantName: string | null;
  parentName: string | null;
  parentEmail: string | null;
  amountGbp: number;
  paymentStatus: string;
  paidVia?: string | null;
  sourceLabel?: string | null;
  stripeSessionId?: string | null;
}): Promise<void> {
  const invNo = String(opts.invoiceNumber || "").trim() || opts.invoiceShareId.slice(0, 8);
  const participant = String(opts.participantName || "").trim() || "Participant";
  const parent = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.parentEmail || "").trim();
  const amount = Number(opts.amountGbp) || 0;
  const status = String(opts.paymentStatus || "paid").trim();
  const source = String(opts.sourceLabel || "Stripe payment link").trim();
  const sessionId = String(opts.stripeSessionId || "").trim();

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  const adminUrl = reenrolmentsReviewUrl();
  const subject = `Stripe paid · ${invNo} · ${participant}`;
  const bodyText =
    `A parent paid via Stripe (card / Apple Pay).\n\n` +
    `Invoice: ${invNo}\n` +
    `Participant: ${participant}\n` +
    `Parent / carer: ${parent}\n` +
    (email ? `Email: ${email}\n` : "") +
    `Amount recorded: £${amount.toFixed(2)}\n` +
    `Invoice status: ${status}\n` +
    `Source: ${source}\n` +
    (sessionId ? `Stripe session: ${sessionId}\n` : "") +
    `\nOpen Admin → Finance → Re-enrolments to review the paid invoice (optional).\n` +
    (adminUrl ? `${adminUrl}\n\n` : "") +
    `No need to Mark paid — Stripe already updated the invoice.\n` +
    `Term bookings: Parent Portal PIN is sent automatically when Stripe confirms the first instalment / settle.\n` +
    `Trial bookings: parent gets a booking-completed message (day, time, venue, instructor). No PIN - portal is for term places only.\n` +
    `— clubSENsational portal`;

  if (smtp && tos.length) {
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
        replyFooter: "off",
      });
      if (!mail.ok) {
        console.warn("[stripe-office-notify] email failed", to, mail.error);
      }
    }
  } else {
    console.log(
      `[stripe-office-notify] invoice=${invNo} participant=${participant} amount=${amount} status=${status}`,
    );
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret || !opts.invoiceShareId) return;

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
          type: "UPDATE",
          table: "portal_parent_invoice_share",
          record: {
            id: opts.invoiceShareId,
            invoice_number: invNo,
            participant_name: participant,
            parent_name: parent,
            payment_status: status,
            amount_paid_gbp: amount,
            notify_event: "stripe_paid",
            paid_via: opts.paidVia || "stripe",
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[stripe-office-notify] push failed", res.status, t.slice(0, 200));
    }
  } catch (e) {
    console.warn("[stripe-office-notify] push error", e);
  }
}

/** Parent reported bank transfer (trial or term finish-booking) — office must confirm Tide. */
export async function notifyOfficeBankPaymentReported(opts: {
  invoiceShareId: string;
  invoiceNumber: string | null;
  participantName: string;
  parentName: string | null;
  parentEmail: string | null;
  amountGbp: number;
  isTrial?: boolean;
  paymentRef?: string | null;
  /** When true, parent messaged (WhatsApp / Messages / email) instead of an in-app button. */
  viaParentMessage?: boolean;
  /** Live session being held while Tide is checked. */
  slotSummary?: string | null;
  holdExpiresAt?: string | null;
  fundingLabel?: string | null;
  payPlanLabel?: string | null;
}): Promise<void> {
  const invNo = String(opts.invoiceNumber || "").trim() || opts.invoiceShareId.slice(0, 8);
  const participant = String(opts.participantName || "").trim() || "Participant";
  const parent = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.parentEmail || "").trim();
  const amount = Number(opts.amountGbp) || 0;
  const ref = String(opts.paymentRef || "").trim();
  const kind = opts.isTrial ? "Trial" : "Booking";
  const viaMsg = !!opts.viaParentMessage;
  const slot = String(opts.slotSummary || "").trim();
  const holdUntil = String(opts.holdExpiresAt || "").trim();
  const funding = String(opts.fundingLabel || "").trim();
  const payPlan = String(opts.payPlanLabel || "").trim();

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  const adminUrl = reenrolmentsReviewUrl();
  const subject = viaMsg
    ? `${kind} parent says paid · ${invNo} · ${participant}`
    : `${kind} bank payment reported · ${invNo} · ${participant}`;
  const bodyText =
    (viaMsg
      ? `A parent messaged that they have paid (WhatsApp / Messages / email).\n\n`
      : `A parent reported a bank transfer for finish-booking${opts.isTrial ? " (trial)" : ""}.\n\n`) +
    `Invoice: ${invNo}\n` +
    `Participant: ${participant}\n` +
    `Parent / carer: ${parent}\n` +
    (email ? `Email: ${email}\n` : "") +
    (slot ? `Held session: ${slot}\n` : "") +
    (holdUntil ? `Office confirm hold until: ${holdUntil}\n` : "") +
    (funding ? `Funding: ${funding}\n` : "") +
    (payPlan ? `Pay plan: ${payPlan}\n` : "") +
    `Amount due: £${amount.toFixed(2)}\n` +
    (ref ? `Reference / phone noted: ${ref}\n` : "") +
    `\nPlease check Tide and Mark paid in Admin -> Finance -> Re-enrolments.\n` +
    `Parent Portal PIN is sent only after you confirm payment.\n` +
    (adminUrl ? `${adminUrl}\n\n` : "\n") +
    `- clubSENsational portal`;

  if (smtp && tos.length) {
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
        replyFooter: "off",
      });
      if (!mail.ok) {
        console.warn("[bank-report-office-notify] email failed", to, mail.error);
      }
    }
  } else {
    console.log(
      `[bank-report-office-notify] invoice=${invNo} participant=${participant} amount=${amount} trial=${!!opts.isTrial} slot=${slot || "-"}`,
    );
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret || !opts.invoiceShareId) return;

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
          type: "UPDATE",
          table: "portal_parent_invoice_share",
          record: {
            id: opts.invoiceShareId,
            invoice_number: invNo,
            participant_name: participant,
            parent_name: parent,
            payment_status: "pending_confirmation",
            amount_gbp: amount,
            notify_event: "bank_payment_reported",
            paid_via: "bank_transfer",
            is_trial: !!opts.isTrial,
            slot_summary: slot || null,
            hold_expires_at: holdUntil || null,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[bank-report-office-notify] push failed", res.status, t.slice(0, 200));
    }
  } catch (e) {
    console.warn("[bank-report-office-notify] push error", e);
  }
}

/** Invoice PDF account, used when Tide secrets are not on this function. */
const INVOICE_BANK = {
  payee_name: "ClubSENsational LTD",
  sort_code: "04-06-05",
  account_number: "16987295",
};

function payPlanNeedsBankDetails(payPlan: string): boolean {
  return /bank transfer/i.test(payPlan);
}

function payHoldBankBlock(invoiceNumber: string, participant: string): string {
  const bank = tideBankDetailsFromEnv();
  const payee = bank.payee_name || INVOICE_BANK.payee_name;
  const sort = bank.sort_code || INVOICE_BANK.sort_code;
  const account = bank.account_number || INVOICE_BANK.account_number;
  const ref = suggestedTransferReference(invoiceNumber, participant);
  return (
    `Bank transfer:\n` +
    `Payee: ${payee}\n` +
    `Sort code: ${sort}\n` +
    `Account: ${account}\n` +
    `Reference: ${ref}\n`
  );
}

/** Office FYI when finish-booking creates invoice + 30' pay hold on a live session. */
export async function notifyOfficePayHoldStarted(opts: {
  invoiceShareId: string;
  invoiceNumber: string | null;
  participantName: string;
  parentName: string | null;
  parentEmail: string | null;
  amountGbp: number;
  isTrial?: boolean;
  slotSummary?: string | null;
  holdExpiresAt?: string | null;
  fundingLabel?: string | null;
  payPlanLabel?: string | null;
}): Promise<void> {
  const invNo = String(opts.invoiceNumber || "").trim() || opts.invoiceShareId.slice(0, 8);
  const participant = String(opts.participantName || "").trim() || "Participant";
  const parent = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.parentEmail || "").trim();
  const amount = Number(opts.amountGbp) || 0;
  const kind = opts.isTrial ? "Trial" : "Booking";
  const slot = String(opts.slotSummary || "").trim();
  const holdUntil = String(opts.holdExpiresAt || "").trim();
  const funding = String(opts.fundingLabel || "").trim();
  const payPlan = String(opts.payPlanLabel || "").trim();

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  const adminUrl = reenrolmentsReviewUrl();
  const subject = `${kind} pay hold 30' · ${invNo} · ${participant}`;
  const bankBlock = payPlanNeedsBankDetails(payPlan)
    ? `\n${payHoldBankBlock(invNo, participant)}\n`
    : "";
  const bodyText =
    `Finish-booking: parent chose funding / payment and a ${kind.toLowerCase()} seat is on a 30 minute pay hold.\n\n` +
    `Invoice: ${invNo}\n` +
    `Participant: ${participant}\n` +
    `Parent / carer: ${parent}\n` +
    (email ? `Email: ${email}\n` : "") +
    (slot ? `Held session: ${slot}\n` : "Held session: (see reservation / invoice)\n") +
    (holdUntil ? `Hold until: ${holdUntil}\n` : "") +
    (funding ? `Funding: ${funding}\n` : "") +
    (payPlan ? `Pay plan: ${payPlan}\n` : "") +
    `Amount due: £${amount.toFixed(2)}\n` +
    bankBlock +
    `\nNo Mark paid yet - wait until the parent transfers and taps WhatsApp/email (or Stripe pays).\n` +
    `Then check Tide and Mark paid in Admin -> Finance -> Re-enrolments.\n` +
    (adminUrl ? `${adminUrl}\n\n` : "\n") +
    `- clubSENsational portal`;

  if (smtp && email && bankBlock && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const parentMail = await sendParentEmailViaSmtp({
      config: smtp,
      to: email,
      subject: `Bank details to pay · ${invNo} · ${participant}`,
      bodyText:
        `Hi ${parent},\n\n` +
        `Your place for ${participant} is held for 30 minutes.\n` +
        (slot ? `Session: ${slot}\n` : "") +
        `Invoice: ${invNo}\n` +
        `Amount due: £${amount.toFixed(2)}\n\n` +
        bankBlock +
        `\nUse that reference on the transfer. After you pay, WhatsApp or email the office.\n\n` +
        `Thank you,\nclubSENsational`,
      replyFooter: "no_portal",
    });
    if (!parentMail.ok) {
      console.warn("[pay-hold-parent-bank] email failed", email, parentMail.error);
    }
  }

  if (smtp && tos.length) {
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
        replyFooter: "off",
      });
      if (!mail.ok) {
        console.warn("[pay-hold-office-notify] email failed", to, mail.error);
      }
    }
  } else {
    console.log(
      `[pay-hold-office-notify] invoice=${invNo} participant=${participant} slot=${slot || "-"} hold=${holdUntil || "-"}`,
    );
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret || !opts.invoiceShareId) return;

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
          type: "UPDATE",
          table: "portal_parent_invoice_share",
          record: {
            id: opts.invoiceShareId,
            invoice_number: invNo,
            participant_name: participant,
            parent_name: parent,
            payment_status: "unpaid",
            amount_gbp: amount,
            notify_event: "pay_hold_started",
            is_trial: !!opts.isTrial,
            slot_summary: slot || null,
            hold_expires_at: holdUntil || null,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[pay-hold-office-notify] push failed", res.status, t.slice(0, 200));
    }
  } catch (e) {
    console.warn("[pay-hold-office-notify] push error", e);
  }
}

/** Office FYI: parent chose Local Authority / NHS referral. */
export async function notifyOfficeSwNhsReferral(opts: {
  participantName: string;
  parentName: string | null;
  parentEmail: string | null;
  slotSummary?: string | null;
  bookingScope?: string | null;
  swName: string;
  swEmail: string;
  supportRegulated?: string | null;
  ehcp?: string | null;
  ehcpUploaded?: boolean;
  documentId?: string | null;
}): Promise<void> {
  const participant = String(opts.participantName || "").trim() || "Participant";
  const parent = String(opts.parentName || "").trim() || "Parent / carer";
  const email = String(opts.parentEmail || "").trim();
  const slot = String(opts.slotSummary || "").trim();
  const scope = String(opts.bookingScope || "").trim();
  const swName = String(opts.swName || "").trim() || "(not provided)";
  const swEmail = String(opts.swEmail || "").trim() || "(not provided)";
  const ratio = String(opts.supportRegulated || "").trim();
  const ehcp = String(opts.ehcp || "").trim();

  const smtp = readParentNotifySmtpConfig();
  const tos = officeNotifyEmails();
  const adminUrl = reenrolmentsReviewUrl();
  const subject = `Local Authority / NHS referral · ${participant}`;
  const bodyText =
    `Finish-booking: parent chose Local Authority / NHS referral. Our team will contact the family to finalise the booking.\n\n` +
    `Participant: ${participant}\n` +
    `Parent / carer: ${parent}\n` +
    (email ? `Parent email: ${email}\n` : "") +
    (slot ? `Requested session: ${slot}\n` : "") +
    (scope ? `Booking length: ${scope}\n` : "") +
    `Social worker / NHS manager: ${swName}\n` +
    `SW / NHS email: ${swEmail}\n` +
    (ratio ? `Support when regulated: ${ratio}\n` : "") +
    (ehcp ? `EHCP on form: ${ehcp}\n` : "") +
    (opts.ehcpUploaded ? `EHCP file: uploaded with registration\n` : "") +
    (opts.documentId ? `Registration document: ${opts.documentId}\n` : "") +
    `\nContact the social worker / NHS manager and the family to finalise with LA or NHS.\n` +
    (adminUrl ? `${adminUrl}\n\n` : "\n") +
    `- clubSENsational portal`;

  if (smtp && tos.length) {
    for (const to of tos) {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to,
        subject,
        bodyText,
        replyFooter: "off",
      });
      if (!mail.ok) {
        console.warn("[sw-nhs-referral-office-notify] email failed", to, mail.error);
      }
    }
  } else {
    console.log(
      `[sw-nhs-referral-office-notify] participant=${participant} sw=${swName} <${swEmail}> slot=${slot || "-"}`,
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
          type: "UPDATE",
          table: "portal_booking_completion_tokens",
          record: {
            participant_name: participant,
            parent_name: parent,
            parent_email: email || null,
            notify_event: "sw_nhs_referral",
            slot_summary: slot || null,
            social_worker_name: swName,
            social_worker_email: swEmail,
            support_regulated: ratio || null,
            document_id: opts.documentId || null,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[sw-nhs-referral-office-notify] push failed", res.status, t.slice(0, 200));
    }
  } catch (e) {
    console.warn("[sw-nhs-referral-office-notify] push error", e);
  }
}
