/**
 * Web Push to a staff leader when admin sends Leader WhatsApp.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  initVapidFromEnv,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
} from "./portal_webpush_util.ts";

function clamp(s: string, max = 120): string {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export async function pushStaffLeaderWhatsappMessage(
  admin: SupabaseClient,
  opts: {
    staffProfileId: string;
    staffUsername?: string;
    bodyText: string;
    logId?: string | null;
    /** Admin who sent — clients/SW ignore the alert for this user (don't notify the sender). */
    senderUserId?: string | null;
  },
): Promise<{ ok: boolean; sent?: number; detail?: string }> {
  const staffId = String(opts.staffProfileId || "").trim();
  if (!staffId) return { ok: false, detail: "missing_staff_id" };
  if (!initVapidFromEnv()) {
    console.warn("[staff-wa-push] VAPID not configured");
    return { ok: false, detail: "no_vapid" };
  }

  const openBase = (staffPushOpenBase() || "").replace(/\/$/, "");
  const url = openBase
    ? `${openBase}${openBase.includes("?") ? "&" : "?"}portalOpen=staff_whatsapp`
    : "/staff_dashboard.html?portalOpen=staff_whatsapp";

  const preview = clamp(opts.bodyText || "New message from the club", 120);
  const sourceId = String(opts.logId || Date.now());
  const senderUserId = String(opts.senderUserId || "").trim();
  const payload = JSON.stringify({
    title: "Portal WhatsApp",
    body: preview,
    url,
    portalOpen: "staff_whatsapp",
    tag: `staff-wa-${sourceId}`,
    requireInteraction: true,
    vibrate: [200, 80, 200, 80, 280, 100, 200],
    targetUserId: staffId,
    senderUserId: senderUserId || undefined,
  });

  try {
    const result = await sendPushPayloadToUserIds(admin, [staffId], payload, {
      urgency: "high",
      topic: `staff-wa-${sourceId}`.slice(0, 32),
    });
    return { ok: result.sent > 0, sent: result.sent, detail: result.sent ? undefined : "no_subs" };
  } catch (e) {
    console.warn("[staff-wa-push] send failed", e);
    return { ok: false, detail: String(e) };
  }
}
