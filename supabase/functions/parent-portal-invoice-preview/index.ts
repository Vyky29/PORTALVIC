// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-invoice-preview
// Live parent-facing PDF replica from current share payment state (unpaid /
// partial / paid stamps + paid-to-date). Does not mutate the stored document
// used for Xero / office truth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { regeneratePortalInvoiceSharePdf } from "../_shared/portal_create_family_invoice.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: parentPortalCorsHeaders });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, admin);
  if (!session) return parentPortalJsonInvalid();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const contactId = clean(body.contact_id, 40);
  const invoiceId = clean(body.invoice_id, 80);
  if (!contactId || !invoiceId) {
    return json(400, { ok: false, error: "contact_id_and_invoice_id_required" });
  }

  const { data: participant } = await admin
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) {
    const fallback = await admin
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const { data: share, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .select("id, contact_id, invoice_number, share_status, payment_status")
    .eq("id", invoiceId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (shareErr || !share) return json(404, { ok: false, error: "not_found" });
  if (clean(share.share_status, 40) === "hidden") {
    return json(404, { ok: false, error: "not_found" });
  }

  const built = await regeneratePortalInvoiceSharePdf(admin, invoiceId, { mode: "bytes" });
  if (!built.ok || !("pdfBytes" in built) || !built.pdfBytes) {
    return json(500, {
      ok: false,
      error: ("error" in built && built.error) || "pdf_failed",
    });
  }

  const filename = `${clean(built.invoiceNumber || share.invoice_number, 40) || "invoice"}-view.pdf`
    .replace(/[^\w.-]+/g, "_");

  return new Response(built.pdfBytes, {
    status: 200,
    headers: {
      ...parentPortalCorsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Invoice-Number": clean(built.invoiceNumber || share.invoice_number, 40),
      "X-Payment-Status": clean(share.payment_status, 40) || "unpaid",
    },
  });
});
