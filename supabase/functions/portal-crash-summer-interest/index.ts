// @ts-nocheck — Edge Function (Deno).
//
// portal-crash-summer-interest
// Parent registers interest in individual leftover hours, a waiting-list climb slot,
// or future crash courses when July weeks are fully booked.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

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
  if (req.method !== "POST") {
    return parentPortalJsonInvalid(405);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(503, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid(401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = String(body.contact_id || "").trim();
  const weekId = String(body.week_id || "w1").trim();
  const interestType = String(body.interest_type || "individual_hours").trim();
  const slotId = String(body.slot_id || "").trim() || null;
  const note = String(body.note || "").trim().slice(0, 400) || null;

  if (!contactId) return json(400, { ok: false, error: "contact_required" });
  const allowedTypes = new Set([
    "individual_hours",
    "waiting_list_slot",
    "next_crash_courses",
  ]);
  if (!allowedTypes.has(interestType)) {
    return json(400, { ok: false, error: "invalid_interest_type" });
  }

  const storeWeekId =
    interestType === "next_crash_courses"
      ? "next"
      : weekId === "w1" || weekId === "w2"
        ? weekId
        : "";
  if (!storeWeekId) {
    return json(400, { ok: false, error: "invalid_week" });
  }

  const { data: contact, error: cErr } = await supabase
    .from("portal_parent_contacts")
    .select("contact_id, parent_person_id, child_display")
    .eq("contact_id", contactId)
    .eq("parent_person_id", session.parent_person_id)
    .maybeSingle();

  if (cErr || !contact) {
    return json(403, { ok: false, error: "contact_not_yours" });
  }

  const { data: recent } = await supabase
    .from("portal_crash_summer_interest")
    .select("id")
    .eq("contact_id", contactId)
    .eq("week_id", storeWeekId)
    .eq("interest_type", interestType)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recent?.length) {
    return json(200, {
      ok: true,
      already_registered: true,
      message:
        interestType === "next_crash_courses"
          ? "Thanks — we already have your details for the next crash courses. We will be in touch."
          : "Thanks — we already have your interest for this week. We will follow up when individual hours open.",
    });
  }

  const defaultNote =
    interestType === "waiting_list_slot"
      ? `Waiting list · ${slotId || "climb slot"}`
      : interestType === "next_crash_courses"
        ? "Interested in the next crash courses after July 2026"
        : "Interested in individual leftover hours";

  const { error: insErr } = await supabase.from("portal_crash_summer_interest").insert({
    contact_id: contactId,
    parent_person_id: session.parent_person_id,
    week_id: storeWeekId,
    interest_type: interestType,
    slot_id: interestType === "next_crash_courses" ? null : slotId,
    note: note || defaultNote,
  });

  if (insErr) {
    console.error("[portal-crash-summer-interest]", insErr.message);
    return json(500, { ok: false, error: "save_failed" });
  }

  return json(200, {
    ok: true,
    message:
      interestType === "waiting_list_slot"
        ? "Thanks — you are on the waiting list for that time. We will contact you if it opens."
        : interestType === "next_crash_courses"
          ? "Thanks — we have your details. We will contact you when the next crash courses open."
          : "Thanks — we have noted your interest in individual hours. We will contact you when leftover times open (from Fri 17 July for Week 1).",
  });
});
