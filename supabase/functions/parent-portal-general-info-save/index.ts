// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-general-info-save
// --------------------------------
// Save parent-edited general information for a linked participant.
//
// Headers: x-parent-portal-session
// Body: { contact_id, general_info_sheet?, fields? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  parseGeneralInfoSheet,
  rebuildGeneralInfoSheet,
} from "../_shared/participant_general_info.ts";

function clean(v: unknown, max = 12000): string {
  return String(v ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: {
    contact_id?: string;
    general_info_sheet?: string;
    fields?: Array<{ num?: string; label?: string; value?: string }>;
  } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return parentPortalJsonInvalid(400);

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (!participant) return parentPortalJsonInvalid(403);

  let sheet = clean(body.general_info_sheet, 12000);
  if (!sheet && Array.isArray(body.fields) && body.fields.length) {
    sheet = rebuildGeneralInfoSheet(
      body.fields.map((f, i) => ({
        num: String(f.num || i + 1),
        label: clean(f.label, 200),
        value: clean(f.value, 2000),
      })),
    );
  }

  if (!sheet) {
    return new Response(JSON.stringify({ ok: false, error: "empty" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const fields = parseGeneralInfoSheet(sheet);
  if (fields.length < 1) {
    return new Response(JSON.stringify({ ok: false, error: "invalid_format" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const normalizedSheet = rebuildGeneralInfoSheet(fields);
  const now = new Date().toISOString();

  const { error: upsertErr } = await supabase.from("portal_participant_general_info").upsert(
    {
      contact_id: contactId,
      general_info_sheet: normalizedSheet,
      updated_at: now,
      updated_by_parent_person_id: session.parent_person_id,
    },
    { onConflict: "contact_id" },
  );

  if (upsertErr) {
    console.error("[parent-portal-general-info-save]", upsertErr);
    return parentPortalJsonInvalid(500);
  }

  await supabase.from("portal_participant_general_info_log").insert({
    contact_id: contactId,
    parent_person_id: session.parent_person_id,
    general_info_sheet: normalizedSheet,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      general_info: {
        general_info_sheet: normalizedSheet,
        fields,
        updated_at: now,
      },
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
