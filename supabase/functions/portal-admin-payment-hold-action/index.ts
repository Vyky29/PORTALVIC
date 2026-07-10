// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-payment-hold-action
// Admin: soft_hold / remind / hold_session (cancel one recoverable) / clear / hard_cut.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  clearPaymentHoldForContact,
  getOpenPaymentHold,
  holdNextSession,
  loadOwnArrangementBuffer,
  upsertSoftHold,
} from "../_shared/portal_payment_holds.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: {
    action?: string;
    contact_id?: string;
    invoice_share_id?: string;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 40).toLowerCase();
  const contactId = clean(body.contact_id, 120);
  if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });
  if (!action) return portalAdminJson(400, { ok: false, error: "action_required" });

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actor = verified.userId || null;

  const buffer = await loadOwnArrangementBuffer(admin, contactId);

  if (action === "soft_hold" || action === "remind") {
    const hold = await upsertSoftHold(admin, {
      contactId,
      parentPersonId: buffer.parent_person_id,
      bufferGbp: buffer.buffer_gbp || null,
      bufferLines: buffer.lines,
      invoiceShareId: clean(body.invoice_share_id, 80) || null,
      notes:
        body.notes ||
        (action === "remind"
          ? "Reminder sent — pay to keep the slot; one session may be cancelled if still unpaid."
          : "Soft hold — reminders before cancelling one session."),
      actorUserId: actor,
      bumpReminder: action === "remind",
    });
    return portalAdminJson(200, {
      ok: true,
      hold,
      message:
        action === "remind"
          ? "Reminder logged. After enough reminders, use Hold next session."
          : "Soft hold active. Send reminders, then hold one session if still unpaid.",
    });
  }

  if (action === "hold_session") {
    let hold = await getOpenPaymentHold(admin, contactId);
    if (!hold) {
      hold = await upsertSoftHold(admin, {
        contactId,
        parentPersonId: buffer.parent_person_id,
        bufferGbp: buffer.buffer_gbp || null,
        bufferLines: buffer.lines,
        invoiceShareId: clean(body.invoice_share_id, 80) || null,
        notes: "Soft hold created before holding a session.",
        actorUserId: actor,
        bumpReminder: false,
      });
    }
    if (hold.status === "session_held") {
      return portalAdminJson(200, {
        ok: true,
        hold,
        message: "A session is already held for this family.",
      });
    }
    const result = await holdNextSession(admin, {
      contactId,
      holdId: String(hold.id),
      actorUserId: actor,
    });
    if (!result.ok) {
      return portalAdminJson(400, { ok: false, error: result.error });
    }
    return portalAdminJson(200, {
      ok: true,
      hold: result.hold,
      session: result.session,
      message:
        "One upcoming session cancelled (recoverable). Parent can pay to restore it before a hard cut.",
    });
  }

  if (action === "clear") {
    const out = await clearPaymentHoldForContact(admin, contactId, "admin", actor);
    return portalAdminJson(200, {
      ok: true,
      ...out,
      message: out.cleared
        ? out.restored
          ? "Hold cleared and held session restored."
          : "Hold cleared."
        : "No open hold for this contact.",
    });
  }

  if (action === "hard_cut") {
    const hold = await getOpenPaymentHold(admin, contactId);
    if (!hold) {
      return portalAdminJson(400, { ok: false, error: "no_open_hold" });
    }
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("portal_family_payment_holds")
      .update({
        status: "hard_cut",
        updated_at: now,
        updated_by: actor,
        notes: clean(
          body.notes ||
            "Hard cut — admin paused / force standard plan. Held session not auto-restored.",
          500,
        ),
      })
      .eq("id", hold.id)
      .select("*")
      .maybeSingle();
    if (error) {
      return portalAdminJson(500, { ok: false, error: "hard_cut_failed" });
    }
    return portalAdminJson(200, {
      ok: true,
      hold: data,
      message: "Hard cut recorded. Move family to a standard plan or pause services manually.",
    });
  }

  return portalAdminJson(400, { ok: false, error: "unknown_action" });
});
