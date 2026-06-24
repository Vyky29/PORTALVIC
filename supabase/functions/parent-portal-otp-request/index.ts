// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-otp-request
// -------------------------
// Step 1: parent/carer proves identity with name + mobile on file.
// Always returns generic success (anti-enumeration).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PARENT_PORTAL_OTP_MAX_PER_HOUR_PER_IP,
  PARENT_PORTAL_OTP_MAX_PER_HOUR_PER_PARENT,
  PARENT_PORTAL_OTP_TTL_MS,
  clientIp,
  maskPhoneForLog,
  newOtpCode,
  normalizePhoneE164,
  parentPortalCorsHeaders,
  parentPortalJsonOk,
  sendParentPortalOtpViaTwilioSms,
  sendParentPortalOtpViaWhatsapp,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  let body: { full_name?: unknown; phone_number?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonOk();
  }

  const fullName = String(body.full_name || "").trim();
  const phoneInput = String(body.phone_number || "").trim();
  if (!fullName || !phoneInput) return parentPortalJsonOk();

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[parent-portal-otp-request] Missing SUPABASE env vars");
    return parentPortalJsonOk();
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("portal_parent_portal_otps")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("ip_hash", ipHash);
    if ((count ?? 0) >= PARENT_PORTAL_OTP_MAX_PER_HOUR_PER_IP) return parentPortalJsonOk();
  }

  const { data: matchedParentId, error: matchErr } = await supabase.rpc(
    "portal_parent_match_identity",
    { p_full_name: fullName, p_phone: phoneInput },
  );
  if (matchErr) {
    console.error("[parent-portal-otp-request] match rpc error", matchErr);
    return parentPortalJsonOk();
  }
  if (!matchedParentId) return parentPortalJsonOk();

  const sinceParent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: parentCount } = await supabase
    .from("portal_parent_portal_otps")
    .select("id", { count: "exact", head: true })
    .eq("parent_person_id", matchedParentId)
    .gte("created_at", sinceParent);
  if ((parentCount ?? 0) >= PARENT_PORTAL_OTP_MAX_PER_HOUR_PER_PARENT) return parentPortalJsonOk();

  const { data: contactRow } = await supabase
    .from("portal_parent_contacts")
    .select("mobile, parent_display")
    .eq("parent_person_id", matchedParentId)
    .not("mobile", "is", null)
    .limit(1)
    .maybeSingle();

  const destination = normalizePhoneE164(String(contactRow?.mobile || phoneInput).trim());
  if (!destination) {
    console.warn("[parent-portal-otp-request] matched parent has no mobile", matchedParentId);
    return parentPortalJsonOk();
  }

  const code = newOtpCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + PARENT_PORTAL_OTP_TTL_MS).toISOString();

  await supabase
    .from("portal_parent_portal_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("parent_person_id", matchedParentId)
    .is("consumed_at", null);

  let channel: "whatsapp" | "sms" | "log" = "log";
  let sent = await sendParentPortalOtpViaWhatsapp(destination, code);
  if (sent) channel = "whatsapp";
  if (!sent) {
    sent = await sendParentPortalOtpViaTwilioSms(destination, code);
    if (sent) channel = "sms";
  }
  if (!sent) {
    console.log(
      "[parent-portal-otp-request] No SMS/WhatsApp provider configured. " +
        `parent_person_id=${matchedParentId} destination=${maskPhoneForLog(destination)} code=${code}`,
    );
  }

  const { error: insertErr } = await supabase.from("portal_parent_portal_otps").insert({
    parent_person_id: matchedParentId,
    code_hash: codeHash,
    channel,
    destination,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });
  if (insertErr) {
    console.error("[parent-portal-otp-request] insert otp failed", insertErr);
  }

  return parentPortalJsonOk();
});
