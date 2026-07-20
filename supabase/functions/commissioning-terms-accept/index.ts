// @ts-nocheck — Edge Function (Deno).
//
// commissioning-terms-accept
// Public (token): view + accept commissioning Terms. Never touches family T&Cs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientIp,
  parentPortalCorsHeaders,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function hashToken(raw: string): Promise<string> {
  return sha256Hex(String(raw || "").trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: parentPortalCorsHeaders });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const action = clean(body.action, 40).toLowerCase() || "load";
  const token = clean(body.token, 200);
  if (!token) return json(400, { ok: false, error: "token_required" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await hashToken(token);
  const { data: ev, error: evErr } = await supabase
    .from("portal_terms_send_events")
    .select(
      "id, document_id, org_id, recipient_email, recipient_name, recipient_role, status, token_expires_at, participant_contact_id"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (evErr || !ev) return json(404, { ok: false, error: "link_not_found" });

  if (ev.token_expires_at && Date.parse(ev.token_expires_at) < Date.now()) {
    await supabase
      .from("portal_terms_send_events")
      .update({ status: "expired" })
      .eq("id", ev.id)
      .in("status", ["sent", "viewed"]);
    return json(410, { ok: false, error: "link_expired" });
  }

  if (ev.status === "accepted") {
    return json(200, { ok: true, already_accepted: true, status: "accepted" });
  }
  if (ev.status === "expired" || ev.status === "superseded") {
    return json(410, { ok: false, error: "link_" + ev.status });
  }

  const { data: doc } = await supabase
    .from("portal_terms_documents")
    .select("id, version, title, public_path, content_hash, status, audience")
    .eq("id", ev.document_id)
    .maybeSingle();

  if (!doc || doc.audience !== "commissioning") {
    return json(400, { ok: false, error: "invalid_document" });
  }

  let orgName = "";
  if (ev.org_id) {
    const { data: org } = await supabase
      .from("portal_commissioning_orgs")
      .select("name")
      .eq("id", ev.org_id)
      .maybeSingle();
    orgName = clean(org?.name, 200);
  }

  if (action === "load" || action === "view") {
    if (ev.status === "sent") {
      await supabase
        .from("portal_terms_send_events")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", ev.id)
        .eq("status", "sent");
    }
    return json(200, {
      ok: true,
      status: ev.status === "sent" ? "viewed" : ev.status,
      document: {
        version: doc.version,
        title: doc.title,
        public_path: doc.public_path,
      },
      recipient: {
        name: ev.recipient_name || "",
        email: ev.recipient_email || "",
        role: ev.recipient_role || "",
      },
      organisation_name: orgName,
    });
  }

  if (action !== "accept") return json(400, { ok: false, error: "unknown_action" });

  const acceptedByName = clean(body.accepted_by_name, 120) || clean(ev.recipient_name, 120);
  const acceptedByEmail =
    clean(body.accepted_by_email, 160).toLowerCase() ||
    clean(ev.recipient_email, 160).toLowerCase();
  const acceptedByRole = clean(body.accepted_by_role, 120) || clean(ev.recipient_role, 120);
  const organisationName = clean(body.organisation_name, 200) || orgName;
  const poReference = clean(body.po_reference, 80);

  if (!acceptedByName || !acceptedByEmail || !organisationName) {
    return json(400, { ok: false, error: "acceptance_fields_required" });
  }

  const ip = clientIp(req);
  const ua = clean(req.headers.get("user-agent"), 300);
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;
  const nowIso = new Date().toISOString();

  const { data: acceptance, error: accErr } = await supabase
    .from("portal_terms_acceptances")
    .insert({
      document_id: doc.id,
      send_event_id: ev.id,
      org_id: ev.org_id,
      organisation_name: organisationName,
      accepted_by_name: acceptedByName,
      accepted_by_role: acceptedByRole || null,
      accepted_by_email: acceptedByEmail,
      po_reference: poReference || null,
      participant_contact_id: ev.participant_contact_id || null,
      accepted_at: nowIso,
      document_version: doc.version,
      document_content_hash: doc.content_hash,
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    })
    .select("id, accepted_at, document_version")
    .maybeSingle();

  if (accErr || !acceptance) {
    return json(500, { ok: false, error: "accept_failed", detail: accErr?.message || "" });
  }

  await supabase
    .from("portal_terms_send_events")
    .update({ status: "accepted", accepted_at: nowIso, viewed_at: ev.viewed_at || nowIso })
    .eq("id", ev.id);

  // If a placement is waiting on terms, move to awaiting_po (does not authorise attendance).
  if (ev.org_id && ev.participant_contact_id) {
    await supabase
      .from("portal_commissioning_placements")
      .update({
        status: "awaiting_po",
        terms_acceptance_id: acceptance.id,
        terms_document_id: doc.id,
        updated_at: nowIso,
      })
      .eq("org_id", ev.org_id)
      .eq("participant_contact_id", ev.participant_contact_id)
      .eq("status", "awaiting_terms_acceptance");
  }

  return json(200, {
    ok: true,
    accepted: true,
    acceptance_id: acceptance.id,
    accepted_at: acceptance.accepted_at,
    document_version: acceptance.document_version,
  });
});
