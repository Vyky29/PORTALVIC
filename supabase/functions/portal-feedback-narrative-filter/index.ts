// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-narrative-filter
// --------------------------------
// Split staff session narrative (English) into positive_feedback + relevant_information.
//
// GET  → { ok: true, openai: boolean }
// POST JSON:
//   narrative_en, engagement_rating?, client_emotions?, independence_level?,
//   participant_name?, participant_gender?, service?
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

/** Training-demo output — must never be returned for live staff narratives. */
const TRAINING_DEMO_POSITIVE =
  "The participant arrived happy and ready to begin the session. Throughout the session, he remained calm and enjoyed exploring the aquatic environment. By following his interests and using Intensive Interaction alongside a First–Then routine, he successfully participated in several structured activities, including Seahorse and Front Kicking with a noodle. He responded positively when activities were presented in short, predictable sequences with regular movement breaks. The session finished with a smooth transition and a positive handover with his family.";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function str(v: unknown, max = 12000): string {
  return String(v ?? "").trim().slice(0, max);
}

function firstName(full: string): string {
  const parts = str(full, 200).split(/\s+/).filter(Boolean);
  return parts[0] || str(full, 80) || "Participant";
}

function genderLabel(raw: unknown): "male" | "female" | "" {
  const g = str(raw, 8).toLowerCase();
  if (g === "m" || g === "male" || g === "boy") return "male";
  if (g === "f" || g === "female" || g === "girl") return "female";
  return "";
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function validateFilterOutput(
  positive: string,
  relevant: string,
  narrative: string,
  participantName: string,
): string | null {
  const participantFirst = firstName(participantName);
  const posNorm = normalizeForCompare(positive);
  const demoNorm = normalizeForCompare(TRAINING_DEMO_POSITIVE);

  if (posNorm === demoNorm || posNorm.startsWith(demoNorm.slice(0, 80))) {
    return "template_response";
  }
  if (participantFirst && /\bthe participant\b/i.test(positive)) {
    return "generic_participant_label";
  }
  if (participantFirst) {
    const nameInOutput =
      positive.includes(participantFirst) || relevant.includes(participantFirst);
    if (!nameInOutput) return "missing_participant_name";
  }
  const inventedChecks: { phrase: RegExp; narrativeNeed: RegExp }[] = [
    { phrase: /seahorse/i, narrativeNeed: /seahorse/i },
    { phrase: /front kicking with a noodle/i, narrativeNeed: /front kicking|noodle/i },
    {
      phrase: /intensive interaction alongside a first/i,
      narrativeNeed: /intensive interaction/i,
    },
    { phrase: /requested to finish the session approximately ten minutes early/i, narrativeNeed: /ten minutes early|finish.*early|sauna/i },
  ];
  for (const { phrase, narrativeNeed } of inventedChecks) {
    if (phrase.test(positive + " " + relevant) && !narrativeNeed.test(narrative)) {
      return "invented_details";
    }
  }
  return null;
}

function buildMessages(body: Record<string, unknown>, strictRetry = false) {
  const narrative = str(body.narrative_en, 10000);
  const engagement = str(body.engagement_rating, 8);
  const emotions = str(body.client_emotions, 500);
  const independence = str(body.independence_level, 200);
  const participant = str(body.participant_name, 200);
  const participantFirst = firstName(participant);
  const gender = genderLabel(body.participant_gender);
  const service = str(body.service, 200);

  const contextLines = [
    participant ? `Participant full name: ${participant}` : "",
    participant ? `Use first name in text: ${participantFirst}` : "",
    gender ? `Gender: ${gender}` : participant ? "Gender: unknown — use the first name, not they/them" : "",
    service ? `Service: ${service}` : "",
    engagement ? `Engagement rating (1–5): ${engagement}` : "",
    emotions ? `Emotions / regulation: ${emotions}` : "",
    independence ? `Independence: ${independence}` : "",
  ].filter(Boolean);

  const system = [
    "You are a clinical/education session feedback assistant for a children's therapy and aquatic club portal.",
    "Staff have already written an internal English session narrative covering Reception, Session and Handover.",
    "Your job is to split THIS SPECIFIC narrative into two English text fields — not to write a generic session summary.",
    "",
    "Naming and pronouns (strict):",
    "- Use the participant's FIRST NAME throughout — never write \"the participant\", \"the client\", or \"the child\".",
    "- If gender is male: he, him, his only — never they/them/their.",
    "- If gender is female: she, her, hers only — never they/them/their.",
    "- If gender is unknown: repeat the first name instead of generic labels or singular they.",
    "",
    "Style (strict — output must reflect THIS narrative only):",
    "- Every sentence must come from the staff narrative below — no invented details, activities, or strategies.",
    "- Do NOT copy training examples (Seahorse, First–Then, sauna, noodle kicking) unless they appear in the narrative.",
    "- Do NOT reuse stock phrases (e.g. \"arrived happy and ready\", \"remained calm throughout\", \"responded positively\", \"smooth transition\") unless the narrative literally says that.",
    "- Vary openings and structure — sound like a human summarising today's session, not a copy-paste template.",
    "- If two sessions differ, your output must differ.",
    "",
    "positive_feedback:",
    "- Warm, professional text suitable for parents in the family app.",
    "- Focus on what went well, participation, strategies that worked — only if stated in the narrative.",
    "- Do NOT include internal negatives, low engagement, hunger/toilet breaks as problems, or anything that would worry parents unnecessarily.",
    "- One or two short paragraphs, plain English.",
    "",
    "relevant_information:",
    "- Internal staff/admin notes only — not shown to families as the positive message.",
    "- Include low engagement, non-response, strategies used, finishing early, handover details — only from the narrative.",
    "- One or two short paragraphs, plain English.",
    "",
    strictRetry
      ? "RETRY: Your previous answer looked like a generic training template. Rewrite using ONLY facts from the narrative below. Start with the participant's first name."
      : "",
    "",
    "Always output valid JSON with keys positive_feedback and relevant_information only.",
    "Both values must be non-empty English strings.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    contextLines.length ? "Session context:\n" + contextLines.join("\n") : "",
    "",
    "Staff session narrative (English) — split THIS text only:",
    narrative,
  ]
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function callOpenAi(
  apiKey: string,
  messages: { role: string; content: string }[],
  temperature = 0.35,
) {
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
      temperature,
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

  const participantName = str(body.participant_name, 200);

  let result = await callOpenAi(apiKey, buildMessages(body, false));
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502);
  }

  let validationError = validateFilterOutput(
    result.positive_feedback,
    result.relevant_information,
    narrative,
    participantName,
  );

  if (validationError) {
    console.warn(
      "[portal-feedback-narrative-filter] validation failed, retrying:",
      validationError,
    );
    const retry = await callOpenAi(apiKey, buildMessages(body, true), 0.25);
    if (retry.ok) {
      result = retry;
      validationError = validateFilterOutput(
        result.positive_feedback,
        result.relevant_information,
        narrative,
        participantName,
      );
    }
  }

  if (validationError) {
    return json({ ok: false, error: validationError }, 422);
  }

  return json({
    ok: true,
    positive_feedback: result.positive_feedback,
    relevant_information: result.relevant_information,
  });
});
