// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-narrative-filter
// --------------------------------
// Split staff session narrative (English) into positive_feedback + relevant_information.
//
// GET  → { ok: true, openai: boolean }
// POST JSON:
//   narrative_en, engagement_rating?, client_emotions?, independence_level?,
//   participant_name?, service?
//
// Auth: active portal staff JWT

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_MODEL = "gpt-4o-mini";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(v: unknown, max = 12000): string {
  return String(v ?? "").trim().slice(0, max);
}

function buildMessages(body: Record<string, unknown>) {
  const narrative = str(body.narrative_en, 10000);
  const engagement = str(body.engagement_rating, 8);
  const emotions = str(body.client_emotions, 500);
  const independence = str(body.independence_level, 200);
  const participant = str(body.participant_name, 200);
  const service = str(body.service, 200);

  const contextLines = [
    participant ? `Participant: ${participant}` : "",
    service ? `Service: ${service}` : "",
    engagement ? `Engagement rating (1–5): ${engagement}` : "",
    emotions ? `Emotions / regulation: ${emotions}` : "",
    independence ? `Independence: ${independence}` : "",
  ].filter(Boolean);

  const system = [
    "You are a clinical/education session feedback assistant for a children's therapy and aquatic club portal.",
    "Staff have already written an internal English session narrative covering Reception, Session and Handover.",
    "Your job is to split it into two English text fields for database storage.",
    "",
    "positive_feedback:",
    "- Warm, professional text suitable for parents in the family app.",
    "- Focus on what went well, participation, strategies that worked, smooth transitions.",
    "- Do NOT include internal jargon-heavy negatives, low engagement details, hunger/toilet breaks as problems, or anything that would worry parents unnecessarily.",
    "- One or two short paragraphs, plain English.",
    "",
    "relevant_information:",
    "- Internal staff/admin notes only — not shown to families as the positive message.",
    "- Include low engagement, non-response to instructions, strategies used (e.g. Intensive Interaction, First–Then), finishing early, hunger/sauna requests, handover details for the team.",
    "- One or two short paragraphs, plain English.",
    "",
    "Always output valid JSON with keys positive_feedback and relevant_information only.",
    "Both values must be non-empty English strings.",
  ].join("\n");

  const user = [
    contextLines.length ? "Session context:\n" + contextLines.join("\n") : "",
    "",
    "Staff session narrative (English):",
    narrative,
  ]
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function callOpenAi(apiKey: string, messages: { role: string; content: string }[]) {
  const model = str(Deno.env.get("PORTAL_OPENAI_MODEL"), 64) || DEFAULT_MODEL;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      "[portal-feedback-narrative-filter] OpenAI error",
      res.status,
      errText.slice(0, 500),
    );
    return { ok: false as const, error: "openai_failed" };
  }

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = await res.json();
  } catch {
    return { ok: false as const, error: "openai_bad_response" };
  }

  const raw = str(parsed?.choices?.[0]?.message?.content, 8000);
  if (!raw) return { ok: false as const, error: "empty_response" };

  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const positive = str(j.positive_feedback, 4000);
    const relevant = str(j.relevant_information, 4000);
    if (!positive || !relevant) {
      return { ok: false as const, error: "incomplete_response" };
    }
    return { ok: true as const, positive_feedback: positive, relevant_information: relevant };
  } catch {
    return { ok: false as const, error: "invalid_json_response" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      openai: Boolean(Deno.env.get("OPENAI_API_KEY")),
      model: str(Deno.env.get("PORTAL_OPENAI_MODEL"), 64) || DEFAULT_MODEL,
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) {
    return json({ ok: false, error: "no_openai" }, 503);
  }

  const staff = await verifyPortalStaff(req);
  if (!staff.ok) {
    return json({ ok: false, error: staff.error }, staff.status);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const narrative = str(body.narrative_en, 10000);
  if (narrative.length < 40) {
    return json({ ok: false, error: "narrative_too_short" }, 400);
  }

  const result = await callOpenAi(apiKey, buildMessages(body));
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502);
  }

  return json({
    ok: true,
    positive_feedback: result.positive_feedback,
    relevant_information: result.relevant_information,
  });
});
