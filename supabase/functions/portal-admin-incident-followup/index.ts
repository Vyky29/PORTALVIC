// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-incident-followup
// Phase A: triage, follow-up form, generate/apply support plan update.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  loadStaffProfiles,
  meetingTypeLabel,
  notifyUsersAboutIncident,
  resolveOwnerUserIds,
} from "../_shared/portal_incident_followup_ops.ts";

type StrategyIn = {
  risk_behaviour?: string;
  strategy_in_place?: string;
  risk_level?: string;
};

function clean(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}

function riskLevel(v: unknown): "high" | "medium" | "low" {
  const s = clean(v, 20).toLowerCase();
  if (s === "high" || s === "low") return s;
  return "medium";
}

function normalizeStrategies(raw: unknown): Array<{
  risk_behaviour: string;
  strategy_in_place: string;
  risk_level: "high" | "medium" | "low";
  sort_order: number;
}> {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, 40).map((row: StrategyIn, i: number) => ({
    risk_behaviour: clean(row?.risk_behaviour, 500),
    strategy_in_place: clean(row?.strategy_in_place, 2000),
    risk_level: riskLevel(row?.risk_level),
    sort_order: i,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 60);
  const incidentId = clean(body.incident_id, 80);
  if (!action) return portalAdminJson(400, { ok: false, error: "action_required" });
  if (!incidentId && action !== "get_plan_by_name") {
    return portalAdminJson(400, { ok: false, error: "incident_id_required" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = verified.userId || null;
  const now = new Date().toISOString();

  async function loadIncident() {
    const { data, error } = await admin
      .from("incident_reports")
      .select("*")
      .eq("id", incidentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async function loadFollowupBundle(incId: string) {
    const { data: followup } = await admin
      .from("portal_incident_followups")
      .select("*")
      .eq("incident_id", incId)
      .maybeSingle();
    let strategies: unknown[] = [];
    if (followup?.id) {
      const { data: rows } = await admin
        .from("portal_incident_followup_strategies")
        .select("*")
        .eq("followup_id", followup.id)
        .order("sort_order", { ascending: true });
      strategies = rows || [];
    }
    const { data: update } = await admin
      .from("portal_support_plan_updates")
      .select("*")
      .eq("incident_id", incId)
      .in("status", ["draft", "pending_instructor"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: meeting } = await admin
      .from("portal_incident_followup_meetings")
      .select("*")
      .eq("incident_id", incId)
      .in("status", ["draft", "awaiting_responses", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let invitees: unknown[] = [];
    if (meeting?.id) {
      const { data: inv } = await admin
        .from("portal_incident_followup_invitees")
        .select("*")
        .eq("meeting_id", meeting.id)
        .order("created_at", { ascending: true });
      invitees = inv || [];
    }

    const incidentRow = await loadIncident();
    const ownerIds = incidentRow
      ? await resolveOwnerUserIds(
        admin,
        incidentRow.client_id || null,
        incidentRow.client_name || null,
      )
      : [];
    const ownerProfiles = await loadStaffProfiles(admin, ownerIds);
    let submitterProfile = null;
    if (incidentRow?.submitted_by_user_id) {
      const rows = await loadStaffProfiles(admin, [incidentRow.submitted_by_user_id]);
      submitterProfile = rows[0] || {
        id: incidentRow.submitted_by_user_id,
        full_name: incidentRow.submitted_by_name,
        email: null,
        username: null,
      };
    }

    return {
      followup: followup || null,
      strategies,
      update: update || null,
      meeting: meeting || null,
      invitees,
      suggested_participants: {
        submitter: submitterProfile,
        owners: ownerProfiles,
      },
    };
  }

  try {
    if (action === "get") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });
      const bundle = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, { ok: true, incident, ...bundle });
    }

    if (action === "triage") {
      const triage = clean(body.triage, 40);
      if (!["no_follow_up", "manager_review_only", "formal_meeting"].includes(triage)) {
        return portalAdminJson(400, { ok: false, error: "invalid_triage" });
      }
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });

      if (triage === "no_follow_up") {
        const { error } = await admin
          .from("incident_reports")
          .update({
            triage,
            triage_at: now,
            triage_by: userId,
            workflow_status: "archived",
            closed_at: now,
            closed_by: userId,
          })
          .eq("id", incidentId);
        if (error) throw new Error(error.message);
        return portalAdminJson(200, { ok: true, workflow_status: "archived", triage });
      }

      // manager_review_only or formal_meeting → start follow-up (meeting scheduling = Phase B)
      const { error: upErr } = await admin
        .from("incident_reports")
        .update({
          triage,
          triage_at: now,
          triage_by: userId,
          workflow_status: "follow_up_in_progress",
          follow_up_started_at: now,
        })
        .eq("id", incidentId);
      if (upErr) throw new Error(upErr.message);

      const { data: existing } = await admin
        .from("portal_incident_followups")
        .select("id")
        .eq("incident_id", incidentId)
        .maybeSingle();
      let followupId = existing?.id || null;
      if (!followupId) {
        const { data: created, error: cErr } = await admin
          .from("portal_incident_followups")
          .insert({
            incident_id: incidentId,
            status: "in_progress",
            created_by: userId,
          })
          .select("id")
          .maybeSingle();
        if (cErr) throw new Error(cErr.message);
        followupId = created?.id || null;
      }

      const bundle = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, {
        ok: true,
        workflow_status: "follow_up_in_progress",
        triage,
        followup_id: followupId,
        note: triage === "formal_meeting"
          ? "Meeting scheduling comes in Phase B — you can complete the follow-up form now."
          : null,
        ...bundle,
      });
    }

    if (action === "save_followup") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });

      let { data: followup } = await admin
        .from("portal_incident_followups")
        .select("*")
        .eq("incident_id", incidentId)
        .maybeSingle();
      if (!followup) {
        const { data: created, error: cErr } = await admin
          .from("portal_incident_followups")
          .insert({
            incident_id: incidentId,
            status: "in_progress",
            created_by: userId,
          })
          .select("*")
          .maybeSingle();
        if (cErr) throw new Error(cErr.message);
        followup = created;
        await admin
          .from("incident_reports")
          .update({
            workflow_status: "follow_up_in_progress",
            follow_up_started_at: incident.follow_up_started_at || now,
          })
          .eq("id", incidentId);
      }

      const patch = {
        immediate_findings: clean(body.immediate_findings),
        root_cause: clean(body.root_cause),
        parent_communication: clean(body.parent_communication),
        staff_discussion: clean(body.staff_discussion),
        lessons_learned: clean(body.lessons_learned),
        follow_up_summary: clean(body.follow_up_summary),
        updated_at: now,
      };
      const { error: pErr } = await admin
        .from("portal_incident_followups")
        .update(patch)
        .eq("id", followup.id);
      if (pErr) throw new Error(pErr.message);

      if (Array.isArray(body.strategies)) {
        const strategies = normalizeStrategies(body.strategies);
        await admin
          .from("portal_incident_followup_strategies")
          .delete()
          .eq("followup_id", followup.id);
        if (strategies.length) {
          const { error: sErr } = await admin
            .from("portal_incident_followup_strategies")
            .insert(
              strategies.map((s) => ({
                followup_id: followup.id,
                ...s,
              })),
            );
          if (sErr) throw new Error(sErr.message);
        }
      }

      const bundle = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, { ok: true, saved: true, ...bundle });
    }

    if (action === "complete_followup") {
      // Save + mark complete + create draft support plan update from strategies
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });

      // Reuse save path fields
      const saveRes = await (async () => {
        let { data: followup } = await admin
          .from("portal_incident_followups")
          .select("*")
          .eq("incident_id", incidentId)
          .maybeSingle();
        if (!followup) {
          const { data: created, error: cErr } = await admin
            .from("portal_incident_followups")
            .insert({
              incident_id: incidentId,
              status: "in_progress",
              created_by: userId,
            })
            .select("*")
            .maybeSingle();
          if (cErr) throw new Error(cErr.message);
          followup = created;
        }
        const patch = {
          immediate_findings: clean(body.immediate_findings),
          root_cause: clean(body.root_cause),
          parent_communication: clean(body.parent_communication),
          staff_discussion: clean(body.staff_discussion),
          lessons_learned: clean(body.lessons_learned),
          follow_up_summary: clean(body.follow_up_summary),
          status: "complete",
          completed_at: now,
          completed_by: userId,
          updated_at: now,
        };
        const { error: pErr } = await admin
          .from("portal_incident_followups")
          .update(patch)
          .eq("id", followup.id);
        if (pErr) throw new Error(pErr.message);

        const strategies = normalizeStrategies(body.strategies);
        await admin
          .from("portal_incident_followup_strategies")
          .delete()
          .eq("followup_id", followup.id);
        if (strategies.length) {
          const { error: sErr } = await admin
            .from("portal_incident_followup_strategies")
            .insert(strategies.map((s) => ({ followup_id: followup.id, ...s })));
          if (sErr) throw new Error(sErr.message);
        }

        await admin
          .from("incident_reports")
          .update({
            workflow_status: "follow_up_complete",
            follow_up_completed_at: now,
          })
          .eq("id", incidentId);

        // Cancel prior drafts for this incident
        await admin
          .from("portal_support_plan_updates")
          .update({ status: "cancelled", updated_at: now })
          .eq("incident_id", incidentId)
          .in("status", ["draft", "pending_instructor"]);

        const payload = strategies.filter(
          (s) => s.risk_behaviour || s.strategy_in_place,
        );
        const { data: update, error: uErr } = await admin
          .from("portal_support_plan_updates")
          .insert({
            incident_id: incidentId,
            followup_id: followup.id,
            participant_name: clean(incident.client_name, 200) || "Participant",
            participant_contact_id: clean(incident.client_id, 120) || null,
            status: "draft",
            payload_json: payload,
            created_by: userId,
          })
          .select("*")
          .maybeSingle();
        if (uErr) throw new Error(uErr.message);
        return { followup, update, strategies: payload };
      })();

      return portalAdminJson(200, {
        ok: true,
        workflow_status: "follow_up_complete",
        followup: saveRes.followup,
        update: saveRes.update,
        strategies: saveRes.strategies,
      });
    }

    if (action === "apply_support_plan") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });

      const updateId = clean(body.update_id, 80);
      let update = null;
      if (updateId) {
        const { data } = await admin
          .from("portal_support_plan_updates")
          .select("*")
          .eq("id", updateId)
          .maybeSingle();
        update = data;
      }
      if (!update || update.status === "cancelled" || update.status === "applied") {
        const { data: draft } = await admin
          .from("portal_support_plan_updates")
          .select("*")
          .eq("incident_id", incidentId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        update = draft;
      }
      if (!update) return portalAdminJson(404, { ok: false, error: "update_not_found" });

      const participantName = clean(update.participant_name, 200) || clean(incident.client_name, 200);
      const items = Array.isArray(update.payload_json) ? update.payload_json : [];
      const forceApply = body.force_apply === true || body.skip_instructor_review === true;

      const ownerIds = await resolveOwnerUserIds(
        admin,
        incident.client_id || null,
        incident.client_name || null,
      );
      const needsInstructor =
        !forceApply &&
        ownerIds.length > 0 &&
        userId &&
        !ownerIds.includes(userId);

      if (needsInstructor && update.status !== "pending_instructor") {
        await admin
          .from("portal_support_plan_updates")
          .update({ status: "pending_instructor", updated_at: now })
          .eq("id", update.id);
        await admin
          .from("incident_reports")
          .update({ workflow_status: "awaiting_instructor" })
          .eq("id", incidentId);
        await notifyUsersAboutIncident(admin, {
          userIds: ownerIds,
          title: "Support Plan Update Pending",
          body:
            `Please review the proposed support plan changes for ${participantName} (from an incident follow-up). Open Individual Support Plan on their card to Approve or Reject.`,
          messageType: "support_plan_pending",
          incidentId,
          createdBy: userId,
          dedupeKey: "pending",
        });
        return portalAdminJson(200, {
          ok: true,
          workflow_status: "awaiting_instructor",
          pending_instructor: true,
          owner_user_ids: ownerIds,
        });
      }

      // Activate plan (admin is owner, force apply, or already approved path)
      await admin
        .from("portal_support_plans")
        .update({ status: "superseded", updated_at: now })
        .eq("status", "active")
        .ilike("participant_name", participantName);

      const { data: plan, error: planErr } = await admin
        .from("portal_support_plans")
        .insert({
          participant_name: participantName,
          participant_contact_id: update.participant_contact_id || clean(incident.client_id, 120) || null,
          status: "active",
          source_incident_id: incidentId,
          source_followup_id: update.followup_id,
          activated_at: now,
          activated_by: userId,
        })
        .select("*")
        .maybeSingle();
      if (planErr) throw new Error(planErr.message);

      const byName = clean(verified.email, 120) || "Admin";
      if (items.length && plan?.id) {
        const rows = items.map((row: StrategyIn, i: number) => ({
          plan_id: plan.id,
          sort_order: i,
          risk_behaviour: clean(row?.risk_behaviour, 500),
          strategy_in_place: clean(row?.strategy_in_place, 2000),
          risk_level: riskLevel(row?.risk_level),
          source_incident_id: incidentId,
          last_updated_at: now,
          updated_by: userId,
          updated_by_name: byName,
          item_status: "active",
        }));
        const { error: iErr } = await admin.from("portal_support_plan_items").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }

      await admin
        .from("portal_support_plan_updates")
        .update({
          status: "applied",
          applied_plan_id: plan.id,
          applied_at: now,
          updated_at: now,
        })
        .eq("id", update.id);

      await admin
        .from("incident_reports")
        .update({
          workflow_status: "closed",
          closed_at: now,
          closed_by: userId,
        })
        .eq("id", incidentId);

      const notifyIds = Array.from(
        new Set([
          ...ownerIds,
          incident.submitted_by_user_id,
        ].filter(Boolean).map(String)),
      ).filter((id) => id !== userId);

      await notifyUsersAboutIncident(admin, {
        userIds: notifyIds,
        title: "Support Plan Updated",
        body:
          `${participantName}'s Support Plan has been updated. Please review the latest strategies before the next session (Individual Support Plan on their card).`,
        messageType: "support_plan_updated",
        incidentId,
        createdBy: userId,
        dedupeKey: "updated",
      });

      const { data: planItems } = await admin
        .from("portal_support_plan_items")
        .select("*")
        .eq("plan_id", plan.id)
        .order("sort_order", { ascending: true });

      return portalAdminJson(200, {
        ok: true,
        workflow_status: "closed",
        plan,
        items: planItems || [],
        notified: notifyIds.length,
      });
    }

    if (action === "cancel_support_plan_update") {
      const updateId = clean(body.update_id, 80);
      const q = admin
        .from("portal_support_plan_updates")
        .update({ status: "cancelled", updated_at: now });
      if (updateId) q.eq("id", updateId);
      else q.eq("incident_id", incidentId).eq("status", "draft");
      const { error } = await q;
      if (error) throw new Error(error.message);
      return portalAdminJson(200, { ok: true, cancelled: true });
    }

    if (action === "reopen_followup") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });
      await admin
        .from("portal_support_plan_updates")
        .update({ status: "cancelled", updated_at: now })
        .eq("incident_id", incidentId)
        .in("status", ["draft", "pending_instructor"]);
      await admin
        .from("portal_incident_followups")
        .update({
          status: "in_progress",
          completed_at: null,
          completed_by: null,
          updated_at: now,
        })
        .eq("incident_id", incidentId);
      await admin
        .from("incident_reports")
        .update({
          workflow_status: "follow_up_in_progress",
          follow_up_completed_at: null,
          closed_at: null,
          closed_by: null,
        })
        .eq("id", incidentId);
      const bundle = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, {
        ok: true,
        workflow_status: "follow_up_in_progress",
        ...bundle,
      });
    }

    if (action === "save_meeting") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });

      const meetingType = clean(body.meeting_type, 40) || "internal_review";
      const locationMode = clean(body.location_mode, 20) || "teams";
      const locationDetail = clean(body.location_detail, 300);
      const proposedAt = clean(body.proposed_at, 40);
      const notes = clean(body.notes, 2000);
      const inviteeInputs = Array.isArray(body.invitees) ? body.invitees : [];

      let { data: followup } = await admin
        .from("portal_incident_followups")
        .select("id")
        .eq("incident_id", incidentId)
        .maybeSingle();
      if (!followup) {
        const { data: created } = await admin
          .from("portal_incident_followups")
          .insert({ incident_id: incidentId, status: "in_progress", created_by: userId })
          .select("id")
          .maybeSingle();
        followup = created;
      }

      let { data: meeting } = await admin
        .from("portal_incident_followup_meetings")
        .select("*")
        .eq("incident_id", incidentId)
        .in("status", ["draft", "awaiting_responses", "confirmed"])
        .maybeSingle();

      const meetingPatch = {
        meeting_type: meetingType,
        location_mode: locationMode,
        location_detail: locationDetail || null,
        proposed_at: proposedAt || null,
        notes: notes || null,
        followup_id: followup?.id || null,
        updated_at: now,
      };

      if (!meeting) {
        const { data: created, error: mErr } = await admin
          .from("portal_incident_followup_meetings")
          .insert({
            incident_id: incidentId,
            status: "draft",
            created_by: userId,
            ...meetingPatch,
          })
          .select("*")
          .maybeSingle();
        if (mErr) throw new Error(mErr.message);
        meeting = created;
      } else {
        const { data: updated, error: uErr } = await admin
          .from("portal_incident_followup_meetings")
          .update(meetingPatch)
          .eq("id", meeting.id)
          .select("*")
          .maybeSingle();
        if (uErr) throw new Error(uErr.message);
        meeting = updated;
      }

      await admin.from("portal_incident_followup_invitees").delete().eq("meeting_id", meeting.id);

      const rows = inviteeInputs.slice(0, 30).map((inv: Record<string, unknown>) => ({
        meeting_id: meeting.id,
        role: clean(inv.role, 40) || "other_staff",
        user_id: clean(inv.user_id, 80) || null,
        display_name: clean(inv.display_name, 120) || "Participant",
        email: clean(inv.email, 160) || null,
        phone: clean(inv.phone, 40) || null,
        required: inv.required !== false,
        response: "pending",
      }));
      if (rows.length) {
        const { error: iErr } = await admin.from("portal_incident_followup_invitees").insert(rows);
        if (iErr) throw new Error(iErr.message);
      }

      const bundle = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, { ok: true, saved: true, ...bundle });
    }

    if (action === "send_availability") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });
      const bundle = await loadFollowupBundle(incidentId);
      const meeting = bundle.meeting;
      if (!meeting) return portalAdminJson(400, { ok: false, error: "meeting_required" });

      await admin
        .from("portal_incident_followup_meetings")
        .update({ status: "awaiting_responses", updated_at: now })
        .eq("id", meeting.id);
      await admin
        .from("incident_reports")
        .update({ workflow_status: "meeting_scheduled" })
        .eq("id", incidentId);

      const whenLabel = meeting.proposed_at
        ? new Date(meeting.proposed_at).toLocaleString("en-GB", {
          timeZone: "Europe/London",
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
        : "TBC";
      const staffInvitees = (bundle.invitees || []).filter((i: { user_id?: string }) => i.user_id);
      const userIds = staffInvitees.map((i: { user_id: string }) => i.user_id);
      await notifyUsersAboutIncident(admin, {
        userIds,
        title: "Follow-up Meeting Invitation",
        body:
          `A follow-up meeting has been requested regarding an incident for ${clean(incident.client_name, 80)}.\n` +
          `Type: ${meetingTypeLabel(meeting.meeting_type)}\n` +
          `Proposed: ${whenLabel}\n` +
          `Location: ${meeting.location_mode}${meeting.location_detail ? " — " + meeting.location_detail : ""}\n\n` +
          `Please confirm availability in the portal (Announcements / Individual Support Plan).`,
        messageType: "followup_meeting_invite",
        incidentId,
        createdBy: userId,
        dedupeKey: "invite",
      });

      const out = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, {
        ok: true,
        workflow_status: "meeting_scheduled",
        invited: userIds.length,
        ...out,
      });
    }

    if (action === "confirm_meeting") {
      const incident = await loadIncident();
      if (!incident) return portalAdminJson(404, { ok: false, error: "incident_not_found" });
      const bundle = await loadFollowupBundle(incidentId);
      const meeting = bundle.meeting;
      if (!meeting) return portalAdminJson(400, { ok: false, error: "meeting_required" });

      await admin
        .from("portal_incident_followup_meetings")
        .update({
          status: "confirmed",
          confirmed_at: now,
          confirmed_by: userId,
          updated_at: now,
        })
        .eq("id", meeting.id);
      await admin
        .from("incident_reports")
        .update({ workflow_status: "meeting_confirmed" })
        .eq("id", incidentId);

      const whenLabel = meeting.proposed_at
        ? new Date(meeting.proposed_at).toLocaleString("en-GB", {
          timeZone: "Europe/London",
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
        : "TBC";
      const userIds = (bundle.invitees || [])
        .map((i: { user_id?: string }) => i.user_id)
        .filter(Boolean);
      await notifyUsersAboutIncident(admin, {
        userIds,
        title: "Follow-up Meeting Confirmed",
        body:
          `Your follow-up meeting for ${clean(incident.client_name, 80)} is confirmed.\n` +
          `Date/time: ${whenLabel}\n` +
          `Location: ${meeting.location_mode}${meeting.location_detail ? " — " + meeting.location_detail : ""}`,
        messageType: "followup_meeting_confirmed",
        incidentId,
        createdBy: userId,
        dedupeKey: "confirmed",
      });

      const out = await loadFollowupBundle(incidentId);
      return portalAdminJson(200, {
        ok: true,
        workflow_status: "meeting_confirmed",
        ...out,
      });
    }

    if (action === "get_plan_by_name") {
      const name = clean(body.participant_name, 200);
      if (!name) return portalAdminJson(400, { ok: false, error: "participant_name_required" });
      const { data: plan } = await admin
        .from("portal_support_plans")
        .select("*")
        .eq("status", "active")
        .ilike("participant_name", name)
        .order("activated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!plan) return portalAdminJson(200, { ok: true, plan: null, items: [] });
      const { data: items } = await admin
        .from("portal_support_plan_items")
        .select("*")
        .eq("plan_id", plan.id)
        .order("sort_order", { ascending: true });
      return portalAdminJson(200, { ok: true, plan, items: items || [] });
    }

    return portalAdminJson(400, { ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("[portal-admin-incident-followup]", e instanceof Error ? e.message : e);
    return portalAdminJson(500, {
      ok: false,
      error: e instanceof Error ? e.message : "server_error",
    });
  }
});
