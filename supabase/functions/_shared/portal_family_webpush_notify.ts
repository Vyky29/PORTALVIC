/**
 * Fire-and-forget Family Web Push after a hub-alert parent notify log insert.
 */
export async function notifyFamilyWebPushForParentNotify(opts: {
  notifyLogId: string;
  kind?: string | null;
}): Promise<void> {
  const id = String(opts?.notifyLogId || "").trim();
  if (!id) return;

  const kind = String(opts?.kind || "").trim().toLowerCase();
  const allowed = new Set([
    "instructor_change",
    "instructor_reassign",
    "session_cancelled",
    "absence_announced",
  ]);
  if (kind && !allowed.has(kind)) return;

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const secret = (Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") || "").trim();
  if (!baseUrl || !secret) {
    console.warn(
      "[family-webpush] skip — missing PORTAL_PUSH_WEBHOOK_SECRET or SUPABASE_URL",
    );
    return;
  }

  try {
    const res = await fetch(
      `${baseUrl}/functions/v1/portal-push-dispatch-parent-notify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-portal-webhook-secret": secret,
        },
        body: JSON.stringify({ notify_log_id: id, kind: kind || undefined }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(
        "[family-webpush] dispatch failed",
        res.status,
        t.slice(0, 200),
      );
    }
  } catch (e) {
    console.warn("[family-webpush] dispatch error", e);
  }
}
