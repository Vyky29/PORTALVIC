// portal-openai-assist
// --------------------
// OpenAI-backed help answers and report drafting for portal staff/admin.
//
// GET  → { ok: true, openai: boolean }
// POST JSON:
//   task: "help" | "report_draft" | "report_improve"
//   question?: string
//   knowledge?: { title: string; answer: string }[]
//   reportType?: string
//   clientName?: string
//   context?: string
//   existingText?: string
//
// Auth: active staff (help) · admin allowlist (report_*)
// Env: OPENAI_API_KEY, optional PORTAL_OPENAI_MODEL (default gpt-4o-mini)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";

type AssistTask = "help" | "report_draft" | "report_improve";

type KnowledgeSnippet = { title?: unknown; answer?: unknown };

type AssistBody = {
  task?: unknown;
  question?: unknown;
  knowledge?: unknown;
  reportType?: unknown;
  clientName?: unknown;
  context?: unknown;
  existingText?: unknown;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_KNOWLEDGE_ITEMS = 10;
const MAX_KNOWLEDGE_ANSWER = 900;

function str(v: unknown, max = 12000): string {
  return String(v ?? "").trim().slice(0, max);
}

function parseTask(v: unknown): AssistTask | null {
  const t = str(v, 32).toLowerCase();
  if (t === "help" || t === "report_draft" || t === "report_improve") return t;
  return null;
}

function parseKnowledge(raw: unknown): { title: string; answer: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { title: string; answer: string }[] = [];
  for (let i = 0; i < raw.length && out.length < MAX_KNOWLEDGE_ITEMS; i++) {
    const row = raw[i] as KnowledgeSnippet;
    const title = str(row?.title, 200);
    const answer = str(row?.answer, MAX_KNOWLEDGE_ANSWER);
    if (title && answer) out.push({ title, answer });
  }
  return out;
}

function reportTypeLabel(raw: string): string {
  const map: Record<string, string> = {
    progress: "Progress report for parents",
    parent_summary: "Parent summary",
    term: "Term review draft",
    trial: "Trial session summary",
    ehcp: "EHCP contribution",
    observation: "Observation summary",
  };
  return map[raw] || raw || "Progress report";
}

function buildHelpMessages(
  question: string,
  knowledge: { title: string; answer: string }[],
): { role: string; content: string }[] {
  const kb = knowledge.length
    ? knowledge.map((k, i) =>
      `[${i + 1}] ${k.title}\n${k.answer}`
    ).join("\n\n")
    : "No FAQ snippets supplied.";

  return [
    {
      role: "system",
      content:
        "You are the ClubSENsational portal help assistant. Answer staff questions about using the portal (login, dashboards, feedback, timesheets, participants, announcements, etc.). " +
        "Use ONLY the FAQ snippets below when they are relevant. If the snippets do not cover the question, say honestly that you are not sure and suggest opening portal_guide.html or asking the ops team. " +
        "Reply in the same language the user used (English or Spanish). Keep answers concise (under 180 words), practical, and step-by-step when useful. Do not invent features that are not in the snippets.",
    },
    {
      role: "user",
      content: `FAQ snippets:\n\n${kb}\n\n---\n\nStaff question:\n${question}`,
    },
  ];
}

function buildReportDraftMessages(
  reportType: string,
  clientName: string,
  context: string,
): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content:
        "You draft professional reports for ClubSENsational, a UK SEND activities provider. " +
        "Write in warm, clear British English suitable for parents, schools, or local authority readers. " +
        "Be factual — do not invent attendance figures, names, or outcomes not provided in the context. " +
        "Use placeholders like [add detail] where data is missing. Avoid clinical jargon unless the report type requires it (EHCP). " +
        "Structure with short paragraphs and bullet points where helpful.",
    },
    {
      role: "user",
      content:
        `Report type: ${reportTypeLabel(reportType)}\n` +
        `Participant / subject: ${clientName || "Not specified"}\n\n` +
        `Context and notes from staff:\n${context || "No extra notes — write a sensible template draft."}\n\n` +
        "Write the full report draft text only (no markdown headings with #).",
    },
  ];
}

function buildReportImproveMessages(
  reportType: string,
  clientName: string,
  existingText: string,
): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content:
        "You improve draft reports for ClubSENsational. Keep all factual content; improve clarity, tone, and flow for parents or professionals. " +
        "British English. Do not add invented facts. Return the improved full text only.",
    },
    {
      role: "user",
      content:
        `Report type: ${reportTypeLabel(reportType)}\n` +
        `Participant / subject: ${clientName || "Not specified"}\n\n` +
        `Draft to improve:\n${existingText}`,
    },
  ];
}

async function callOpenAiChat(
  apiKey: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
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
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[portal-openai-assist] OpenAI error", res.status, errText.slice(0, 500));
    return { ok: false, error: "openai_failed" };
  }

  let body: { choices?: { message?: { content?: string } }[] };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "openai_bad_response" };
  }

  const text = str(body?.choices?.[0]?.message?.content, 16000);
  if (!text) return { ok: false, error: "empty_response" };
  return { ok: true, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }

  if (req.method === "GET") {
    return portalAdminJson(200, {
      ok: true,
      openai: Boolean(Deno.env.get("OPENAI_API_KEY")),
      model: str(Deno.env.get("PORTAL_OPENAI_MODEL"), 64) || DEFAULT_MODEL,
    });
  }

  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) {
    return portalAdminJson(503, { ok: false, error: "no_openai" });
  }

  let payload: AssistBody;
  try {
    payload = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const task = parseTask(payload.task);
  if (!task) {
    return portalAdminJson(400, { ok: false, error: "invalid_task" });
  }

  if (task === "help") {
    const staff = await verifyPortalStaff(req);
    if (!staff.ok) {
      return portalAdminJson(staff.status, { ok: false, error: staff.error });
    }

    const question = str(payload.question, 2000);
    if (!question) {
      return portalAdminJson(400, { ok: false, error: "missing_question" });
    }

    const knowledge = parseKnowledge(payload.knowledge);
    const result = await callOpenAiChat(
      apiKey,
      buildHelpMessages(question, knowledge),
      450,
    );
    if (!result.ok) {
      return portalAdminJson(502, { ok: false, error: result.error });
    }
    return portalAdminJson(200, { ok: true, task, text: result.text });
  }

  const admin = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!admin.ok) {
    return portalAdminJson(admin.status, { ok: false, error: admin.error });
  }

  const reportType = str(payload.reportType, 64) || "progress";
  const clientName = str(payload.clientName, 200);
  const context = str(payload.context, 8000);

  if (task === "report_draft") {
    const result = await callOpenAiChat(
      apiKey,
      buildReportDraftMessages(reportType, clientName, context),
      1800,
    );
    if (!result.ok) {
      return portalAdminJson(502, { ok: false, error: result.error });
    }
    return portalAdminJson(200, { ok: true, task, text: result.text });
  }

  const existingText = str(payload.existingText, 12000);
  if (!existingText) {
    return portalAdminJson(400, { ok: false, error: "missing_existing_text" });
  }

  const improved = await callOpenAiChat(
    apiKey,
    buildReportImproveMessages(reportType, clientName, existingText),
    2000,
  );
  if (!improved.ok) {
    return portalAdminJson(502, { ok: false, error: improved.error });
  }
  return portalAdminJson(200, { ok: true, task: "report_improve", text: improved.text });
});
