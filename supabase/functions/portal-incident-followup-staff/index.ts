// @ts-nocheck — Edge Function (Deno).
//
// portal-incident-followup-staff
// Staff: respond to meeting availability; primary instructor approve/reject support plan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  notifyUsersAboutIncident,
  resolveOwnerUserIds,
} from "../_shared/portal_incident_followup_ops.ts";
import {
  activitiesToServiceTags,
  cleanIsp,
  ensureParticipantSupportPlan,
  libraryMatchesServices,
  riskLevelIsp,
  upsertBehaviourLibraryFork,
  upsertStrategyLibraryFork,
} from "../_shared/portal_isp_library.ts";

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
  return cleanIsp(v, max);
}

function riskLevel(v: unknown): "high" | "medium" | "low" {
  return riskLevelIsp(v);
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

    if (action === "list_library") {
      const services = body.services;
      const { data: behaviours, error: bErr } = await admin
        .from("portal_isp_behaviour_library")
        .select(
          "id, code, label, category, default_risk_level, sort_order, scope, service_tags, forked_from_id",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (bErr) throw new Error(bErr.message);
      const { data: strategies, error: sErr } = await admin
        .from("portal_isp_strategy_library")
        .select(
          "id, code, label, body, category, behaviour_codes, sort_order, scope, service_tags, forked_from_id",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (sErr) throw new Error(sErr.message);
      const tags = activitiesToServiceTags(services);
      const filterByService = Array.isArray(services) || clean(services, 200);
      return json(200, {
        ok: true,
        service_tags: tags,
        behaviours: (behaviours || []).filter((b) =>
          !filterByService || b.scope === "individual" ||
          libraryMatchesServices(b.service_tags, tags)
        ),
        strategies: (strategies || []).filter((s) =>
          !filterByService || s.scope === "individual" ||
          libraryMatchesServices(s.service_tags, tags)
        ),
      });
    }

    if (action === "ensure_support_plan") {
      const name = clean(body.participant_name, 200);
      if (!name) return json(400, { ok: false, error: "participant_name_required" });
      const bundle = await ensureParticipantSupportPlan(admin, {
        participantName: name,
        participantContactId: clean(body.participant_contact_id, 120) || null,
        services: body.services,
        userId,
        userName: profile.full_name || profile.email || "Staff",
      });
      let pending = null;
      const { data: update } = await admin
        .from("portal_support_plan_updates")
        .select("*")
        .eq("status", "pending_instructor")
        .ilike("participant_name", name)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pending = update || null;
      const { data: invitees } = await admin
        .from("portal_incident_followup_invitees")
        .select("*, meeting:portal_incident_followup_meetings(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      const invites = (invitees || []).filter((row) => {
        const m = row.meeting || {};
        return ["draft", "awaiting_responses", "confirmed"].includes(
          String(m.status || ""),
        );
      }).slice(0, 5);
      return json(200, {
        ok: true,
        plan: bundle.plan,
        items: bundle.items,
        service_tags: bundle.service_tags,
        pending,
        invites,
      });
    }

    if (action === "add_plan_item" || action === "update_plan_item") {
      const planId = clean(body.plan_id, 80);
      if (!planId) return json(400, { ok: false, error: "plan_id_required" });
      const { data: plan } = await admin
        .from("portal_support_plans")
        .select("*")
        .eq("id", planId)
        .eq("status", "active")
        .maybeSingle();
      if (!plan) return json(404, { ok: false, error: "plan_not_found" });

      const riskBeh = clean(body.risk_behaviour, 500);
      const stratBody = clean(body.strategy_in_place, 4000);
      if (!riskBeh) return json(400, { ok: false, error: "risk_behaviour_required" });

      const behLib = await upsertBehaviourLibraryFork(admin, {
        libraryId: clean(body.behaviour_library_id, 80) || null,
        label: riskBeh,
        riskLevel: body.risk_level,
        scope: "individual",
        serviceTags: Array.isArray(body.service_tags) ? body.service_tags : ["all"],
        userId,
      });
      const stratLib = await upsertStrategyLibraryFork(admin, {
        libraryId: clean(body.strategy_library_id, 80) || null,
        label: clean(body.strategy_label, 200) || stratBody.slice(0, 80),
        body: stratBody || riskBeh,
        behaviourCodes: behLib?.code ? [behLib.code] : [],
        scope: "individual",
        serviceTags: Array.isArray(body.service_tags) ? body.service_tags : ["all"],
        userId,
      });

      const byName = profile.full_name || profile.email || "Staff";
      const patch = {
        risk_behaviour: riskBeh,
        strategy_in_place: stratBody,
        risk_level: riskLevel(body.risk_level),
        behaviour_library_id: behLib?.id || null,
        strategy_library_id: stratLib?.id || null,
        item_scope: "individual",
        is_customized: true,
        item_status: "active",
        last_updated_at: now,
        updated_at: now,
        updated_by: userId,
        updated_by_name: byName,
      };

      if (action === "update_plan_item") {
        const itemId = clean(body.item_id, 80);
        if (!itemId) return json(400, { ok: false, error: "item_id_required" });
        const { data: item, error } = await admin
          .from("portal_support_plan_items")
          .update(patch)
          .eq("id", itemId)
          .eq("plan_id", planId)
          .select("*")
          .maybeSingle();
        if (error) throw new Error(error.message);
        return json(200, {
          ok: true,
          item,
          behaviour_library: behLib,
          strategy_library: stratLib,
          forked: !!(behLib?.forked_from_id || stratLib?.forked_from_id),
        });
      }

      const { data: maxRow } = await admin
        .from("portal_support_plan_items")
        .select("sort_order")
        .eq("plan_id", planId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: item, error } = await admin
        .from("portal_support_plan_items")
        .insert({
          plan_id: planId,
          sort_order: (maxRow?.sort_order ?? -1) + 1,
          ...patch,
        })
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return json(200, {
        ok: true,
        item,
        behaviour_library: behLib,
        strategy_library: stratLib,
        forked: !!(behLib?.forked_from_id || stratLib?.forked_from_id),
      });
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

      // Approve → merge individual rows into existing plan (or create one)
      const participantName = clean(update.participant_name, 200);
      const items = Array.isArray(update.payload_json) ? update.payload_json : [];
      const byName = profile.full_name || profile.email || "Instructor";
      const ensured = await ensureParticipantSupportPlan(admin, {
        participantName,
        participantContactId: update.participant_contact_id || incident.client_id || null,
        services: body.services || incident.activity || [],
        userId,
        userName: byName,
      });
      const plan = ensured.plan;
      if (!plan?.id) throw new Error("plan_missing");

      await admin
        .from("portal_support_plans")
        .update({
          source_incident_id: incident.id,
          source_followup_id: update.followup_id,
          activated_at: now,
          activated_by: userId,
          reviewed_by: userId,
          reviewed_by_name: byName,
          reviewed_at: now,
          approved_by: update.created_by || null,
          approved_at: update.created_by ? now : null,
          updated_at: now,
        })
        .eq("id", plan.id);

      if (update.created_by) {
        const { data: approver } = await admin
          .from("staff_profiles")
          .select("full_name, email")
          .eq("id", update.created_by)
          .maybeSingle();
        await admin
          .from("portal_support_plans")
          .update({
            approved_by_name: approver?.full_name || approver?.email || "Admin",
          })
          .eq("id", plan.id);
      }

      if (items.length) {
        const { data: maxRow } = await admin
          .from("portal_support_plan_items")
          .select("sort_order")
          .eq("plan_id", plan.id)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        let sort = (maxRow?.sort_order ?? -1) + 1;
        for (const row of items) {
          const riskBeh = clean(row?.risk_behaviour, 500);
          const stratBody = clean(row?.strategy_in_place, 2000);
          if (!riskBeh) continue;
          const behLib = await upsertBehaviourLibraryFork(admin, {
            libraryId: clean(row?.behaviour_library_id, 80) || null,
            label: riskBeh,
            riskLevel: row?.risk_level,
            scope: "individual",
            userId,
          });
          const stratLib = await upsertStrategyLibraryFork(admin, {
            libraryId: clean(row?.strategy_library_id, 80) || null,
            body: stratBody || riskBeh,
            behaviourCodes: behLib?.code ? [behLib.code] : [],
            scope: "individual",
            userId,
          });
          await admin.from("portal_support_plan_items").insert({
            plan_id: plan.id,
            sort_order: sort++,
            risk_behaviour: riskBeh,
            strategy_in_place: stratBody,
            risk_level: riskLevel(row?.risk_level),
            behaviour_library_id: behLib?.id || null,
            strategy_library_id: stratLib?.id || null,
            source_incident_id: incident.id,
            item_scope: "individual",
            is_customized: true,
            last_updated_at: now,
            updated_by: userId,
            updated_by_name: byName,
            item_status: "active",
          });
        }
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
