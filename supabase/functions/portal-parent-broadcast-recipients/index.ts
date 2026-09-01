// portal-parent-broadcast-recipients
// -----------------------------------
// Admin-only: returns the de-duplicated list of parent/carer inboxes for a
// bulk broadcast (e.g. the WhatsApp contact-number change email).
//
// POST JSON (optional):
//   { audience?: "in_class" | "waiting_list" | "enquiries" | "otp_no_booking" | "all" }
//     in_class        — default; families currently in class
//     waiting_list    — on_waiting_list = true (prospects / not yet placed)
//     enquiries       — alias of otp_no_booking
//     otp_no_booking  — booking-portal leads: email OTP verified, but no registration /
//                       booking completed yet (chase list)
//     all             — in class + waiting list + otp_no_booking (deduped by email)
//
// One row per email inbox: children names are aggregated, a parent display
// name is chosen, and the first mobile on file (if any) is returned. The demo
// row is excluded. No OTP/session PII is returned.
// Also returns a best-effort paymentMethod: bank | gocardless | other | unknown
// (re-enrol → contact label → latest invoice hint).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const DEMO_EMAIL = "victor.matilla.demo@clubsensational.org";
const REENROL_YEAR = "2026-27";

type Audience = "in_class" | "waiting_list" | "enquiries" | "otp_no_booking" | "all";

type ContactRow = {
  contact_id: string | null;
  email: string | null;
  email_norm: string | null;
  parent_display: string | null;
  child_display: string | null;
  mobile: string | null;
  in_class: boolean | null;
  on_waiting_list: boolean | null;
  payment_method_label: string | null;
};

type PayChannel = "bank" | "gocardless" | "other" | "unknown";

type Recipient = {
  email: string;
  parentName: string;
  children: string[];
  mobile: string;
  hasMobile: boolean;
  contactIds: string[];
  payChannels: Set<PayChannel>;
  inClass: boolean;
  onWaitingList: boolean;
  bookingStatus?: string;
  registrationStatus?: string;
  leadStage?: string;
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseAudience(raw: unknown): Audience {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "waiting_list" || s === "waitlist" || s === "waiting") return "waiting_list";
  if (
    s === "otp_no_booking" ||
    s === "otp_only" ||
    s === "verified_no_booking" ||
    s === "enquiries" ||
    s === "enquiry" ||
    s === "leads" ||
    s === "booking_leads"
  ) {
    return "otp_no_booking";
  }
  if (s === "all") return "all";
  return "in_class";
}

/** OTP done, but never finished a booking / registration submit. */
function isOtpNoBookingLead(lead: {
  email_verified_at?: unknown;
  booking_status?: unknown;
  registration_status?: unknown;
}): boolean {
  if (!lead.email_verified_at) return false;
  const book = clean(lead.booking_status, 40).toLowerCase();
  const reg = clean(lead.registration_status, 40).toLowerCase();
  if (book === "registration_submitted" || book === "booking_completed") return false;
  if (reg === "submitted") return false;
  return true;
}

function classifyPay(raw: unknown): PayChannel {
  const s = clean(raw, 200).toLowerCase();
  if (!s) return "unknown";
  if (/gocardless|go\s*cardless|direct\s*debit|monthly\s*dd/.test(s)) {
    return "gocardless";
  }
  if (
    /bank\s*transfer|apple\s*pay|card\s*\/\s*apple|fixed due|one[-\s]?off|flexi|own\s*way|parent invoice/
      .test(s)
  ) {
    return "bank";
  }
  if (s === "bank_transfer" || s === "bank") return "bank";
  if (s === "gocardless") return "gocardless";
  if (/la_funded|la invoice|nhs|care in finance|local authority/.test(s)) {
    return "other";
  }
  return "other";
}

function pickChannel(set: Set<PayChannel>): PayChannel {
  if (set.has("gocardless")) return "gocardless";
  if (set.has("bank")) return "bank";
  if (set.has("other")) return "other";
  return "unknown";
}

function payLabel(ch: PayChannel): string {
  if (ch === "gocardless") return "GoCardless";
  if (ch === "bank") return "Bank";
  if (ch === "other") return "Other";
  return "Unknown";
}

