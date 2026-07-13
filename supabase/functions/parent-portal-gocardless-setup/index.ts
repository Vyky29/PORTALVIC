// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-gocardless-setup
// Starts a GoCardless Billing Request Flow (mandate + optional first payment),
// or schedules payments if a mandate is already active.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  gocardlessConfigured,
  gocardlessCreateBillingRequest,
  gocardlessCreateBillingRequestFlow,
} from "../_shared/gocardless.ts";
import {
  mandateIsActive,
  scheduleGocardlessPaymentsForContact,
  upsertMandateRow,
} from "../_shared/gocardless_portal.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function defaultPortalOrigin(): string {
  return (
    clean(Deno.env.get("PARENT_PORTAL_PUBLIC_ORIGIN"), 200) ||
    "https://www.clubsensational.org"
  ).replace(/\/$/, "");
}

function safeReturnOrigin(raw: unknown): string {
  const o = clean(raw, 200).replace(/\/$/, "");
  if (!o) return defaultPortalOrigin();
  try {
    const u = new URL(o);
    if (u.protocol !== "https:" && u.protocol !== "http:") return defaultPortalOrigin();
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app") ||
      host.endsWith("clubsensational.org") ||
      host === "portalvic.vercel.app"
    ) {
      return u.origin;
    }
  } catch {
    /* fall through */
  }
  return defaultPortalOrigin();
}

function parentPortalReturnPath(origin: string): string {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      host === "www.clubsensational.org" ||
      host === "clubsensational.org" ||
      host === "family.clubsensational.org"
    ) {
      return "/parent";
    }
  } catch {
    /* fall through */
  }
  return "/parent_portal.html";
}

async function assertContactAccess(
  supabase: ReturnType<typeof createClient>,
  parentPersonId: string,
  contactId: string,
): Promise<boolean> {
  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", parentPersonId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (participant) return true;
  const { data: fallback } = await supabase
    .from("portal_parent_contacts")
    .select("contact_id")
    .eq("parent_person_id", parentPersonId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return !!fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  if (!gocardlessConfigured()) {
    return json(503, {
      ok: false,
      error: "gocardless_not_configured",
      message: "Direct Payment is not available yet. Contact the office.",
    });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string; invoice_id?: string; return_origin?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  const invoiceId = clean(body.invoice_id, 60);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const allowed = await assertContactAccess(supabase, session.parent_person_id, contactId);
  if (!allowed) return parentPortalJsonInvalid(403);

  const { data: mandateRow } = await supabase
    .from("portal_parent_gocardless_mandates")
    .select(
      "contact_id, gocardless_mandate_id, mandate_status, authorisation_url, billing_request_id",
    )
    .eq("contact_id", contactId)
    .maybeSingle();

  if (
    mandateRow &&
    mandateIsActive(mandateRow.mandate_status) &&
    clean(mandateRow.gocardless_mandate_id, 80)
  ) {
    const sched = await scheduleGocardlessPaymentsForContact(supabase, {
      contactId,
      mandateId: String(mandateRow.gocardless_mandate_id),
      invoiceId: invoiceId || null,
    });
    return json(200, {
      ok: true,
      already_mandated: true,
      mandate_status: mandateRow.mandate_status,
      scheduled: sched.scheduled,
      schedule_errors: sched.errors.slice(0, 5),
      message:
        sched.scheduled > 0
          ? "Direct Payment is set up. Collection(s) scheduled with GoCardless."
          : "Direct Payment mandate is already active. No new collections needed right now.",
    });
  }

  // Pick first unpaid GC invoice (or the requested one) for optional first payment_request.
  let firstInv: {
    id: string;
    amount_gbp: number | null;
    invoice_number: string | null;
    due_date: string | null;
  } | null = null;

  {
    let iq = supabase
      .from("portal_parent_invoice_share")
      .select("id, amount_gbp, invoice_number, due_date, payment_status, payment_method_hint")
      .eq("contact_id", contactId)
      .eq("share_status", "ready")
      .in("payment_status", ["unpaid", "partial"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1);
    if (invoiceId) iq = iq.eq("id", invoiceId);
    else iq = iq.eq("payment_method_hint", "gocardless");
    const { data: inv } = await iq.maybeSingle();
    if (inv) firstInv = inv;
  }

  if (invoiceId && !firstInv) {
    return json(404, { ok: false, error: "invoice_not_found" });
  }

  const amount = firstInv?.amount_gbp != null ? Number(firstInv.amount_gbp) : 0;
  const amountPence =
    Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
  const invNo = clean(firstInv?.invoice_number, 40);

  const br = await gocardlessCreateBillingRequest({
    contactId,
    parentPersonId: session.parent_person_id,
    description: "clubSENsational Direct Payment",
    paymentAmountPence: amountPence,
    paymentDescription: invNo
      ? `clubSENsational ${invNo}`
      : "clubSENsational Direct Payment",
    invoiceShareId: firstInv?.id || null,
    invoiceNumber: invNo || null,
  });
  if (!br.ok) {
    return json(502, {
      ok: false,
      error: br.error,
      message: br.detail || "Could not start GoCardless setup.",
    });
  }

  const origin = safeReturnOrigin(body.return_origin);
  const path = parentPortalReturnPath(origin);
  const qs = new URLSearchParams({
    gocardless: "1",
    view: "invoices",
    contact: contactId,
  });
  if (firstInv?.id) qs.set("invoice", firstInv.id);
  const redirectUri = `${origin}${path}?${qs.toString()}`;
  const exitUri = `${origin}${path}?gocardless=cancel&view=invoices&contact=${encodeURIComponent(contactId)}`;

  const flow = await gocardlessCreateBillingRequestFlow({
    billingRequestId: br.data.id,
    redirectUri,
    exitUri,
  });
  if (!flow.ok) {
    return json(502, {
      ok: false,
      error: flow.error,
      message: flow.detail || "Could not open GoCardless pages.",
    });
  }

  try {
    await upsertMandateRow(supabase, {
      contact_id: contactId,
      parent_person_id: session.parent_person_id,
      billing_request_id: br.data.id,
      billing_request_flow_id: flow.data.id,
      authorisation_url: flow.data.authorisation_url,
      mandate_status: "pending",
      last_error: null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[parent-portal-gocardless-setup] upsert", e);
  }

  if (firstInv?.id) {
    await supabase
      .from("portal_parent_invoice_share")
      .update({
        gocardless_url: flow.data.authorisation_url,
        payment_method_hint: "gocardless",
        updated_at: new Date().toISOString(),
      })
      .eq("id", firstInv.id);
  }

  return json(200, {
    ok: true,
    authorisation_url: flow.data.authorisation_url,
    billing_request_id: br.data.id,
    invoice_id: firstInv?.id || null,
  });
});
