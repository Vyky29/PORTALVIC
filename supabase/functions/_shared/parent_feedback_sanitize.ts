const DEFAULT_MODEL = "gpt-4o-mini";

/** Bump when parent-summary instructions change so cached shares regenerate. */
export const PARENT_SUMMARY_PROMPT_VERSION = "20260630-specialist-v2";

export const STALE_PARENT_SUMMARY_MODELS = new Set([
  "fallback-no-openai",
  "fallback-positive-only",
  "fallback-needs-ai",
  "fallback-empty",
  "fallback-specialist-rules",
  "openai-error",
]);

export function parentSummaryModelNeedsRefresh(reviewModel: unknown): boolean {
  const model = String(reviewModel || "").trim();
  if (!model) return true;
  if (STALE_PARENT_SUMMARY_MODELS.has(model)) return true;
  if (model.startsWith("openai-http-")) return true;
  if (model.startsWith("openai-")) return true;
  if (model.endsWith("-empty")) return true;
  return false;
}

export type SanitizeInput = {
  clientName: string;
  sessionDate: string;
  service: string;
  positiveFeedback: string;
  relevantInformation: string;
  engagementRating: number | null;
  clientEmotions: string;
  independenceLabel: string;
};

export type SanitizeResult = {
  share_status: "approved" | "hidden";
  parent_message: string;
  review_model: string;
};

function str(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}

/**
 * Rule-based specialist rewrite when OpenAI is unavailable (no credits, errors, etc.).
 * Not as rich as AI but reframes staff jargon for parents.
 */
function specialistRuleFallback(input: SanitizeInput): SanitizeResult {
  const name = str(input.clientName, 80) || "They";
  const firstName = name.split(/\s+/)[0] || name;
  const positive = str(input.positiveFeedback, 2000);
  const relevant = str(input.relevantInformation, 1500);
  const combined = [positive, relevant].filter(Boolean).join(" ");
  if (combined.length < 15) {
    return { share_status: "hidden", parent_message: "", review_model: "fallback-empty" };
  }

  let body = positive || relevant;
  const reframes: [RegExp, string][] = [
    [
      /physical activit(?:y|ies) where (?:he|she|they) (?:complained a lot because )?(?:didn't|did not|doesn't|didnt) want to do it/gi,
      "physical activities towards the end of the session; at that point they were less keen to take part, which can happen when they are ready to go home",
    ],
    [
      /complained a lot because (?:didn't|did not|doesn't|didnt) want to do it/gi,
      "found the later activity harder as the session was coming to an end and they were ready to go home",
    ],
    [/complained a lot/gi, "needed gentle encouragement"],
    [/(?:didn't|did not|doesn't|didnt) want to do it/gi, "was less keen to take part as the session was ending"],
    [/was lazy(?: today)?/gi, "needed more prompting to stay engaged"],
    [/hitting himself a lot/gi, "needed support when feeling frustrated"],
    [
      /we made him sit down on a chair and use some ice around the head/gi,
      "needed calm time and sensory support when feeling overwhelmed",
    ],
    [/hitting hi(?:m)?self(?: a lot)?/gi, "showed frustration and needed support to regulate"],
    [/a little frustrated/gi, "some frustration at the start"],
    [/He was needed support/gi, "He needed support"],
    [/She was needed support/gi, "She needed support"],
  ];
  for (const [re, rep] of reframes) {
    body = body.replace(re, rep);
  }

  body = body.charAt(0).toUpperCase() + body.slice(1);
  const parts = [`${firstName} joined us for today's session. ${body}`];

  const lower = combined.toLowerCase();
  if (/physical activit|go home|end of|leaving|didn't want|complain|frustrat|ready to leave/.test(lower)) {
    parts.push(
      "Physical activity often falls at the end of the session before going home; some young people find it harder to stay engaged indoors at that point, while community or outdoor activities earlier in the day may feel easier and they can appear more regulated.",
    );
  }

  const independence = str(input.independenceLabel, 200).toLowerCase();
  if (independence.includes("full support")) {
    parts.push("They needed close support throughout the session.");
  } else if (independence.includes("regular support")) {
    parts.push("They needed regular support to stay on track.");
  } else if (independence.includes("little support") || independence.includes("some support")) {
    parts.push("They needed a little support at times.");
  }

  const message = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (message.length < 15) {
    return { share_status: "hidden", parent_message: "", review_model: "fallback-empty" };
  }
  return {
    share_status: "approved",
    parent_message: message,
    review_model: "fallback-specialist-rules",
  };
}

function fallbackSanitize(input: SanitizeInput): SanitizeResult {
  return specialistRuleFallback(input);
}

function parseOpenAiJson(raw: string): { share_status?: string; parent_message?: string } {
  const t = raw.trim();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("json_parse_failed");
  }
}

