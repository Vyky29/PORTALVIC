export function onboardingSubmittedAt(
  payload: Record<string, unknown>,
): string | null {
  const portal = payload._portal && typeof payload._portal === "object"
    ? (payload._portal as Record<string, unknown>)
    : null;
  const submittedAt = portal?.submitted_at;
  if (typeof submittedAt !== "string") return null;
  const trimmed = submittedAt.trim();
  return trimmed.length ? trimmed : null;
}

export function buildMakeOnboardingBody(
  formType: "job" | "health",
  sessionId: string,
  staffName: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const submittedAt = onboardingSubmittedAt(payload) ??
    new Date().toISOString();
  const source = formType === "job"
    ? "portal-onboarding-job-application"
    : "portal-onboarding-health-questionnaire";

  const body: Record<string, unknown> = {
    source,
    form_type: formType,
    applicant_session_id: sessionId,
    staff_session_id: sessionId,
    portal_staff_name: staffName,
    submitted_at: submittedAt,
    payload,
  };

  for (const [key, value] of Object.entries(payload)) {
    if (key === "_portal") continue;
    body[key] = value;
  }

  return body;
}

export async function postMakeOnboardingWebhook(
  webhookUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  const url = webhookUrl.trim();
  if (!url || !/^https:\/\//i.test(url)) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[onboarding-make-webhook]", res.status, detail.slice(0, 500));
    }
  } catch (err) {
    console.error("[onboarding-make-webhook]", err);
  }
}