function reenrolPayCode(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const funding = (p.funding && typeof p.funding === "object")
    ? p.funding as Record<string, unknown>
    : null;
  const choices = (p.choices && typeof p.choices === "object")
    ? p.choices as Record<string, unknown>
    : null;
  const c2627 = (funding && funding.choices_2627 && typeof funding.choices_2627 === "object")
    ? funding.choices_2627 as Record<string, unknown>
    : (p.choices_2627 && typeof p.choices_2627 === "object")
    ? p.choices_2627 as Record<string, unknown>
    : null;
  return clean(
    c2627?.payment_method_code ||
      funding?.payment_method_code ||
      choices?.payment_method_code ||
      c2627?.payment_method_label ||
      funding?.payment_method_label ||
      "",
    80,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const audience = parseAudience(body.audience);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byInbox = new Map<string, Recipient>();

  function upsertRecipient(opts: {
    email: string;
    parentName?: string;
    child?: string;
    mobile?: string;
    contactId?: string;
    inClass?: boolean;
    onWaitingList?: boolean;
    payLabel?: string;
    listKindHint?: string;
    bookingStatus?: string;
    registrationStatus?: string;
    leadStage?: string;
  }) {
    const email = clean(opts.email, 200);
    const norm = email.toLowerCase();
    if (!norm || norm.indexOf("@") < 1) return;
    if (norm === DEMO_EMAIL) return;

    let rec = byInbox.get(norm);
    if (!rec) {
      rec = {
        email,
        parentName: "",
        children: [],
        mobile: "",
        hasMobile: false,
        contactIds: [],
        payChannels: new Set(),
        inClass: false,
        onWaitingList: false,
        bookingStatus: "",
        registrationStatus: "",
        leadStage: "",
      };
      byInbox.set(norm, rec);
    }
    const parent = clean(opts.parentName, 120);
    if (parent && !rec.parentName) rec.parentName = parent;
    const child = clean(opts.child, 120);
    if (child && rec.children.indexOf(child) < 0) rec.children.push(child);
    const mobile = clean(opts.mobile, 40);
    if (mobile && !rec.mobile) {
      rec.mobile = mobile;
      rec.hasMobile = true;
    }
    const cid = clean(opts.contactId, 40);
    if (cid && rec.contactIds.indexOf(cid) < 0) rec.contactIds.push(cid);
    if (opts.inClass === true) rec.inClass = true;
    if (opts.onWaitingList === true) rec.onWaitingList = true;
    if (opts.bookingStatus && !rec.bookingStatus) rec.bookingStatus = clean(opts.bookingStatus, 40);
    if (opts.registrationStatus && !rec.registrationStatus) {
      rec.registrationStatus = clean(opts.registrationStatus, 40);
    }
    if (opts.leadStage && !rec.leadStage) rec.leadStage = clean(opts.leadStage, 40);
    const ch = classifyPay(opts.payLabel);
    if (ch && ch !== "unknown") rec.payChannels.add(ch);
    else if (!rec.payChannels.size) rec.payChannels.add("unknown");
  }

  const includeContacts = audience === "in_class" || audience === "waiting_list" ||
    audience === "all";
  const includeOtpNoBooking = audience === "otp_no_booking" || audience === "all";

  if (includeContacts) {
    let query = admin
      .from("portal_parent_contacts")
      .select(
        "contact_id, email, email_norm, parent_display, child_display, mobile, in_class, on_waiting_list, payment_method_label",
      )
      .limit(5000);

    if (audience === "in_class") {
      query = query.eq("in_class", true);
    } else if (audience === "waiting_list") {
      query = query.eq("on_waiting_list", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[portal-parent-broadcast-recipients]", error.message);
      return portalAdminJson(500, { ok: false, error: "query_failed" });
    }

    const contactIds = [
      ...new Set(
        ((data || []) as ContactRow[])
          .map((r) => clean(r.contact_id, 40))
          .filter(Boolean),
      ),
    ];

    const payByContact = new Map<string, PayChannel>();

    if (contactIds.length) {
      const { data: reenrolRows } = await admin
        .from("portal_re_enrolment_submissions")
        .select("participant_contact_id, payload, submitted_at")
        .eq("academic_year", REENROL_YEAR)
        .in("participant_contact_id", contactIds)
        .order("submitted_at", { ascending: false })
        .limit(2000);
      for (const row of reenrolRows || []) {
        const cid = clean(row.participant_contact_id, 40);
        if (!cid || payByContact.has(cid)) continue;
        const code = reenrolPayCode(row.payload);
        const ch = classifyPay(code);
        if (ch !== "unknown") payByContact.set(cid, ch);
      }

      const { data: invRows } = await admin
        .from("portal_parent_invoice_share")
        .select("contact_id, payment_method_hint, updated_at")
        .in("contact_id", contactIds)
        .order("updated_at", { ascending: false })
        .limit(4000);
      for (const row of invRows || []) {
        const cid = clean(row.contact_id, 40);
        if (!cid || payByContact.has(cid)) continue;
        const hint = clean(row.payment_method_hint, 40);
        if (!hint || hint === "la_funded") continue;
        payByContact.set(cid, classifyPay(hint));
      }
    }

    for (const raw of (data || []) as ContactRow[]) {
      const email = String(raw.email || "").trim();
      const cid = clean(raw.contact_id, 40);
      let pay = cid ? payByContact.get(cid) : undefined;
      if (!pay || pay === "unknown") pay = classifyPay(raw.payment_method_label);
      upsertRecipient({
        email,
        parentName: String(raw.parent_display || "").trim(),
        child: String(raw.child_display || "").trim(),
        mobile: String(raw.mobile || "").trim(),
        contactId: cid,
        inClass: raw.in_class === true,
        onWaitingList: raw.on_waiting_list === true,
        payLabel: pay,
      });
    }
  }

  /** Booking-portal leads: OTP verified, but never completed a booking/registration. */
  if (includeOtpNoBooking) {
    const { data: leads, error: leadErr } = await admin
      .from("portal_booking_leads")
      .select(
        "parent_name, email, mobile, email_verified_at, booking_status, registration_status, last_activity_at",
      )
      .not("email_verified_at", "is", null)
      .order("last_activity_at", { ascending: false })
      .limit(2000);
    if (leadErr) {
      console.error("[portal-parent-broadcast-recipients] leads", leadErr.message);
    } else {
      for (const lead of leads || []) {
        if (!isOtpNoBookingLead(lead)) continue;
        upsertRecipient({
          email: String(lead.email || "").trim(),
          parentName: String(lead.parent_name || "").trim(),
          mobile: String(lead.mobile || "").trim(),
          listKindHint: "otp_no_booking",
          bookingStatus: String(lead.booking_status || "").trim(),
          registrationStatus: String(lead.registration_status || "").trim(),
          leadStage: "otp_no_booking",
        });
      }
    }
  }

  const recipients = Array.from(byInbox.values())
    .map((r) => {
      const paymentMethod = pickChannel(r.payChannels);
      let listKind = "other";
      if (r.onWaitingList && !r.inClass) listKind = "waiting_list";
      else if (r.inClass && r.onWaitingList) listKind = "in_class_and_waiting";
      else if (r.inClass) listKind = "in_class";
      else if (r.leadStage === "otp_no_booking" || (!r.inClass && !r.onWaitingList)) {
        listKind = "otp_no_booking";
      }
      return {
        email: r.email,
        parentName: r.parentName || r.children[0] || r.email,
        children: r.children.join(", "),
        mobile: r.mobile,
        hasMobile: r.hasMobile,
        paymentMethod,
        paymentMethodLabel: payLabel(paymentMethod),
        inClass: r.inClass,
        onWaitingList: r.onWaitingList,
        listKind,
        bookingStatus: r.bookingStatus || "",
        registrationStatus: r.registrationStatus || "",
        leadStage: r.leadStage || "",
      };
    })
    .sort((a, b) => a.parentName.localeCompare(b.parentName));

  return portalAdminJson(200, {
    ok: true,
    audience,
    recipients,
    count: recipients.length,
    withMobile: recipients.filter((r) => r.hasMobile).length,
    emailOnly: recipients.filter((r) => !r.hasMobile).length,
    withBank: recipients.filter((r) => r.paymentMethod === "bank").length,
    withGocardless: recipients.filter((r) => r.paymentMethod === "gocardless").length,
    waitingList: recipients.filter((r) => r.onWaitingList).length,
    enquiries: recipients.filter((r) => r.listKind === "otp_no_booking").length,
    otpNoBooking: recipients.filter((r) => r.listKind === "otp_no_booking").length,
  });
});
