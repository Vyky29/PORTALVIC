// portal-ceo-parent-portal-presence
// CEO/admin: who has an active Family portal session and recent surfaces/actions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const ONLINE_MS = 5 * 60 * 1000;
const RECENT_MS = 24 * 60 * 60 * 1000;

function clean(v: unknown, max = 120): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function looksLikeRawId(name: string): boolean {
  const s = clean(name, 120);
  if (!s) return true;
  if (/^\d{4,}$/.test(s)) return true;
  if (/^(parent-|gap-|contact-)/i.test(s)) return true;
  return false;
}

function parentDisplayFromContact(c: {
  parent_display?: unknown;
  parent_first_name?: unknown;
  parent_last_name?: unknown;
}): string {
  const full =
    clean(c.parent_display, 120) ||
    [clean(c.parent_first_name, 60), clean(c.parent_last_name, 60)].filter(Boolean).join(" ");
  if (full && !looksLikeRawId(full)) return full;
  return "";
}

function deviceLabel(raw: unknown): string {
  const d = clean(raw, 20).toLowerCase();
  if (d === "phone") return "Phone";
  if (d === "tablet") return "Tablet";
  if (d === "desktop") return "Desktop";
  return "";
}

function surfaceLabel(raw: string): string {
  const map: Record<string, string> = {
    home: "Home (children list)",
    hub: "Child hub",
    sessions: "Sessions Overview",
    photos: "Achievement photos",
    achievements: "Achievement photos",
    weekly_notes: "Weekly notes",
    messages: "Messages",
    absence: "Report absent",
    consents: "Consents & forms",
    documents: "Consents & forms",
    booking: "My booking 2026/27",
    calendar: "My Calendar",
    team: "Team / instructors",
    balance: "Credits & refunds",
    credits: "Credits & refunds",
    swim: "Swim term review",
    invoices: "Invoices",
    crash: "Crash / intensive",
    reenrolment: "Re-enrolment",
    general_info: "General info",
  };
  const k = clean(raw, 40).toLowerCase();
  return map[k] || (k ? k.replace(/_/g, " ") : "—");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(503, { ok: false, error: "server_misconfigured" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = Date.now();
  const onlineSince = new Date(now - ONLINE_MS).toISOString();
  const recentSince = new Date(now - RECENT_MS).toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const { data: sessions, error: sessErr } = await admin
    .from("portal_parent_portal_sessions")
    .select(
      "id, parent_person_id, issued_at, expires_at, last_used_at, revoked_at, last_surface, last_contact_id, geo_bucket, geo_label, geo_lat, geo_lng, geo_city, geo_region, geo_country, client_device",
    )
    .is("revoked_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .gte("last_used_at", recentSince)
    .order("last_used_at", { ascending: false })
    .limit(200);

  if (sessErr) {
    console.error("[portal-ceo-parent-portal-presence] sessions", sessErr.message);
    return portalAdminJson(500, { ok: false, error: "sessions_query_failed" });
  }

  const parentIds = Array.from(
    new Set((sessions || []).map((s) => clean(s.parent_person_id, 80)).filter(Boolean)),
  );

  const contactsByParent = new Map<
    string,
    Array<{ contact_id: string; display_name: string; parent_display: string }>
  >();

  if (parentIds.length) {
    const { data: contacts, error: contactErr } = await admin
      .from("portal_parent_contacts")
      .select(
        "parent_person_id, contact_id, child_display, parent_display, parent_first_name, parent_last_name",
      )
      .in("parent_person_id", parentIds)
      .limit(800);
    if (contactErr) {
      console.error("[portal-ceo-parent-portal-presence] contacts", contactErr.message);
    }
    for (const c of contacts || []) {
      const pid = clean(c.parent_person_id, 80);
      if (!pid) continue;
      const parentDisplay = parentDisplayFromContact(c) || "Parent";
      const row = {
        contact_id: clean(c.contact_id, 80),
        display_name: clean(c.child_display, 120) || "Participant",
        parent_display: parentDisplay,
      };
      const list = contactsByParent.get(pid) || [];
      list.push(row);
      contactsByParent.set(pid, list);
    }
  }

  const online: Record<string, unknown>[] = [];
  const recent: Record<string, unknown>[] = [];
  const seenOnline = new Set<string>();
  const seenRecent = new Set<string>();
  const mapPoints: Record<string, unknown>[] = [];
  const outsideList: Record<string, unknown>[] = [];
  const geoSummary = { london: 0, england: 0, outside: 0, unknown: 0 };
  const geoSeen = new Set<string>();

  function resolveParentName(pid: string): string {
    const kids = contactsByParent.get(pid) || [];
    for (let i = 0; i < kids.length; i++) {
      const n = clean(kids[i].parent_display, 120);
      if (n && n !== "Parent" && !looksLikeRawId(n)) return n;
    }
    return "Parent";
  }

  for (const s of sessions || []) {
    const pid = clean(s.parent_person_id, 80);
    if (!pid) continue;
    const lastUsed = s.last_used_at ? new Date(String(s.last_used_at)).getTime() : 0;
    const kids = contactsByParent.get(pid) || [];
    const parentName = resolveParentName(pid);
    const childNames = kids.map((k) => k.display_name).filter(Boolean);
    const lastContact = clean(s.last_contact_id, 80);
    const childFocus =
      (lastContact && kids.find((k) => k.contact_id === lastContact)?.display_name) ||
      childNames[0] ||
      null;
    const bucket = clean(s.geo_bucket, 20).toLowerCase();
    const geoLabel = clean(s.geo_label, 120) || null;
    const geoLat = typeof s.geo_lat === "number" ? s.geo_lat : null;
    const geoLng = typeof s.geo_lng === "number" ? s.geo_lng : null;
    const device = clean(s.client_device, 20).toLowerCase() || null;
    const item = {
      parent_person_id: pid,
      parent_name: parentName,
      children: childNames,
      child_focus: childFocus,
      last_used_at: s.last_used_at || null,
      issued_at: s.issued_at || null,
      expires_at: s.expires_at || null,
      last_surface: clean(s.last_surface, 40) || null,
      last_surface_label: surfaceLabel(String(s.last_surface || "")),
      online: lastUsed >= now - ONLINE_MS,
      client_device: device,
      client_device_label: deviceLabel(device) || null,
      geo_bucket: bucket || null,
      geo_label: geoLabel,
      geo_city: clean(s.geo_city, 80) || null,
      geo_region: clean(s.geo_region, 80) || null,
      geo_country: clean(s.geo_country, 80) || null,
    };
    if (item.online) {
      if (!seenOnline.has(pid)) {
        seenOnline.add(pid);
        online.push(item);
      }
    } else if (!seenRecent.has(pid) && !seenOnline.has(pid)) {
      seenRecent.add(pid);
      recent.push(item);
    }

    // One geo entry per parent (most recent session wins due to order).
    if (!geoSeen.has(pid)) {
      geoSeen.add(pid);
      if (bucket === "london" || bucket === "england") {
        if (bucket === "london") geoSummary.london += 1;
        else geoSummary.england += 1;
        if (geoLat != null && geoLng != null) {
          mapPoints.push({
            parent_person_id: pid,
            parent_name: parentName,
            bucket,
            label: geoLabel || (bucket === "london" ? "London" : "England"),
            lat: geoLat,
            lng: geoLng,
            online: item.online,
          });
        }
      } else if (bucket === "outside") {
        geoSummary.outside += 1;
        outsideList.push({
          parent_person_id: pid,
          parent_name: parentName,
          label: geoLabel || "Outside England",
          online: item.online,
        });
      } else {
        geoSummary.unknown += 1;
      }
    }
  }

  const { data: activityRows } = await admin
    .from("portal_parent_portal_activity")
    .select("id, parent_person_id, contact_id, event_type, detail, created_at")
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(80);

  const activityParentIds = Array.from(
    new Set((activityRows || []).map((a) => clean(a.parent_person_id, 80)).filter(Boolean)),
  );
  for (const pid of activityParentIds) {
    if (contactsByParent.has(pid)) continue;
    const { data: more } = await admin
      .from("portal_parent_contacts")
      .select(
        "parent_person_id, contact_id, child_display, parent_display, parent_first_name, parent_last_name",
      )
      .eq("parent_person_id", pid)
      .limit(20);
    for (const c of more || []) {
      const parentDisplay = parentDisplayFromContact(c) || "Parent";
      const list = contactsByParent.get(pid) || [];
      list.push({
        contact_id: clean(c.contact_id, 80),
        display_name: clean(c.child_display, 120) || "Participant",
        parent_display: parentDisplay,
      });
      contactsByParent.set(pid, list);
    }
  }

  const activity = (activityRows || []).map((a) => {
    const pid = clean(a.parent_person_id, 80);
    const kids = contactsByParent.get(pid) || [];
    const cid = clean(a.contact_id, 80);
    const child =
      (cid && kids.find((k) => k.contact_id === cid)?.display_name) ||
      kids[0]?.display_name ||
      null;
    return {
      at: a.created_at,
      parent_person_id: pid,
      parent_name: resolveParentName(pid),
      child_name: child,
      event_type: clean(a.event_type, 40),
      event_label: surfaceLabel(String(a.event_type || "")),
      detail: clean(a.detail, 160) || null,
    };
  });

  const { count: signInsToday } = await admin
    .from("portal_parent_portal_sessions")
    .select("id", { count: "exact", head: true })
    .gte("issued_at", dayStartIso);

  const { data: absences } = await admin
    .from("portal_parent_absence_reports")
    .select("id, created_at, contact_id, status, session_date")
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(20);

  const actions: Record<string, unknown>[] = [];
  for (const ab of absences || []) {
    actions.push({
      at: ab.created_at,
      kind: "absence",
      label: "Absence reported",
      detail: clean(ab.session_date, 20) + (ab.status ? ` · ${clean(ab.status, 40)}` : ""),
      contact_id: clean(ab.contact_id, 80) || null,
    });
  }

  const { data: inbound } = await admin
    .from("portal_parent_whatsapp_inbound")
    .select("id, created_at, parent_person_id, contact_id, body_preview, meta")
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(30);

  for (const row of inbound || []) {
    const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
    if (clean(meta.source, 40) !== "parent_portal") continue;
    actions.push({
      at: row.created_at,
      kind: "message",
      label: "Message from Family portal",
      detail: clean(row.body_preview || meta.body || "", 120) || null,
      parent_person_id: clean(row.parent_person_id, 80) || null,
      contact_id: clean(row.contact_id, 80) || null,
    });
  }

  actions.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  return portalAdminJson(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    online_window_minutes: ONLINE_MS / 60000,
    summary: {
      online_now: online.length,
      active_last_24h: online.length + recent.length,
      sign_ins_today: signInsToday || 0,
      geo: geoSummary,
    },
    online,
    recent,
    activity,
    actions: actions.slice(0, 40),
    map: {
      england_only: true,
      points: mapPoints,
      outside: outsideList,
    },
  });
});
