// portal-reenrolment-submit — save parent re-enrolment 2026/27 choices for admin review.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientIp,
  parentPortalCorsHeaders,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { REENROL_ACADEMIC_YEAR } from "../_shared/reenrolment_catalog.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(raw: unknown, max = 200): string {
  return String(raw ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const participantName = sanitize(body.participant_name, 200);
  if (!participantName) return json(400, { ok: false, error: "missing_participant" });

  const choices = body.choices;
  if (!choices || typeof choices !== "object") {
    return json(400, { ok: false, error: "missing_choices" });
  }

  const declarations = body.declarations;
  if (!declarations || typeof declarations !== "object") {
    return json(400, { ok: false, error: "missing_declarations" });
  }

  const confirmAccurate = !!(declarations as Record<string, unknown>).accurate;
  const confirmTerms = !!(declarations as Record<string, unknown>).terms;
  if (!confirmAccurate || !confirmTerms) {
    return json(400, { ok: false, error: "declarations_required" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  const source = sanitize(body.source, 40) === "parent_portal" ? "parent_portal" : "link";

  const payload = {
    choices,
    declarations,
    funding: body.funding ?? null,
    weekly_slots_snapshot: body.weekly_slots ?? null,
    day_centre_snapshot: body.day_centre ?? null,
    annual_weekly_total: body.annual_weekly_total ?? null,
    slot_change_notes: sanitize(body.slot_change_notes, 2000) || null,
    contact_email: sanitize(body.contact_email, 200) || null,
    contact_phone: sanitize(body.contact_phone, 40) || null,
    submitted_from: sanitize(body.submitted_from, 500) || null,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("portal_re_enrolment_submissions")
    .insert({
      academic_year: REENROL_ACADEMIC_YEAR,
      source,
      parent_first_name: sanitize(body.parent_first_name, 120) || null,
      parent_last_name: sanitize(body.parent_last_name, 120) || null,
      participant_name: participantName,
      participant_contact_id: sanitize(body.participant_contact_id, 80) || null,
      parent_person_id: sanitize(body.parent_person_id, 80) || null,
      client_payments_client_key: sanitize(body.client_key, 120) || null,
      payment_status_at_submit: sanitize(body.payment_status, 80) || null,
      outstanding_amount:
        body.outstanding_amount != null && body.outstanding_amount !== ""
          ? Number(body.outstanding_amount)
          : null,
      payload,
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    })
    .select("id, submitted_at")
    .single();

  if (insErr || !inserted) {
    console.error("[portal-reenrolment-submit] insert", insErr?.message);
    return json(500, { ok: false, error: "save_failed" });
  }

  return json(200, {
    ok: true,
    submission_id: inserted.id,
    submitted_at: inserted.submitted_at,
    message: "Thank you — your re-enrolment has been sent to the club office.",
  });
});
