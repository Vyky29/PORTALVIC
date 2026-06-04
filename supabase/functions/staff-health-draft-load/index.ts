import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "misconfigured" });
  }

  let body: { staff_session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const sid = String(body.staff_session_id ?? "").trim();
  if (!UUID_RE.test(sid)) {
    return json(400, { ok: false, error: "invalid_session_id" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("staff_health_questionnaire_drafts")
    .select("payload, updated_at, submitted_at, staff_name")
    .eq("staff_session_id", sid)
    .maybeSingle();

  if (error) {
    console.error("[staff-health-draft-load]", error);
    return json(500, { ok: false, error: "load_failed" });
  }

  if (!data) {
    return json(200, { ok: true, draft: null });
  }

  return json(200, {
    ok: true,
    draft: {
      payload: data.payload ?? {},
      updated_at: data.updated_at ?? null,
      submitted_at: data.submitted_at ?? null,
      staff_name: data.staff_name ?? null,
    },
  });
});
