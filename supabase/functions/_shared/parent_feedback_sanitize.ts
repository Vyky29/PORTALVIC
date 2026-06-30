const DEFAULT_MODEL = "gpt-4o-mini";

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
 * No-OpenAI fallback: draft a parent summary from the staff positive note so the
 * admin family-summary column is populated and reviewable. Admins can edit/hide
 * before parents rely on it; relevant_information (internal) is never used here.
 */
function fallbackSanitize(input: SanitizeInput): SanitizeResult {
  const positive = str(input.positiveFeedback, 2000);
  if (positive.length >= 15) {
    return {
      share_status: "approved",
      parent_message: positive,
      review_model: "fallback-positive-only",
    };
  }
  return { share_status: "hidden", parent_message: "", review_model: "fallback-empty" };
}

export async function sanitizeFeedbackForParents(input: SanitizeInput): Promise<SanitizeResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return fallbackSanitize(input);

  const model = str(Deno.env.get("PORTAL_OPENAI_MODEL") || DEFAULT_MODEL, 64) || DEFAULT_MODEL;
  const payload = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a UK specialist in autism and SEND, writing session updates for parents and carers at clubSENsational — a club where children with additional needs enjoy swimming, climbing, fitness and multi-activity sessions. " +
          "Return JSON only: {\"share_status\":\"approved\"|\"hidden\",\"parent_message\":\"...\"}. " +
          "parent_message: warm British English, 2–5 short sentences, strengths-based and constructive — what their child enjoyed, tried, or progressed with. " +
          "Use engagement, emotions and independence only in gentle general terms (e.g. 'engaged well', 'needed a little support'). " +
          "NEVER include: staff or instructor names (first or full), names of other children, internal staff jargon, safeguarding allegations, " +
          "detailed dysregulation or challenging behaviour, incident specifics, billing, LA/EHCP admin, or anything clearly for managers only. " +
          "staff_relevant_notes_internal is for context only — include only if it helps parents in a constructive, non-alarming way; otherwise ignore it. " +
          "If you cannot write something genuinely helpful and parent-safe, set share_status to hidden and parent_message to \"\".",
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
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[parent-feedback-sanitize] OpenAI HTTP", res.status, await res.text());
      return fallbackSanitize(input);
    }
    const body = await res.json();
    const raw = str(body?.choices?.[0]?.message?.content, 4000);
    const parsed = JSON.parse(raw || "{}") as { share_status?: string; parent_message?: string };
    const status = parsed.share_status === "approved" ? "approved" : "hidden";
    const message = str(parsed.parent_message, 2000);
    if (status === "approved" && message.length >= 15) {
      return { share_status: "approved", parent_message: message, review_model: model };
    }
    return { share_status: "hidden", parent_message: "", review_model: model };
  } catch (err) {
    console.warn("[parent-feedback-sanitize] OpenAI error", err);
    return fallbackSanitize(input);
  }
}

export async function feedbackSourceFingerprint(input: SanitizeInput): Promise<string> {
  const { sha256Hex } = await import("./parent_portal_auth.ts");
  return sha256Hex(
    [
      input.positiveFeedback,
      input.relevantInformation,
      String(input.engagementRating ?? ""),
      input.clientEmotions,
      input.independenceLabel,
    ].join("\x1f"),
  );
}
