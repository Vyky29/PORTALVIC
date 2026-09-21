import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchStaffPinRow } from "../_shared/portal_onboarding_pin.ts";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizeKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false });
  }

  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 80 || name.includes("@")) {
    return json(200, { ok: false });
  }

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!portalUrl || !portalService) {
    return json(200, { ok: false });
  }

  const admin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pins } = await admin
    .from("portal_login_pins")
    .select("name, pin, portal")
    .eq("portal", "staff");

  const want = normalizeKey(name);
  const { data: profiles } = await admin
    .from("staff_profiles")
    .select("id, username, full_name, email_personal, is_active")
    .eq("is_active", true)
    .limit(400);

  const hits = (profiles || []).filter((p) => {
    const username = normalizeKey(String(p.username || ""));
    const full = normalizeKey(String(p.full_name || ""));
    const first = normalizeKey(String(p.full_name || "").split(/\s+/)[0] || "");
    return want === username || want === full || want === first;
  });

  for (const profile of hits) {
    const matched = matchStaffPinRow(
      pins || [],
      String(profile.username || ""),
      String(profile.full_name || ""),
    );
    if (!matched) continue;
    const email = String(profile.email_personal || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    return json(200, { ok: true, email });
  }

  return json(200, { ok: false });
});
