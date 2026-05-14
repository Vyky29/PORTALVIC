// @ts-nocheck — Edge Function (Deno).
//
// staff-profile-update-load
// -------------------------
// Returns the profile row for the staff_id bound to the caller's
// staff_profile_update session token. The session must have been issued by
// staff-profile-otp-verify and not yet expired/revoked.
//
// Headers:
//   x-staff-profile-session: <token>
//
// Response (200):
//   {
//     ok: true,
//     staff: {
//       id, full_name, username, staff_role,
//       phone_e164, email_personal,
//       address: { line1, line2, city, postcode },
//       emergency_contact: { name, relationship, phone },
//       availability: { summary, status, changes },
//       other_work: { status, organisation, schedule, affects_availability },
//       wellbeing_notes,
//       profile_last_updated_at, profile_last_confirmed_at
//     },
//     session: { expires_at }
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-staff-profile-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonInvalid(status = 401) {
  return new Response(JSON.stringify({ ok: false, error: "invalid_session" }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const token = String(req.headers.get("x-staff-profile-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return jsonInvalid();

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return jsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: sess, error: sessErr } = await supabase
    .from("staff_profile_update_sessions")
    .select("id, staff_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (sessErr) {
    console.error("[staff-profile-update-load] session lookup error", sessErr);
    return jsonInvalid();
  }
  if (!sess || sess.revoked_at) return jsonInvalid();
  if (new Date(sess.expires_at).getTime() < Date.now()) return jsonInvalid();

  await supabase
    .from("staff_profile_update_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", sess.id);

  const { data: row, error: rowErr } = await supabase
    .from("staff_profiles")
    .select(
      "id, full_name, username, staff_role, phone_e164, email_personal, " +
        "address_line1, address_line2, address_city, address_postcode, " +
        "emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, " +
        "availability_summary, availability_status, availability_changes, " +
        "other_work_status, other_work_organisation, other_work_schedule, other_work_affects_availability, " +
        "wellbeing_notes, profile_last_updated_at, profile_last_confirmed_at",
    )
    .eq("id", sess.staff_id)
    .maybeSingle();
  if (rowErr || !row) {
    console.error("[staff-profile-update-load] profile lookup error", rowErr);
    return jsonInvalid(500);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      staff: {
        id: row.id,
        full_name: row.full_name,
        username: row.username,
        staff_role: row.staff_role,
        phone_e164: row.phone_e164,
        email_personal: row.email_personal,
        address: {
          line1: row.address_line1,
          line2: row.address_line2,
          city: row.address_city,
          postcode: row.address_postcode,
        },
        emergency_contact: {
          name: row.emergency_contact_name,
          relationship: row.emergency_contact_relationship,
          phone: row.emergency_contact_phone,
        },
        availability: {
          summary: row.availability_summary,
          status: row.availability_status,
          changes: row.availability_changes,
        },
        other_work: {
          status: row.other_work_status,
          organisation: row.other_work_organisation,
          schedule: row.other_work_schedule,
          affects_availability: row.other_work_affects_availability,
        },
        wellbeing_notes: row.wellbeing_notes,
        profile_last_updated_at: row.profile_last_updated_at,
        profile_last_confirmed_at: row.profile_last_confirmed_at,
      },
      session: { expires_at: sess.expires_at },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
