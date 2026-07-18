// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-sign-in
// Sign in with participant first name + 4-digit family PIN
// (or 6-digit office master PIN).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientDeviceFromRequest,
  clientIp,
  newSessionToken,
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentGeo, parentGeoToDbFields } from "../_shared/parent_geo.ts";
import {
  childFirstNameToken,
  isMasterPin,
  isValidFamilyPin,
  masterPinFromEnv,
  normalizeParticipantFirstName,
  normalizePinDigits,
  verifyFamilyPinHash,
} from "../_shared/parent_portal_pin.ts";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_HOUR = 20;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  let body: {
    participant_first_name?: unknown;
    child_first_name?: unknown;
    login_pin?: unknown;
    pin?: unknown;
    /** Legacy DOB login fields — ignored (PIN login only). */
    parent_first_name?: unknown;
    parent_last_name?: unknown;
    login_dob?: unknown;
    geo_hint?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const firstName = normalizeParticipantFirstName(
    body.participant_first_name || body.child_first_name || "",
  );
  const pinDigits = normalizePinDigits(body.login_pin || body.pin || "");
  const masterLen = masterPinFromEnv().length;
  if (
    !firstName ||
    (pinDigits.length !== 4 && pinDigits.length !== masterLen && pinDigits.length !== 6)
  ) {
    return parentPortalJsonInvalid(400);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[parent-portal-sign-in] Missing SUPABASE env vars");
    return parentPortalJsonInvalid(500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const ipHash = ip ? await sha256Hex(ip) : await sha256Hex("unknown");

  // Soft rate limit
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: attemptCount } = await supabase
    .from("portal_parent_pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", hourAgo);
  if ((attemptCount || 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return json(429, { ok: false, error: "too_many_attempts" });
  }

  const recordFail = async () => {
    await supabase.from("portal_parent_pin_attempts").insert({
      ip_hash: ipHash,
      name_norm: firstName,
    });
  };

  // Candidate contacts by child first name (first token of first_name or display).
  const { data: contacts, error: cErr } = await supabase
    .from("portal_parent_contacts")
    .select(
      "contact_id, parent_person_id, child_first_name, child_display, parent_display, email, mobile",
    )
    .limit(4000);
  if (cErr) {
    console.error("[parent-portal-sign-in] contacts", cErr.message);
    return parentPortalJsonInvalid(500);
  }

  const matchedRows = (contacts || []).filter((row) => childFirstNameToken(row) === firstName);
  if (!matchedRows.length) {
    await recordFail();
    return parentPortalJsonInvalid();
  }

  const master = isMasterPin(pinDigits);
  let matchedParentId: string | null = null;
  let matchedContactId: string | null = null;

  if (master) {
    const uniqueParents = [
      ...new Set(matchedRows.map((r) => String(r.parent_person_id || "").trim()).filter(Boolean)),
    ];
    if (!uniqueParents.length) {
      await recordFail();
      return parentPortalJsonInvalid();
    }
    /* Prefer a non-demo parent when the same first name exists on test rows. */
    const preferred =
      uniqueParents.find((pid) => !/demo|test/i.test(pid)) || uniqueParents[0];
    matchedParentId = preferred;
    matchedContactId =
      String(
        matchedRows.find((r) => String(r.parent_person_id) === matchedParentId)?.contact_id || "",
      ) || null;
  } else {
    if (!isValidFamilyPin(pinDigits)) {
      await recordFail();
      return parentPortalJsonInvalid();
    }
    const parentIds = [
      ...new Set(matchedRows.map((r) => String(r.parent_person_id || "").trim()).filter(Boolean)),
    ];
    const { data: creds } = await supabase
      .from("portal_parent_portal_credentials")
      .select("parent_person_id, pin_hash")
      .in("parent_person_id", parentIds);

    const byParent = new Map(
      (creds || []).map((c) => [String(c.parent_person_id), String(c.pin_hash || "")]),
    );

    const hits: string[] = [];
    for (const pid of parentIds) {
      const hash = byParent.get(pid);
      if (!hash) continue;
      if (await verifyFamilyPinHash(pinDigits, hash)) hits.push(pid);
    }
    if (!hits.length) {
      await recordFail();
      return parentPortalJsonInvalid();
    }
    /* Co-parents share one family PIN — multiple hits with the same PIN is OK.
       Prefer a non-demo parent_person_id when test rows collide on first name. */
    matchedParentId = hits.find((pid) => !/demo|test/i.test(pid)) || hits[0];
    matchedContactId =
      String(
        matchedRows.find((r) => String(r.parent_person_id) === matchedParentId)?.contact_id || "",
      ) || null;
  }

  if (!matchedParentId) {
    await recordFail();
    return parentPortalJsonInvalid();
  }

  const nowIso = new Date().toISOString();
  const ua = req.headers.get("user-agent") || "";
  const uaHash = ua ? await sha256Hex(ua) : null;

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await supabase
    .from("portal_parent_portal_sessions")
    .update({ revoked_at: nowIso })
    .eq("parent_person_id", matchedParentId)
    .is("revoked_at", null);

  const geo = await resolveParentGeo(req, ip, body.geo_hint);
  const geoFields = geo ? parentGeoToDbFields(geo) : {};

  const { error: insertErr } = await supabase.from("portal_parent_portal_sessions").insert({
    parent_person_id: matchedParentId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
    client_device: clientDeviceFromRequest(req),
    last_contact_id: matchedContactId,
    last_surface: master ? "office_master" : "pin_login",
    ...geoFields,
  });
  if (insertErr) {
    console.error("[parent-portal-sign-in] session insert failed", insertErr);
    return parentPortalJsonInvalid(500);
  }

  const parentRow = matchedRows.find((r) => String(r.parent_person_id) === matchedParentId);

  return new Response(
    JSON.stringify({
      ok: true,
      session_token: token,
      expires_at: expiresAt,
      master_login: master,
      parent: {
        parent_person_id: matchedParentId,
        display_name: parentRow?.parent_display ?? null,
        email: parentRow?.email ?? null,
        mobile: parentRow?.mobile ?? null,
      },
      preferred_contact_id: matchedContactId,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
