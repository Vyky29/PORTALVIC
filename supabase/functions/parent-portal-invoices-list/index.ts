// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-invoices-list
// Parent-facing list of shared client invoice PDFs for one linked child.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

const BUCKET = "documents";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const { data: shares, error } = await supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, document_id, contact_id, invoice_number, amount_gbp, due_date, payment_status, share_status, ready_at, notes, created_at, updated_at",
    )
    .eq("contact_id", contactId)
    .eq("share_status", "ready")
    .order("due_date", { ascending: false, nullsFirst: false })
    .order("ready_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error("[parent-portal-invoices-list]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const docIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
  const docsById = new Map<string, Record<string, unknown>>();
  if (docIds.length) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, related_date, file_url, created_at, related_client, document_type")
      .in("id", docIds)
      .eq("document_type", "client_invoice");
    for (const d of docs || []) {
      if (d?.id) docsById.set(String(d.id), d);
    }
  }

  const out = [];
  for (const share of shares || []) {
    const doc = docsById.get(String(share.document_id));
    if (!doc || !doc.file_url) continue;
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(String(doc.file_url), 3600);
    out.push({
      id: share.id,
      document_id: share.document_id,
      title: clean(doc.title, 200) || "Invoice",
      invoice_number: share.invoice_number || null,
      amount_gbp: share.amount_gbp != null ? Number(share.amount_gbp) : null,
      due_date: share.due_date || null,
      payment_status: share.payment_status || "unpaid",
      ready_at: share.ready_at || doc.created_at || null,
      related_date: doc.related_date || null,
      notes: share.notes || null,
      pdf_url: signed?.signedUrl || null,
    });
  }

  return json(200, { ok: true, invoices: out });
});
