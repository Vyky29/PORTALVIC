// portal-parent-broadcast-recipients
// -----------------------------------
// Admin-only: returns the de-duplicated list of parent/carer inboxes for a
// bulk broadcast (e.g. the WhatsApp contact-number change email).
//
// One row per email inbox: children names are aggregated, a parent display
// name is chosen, and the first mobile on file (if any) is returned. The demo
// row and out-of-class contacts are excluded. No OTP/session PII is returned.
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

type ContactRow = {
  contact_id: string | null;
  email: string | null;
  email_norm: string | null;
  parent_display: string | null;
  child_display: string | null;
  mobile: string | null;
  in_class: boolean | null;
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
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("portal_parent_contacts")
    .select(
      "contact_id, email, email_norm, parent_display, child_display, mobile, in_class, payment_method_label",
    )
    .eq("in_class", true)
    .limit(5000);

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

  const byInbox = new Map<string, Recipient>();
  for (const raw of (data || []) as ContactRow[]) {
    const email = String(raw.email || "").trim();
    const norm = String(raw.email_norm || email).trim().toLowerCase();
    if (!norm || norm.indexOf("@") < 1) continue;
    if (norm === DEMO_EMAIL) continue;

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
      };
      byInbox.set(norm, rec);
    }
    const parent = String(raw.parent_display || "").trim();
    if (parent && !rec.parentName) rec.parentName = parent;
    const child = String(raw.child_display || "").trim();
    if (child && rec.children.indexOf(child) < 0) rec.children.push(child);
    const mobile = String(raw.mobile || "").trim();
    if (mobile && !rec.mobile) {
      rec.mobile = mobile;
      rec.hasMobile = true;
    }
    const cid = clean(raw.contact_id, 40);
    if (cid && rec.contactIds.indexOf(cid) < 0) rec.contactIds.push(cid);

    let ch = cid ? payByContact.get(cid) : undefined;
    if (!ch || ch === "unknown") {
      ch = classifyPay(raw.payment_method_label);
    }
    if (ch && ch !== "unknown") rec.payChannels.add(ch);
    else if (!rec.payChannels.size) rec.payChannels.add("unknown");
  }

  const recipients = Array.from(byInbox.values())
    .map((r) => {
      const paymentMethod = pickChannel(r.payChannels);
      return {
        email: r.email,
        parentName: r.parentName || r.children[0] || r.email,
        children: r.children.join(", "),
        mobile: r.mobile,
        hasMobile: r.hasMobile,
        paymentMethod,
        paymentMethodLabel: payLabel(paymentMethod),
      };
    })
    .sort((a, b) => a.parentName.localeCompare(b.parentName));

  return portalAdminJson(200, {
    ok: true,
    recipients,
    count: recipients.length,
    withMobile: recipients.filter((r) => r.hasMobile).length,
    emailOnly: recipients.filter((r) => !r.hasMobile).length,
    withBank: recipients.filter((r) => r.paymentMethod === "bank").length,
    withGocardless: recipients.filter((r) => r.paymentMethod === "gocardless").length,
  });
});
