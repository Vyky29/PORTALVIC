// @ts-nocheck — Edge Function (Deno).
//
// portal-parent-feedback-sanitize
// -------------------------------
// Database webhook: sanitize session_feedback for the family portal when staff submit.
// Trigger: AFTER INSERT OR UPDATE on public.session_feedback (pg_net + record JSON).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY,
//          PORTAL_PUSH_WEBHOOK_SECRET (x-portal-webhook-secret header).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  sanitizeAndCacheParentFeedbackShare,
  type SessionFeedbackRow,
} from "../_shared/parent_feedback_sanitize_job.ts";
import { verifyPortalPushWebhook } from "../_shared/portal_webpush_util.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function notesChanged(
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null | undefined,
): boolean {
  if (!oldRecord) return true;
  const fields = [
    "positive_feedback",
    "relevant_information",
    "engagement_rating",
    "engagement_patterns",
    "client_emotions",
    "attendance",
    "client_name",
    "client_id",
    "service",
    "session_date",
  ];
  return fields.some((f) => clean(record[f]) !== clean(oldRecord[f]));
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
    return json({
      ok: true,
      openai: Boolean(apiKey),
      model: Deno.env.get("PORTAL_OPENAI_MODEL") || "gpt-4o-mini",
    });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const forbidden = verifyPortalPushWebhook(req);
  if (forbidden) return forbidden;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "misconfigured" }, 500);
  }

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown> | null;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  if (String(payload.table || "") !== "session_feedback") {
    return json({ ok: true, skipped: true, reason: "table" });
  }

  const eventType = String(payload.type || "INSERT").toUpperCase();
  if (eventType !== "INSERT" && eventType !== "UPDATE") {
    return json({ ok: true, skipped: true, reason: "event" });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return json({ ok: true, skipped: true, reason: "no_record" });
  }

  if (eventType === "UPDATE" && !notesChanged(record, payload.old_record)) {
    return json({ ok: true, skipped: true, reason: "unchanged_fields" });
  }

  const row: SessionFeedbackRow = {
    id: String(record.id || ""),
    client_name: record.client_name as string | null,
    client_id: record.client_id as string | null,
    service: record.service as string | null,
    session_date: record.session_date as string | null,
    attendance: record.attendance as string | null,
    positive_feedback: record.positive_feedback as string | null,
    relevant_information: record.relevant_information as string | null,
    engagement_rating: record.engagement_rating as number | string | null,
    engagement_patterns: record.engagement_patterns,
    client_emotions: record.client_emotions as string | null,
  };

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await sanitizeAndCacheParentFeedbackShare(supabase, row);
  return json({ ok: result.ok, ...result });
});
