/** Shared helpers for incident follow-up meetings + staff notify. */

export async function resolveOwnerUserIds(
  admin: { rpc: Function },
  clientId: string | null,
  clientName: string | null,
): Promise<string[]> {
  try {
    const { data, error } = await admin.rpc("portal_participant_owner_user_ids", {
      p_client_id: clientId || null,
      p_client_name: clientName || null,
    });
    if (error) {
      console.warn("[followup] owner rpc", error.message);
      return [];
    }
    if (Array.isArray(data)) {
      return data.map((x) => String(x)).filter(Boolean);
    }
    return [];
  } catch (e) {
    console.warn("[followup] owner rpc failed", e);
    return [];
  }
}

export async function loadStaffProfiles(
  admin: { from: Function },
  userIds: string[],
): Promise<Array<{ id: string; full_name: string | null; email: string | null; username: string | null }>> {
  if (!userIds.length) return [];
  const { data } = await admin
    .from("staff_profiles")
    .select("id, full_name, email, username")
    .in("id", userIds);
  return (data || []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
  }>;
}

export async function notifyUsersAboutIncident(
  admin: { from: Function },
  opts: {
    userIds: string[];
    title: string;
    body: string;
    messageType: string;
    incidentId: string;
    createdBy: string | null;
    dedupeKey?: string;
  },
): Promise<number> {
  let sent = 0;
  const ends = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const uid of opts.userIds) {
    if (!uid) continue;
    if (opts.dedupeKey) {
      const { data: existing } = await admin
        .from("portal_staff_announcements")
        .select("id")
        .eq("related_incident_id", opts.incidentId)
        .eq("target_user_id", uid)
        .eq("message_type", opts.messageType)
        .limit(1)
        .maybeSingle();
      if (existing?.id) continue;
    }
    const { error } = await admin.from("portal_staff_announcements").insert({
      created_by: opts.createdBy || uid,
      title: opts.title,
      body: opts.body,
      message_type: opts.messageType,
      priority: "high",
      audience_scope: "all_staff",
      delivery_scope: "single_user",
      target_user_id: uid,
      related_incident_id: opts.incidentId,
      ends_at: ends,
    });
    if (!error) sent++;
    else console.warn("[followup] announce", error.message);
  }
  return sent;
}

export function meetingTypeLabel(t: string): string {
  const map: Record<string, string> = {
    internal_review: "Internal Review",
    parent_meeting: "Parent Meeting",
    staff_follow_up: "Staff Follow-up",
    multi_disciplinary: "Multi-disciplinary Review",
  };
  return map[t] || t;
}
