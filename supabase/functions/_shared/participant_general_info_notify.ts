/**
 * After a parent (or future admin) updates participant general information,
 * Web Push the standing / cover instructors for that child + ops admins.
 * Does not touch payments or parent Family push.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  expandParticipantClientSlugs,
  participantIdentityMatches,
  resolveParticipantClientSlugs,
  resolveParticipantLookupNames,
  slugifyParticipantKey,
} from "./participant_identity.ts";
import { PARENT_SESSION_TERM_START_ISO } from "./parent_feedback_academic_year.ts";
import {
  adminPushOpenBase,
  clampPushBody,
  initVapidFromEnv,
  loadAdminCeoUserIds,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
} from "./portal_webpush_util.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function staffKeyFromName(raw: string): string {
  let k = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)[0] || "";
  if (k === "yousef" || k === "yusef") k = "youssef";
  if (k === "lulia") k = "luliya";
  if (k === "javi") k = "javier";
  return k;
}

function isPlaceholderStaffName(raw: string): boolean {
  const s = clean(raw, 80).toLowerCase();
  if (!s) return true;
  return (
    /no\s*participant|open\s*slot|hold\s*waitlist|cover\s*needed|tbc|tba|vacant|unassigned/.test(s) ||
    s === "open" ||
    s === "extra"
  );
}

function rosterKeyFromProfile(username: string, fullName: string): string {
  const raw = (username || "").trim() || (fullName || "").trim();
  if (!raw) return "";
  const first = raw.split(/\s+/).filter(Boolean)[0] ?? raw;
  return first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function addInstructorKeys(set: Set<string>, raw: unknown) {
  const text = clean(raw, 120);
  if (!text || isPlaceholderStaffName(text)) return;
  for (const part of text.split(/[,/&+]|\band\b|\s+·\s+/i)) {
    const name = clean(part, 80);
    if (!name || isPlaceholderStaffName(name)) continue;
    const key = staffKeyFromName(name);
    if (key) set.add(key);
  }
}

async function resolveInstructorRosterKeys(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  identityInput: {
    contactId?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  },
): Promise<string[]> {
  const keys = new Set<string>();
  const lookupNames = resolveParticipantLookupNames(identityInput);
  const slugs = [
    ...new Set(
      expandParticipantClientSlugs(resolveParticipantClientSlugs(identityInput))
        .map((s) => slugifyParticipantKey(s))
        .filter(Boolean),
    ),
  ];
  const memberSlugs = slugs.filter((s) => s !== "acat" && s !== "acat_group");
  const lookupKeys = memberSlugs.length ? memberSlugs : slugs;

  if (lookupKeys.length) {
    const rawKeys = [
      ...new Set(
        lookupKeys.flatMap((k) => {
          const dashed = k.replace(/_/g, "-");
          return [k, dashed, `${k}-nhs`, `${dashed}-nhs`, `${k}_nhs`];
        }),
      ),
    ];
    try {
      const { data } = await supabase
        .from("portal_participant_service_lines")
        .select("sessions")
        .in("client_key", rawKeys)
        .limit(12);
      for (const row of data || []) {
        const sessions = Array.isArray(row.sessions) ? row.sessions : [];
        for (const slot of sessions) {
          if (!slot || typeof slot !== "object") continue;
          const s = slot as Record<string, unknown>;
          const svc = clean(s.service || s.serviceType, 80);
          if (/crash|intensiv/i.test(svc)) continue;
          addInstructorKeys(keys, s.instructor || s.instructors);
        }
      }
    } catch (e) {
      console.warn("[general-info-notify] service_lines", e);
    }
  }

  const names = [
    ...new Set(
      [...lookupNames.slice(0, 6), identityInput.displayName || "", identityInput.firstName || ""]
        .map((n) => clean(n, 80))
        .filter(Boolean),
    ),
  ];
  if (names.length) {
    const results = await Promise.all(
      names.map((nm) =>
        supabase
          .from("portal_roster_rows")
          .select("client_name, service, instructors, status, session_date")
          .eq("status", "active")
          .ilike("client_name", nm.includes(" ") ? nm : `${nm}%`)
          .limit(80),
      ),
    );
    for (const { data } of results) {
      for (const row of data || []) {
        if (!row) continue;
        if (!participantIdentityMatches(identityInput, String(row.client_name || ""), "")) {
          continue;
        }
        const svc = clean(row.service, 80);
        if (/crash|intensiv/i.test(svc)) continue;
        addInstructorKeys(keys, row.instructors);
      }
    }
  }

  const slugSet = new Set(slugs.map((s) => String(s || "").toLowerCase()).filter(Boolean));
  if (slugSet.size) {
    try {
      const { data: ovRows } = await supabase
        .from("schedule_overrides")
        .select("session_date, override_type, status, payload, anchor_staff_id, anchor_client_id")
        .eq("status", "active")
        .in("override_type", ["instructor_reassign", "client_replace_in_slot"])
        .gte("session_date", PARENT_SESSION_TERM_START_ISO)
        .limit(300);
      for (const ov of ovRows || []) {
        const pl = (ov?.payload && typeof ov.payload === "object"
          ? ov.payload
          : {}) as Record<string, unknown>;
        const ot = clean(ov.override_type, 40);
        const anchorClient = clean(ov.anchor_client_id, 80).toLowerCase();
        const toClient = clean(pl.to_client_id || pl.replacement_client_id, 80)
          .toLowerCase();
        const forThisChild =
          (anchorClient && slugSet.has(anchorClient)) ||
          (toClient && slugSet.has(toClient));
        if (!forThisChild) continue;
        if (ot === "instructor_reassign") {
          const slug =
            clean(pl.covering_staff_id, 80) ||
            staffKeyFromName(clean(pl.covering_staff_name, 120));
          if (slug) keys.add(staffKeyFromName(slug) || slug.toLowerCase());
        } else if (ot === "client_replace_in_slot") {
          const staffSlug = clean(ov.anchor_staff_id, 80);
          if (staffSlug) {
            keys.add(staffKeyFromName(staffSlug) || staffSlug.toLowerCase());
          }
        }
      }
    } catch (e) {
      console.warn("[general-info-notify] overrides", e);
    }
  }

  return [...keys].filter(Boolean);
}

async function mapRosterKeysToStaffUserIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  rosterKeys: string[],
): Promise<string[]> {
  const want = new Set(rosterKeys.map((k) => String(k || "").toLowerCase()).filter(Boolean));
  if (!want.size) return [];
  const { data: profiles, error } = await supabase
    .from("staff_profiles")
    .select("id, username, full_name, app_role")
    .in("app_role", ["staff", "lead", "ceo"]);
  if (error || !profiles?.length) {
    if (error) console.warn("[general-info-notify] profiles", error.message);
    return [];
  }
  const ids = new Set<string>();
  for (const p of profiles as Array<{
    id?: string;
    username?: string;
    full_name?: string;
  }>) {
    const rk = rosterKeyFromProfile(p.username ?? "", p.full_name ?? "");
    if (rk && want.has(rk) && p.id) ids.add(String(p.id));
  }
  return [...ids];
}

export type GeneralInfoNotifyResult = {
  ok: boolean;
  detail?: string;
  staffSent?: number;
  adminSent?: number;
  instructorKeys?: string[];
};

/**
 * Fire-and-forget safe: never throws to the caller. Call after a successful
 * general-info upsert when the sheet content actually changed.
 */
