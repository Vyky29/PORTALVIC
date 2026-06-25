// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores Deno.* here.
// portal-openai-assist
// --------------------
// OpenAI-backed help answers and report drafting for portal staff/admin.
//
// GET  → { ok: true, openai: boolean }
// POST JSON:
//   task: "help" | "report_draft" | "report_improve"
//   question?: string
//   knowledge?: { title: string; answer: string }[]
//   guideSections?: { id?: string; title: string; content: string; illustrations?: { src: string; caption?: string }[] }[]
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
type GuideSectionSnippet = {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  illustrations?: unknown;
};
type IllustrationSnippet = { src?: unknown; caption?: unknown };

type AssistBody = {
  task?: unknown;
  question?: unknown;
  knowledge?: unknown;
  guideSections?: unknown;
  reportType?: unknown;
  clientName?: unknown;
  context?: unknown;
  existingText?: unknown;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_KNOWLEDGE_ITEMS = 12;
const MAX_KNOWLEDGE_ANSWER = 1200;
const MAX_GUIDE_SECTIONS = 8;
const MAX_GUIDE_CONTENT = 2000;

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

function parseIllustrations(raw: unknown): { src: string; caption: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { src: string; caption: string }[] = [];
  for (let i = 0; i < raw.length && out.length < 6; i++) {
    const row = raw[i] as IllustrationSnippet;
    const src = str(row?.src, 300);
    if (!src || !src.startsWith("/portal/")) continue;
    out.push({ src, caption: str(row?.caption, 240) });
  }
  return out;
}

function parseGuideSections(raw: unknown): {
  id: string;
  title: string;
  content: string;
  illustrations: { src: string; caption: string }[];
}[] {
  if (!Array.isArray(raw)) return [];
  const out: {
    id: string;
    title: string;
    content: string;
    illustrations: { src: string; caption: string }[];
  }[] = [];
  for (let i = 0; i < raw.length && out.length < MAX_GUIDE_SECTIONS; i++) {
    const row = raw[i] as GuideSectionSnippet;
    const title = str(row?.title, 200);
    const content = str(row?.content, MAX_GUIDE_CONTENT);
    if (!title || !content) continue;
    out.push({
      id: str(row?.id, 80) || title.toLowerCase().replace(/\s+/g, "-"),
      title,
      content,
      illustrations: parseIllustrations(row?.illustrations),
    });
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
  guideSections: {
    id: string;
    title: string;
    content: string;
    illustrations: { src: string; caption: string }[];
  }[],
): { role: string; content: string }[] {
  const faq = knowledge.length
    ? knowledge.map((k, i) => `[FAQ ${i + 1}] ${k.title}\n${k.answer}`).join("\n\n")
    : "No FAQ snippets supplied.";

  const guide = guideSections.length
    ? guideSections.map((s, i) => {
      const ill = s.illustrations.length
        ? "\nIllustrations:\n" + s.illustrations.map((im) =>
          `- ${im.src}${im.caption ? ` (${im.caption})` : ""}`
        ).join("\n")
        : "";
      return `[Guide ${i + 1} id=${s.id}] ${s.title}\n${s.content}${ill}`;
    }).join("\n\n")
    : "No guide sections supplied.";

  return [
    {
      role: "system",
      content:
        "You are the ClubSENsational portal help voice agent. Staff ask how to use the portal (login, dashboard, feedback, timesheets, participants, announcements, etc.). " +
        "This is Q&A only — not a guided tour. Answer from the FAQ and Guide sections provided. " +
        "Reply in the same language the user used (English or Spanish). Be practical and concise (under 200 words for display text). " +
        "Do not invent features not in the knowledge. If unsure, say so and suggest asking the ops team. " +
        "Return ONLY valid JSON with keys: " +
        "answer (string, formatted for on-screen reading, may use short bullet lines), " +
        "speakText (string, natural spoken version under 120 words — no markdown, no URLs), " +
        "illustration (string or null — pick ONE /portal/guide-shots/... path from the guide if it helps, else null), " +
        "sectionId (string or null — id of the best matching guide section).",
    },
    {
      role: "user",
      content:
        `FAQ snippets:\n\n${faq}\n\n---\n\nGuide sections:\n\n${guide}\n\n---\n\nStaff question:\n${question}`,
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
  jsonMode = false,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const model = str(Deno.env.get("PORTAL_OPENAI_MODEL"), 64) || DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.35,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[portal-openai-assist] OpenAI error", res.status, errText.slice(0, 500));
    return { ok: false, error: "openai_failed" };
  }

  let parsed: { choices?: { message?: { content?: string } }[] };
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, error: "openai_bad_response" };
  }

  const text = str(parsed?.choices?.[0]?.message?.content, 16000);
  if (!text) return { ok: false, error: "empty_response" };
  return { ok: true, text };
}

type HelpAnswerPayload = {
  answer: string;
  speakText: string;
  illustration: string | null;
  sectionId: string | null;
};

function parseHelpAnswerJson(raw: string): HelpAnswerPayload | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const answer = str(j.answer, 4000);
    if (!answer) return null;
    const speakText = str(j.speakText, 1500) || answer;
    let illustration = str(j.illustration, 300) || null;
    if (illustration && !illustration.startsWith("/portal/")) illustration = null;
    const sectionId = str(j.sectionId, 80) || null;
    return { answer, speakText, illustration, sectionId };
  } catch {
    return null;
  }
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
    const guideSections = parseGuideSections(payload.guideSections);
    const result = await callOpenAiChat(
      apiKey,
      buildHelpMessages(question, knowledge, guideSections),
      650,
      true,
    );
    if (!result.ok) {
      return portalAdminJson(502, { ok: false, error: result.error });
    }

    const parsed = parseHelpAnswerJson(result.text);
    if (parsed) {
      return portalAdminJson(200, {
        ok: true,
        task,
        text: parsed.answer,
        speakText: parsed.speakText,
        illustration: parsed.illustration,
        sectionId: parsed.sectionId,
      });
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
