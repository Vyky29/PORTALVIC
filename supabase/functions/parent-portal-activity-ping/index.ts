// parent-portal-activity-ping
// Parents report which hub surface they opened. Updates session last_surface
// and appends a row to portal_parent_portal_activity (deduped ~45s same surface).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

const ALLOWED = new Set([
  "home",
  "hub",
  "sessions",
  "photos",
  "weekly_notes",
  "messages",
  "absence",
  "consents",
  "documents",
  "booking",
  "calendar",
  "team",
  "balance",
  "credits",
  "swim",
  "invoices",
  "crash",
  "reenrolment",
  "general_info",
  "achievements",
]);

const DEDUPE_MS = 45_000;

function clean(v: unknown, max = 80): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: parentPortalCorsHeaders() });
  }
  if (req.method !== "POST") {
    return parentPortalJsonInvalid(405, { ok: false, error: "method_not_allowed" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return parentPortalJsonInvalid(503, { ok: false, error: "server_misconfigured" });
  }

  const supabase = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) {
    return parentPortalJsonInvalid(401, { ok: false, error: "session_expired" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const surface = clean(body.surface || body.view || body.event_type, 40).toLowerCase();
  if (!surface || !ALLOWED.has(surface)) {
    return parentPortalJsonInvalid(400, { ok: false, error: "invalid_surface" });
  }
  const contactId = clean(body.contact_id, 80) || null;
  const detail = clean(body.detail, 160) || null;
  const nowIso = new Date().toISOString();

  await supabase
    .from("portal_parent_portal_sessions")
    .update({
      last_used_at: nowIso,
      last_surface: surface,
      last_contact_id: contactId,
    })
    .eq("id", session.id);

  const since = new Date(Date.now() - DEDUPE_MS).toISOString();
  const { data: recent } = await supabase
    .from("portal_parent_portal_activity")
    .select("id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("event_type", surface)
    .gte("created_at", since)
    .limit(1);

  let logged = false;
  if (!recent?.length) {
    const { error } = await supabase.from("portal_parent_portal_activity").insert({
      parent_person_id: session.parent_person_id,
      contact_id: contactId,
      event_type: surface,
      detail,
      created_at: nowIso,
    });
    if (error) {
      console.error("[parent-portal-activity-ping] insert", error.message);
    } else {
      logged = true;
    }
  }

  return new Response(JSON.stringify({ ok: true, logged, surface }), {
    status: 200,
    headers: { ...parentPortalCorsHeaders(), "Content-Type": "application/json" },
  });
});