export async function notifyParticipantGeneralInfoChanged(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient | any,
  opts: {
    contactId: string;
    source?: "parent" | "admin";
    displayName?: string;
    logId?: string;
  },
): Promise<GeneralInfoNotifyResult> {
  const contactId = clean(opts.contactId, 120);
  if (!contactId) return { ok: false, detail: "missing_contact" };

  try {
    initVapidFromEnv();
  } catch (e) {
    console.warn("[general-info-notify] vapid", e);
    return { ok: false, detail: "vapid_missing" };
  }

  let displayName = clean(opts.displayName, 120);
  let firstName = "";
  let lastName = "";
  try {
    const { data: pax } = await supabase
      .from("portal_participants")
      .select("display_name, first_name, last_name")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (pax) {
      displayName = displayName || clean(pax.display_name, 120);
      firstName = clean(pax.first_name, 80);
      lastName = clean(pax.last_name, 80);
    }
  } catch (_) {
    /* ignore */
  }
  if (!displayName) {
    try {
      const { data: c } = await supabase
        .from("portal_parent_contacts")
        .select("child_display, child_first_name, child_last_name")
        .eq("contact_id", contactId)
        .limit(1)
        .maybeSingle();
      if (c) {
        displayName = clean(c.child_display, 120);
        firstName = firstName || clean(c.child_first_name, 80);
        lastName = lastName || clean(c.child_last_name, 80);
      }
    } catch (_) {
      /* ignore */
    }
  }
  const who = displayName || "Participant";
  const source = opts.source === "admin" ? "admin" : "parent";
  const byLine = source === "admin" ? "Office updated" : "Parent updated";

  const identity = {
    contactId,
    displayName: who,
    firstName: firstName || who.split(/\s+/)[0] || "",
    lastName,
  };

  let instructorKeys: string[] = [];
  try {
    instructorKeys = await resolveInstructorRosterKeys(supabase, identity);
  } catch (e) {
    console.warn("[general-info-notify] resolve instructors", e);
  }

  const staffIds = await mapRosterKeysToStaffUserIds(supabase, instructorKeys);
  let adminIds: string[] = [];
  try {
    adminIds = await loadAdminCeoUserIds(supabase);
  } catch (e) {
    console.warn("[general-info-notify] admins", e);
  }

  const title = "General info updated";
  const body = clampPushBody(`${byLine} · ${who} — review before next session`);
  const tagBase = `general-info-${contactId}-${opts.logId || Date.now()}`;

  const staffBase = staffPushOpenBase() || "";
  const staffUrl = staffBase
    ? `${staffBase}${staffBase.includes("?") ? "&" : "?"}portalOpen=participant&contact_id=${encodeURIComponent(contactId)}`
    : "";
  const staffPayload = JSON.stringify({
    title,
    body,
    url: staffUrl,
    portalOpen: "participant",
    contact_id: contactId,
    tag: `staff-${tagBase}`,
    requireInteraction: false,
  });

  const adminBase = adminPushOpenBase() || "";
  const adminUrl = adminBase
    ? `${adminBase}${adminBase.includes("?") ? "&" : "?"}portalOpen=clients&contact_id=${encodeURIComponent(contactId)}`
    : "";
  const adminPayload = JSON.stringify({
    title,
    body: clampPushBody(`${byLine} · ${who} — open CLIENT Assessment`),
    url: adminUrl,
    portalOpen: "clients",
    contact_id: contactId,
    tag: `admin-${tagBase}`,
    requireInteraction: true,
  });

  let staffSent = 0;
  let adminSent = 0;
  try {
    if (staffIds.length) {
      const r = await sendPushPayloadToUserIds(supabase, staffIds, staffPayload);
      staffSent = r.sent || 0;
    }
  } catch (e) {
    console.warn("[general-info-notify] staff push", e);
  }
  try {
    if (adminIds.length) {
      const r = await sendPushPayloadToUserIds(supabase, adminIds, adminPayload);
      adminSent = r.sent || 0;
    }
  } catch (e) {
    console.warn("[general-info-notify] admin push", e);
  }

  return {
    ok: true,
    staffSent,
    adminSent,
    instructorKeys,
    detail: staffIds.length || adminIds.length ? "sent" : "no_targets",
  };
}