export async function sanitizeFeedbackForParents(input: SanitizeInput): Promise<SanitizeResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return fallbackSanitize(input);

  const model = str(Deno.env.get("PORTAL_OPENAI_MODEL") || DEFAULT_MODEL, 64) || DEFAULT_MODEL;
  const payload = {
    model,
    temperature: 0.35,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a UK specialist in autism and SEND, writing session summaries for parents and carers at clubSENsational — a club where children with additional needs enjoy swimming, climbing, fitness and multi-activity sessions. " +
          "Return JSON only: {\"share_status\":\"approved\"|\"hidden\",\"parent_message\":\"...\"}. " +
          "CRITICAL: Do NOT copy, quote, or lightly reword staff notes. Transform them into professional parent communication — as a practitioner would explain the session to a family. " +
          "parent_message: warm British English, 3–6 short sentences, strengths-based and constructive. Lead with participation and positives. " +
          "When staff describe resistance, frustration, dysregulation, refusal, or complaints: reframe with context and function — why the behaviour may have happened (e.g. end-of-session transition, wanting to go home, fatigue, sensory load, change of routine, hunger). " +
          "Never use blunt staff phrasing such as 'complained a lot', 'didn't want to do it', or 'was lazy'. Instead explain sensitively — e.g. physical activity often falls at the end of the session before going home, and some young people find it harder to stay engaged indoors at that point because they are ready to leave; community or outdoor activities earlier in the day may feel easier and they may appear more regulated. " +
          "Where relevant, note that wanting to finish and go home can be part of their pattern at session end, especially in a classroom/indoor setting, while they may cope better in the community. " +
          "Describe dysregulation or difficult moments in calm, professional language (e.g. 'needed support to stay regulated') — never graphic detail, never blame. " +
          "Use engagement, emotions and independence only in gentle general terms (e.g. 'needed a little support', 'was mostly regulated'). " +
          "NEVER include: staff or instructor names (first or full), names of other children, internal staff jargon, safeguarding allegations, " +
          "detailed incident specifics, billing, LA/EHCP admin, or anything clearly for managers only. " +
          "staff_relevant_notes_internal is for context only — use it to inform your specialist interpretation; never quote it directly. " +
          "If the notes contain any real session activity, share_status MUST be approved with a helpful parent_message — reframe challenges rather than hiding. " +
          "Use hidden only when notes are essentially empty or unusable.",
      },
      {
        role: "user",
        content: JSON.stringify({
          participant: str(input.clientName, 120),
          session_date: str(input.sessionDate, 20),
          service: str(input.service, 120),
          engagement_rating_1_to_5: input.engagementRating,
          emotions: str(input.clientEmotions, 200),
          independence: str(input.independenceLabel, 200),
          staff_positive_notes: str(input.positiveFeedback, 2500),
          staff_relevant_notes_internal: str(input.relevantInformation, 2500),
        }),
      },
    ],
  };

  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) break;
      const errText = await res.text();
      let errCode = String(res.status);
      try {
        errCode = String(JSON.parse(errText)?.error?.code || JSON.parse(errText)?.error?.type || res.status);
      } catch (_) {
        /* keep status */
      }
      if (errCode === "insufficient_quota") {
        console.warn("[parent-feedback-sanitize] OpenAI insufficient_quota — rule fallback");
        return specialistRuleFallback(input);
      }
      if (res.status !== 429 || attempt >= 3) {
        console.warn("[parent-feedback-sanitize] OpenAI HTTP", res.status, errText.slice(0, 500));
        return specialistRuleFallback(input);
      }
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
    if (!res || !res.ok) return specialistRuleFallback(input);
    const body = await res.json();
    const raw = str(body?.choices?.[0]?.message?.content, 4000);
    const parsed = parseOpenAiJson(raw);
    const status = parsed.share_status === "approved" ? "approved" : "hidden";
    const message = str(parsed.parent_message, 2000);
    if (status === "approved" && message.length >= 15) {
      return { share_status: "approved", parent_message: message, review_model: model };
    }
    if (message.length >= 15) {
      return { share_status: "approved", parent_message: message, review_model: model };
    }
    return { share_status: "hidden", parent_message: "", review_model: `${model}-empty` };
  } catch (err) {
    console.warn("[parent-feedback-sanitize] OpenAI error", err);
    return specialistRuleFallback(input);
  }
}

export async function feedbackSourceFingerprint(input: SanitizeInput): Promise<string> {
  const { sha256Hex } = await import("./parent_portal_auth.ts");
  return sha256Hex(
    [
      PARENT_SUMMARY_PROMPT_VERSION,
      input.positiveFeedback,
      input.relevantInformation,
      String(input.engagementRating ?? ""),
      input.clientEmotions,
      input.independenceLabel,
    ].join("\x1f"),
  );
}
