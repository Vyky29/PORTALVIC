import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function flattenPayload(
  payload: Record<string, unknown>,
  prefix = "",
): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === "_portal") continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...flattenPayload(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      rows.push({ key, value: v.map((x) => String(x)).join("; ") });
    } else {
      rows.push({ key, value: v == null ? "" : String(v) });
    }
  }
  return rows;
}

function payloadToCsv(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "field,value\n(empty),";
  }
  const flat = flattenPayload(payload as Record<string, unknown>);
  const lines = ["field,value"];
  for (const row of flat) {
    lines.push(`${csvEscape(row.key)},${csvEscape(row.value)}`);
  }
  return lines.join("\n") + "\n";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
  const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!obUrl || !obService) {
    return portalAdminJson(503, { ok: false, error: "onboarding_not_configured" });
  }

  let body: { applicant_session_id?: string; form_type?: string };
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_json" });
  }

  const sid = String(body.applicant_session_id ?? "").trim();
  const formType = String(body.form_type ?? "").trim().toLowerCase();
  if (!UUID_RE.test(sid)) {
    return portalAdminJson(400, { ok: false, error: "invalid_session_id" });
  }
  if (formType !== "job" && formType !== "health") {
    return portalAdminJson(400, { ok: false, error: "invalid_form_type" });
  }

  const obAdmin = createClient(obUrl, obService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await obAdmin
    .from("onboarding_applicant_drafts")
    .select("payload, updated_at")
    .eq("applicant_session_id", sid)
    .eq("form_type", formType)
    .maybeSingle();

  if (error) {
    console.error("[portal-admin-onboarding-draft-export]", error);
    return portalAdminJson(500, { ok: false, error: "load_failed" });
  }
  if (!data) {
    return portalAdminJson(404, { ok: false, error: "draft_not_found" });
  }

  const csv = payloadToCsv(data.payload);
  const label = formType === "job" ? "job-application" : "health-questionnaire";
  const filename = `${label}-${sid.slice(0, 8)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      ...portalAdminCorsHeaders(),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
