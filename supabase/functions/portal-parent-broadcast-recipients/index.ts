// portal-parent-broadcast-recipients
// -----------------------------------
// Admin-only: returns the de-duplicated list of parent/carer inboxes for a
// bulk broadcast (e.g. the WhatsApp contact-number change email).
//
// One row per email inbox: children names are aggregated, a parent display
// name is chosen, and the first mobile on file (if any) is returned. The demo
// row and out-of-class contacts are excluded. No OTP/session PII is returned.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const DEMO_EMAIL = "victor.matilla.demo@clubsensational.org";

type ContactRow = {
  email: string | null;
  email_norm: string | null;
  parent_display: string | null;
  child_display: string | null;
  mobile: string | null;
  in_class: boolean | null;
};

type Recipient = {
  email: string;
  parentName: string;
  children: string[];
  mobile: string;
  hasMobile: boolean;
};

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
    .select("email, email_norm, parent_display, child_display, mobile, in_class")
    .eq("in_class", true)
    .limit(5000);

  if (error) {
    console.error("[portal-parent-broadcast-recipients]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  const byInbox = new Map<string, Recipient>();
  for (const raw of (data || []) as ContactRow[]) {
    const email = String(raw.email || "").trim();
    const norm = String(raw.email_norm || email).trim().toLowerCase();
    if (!norm || norm.indexOf("@") < 1) continue;
    if (norm === DEMO_EMAIL) continue;

    let rec = byInbox.get(norm);
    if (!rec) {
      rec = { email, parentName: "", children: [], mobile: "", hasMobile: false };
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
  }

  const recipients = Array.from(byInbox.values())
    .map((r) => ({
      email: r.email,
      parentName: r.parentName || r.children[0] || r.email,
      children: r.children.join(", "),
      mobile: r.mobile,
      hasMobile: r.hasMobile,
    }))
    .sort((a, b) => a.parentName.localeCompare(b.parentName));

  return portalAdminJson(200, {
    ok: true,
    recipients,
    count: recipients.length,
    withMobile: recipients.filter((r) => r.hasMobile).length,
    emailOnly: recipients.filter((r) => !r.hasMobile).length,
  });
});
