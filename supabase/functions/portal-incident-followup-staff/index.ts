// @ts-nocheck — Edge Function (Deno).
//
// portal-incident-followup-staff
// Staff: respond to meeting availability; primary instructor approve/reject support plan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  notifyUsersAboutIncident,
  resolveOwnerUserIds,
} from "../_shared/portal_incident_followup_ops.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

function riskLevel(v: unknown): "high" | "medium" | "low" {
  const s = clean(v, 20).toLowerCase();
  if (s === "high" || s === "low") return s;
  return "medium";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !anon || !serviceRole) {
    return json(500, { ok: false, error: "server_misconfigured" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) {
    return json(401, { ok: false, error: "missing_authorization" });
  }

  const userRes = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anon },
  });
  if (!userRes.ok) return json(401, { ok: false, error: "invalid_session" });
  const userBody = await userRes.json();
  const userId = String(userBody?.id || "");
  if (!userId) return json(401, { ok: false, error: "invalid_session" });

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("staff_profiles")
    .select("id, app_role, full_name, email, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_active === false) {
    return json(403, { ok: false, error: "not_staff" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = clean(body.action, 60);
  const now = new Date().toISOString();

  try {
    if (action === "my_invites") {
      const { data: invitees } = await admin
        .from("portal_incident_followup_invitees")
        .select("*, meeting:portal_incident_followup_meetings(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      return json(200, { ok: true, invitees: invitees || [] });
    }

    if (action === "respond_availability") {
      const inviteeId = clean(body.invitee_id, 80);
      const response = clean(body.response, 20);
      if (!inviteeId) return json(400, { ok: false, error: "invitee_id_required" });
      if (!["available", "unable", "suggest_time"].includes(response)) {
        return json(400, { ok: false, error: "invalid_response" });
      }
      const { data: inv } = await admin
        .from("portal_incident_followup_invitees")
        .select("*")
        .eq("id", inviteeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!inv) return json(404, { ok: false, error: "invite_not_found" });

      const patch: Record<string, unknown> = {
        response,
        responded_at: now,
        response_note: clean(body.note, 500) || null,
        updated_at: now,
      };
      if (response === "suggest_time") {
        const suggested = clean(body.suggested_at, 40);
        patch.suggested_at = suggested || null;
      }
      const { error } = await admin
        .from("portal_incident_followup_invitees")
        .update(patch)
        .eq("id", inviteeId);
      if (error) throw new Error(error.message);
      return json(200, { ok: true, response });
    }

    if (action === "pending_plan_for_participant") {
      const name = clean(body.participant_name, 200);
      if (!name) return json(400, { ok: false, error: "participant_name_required" });
      const { data: update } = await admin
        .from("portal_support_plan_updates")
        .select("*")
        .eq("status", "pending_instructor")
        .ilike("participant_name", name)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json(200, { ok: true, update: update || null });
    }

    if (action === "approve_support_plan" || action === "reject_support_plan") {
      const updateId = clean(body.update_id, 80);
      if (!updateId) return json(400, { ok: false, error: "update_id_required" });
      const { data: update } = await admin
        .from("portal_support_plan_updates")
        .select("*")
        .eq("id", updateId)
        .eq("status", "pending_instructor")
        .maybeSingle();
      if (!update) return json(404, { ok: false, error: "update_not_found" });

      const { data: incident } = await admin
        .from("incident_reports")
        .select("*")
        .eq("id", update.incident_id)
        .maybeSingle();
      if (!incident) return json(404, { ok: false, error: "incident_not_found" });

      const owners = await resolveOwnerUserIds(
        admin,
        incident.client_id || null,
        incident.client_name || null,
      );
      const isAdminRole = ["admin", "ceo"].includes(String(profile.app_role || ""));
      if (!owners.includes(userId) && !isAdminRole) {
        return json(403, { ok: false, error: "not_primary_instructor" });
      }

      if (action === "reject_support_plan") {
        await admin
          .from("portal_support_plan_updates")
          .update({ status: "cancelled", updated_at: now })
          .eq("id", updateId);
        await admin
          .from("incident_reports")
          .update({ workflow_status: "follow_up_complete" })
          .eq("id", incident.id);
        if (update.created_by) {
          await notifyUsersAboutIncident(admin, {
            userIds: [update.created_by],
            title: "Support Plan Update Rejected",
            body:
              `${profile.full_name || "Primary instructor"} rejected the support plan update for ${update.participant_name}. Re-open the incident follow-up to edit.`,
            messageType: "support_plan_rejected",
            incidentId: incident.id,
            createdBy: userId,
          });
        }
        return json(200, { ok: true, rejected: true });
      }

      // Approve → activate
      const participantName = clean(update.participant_name, 200);
      const items = Array.isArray(update.payload_json) ? update.payload_json : [];
      await admin
        .from("portal_support_plans")
        .update({ status: "superseded", updated_at: now })
        .eq("status", "active")
        .ilike("participant_name", participantName);

      const { data: plan, error: planErr } = await admin
        .from("portal_support_plans")
        .insert({
          participant_name: participantName,
          participant_contact_id: update.participant_contact_id || null,
          status: "active",
          source_incident_id: incident.id,
          source_followup_id: update.followup_id,
          activated_at: now,
          activated_by: userId,
        })
        .select("*")
        .maybeSingle();
      if (planErr) throw new Error(planErr.message);

      if (items.length && plan?.id) {
        await admin.from("portal_support_plan_items").insert(
          items.map((row: Record<string, unknown>, i: number) => ({
            plan_id: plan.id,
            sort_order: i,
            risk_behaviour: clean(row?.risk_behaviour, 500),
            strategy_in_place: clean(row?.strategy_in_place, 2000),
            risk_level: riskLevel(row?.risk_level),
            source_incident_id: incident.id,
            last_updated_at: now,
            updated_by: userId,
            updated_by_name: profile.full_name || profile.email || "Instructor",
            item_status: "active",
          })),
        );
      }

      await admin
        .from("portal_support_plan_updates")
        .update({
          status: "applied",
          applied_plan_id: plan.id,
          applied_at: now,
          updated_at: now,
        })
        .eq("id", updateId);

      await admin
        .from("incident_reports")
        .update({
          workflow_status: "closed",
          closed_at: now,
          closed_by: userId,
        })
        .eq("id", incident.id);

      const notifyIds = Array.from(
        new Set([
          ...owners,
          incident.submitted_by_user_id,
          update.created_by,
        ].filter(Boolean).map(String)),
      ).filter((id) => id !== userId);

      await notifyUsersAboutIncident(admin, {
        userIds: notifyIds,
        title: "Support Plan Updated",
        body:
          `${participantName}'s Support Plan has been updated. Please review the latest strategies before the next session.`,
        messageType: "support_plan_updated",
        incidentId: incident.id,
        createdBy: userId,
        dedupeKey: "updated",
      });

      return json(200, { ok: true, approved: true, plan });
    }

    return json(400, { ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("[portal-incident-followup-staff]", e instanceof Error ? e.message : e);
    return json(500, { ok: false, error: e instanceof Error ? e.message : "server_error" });
  }
});
