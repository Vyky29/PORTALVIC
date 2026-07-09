import { enforceParticipantFirstNameInText } from "./participant_feedback_name.ts";

/** Bump when parent-summary instructions change so cached shares regenerate. */
export const PARENT_SUMMARY_PROMPT_VERSION = "20260705-narrative-passthrough-v5";

export const STALE_PARENT_SUMMARY_MODELS = new Set([
  "fallback-no-openai",
  "fallback-positive-only",
  "fallback-needs-ai",
  "fallback-empty",
  "fallback-specialist-rules",
  "openai-error",
  "gpt-4o-mini",
  "gpt-4o-mini-empty",
  "passthrough-positive-v4",
]);

export function parentSummaryModelNeedsRefresh(reviewModel: unknown): boolean {
  const model = String(reviewModel || "").trim();
  if (!model) return true;
  if (STALE_PARENT_SUMMARY_MODELS.has(model)) return true;
  if (model.startsWith("openai-http-")) return true;
  if (model.startsWith("openai-")) return true;
  if (model.endsWith("-empty")) return true;
  if (model !== "passthrough-positive-v5") return true;
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
 * Parent Comments = staff narrative extract (positive_feedback) only.
 * No AI rewrite — engagement, regulation and independence live in other columns.
 */
function passthroughPositive(input: SanitizeInput): SanitizeResult {
  const positive = enforceParticipantFirstNameInText(
    str(input.positiveFeedback, 2000),
    input.clientName,
  );
  if (positive.length < 8) {
    return { share_status: "hidden", parent_message: "", review_model: "passthrough-empty" };
  }
  return {
    share_status: "approved",
    parent_message: positive,
    review_model: "passthrough-positive-v5",
  };
}

export async function sanitizeFeedbackForParents(input: SanitizeInput): Promise<SanitizeResult> {
  return passthroughPositive(input);
}

export async function feedbackSourceFingerprint(input: SanitizeInput): Promise<string> {
  const { sha256Hex } = await import("./parent_portal_auth.ts");
  return sha256Hex(
    [PARENT_SUMMARY_PROMPT_VERSION, input.positiveFeedback, input.clientName].join("\x1f"),
  );
}
