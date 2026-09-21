/**
 * Admin Web Push: Session Disruption validated → COVER NEEDED on rota.
 * Uses the same VAPID path as other admin ops alerts (no parent notify).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  adminPushOpenBase,
  clampPushBody,
  initVapidFromEnv,
  loadAdminCeoUserIds,
  sendPushPayloadToUserIds,
} from "./portal_webpush_util.ts";

export async function notifyAdminsInstructorCoverNeeded(opts: {
  reportId: string;
  staffName: string;
  sessionDate: string;
  venue?: string;
  slotCount: number;
}): Promise<{ ok: boolean; detail?: string; sent?: number }> {
  const reportId = String(opts.reportId || "").trim();
  if (!reportId) return { ok: false, detail: "missing_id" };

  const baseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!baseUrl || !serviceRole) {
    return { ok: false, detail: "server_misconfigured" };
  }

  try {
    initVapidFromEnv();
  } catch (e) {
    console.warn("[cover-needed-push] vapid", e);
    return { ok: false, detail: "vapid_missing" };
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let adminIds: string[] = [];
  try {
    adminIds = await loadAdminCeoUserIds(admin);
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
  if (!adminIds.length) return { ok: true, sent: 0, detail: "no_admins" };

  const staff = String(opts.staffName || "Staff").trim() || "Staff";
  const iso = String(opts.sessionDate || "").slice(0, 10);
  const n = Math.max(0, Number(opts.slotCount) || 0);
  const venue = String(opts.venue || "").trim();
  const title = "COVER NEEDED";
  const body = clampPushBody(
    [
      `${staff} off ${iso || "that day"}`,
      n ? `${n} service${n === 1 ? "" : "s"} need cover` : "services need cover",
      venue ? `(${venue})` : "",
      "- open Schedule & Covers",
    ]
      .filter(Boolean)
      .join(" · "),
  );

  const openBase = adminPushOpenBase() || "";
  const notifyUrl = openBase
    ? `${openBase}${openBase.includes("?") ? "&" : "?"}portalOpen=scheduling`
    : "";
  const pushPayload = JSON.stringify({
    title,
    body,
    url: notifyUrl,
    portalOpen: "scheduling",
    tag: `admin-cover-needed-${reportId}`,
    requireInteraction: true,
  });

  try {
    const { sent } = await sendPushPayloadToUserIds(admin, adminIds, pushPayload);
    return { ok: true, sent };
  } catch (e) {
    console.warn("[cover-needed-push] send", e);
    return { ok: false, detail: String(e) };
  }
}
