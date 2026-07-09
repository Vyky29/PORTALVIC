// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-narrative-filter
// --------------------------------
// Rewrite staff session narrative into parent-facing clubSENsational language.
//
// From 2026-07-07 (unified): ONE parent-facing text in positive_feedback.
// Optional staff Notes (relevant_information) are typed separately — AI must
// not invent them. Before that date: legacy split positive + relevant.
//
// GET  → { ok: true, openai: boolean }
// POST JSON:
//   narrative_en, engagement_rating?, client_emotions?, independence_level?,
//   participant_name?, participant_gender?, service?, session_date?
//
// Auth: active portal staff JWT

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";
import { logSessionFeedbackNarrativeAudit } from "../_shared/session_feedback_narrative_audit.ts";
import {
  canonicalParticipantFirstName,
  enforceParticipantFirstNameInText,
  participantFirstNameSpellingOk,
} from "../_shared/participant_feedback_name.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_MODEL = "gpt-4o-mini";
/** From this date: one parent-facing rewrite; Notes are optional staff-only. */
const UNIFIED_PARENT_FEEDBACK_FROM_ISO = "2026-07-07";

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
  return canonicalParticipantFirstName(full) || "Participant";
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

function isUnifiedParentFeedback(body: Record<string, unknown>): boolean {
  if (body.unified_parent_feedback === true || body.unified_parent_feedback === "1") {
    return true;
  }
  if (body.unified_parent_feedback === false || body.unified_parent_feedback === "0") {
    return false;
  }
  const d = str(body.session_date, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d >= UNIFIED_PARENT_FEEDBACK_FROM_ISO;
  // Admin re-filter of recent narratives with no date → new model.
  return true;
}

function narrativeSaysHighEngagement(narrative: string): boolean {
  return /\b(high|great|excellent|strong|good)\s+(level\s+of\s+)?engagement\b/i.test(
    narrative,
  ) || /\bstaying engaged\b/i.test(narrative) || /\bvery engaged\b/i.test(narrative);
}

function outputSaysLowEngagement(text: string): boolean {
  return /\b(low|poor|limited|minimal|little)\s+(level\s+of\s+)?engagement\b/i.test(
    text,
  ) || /\bnot (yet )?engaged\b/i.test(text) || /\bdisengaged\b/i.test(text);
}

function validateFilterOutput(
  positive: string,
  relevant: string,
  narrative: string,
  participantName: string,
  unified: boolean,
): string | null {
  const participantFirst = firstName(participantName);
  const posNorm = normalizeForCompare(positive);
  const demoNorm = normalizeForCompare(TRAINING_DEMO_POSITIVE);
  const combined = unified ? positive : positive + " " + relevant;

  if (posNorm === demoNorm || posNorm.startsWith(demoNorm.slice(0, 80))) {
    return "template_response";
  }
  if (participantFirst && /\bthe participant\b/i.test(positive)) {
    return "generic_participant_label";
  }
  if (participantFirst) {
    if (!participantFirstNameSpellingOk(positive, participantName)) {
      return "wrong_participant_name_spelling";
    }
    if (
      !unified &&
      relevant &&
      !/^none\b/i.test(relevant.trim()) &&
      !participantFirstNameSpellingOk(relevant, participantName)
    ) {
      return "wrong_participant_name_spelling";
    }
  }
  // Never invent the opposite of what staff wrote about engagement.
  if (narrativeSaysHighEngagement(narrative) && outputSaysLowEngagement(combined)) {
    return "engagement_polarity_flip";
  }
  // Parent-facing text must keep substance — reject tiny summaries of long narratives.
  if (narrative.length >= 280 && positive.length < Math.min(180, Math.floor(narrative.length * 0.45))) {
    return "over_summarised";
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
    if (phrase.test(combined) && !narrativeNeed.test(narrative)) {
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
  const unified = isUnifiedParentFeedback(body);

  const contextLines = [
    participant ? `Participant full name: ${participant}` : "",
    participant ? `Use first name in text: ${participantFirst}` : "",
    gender ? `Gender: ${gender}` : participant ? "Gender: unknown — use the first name, not they/them" : "",
    service ? `Service: ${service}` : "",
    engagement ? `Engagement rating (1–5, context only — do not invent engagement level from this alone): ${engagement}` : "",
    emotions ? `Emotions / regulation (context only): ${emotions}` : "",
    independence ? `Independence (context only): ${independence}` : "",
  ].filter(Boolean);

  const namingBlock = [
    "Naming and pronouns (strict):",
    "- Use the participant's FIRST NAME throughout — never write \"the participant\", \"the client\", or \"the child\".",
    participantFirst
      ? `- Spell the first name EXACTLY as in context: "${participantFirst}" — same letters, same order.`
      : "",
    "- If gender is male: he, him, his only — never they/them/their.",
    "- If gender is female: she, her, hers only — never they/them/their.",
    "- If gender is unknown: repeat the first name instead of singular they.",
  ].filter(Boolean);

  const fidelityBlock = [
    "Fidelity (strict — this is the main failure mode to avoid):",
    "- Keep ALL concrete facts from the staff narrative: arrival/mood, activities, equipment settings (e.g. treadmill incline/speed), durations, exercises tried, confidence, engagement level, praise, and what was shared with the carer/family at handover.",
    "- Do NOT invent details, activities, strategies, or emotions that are not in the narrative.",
    "- Do NOT reverse meaning. If staff wrote high / great / excellent engagement, you MUST keep high engagement — never write \"low engagement\", \"limited engagement\", or \"disengaged\".",
    "- Do NOT copy training-demo stock (Seahorse, First–Then, sauna, noodle kicking) unless those words appear in THIS narrative.",
    "- Parents want MORE detail, not less. Prefer a full rewrite that is as long as (or slightly longer than) the staff narrative. Never compress a rich session into 1–2 short sentences.",
  ];

  const vocabBlock = [
    "clubSENsational vocabulary (use when it fits what staff described — do not force unused terms):",
    "- engagement, regulation / emotional regulation, sensory regulation, preferred interests, motivators",
    "- following the client's lead, calm and predictable structure, routines, First-Then / visual supports, Intensive Interaction",
    "- confidence, independence, participation, co-regulation, smooth transition / handover",
    "- Warm, constructive, strengths-based tone suitable for families — clear plain English parents understand, with autism/SEN practice language from inductions and training.",
  ];

  let system: string;
  if (unified) {
    system = [
      "You are the clubSENsational session-feedback writer for a neurodivergent children's activity club (autism / SEN).",
      "Staff wrote an internal English session narrative (Reception, Session, Handover).",
      "From 7 July 2026 the parent-facing message is ONE unified text. Optional internal Notes are typed separately by staff — you do NOT write those.",
      "Your job is to REWRITE the narrative into parent-facing clubSENsational language — NOT to summarise, shorten, invent a different story, or split into two fields.",
      "",
      ...namingBlock,
      "",
      ...fidelityBlock,
      "",
      ...vocabBlock,
      "",
      "positive_feedback (the ONLY parent-facing text — goes to families):",
      "- Full constructive rewrite of the WHOLE session story for parents (everything shareable from Reception, Session and Handover).",
      "- Include constructive detail that used to live in a separate \"relevant\" AI field — keep it together here when it belongs with the family message.",
      "- Preserve concrete session detail (what they did, how they engaged, equipment/settings, praise, carer handover).",
      "- Do NOT mention numeric engagement scores, emotion checkbox labels, or independence/support level codes — families see those elsewhere.",
      "- Keep constructive challenges only if staff stated them AND they are useful for parents without unnecessary worry; never invent negatives.",
      "- Usually 2–4 paragraphs. Length should reflect the narrative — more information is better.",
      "",
      "relevant_information:",
      "- Always output exactly: None",
      "- Do NOT invent internal notes. Staff optional Notes are a separate field outside this filter.",
      "",
      strictRetry
        ? "RETRY: Previous output was wrong (template, invented opposite meaning, over-summarised, or invented relevant notes). Rewrite again using ONLY facts from the narrative. Keep high engagement if staff said high engagement. Keep concrete details. Put EVERYTHING parent-facing into positive_feedback. Set relevant_information to None. Start with the participant's first name."
        : "",
      "",
      "Always output valid JSON with keys positive_feedback and relevant_information only.",
      "positive_feedback must be a non-empty English string. relevant_information must be exactly \"None\".",
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    system = [
      "You are the clubSENsational session-feedback writer for a neurodivergent children's activity club (autism / SEN).",
      "Staff wrote an internal English session narrative (Reception, Session, Handover).",
      "LEGACY mode (session before 7 July 2026): split into positive_feedback + relevant_information.",
      "Your job is to REWRITE that narrative into clubSENsational language — NOT to summarise, shorten, or invent a different story.",
      "",
      ...namingBlock,
      "",
      ...fidelityBlock,
      "",
      ...vocabBlock,
      "",
      "positive_feedback (parent-facing — goes to families):",
      "- Full constructive rewrite of the session story for parents, using clubSENsational vocabulary where appropriate.",
      "- Preserve concrete session detail (what they did, how they engaged, equipment/settings, praise, carer handover).",
      "- Do NOT mention numeric engagement scores, emotion checkbox labels, or independence/support level codes.",
      "- Usually 2–4 paragraphs. Length should reflect the narrative — more information is better.",
      "",
      "relevant_information (legacy internal AI split — not the modern optional Notes field):",
      "- Only operational / internal notes that should NOT go to parents.",
      "- If nothing belongs only internally, write exactly: None",
      "- Do NOT invent \"low engagement\" here when the narrative says high engagement.",
      "",
      strictRetry
        ? "RETRY: Previous output was wrong (template, invented opposite meaning, or over-summarised). Rewrite again using ONLY facts from the narrative. Keep high engagement if staff said high engagement. Keep concrete details. Start with the participant's first name. Make positive_feedback detailed — not a short summary."
        : "",
      "",
      "Always output valid JSON with keys positive_feedback and relevant_information only.",
      "positive_feedback must be a non-empty English string. relevant_information must be a non-empty English string (use \"None\" if empty).",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const user = [
    contextLines.length ? "Session context:\n" + contextLines.join("\n") : "",
    "",
    unified
      ? "Staff session narrative (English) — rewrite THIS text as ONE parent-facing message (keep the detail):"
      : "Staff session narrative (English) — rewrite THIS text for parents (keep the detail):",
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
      max_tokens: 2200,
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

  let parsed: {
    choices?: { message?: { content?: string } }[];
    usage?: Record<string, unknown>;
  };
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
    let relevant = str(j.relevant_information, 4000);
    if (!positive) {
      return { ok: false as const, error: "incomplete_response" };
    }
    // Unified mode may omit relevant; normalise empty → None for callers that expect a string.
    if (!relevant) relevant = "None";
    const usage = parsed.usage || null;
    return {
      ok: true as const,
      positive_feedback: positive,
      relevant_information: relevant,
      usage,
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
  const unified = isUnifiedParentFeedback(body);

  async function auditFilter(
    status: string,
    positive?: string,
    relevant?: string,
    extraMeta?: Record<string, unknown>,
  ) {
    await logSessionFeedbackNarrativeAudit({
      source: "narrative_filter",
      staffUserId: staff.userId,
      staffDisplayName: staff.fullName,
      participantName,
      participantGender: str(body.participant_gender, 8),
      sessionDate: str(body.session_date, 10),
      service: str(body.service, 200),
      narrativeEn: narrative,
      filterPositive: positive,
      filterRelevant: relevant,
      filterStatus: status,
      meta: Object.assign({ unified_parent_feedback: unified }, extraMeta || {}),
    });
  }

  let filterMeta: Record<string, unknown> = { unified_parent_feedback: unified };
  // Slightly lower temperature: fidelity to staff narrative matters more than variety.
  let result = await callOpenAi(apiKey, buildMessages(body, false), 0.25);
  if (result.ok && result.usage) {
    filterMeta = {
      unified_parent_feedback: unified,
      model: result.model,
      prompt_tokens: result.usage.prompt_tokens,
      completion_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.total_tokens,
      attempt: 1,
    };
  }
  if (!result.ok) {
    await auditFilter(String(result.error), undefined, undefined, filterMeta);
    return json({ ok: false, error: result.error }, 502);
  }

  function enforcedPair(positive: string, relevant: string) {
    const pos = enforceParticipantFirstNameInText(positive, participantName);
    // Unified: never invent AI "relevant" — optional Notes are staff-typed elsewhere.
    if (unified) {
      return { positive: pos, relevant: "" };
    }
    const relRaw = /^none$/i.test(relevant.trim()) ? "None" : relevant;
    return {
      positive: pos,
      relevant:
        relRaw === "None"
          ? "None"
          : enforceParticipantFirstNameInText(relRaw, participantName),
    };
  }

  let enforced = enforcedPair(result.positive_feedback, result.relevant_information);
  let validationError = validateFilterOutput(
    enforced.positive,
    enforced.relevant,
    narrative,
    participantName,
    unified,
  );

  if (validationError) {
    console.warn(
      "[portal-feedback-narrative-filter] validation failed, retrying:",
      validationError,
    );
    const retry = await callOpenAi(apiKey, buildMessages(body, true), 0.2);
    if (retry.ok) {
      result = retry;
      enforced = enforcedPair(result.positive_feedback, result.relevant_information);
      if (retry.usage) {
        filterMeta = {
          unified_parent_feedback: unified,
          model: retry.model,
          prompt_tokens: retry.usage.prompt_tokens,
          completion_tokens: retry.usage.completion_tokens,
          total_tokens: retry.usage.total_tokens,
          attempt: 2,
          retry: true,
        };
      }
      validationError = validateFilterOutput(
        enforced.positive,
        enforced.relevant,
        narrative,
        participantName,
        unified,
      );
    }
  }

  if (validationError) {
    await auditFilter(
      validationError,
      enforced.positive,
      enforced.relevant,
      filterMeta,
    );
    return json({ ok: false, error: validationError }, 422);
  }

  await auditFilter("ok", enforced.positive, enforced.relevant || "None", filterMeta);

  return json({
    ok: true,
    positive_feedback: enforced.positive,
    // Unified: empty string so clients do not show Internal notes (AI).
    // Legacy: keep AI relevant (or "None").
    relevant_information: unified ? "" : enforced.relevant,
    unified_parent_feedback: unified,
  });
});
