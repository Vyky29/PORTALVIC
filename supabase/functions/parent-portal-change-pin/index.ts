// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-change-pin
// Parent changes their 4-digit family PIN (synced to co-parents).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  hashFamilyPin,
  isValidFamilyPin,
  isWeakFamilyPin,
  normalizePinDigits,
  verifyFamilyPinHash,
} from "../_shared/parent_portal_pin.ts";
import { upsertFamilyPin } from "../_shared/parent_portal_pin_family.ts";

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

  let body: { current_pin?: unknown; new_pin?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const current = normalizePinDigits(body.current_pin);
  const next = normalizePinDigits(body.new_pin);
  if (!isValidFamilyPin(current) || !isValidFamilyPin(next)) {
    return json(400, { ok: false, error: "pin_format" });
  }
  if (isWeakFamilyPin(next)) {
    return json(400, { ok: false, error: "pin_weak" });
  }
  if (current === next) {
    return json(400, { ok: false, error: "pin_unchanged" });
  }

  const { data: cred } = await supabase
    .from("portal_parent_portal_credentials")
    .select("pin_hash")
    .eq("parent_person_id", session.parent_person_id)
    .maybeSingle();

  if (!cred?.pin_hash || !(await verifyFamilyPinHash(current, String(cred.pin_hash)))) {
    return json(401, { ok: false, error: "current_pin_invalid" });
  }

  const pinHash = await hashFamilyPin(next);
  try {
    await upsertFamilyPin(supabase, session.parent_person_id, next, pinHash, true);
  } catch (e) {
    console.error("[parent-portal-change-pin]", e);
    return parentPortalJsonInvalid(500);
  }

  return json(200, { ok: true, pin_updated: true });
});
