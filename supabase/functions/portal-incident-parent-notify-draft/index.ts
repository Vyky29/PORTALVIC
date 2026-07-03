// @ts-nocheck — Edge Function (Deno).
//
// portal-incident-parent-notify-draft
// -----------------------------------
// Draft a parent/carer-facing incident message from raw staff incident report fields.
//
// GET  → { ok: true, openai: boolean }
// POST JSON:
//   participant_name?, participant_gender?, parent_name?,
//   session_date?, session_time?, incident_category?, service?, location?,
//   statement_before?, statement_during?, statement_after?,
//   injuries_client?, injuries_staff?, submitted_by_name?
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

function buildMessages(body: Record<string, unknown>) {
  const participant = str(body.participant_name, 200);
  const participantFirst = firstName(participant);
  const gender = genderLabel(body.participant_gender);
  const parentName = str(body.parent_name, 200);
  const sessionDate = str(body.session_date, 32);
  const sessionTime = str(body.session_time, 32);
  const category = str(body.incident_category, 200);
  const service = str(body.service, 200);
  const location = str(body.location, 200);

  const reportLines = [
    str(body.statement_before, 4000)
      ? "Before session:\n" + str(body.statement_before, 4000)
      : "",
    str(body.statement_during, 4000)
      ? "During session:\n" + str(body.statement_during, 4000)
      : "",
    str(body.statement_after, 4000)
      ? "After session:\n" + str(body.statement_after, 4000)
      : "",
    str(body.injuries_client, 2000)
      ? "Client injuries:\n" + str(body.injuries_client, 2000)
      : "",
    str(body.injuries_staff, 2000)
      ? "Staff injuries:\n" + str(body.injuries_staff, 2000)
      : "",
  ].filter(Boolean);

  const contextLines = [
    participant ? `Participant full name: ${participant}` : "",
    participant ? `Use first name in text: ${participantFirst}` : "",
    gender ? `Gender: ${gender}` : participant ? "Gender: unknown — use the first name, not they/them" : "",
    parentName ? `Parent/carer name (for greeting): ${parentName}` : "",
    sessionDate ? `Session date: ${sessionDate}` : "",
    sessionTime ? `Session time: ${sessionTime}` : "",
    category ? `Incident category: ${category}` : "",
    service ? `Service: ${service}` : "",
    location ? `Location: ${location}` : "",
  ].filter(Boolean);

  const system = [
    "You are a safeguarding-aware communications assistant for a children's therapy and aquatic club.",
    "Staff have submitted an internal incident report. Your job is to draft ONE parent/carer message in plain English.",
    "The raw staff report stays internal — your output is what a manager sends to the family by email or WhatsApp.",
    "",
    "Naming and pronouns (strict):",
    "- Use the participant's FIRST NAME throughout — never write \"the participant\", \"the client\", or \"the child\".",
    "- If gender is male: he, him, his only — never they/them/their.",
    "- If gender is female: she, her, hers only — never they/them/their.",
    "- If gender is unknown: repeat the first name instead of generic labels or singular they.",
    "",
    "Privacy and tone:",
    "- Be factual, calm, and professional — suitable for a parent/carer.",
    "- Do not invent details; only use information from the staff report.",
    "- Other children or staff: use \"another participant\" or \"a member of staff\" unless naming is essential for clarity.",
    "- Do not assign blame; describe what happened and what the team did.",
    "- Include injuries and first aid only as stated; do not minimise or exaggerate.",
    "- Mention session date/time and activity context when provided.",
    "",
    "Structure:",
    "- Greeting: \"Hi [parent name],\" if parent name is given, otherwise \"Hi,\".",
    "- Brief opening that this is an update about today's session.",
    "- Clear paragraphs: what happened, immediate response/actions, injuries/status, any follow-up or offer to discuss.",
    "- Sign off: \"Thank you,\\nClubSENsational\" (exactly).",
    "",
    "Output valid JSON with keys email_subject and parent_message only.",
    "email_subject: short UK English subject line including the participant first name (e.g. \"Session incident update · Tom\").",
    "parent_message: full message body including greeting and sign-off, ready to send.",
  ].join("\n");

  const user = [
    contextLines.length ? "Context:\n" + contextLines.join("\n") : "",
    "",
    "Internal staff incident report (English):",
    reportLines.length ? reportLines.join("\n\n") : "(no narrative provided)",
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
      temperature: 0.45,
      max_tokens: 1400,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      "[portal-incident-parent-notify-draft] OpenAI error",
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
    const subject = str(j.email_subject, 300);
    const message = str(j.parent_message, 8000);
    if (!subject || !message) {
      return { ok: false as const, error: "incomplete_response" };
    }
    return { ok: true as const, email_subject: subject, parent_message: message };
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

  const during = str(body.statement_during, 10000);
  const after = str(body.statement_after, 10000);
  const before = str(body.statement_before, 10000);
  const injuries = str(body.injuries_client, 2000);
  if (!during && !after && !before && !injuries) {
    return json({ ok: false, error: "report_too_short" }, 400);
  }

  const result = await callOpenAi(apiKey, buildMessages(body));
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 502);
  }

  return json({
    ok: true,
    email_subject: result.email_subject,
    parent_message: result.parent_message,
  });
});
