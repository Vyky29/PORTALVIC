// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-narrative-validate
// ----------------------------------
// Check typed session narrative covers Reception, Session, Handover (mandatory before filter).
//
// GET  → { ok: true, openai: boolean }
// POST JSON: narrative_en, participant_name?, session_date?, service?
//
// Auth: active portal staff JWT

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";
import { logSessionFeedbackNarrativeAudit } from "../_shared/session_feedback_narrative_audit.ts";

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

function buildMessages(narrative: string, participant: string) {
  const system = [
    "You validate staff session feedback narratives for a children's therapy club.",
    "Check ONLY whether these three sections are meaningfully covered in the English narrative:",
    "",
    "1. Reception — arrival and parent handover at the start.",
    "2. Session — what happened in the session (plan, activities, strategies, challenges, what worked).",
    "3. Handover — what was communicated to the family at the end.",
    "",
    "Rules:",
    "- Be practical: a short but clear mention counts as covered.",
    "- If a section is missing or too vague to understand, mark covered false and give one short fix hint (plain English, max 120 chars).",
    "- Do not rewrite the narrative. Do not comment on engagement ratings or emotions.",
    "- Output valid JSON only with keys: all_complete (boolean), reception, session, handover, missing.",
    "- Each of reception/session/handover is an object: { covered: boolean, note: string }.",
    "- missing is an array of section keys not covered (subset of reception, session, handover).",
  ].join("\n");

  const user = [
    participant ? `Participant: ${participant}` : "",
    "",
    "Staff narrative:",
    narrative,
  ]
    .filter(Boolean)
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
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      "[portal-feedback-narrative-validate] OpenAI error",
      res.status,
      errText.slice(0, 500),
    );
    return { ok: false as const, error: "openai_failed" };
  }

  let parsed: {
    choices?: { message?: { content?: string } }[];
    usage?: Record<string, unknown>;
  };
  try {
    parsed = await res.json();
  } catch {
    return { ok: false as const, error: "openai_bad_response" };
  }

  const raw = str(parsed?.choices?.[0]?.message?.content, 4000);
  if (!raw) return { ok: false as const, error: "empty_response" };

  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const section = (key: string) => {
      const o = j[key];
      if (!o || typeof o !== "object") {
        return { covered: false, note: "Not mentioned clearly enough." };
      }
      const row = o as Record<string, unknown>;
      return {
        covered: row.covered === true,
        note: str(row.note, 200) || "",
      };
    };
    const reception = section("reception");
    const sessionSec = section("session");
    const handover = section("handover");
    const missing: string[] = [];
    if (!reception.covered) missing.push("reception");
    if (!sessionSec.covered) missing.push("session");
    if (!handover.covered) missing.push("handover");
    const allComplete =
      j.all_complete === true ||
      (missing.length === 0 && reception.covered && sessionSec.covered && handover.covered);

    return {
      ok: true as const,
      all_complete: allComplete,
      reception,
      session: sessionSec,
      handover,
      missing,
      usage: parsed.usage || null,
      model,
    };
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

  const participantName = str(body.participant_name, 200);
  const result = await callOpenAi(apiKey, buildMessages(narrative, participantName));

  const usageMeta =
    result.ok && result.usage
      ? {
          model: result.model,
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
        }
      : {};

  await logSessionFeedbackNarrativeAudit({
    source: "narrative_validate",
    staffUserId: staff.userId,
    staffDisplayName: staff.fullName,
    participantName,
    participantGender: str(body.participant_gender, 8),
    sessionDate: str(body.session_date, 10),
    service: str(body.service, 200),
    narrativeEn: narrative,
    filterStatus: result.ok ? (result.all_complete ? "complete" : "incomplete") : String(result.error),
    meta: {
      ...usageMeta,
      sections: result.ok
        ? {
            reception: result.reception,
            session: result.session,
            handover: result.handover,
            missing: result.missing,
            all_complete: result.all_complete,
          }
        : { error: result.error },
    },
  });

  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502);
  }

  return json({
    ok: true,
    all_complete: result.all_complete,
    reception: result.reception,
    session: result.session,
    handover: result.handover,
    missing: result.missing,
    usage: usageMeta,
  });
});
