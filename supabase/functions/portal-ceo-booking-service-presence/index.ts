// portal-ceo-booking-service-presence
// CEO/admin: who is on public Booking Service (new-client offer) + location/device.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { sha256Hex } from "../_shared/parent_portal_auth.ts";

const ONLINE_MS = 5 * 60 * 1000;
const RECENT_MS = 24 * 60 * 60 * 1000;

function clean(v: unknown, max = 120): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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
    offer: "Browsing offer",
    filter: "Using filters",
    service: "Service times",
    intensive: "Crash / intensive",
    book_cta: "Tapped Book",
    enquire: "Enquire / waitlist",
    registration: "Registration form",
    registration_submit: "Submitted registration",
    otp_request: "Requested access code",
  };
  const k = clean(raw, 40).toLowerCase();
  return map[k] || (k ? k.replace(/_/g, " ") : "—");
}

function visitorLabel(s: {
  id?: unknown;
  parent_name?: unknown;
  geo_label?: unknown;
  geo_city?: unknown;
  client_device?: unknown;
}): string {
  const named = clean(s.parent_name, 120);
  if (named) return named;
  const loc = clean(s.geo_label, 80) || clean(s.geo_city, 60);
  const device = deviceLabel(s.client_device);
  const bits = [loc, device].filter(Boolean);
  if (bits.length) return bits.join(" · ");
  const id = clean(s.id, 12);
  return id ? "Visitor " + id.slice(0, 8) : "Visitor";
}

/** Sessions that only have an IP pick up the parent from a recent access-code request on that IP. */
async function fillIdentityFromRecentOtps(
  admin: ReturnType<typeof createClient>,
  sessions: Record<string, unknown>[],
  sinceIso: string,
) {
  const need = sessions.filter((s) => !clean(s.parent_name, 2) && clean(s.client_ip, 64));
  if (!need.length) return;
  const hashByIp = new Map<string, string>();
  for (const s of need) {
    const ip = clean(s.client_ip, 64);
    if (!ip || hashByIp.has(ip)) continue;
    hashByIp.set(ip, await sha256Hex(ip));
  }
  const { data: otps } = await admin
    .from("portal_booking_lead_otps")
    .select("lead_id, ip_hash, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(400);
  const leadByHash = new Map<string, string>();
  for (const row of otps || []) {
    const hash = clean((row as { ip_hash?: unknown }).ip_hash, 80);
    const leadId = clean((row as { lead_id?: unknown }).lead_id, 40);
    if (!hash || !leadId || leadByHash.has(hash)) continue;
    if (![...hashByIp.values()].includes(hash)) continue;
    leadByHash.set(hash, leadId);
  }
  const ids = [...new Set(leadByHash.values())];
  if (!ids.length) return;
  const { data: leads } = await admin
    .from("portal_booking_leads")
    .select("id, parent_name, email, mobile")
    .in("id", ids);
  const byId = new Map((leads || []).map((row) => [String(row.id), row]));
  const writes: Promise<unknown>[] = [];
  for (const s of need) {
    const ip = clean(s.client_ip, 64);
    const lead = byId.get(leadByHash.get(hashByIp.get(ip) || "") || "");
    if (!lead) continue;
    s.parent_name = lead.parent_name || null;
    s.parent_email = lead.email || null;
    s.parent_phone = lead.mobile || null;
    s.lead_id = lead.id;
    writes.push(
      admin
        .from("portal_booking_service_sessions")
        .update({
          lead_id: lead.id,
          parent_name: lead.parent_name || null,
          parent_email: lead.email || null,
          parent_phone: lead.mobile || null,
        })
        .eq("id", s.id)
        .is("lead_id", null)
        .then(() => null),
    );
  }
  if (writes.length) await Promise.all(writes);
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
  const recentSince = new Date(now - RECENT_MS).toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { data: sessions, error: sessErr } = await admin
    .from("portal_booking_service_sessions")
    .select(
      "id, issued_at, expires_at, last_used_at, revoked_at, last_surface, last_detail, client_device, client_ip, geo_bucket, geo_label, geo_lat, geo_lng, geo_city, geo_region, geo_country, lead_id, parent_name, parent_email, parent_phone",
    )
    .is("revoked_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .gte("last_used_at", recentSince)
    .order("last_used_at", { ascending: false })
    .limit(200);

  if (sessErr) {
    console.error("[portal-ceo-booking-service-presence]", sessErr.message);
    return portalAdminJson(500, { ok: false, error: "sessions_query_failed" });
  }

  const sessionRows = (sessions || []) as Record<string, unknown>[];
  try {
    await fillIdentityFromRecentOtps(admin, sessionRows, recentSince);
  } catch (fillErr) {
    console.warn("[portal-ceo-booking-service-presence] identity fill", fillErr);
  }

  const online: Record<string, unknown>[] = [];
  const recent: Record<string, unknown>[] = [];
  const mapPoints: Record<string, unknown>[] = [];
  const outsideList: Record<string, unknown>[] = [];
  const geoSummary = { london: 0, england: 0, outside: 0, unknown: 0 };

  for (const s of sessionRows) {
    const lastUsed = s.last_used_at ? new Date(String(s.last_used_at)).getTime() : 0;
    const isOnline = lastUsed >= now - ONLINE_MS;
    const bucket = clean(s.geo_bucket, 20).toLowerCase();
    const geoLabel = clean(s.geo_label, 120) || null;
    const device = clean(s.client_device, 20).toLowerCase() || null;
    const ip = clean((s as { client_ip?: unknown }).client_ip, 64) || null;
    const item = {
      session_id: String(s.id),
      visitor_label: visitorLabel(s),
      last_used_at: s.last_used_at || null,
      issued_at: s.issued_at || null,
      last_surface: clean(s.last_surface, 40) || null,
      last_surface_label: surfaceLabel(String(s.last_surface || "")),
      last_detail: clean(s.last_detail, 160) || null,
      online: isOnline,
      client_device: device,
      client_device_label: deviceLabel(device) || null,
      client_ip: ip,
      parent_name: clean(s.parent_name, 120) || null,
      parent_email: clean(s.parent_email, 160) || null,
      parent_phone: clean(s.parent_phone, 40) || null,
      identified: !!clean(s.parent_name, 2),
      geo_bucket: bucket || null,
      geo_label: geoLabel,
      geo_city: clean(s.geo_city, 80) || null,
      geo_region: clean(s.geo_region, 80) || null,
      geo_country: clean(s.geo_country, 80) || null,
    };
    if (isOnline) online.push(item);
    else recent.push(item);

    if (bucket === "london") {
      geoSummary.london += 1;
      const pinLat =
        typeof s.geo_lat === "number" && Number.isFinite(s.geo_lat) ? s.geo_lat : 51.5074;
      const pinLng =
        typeof s.geo_lng === "number" && Number.isFinite(s.geo_lng) ? s.geo_lng : -0.1278;
      mapPoints.push({
        session_id: String(s.id),
        visitor_label: item.visitor_label,
        client_ip: ip,
        bucket: "london",
        label: geoLabel || "London",
        lat: pinLat,
        lng: pinLng,
        online: isOnline,
      });
    } else if (bucket === "england") {
      geoSummary.england += 1;
      outsideList.push({
        session_id: String(s.id),
        visitor_label: item.visitor_label,
        client_ip: ip,
        label: geoLabel || "England (outside London)",
        kind: "england",
        online: isOnline,
      });
    } else if (bucket === "outside") {
      geoSummary.outside += 1;
      outsideList.push({
        session_id: String(s.id),
        visitor_label: item.visitor_label,
        client_ip: ip,
        label: geoLabel || "Outside UK",
        kind: "outside",
        online: isOnline,
      });
    } else {
      geoSummary.unknown += 1;
    }
  }

  const { data: activityRows } = await admin
    .from("portal_booking_service_activity")
    .select("id, session_id, event_type, detail, created_at")
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(80);

  const sessById = new Map(sessionRows.map((s) => [String(s.id), s]));
  const activity = (activityRows || []).map((a) => {
    const sid = String(a.session_id || "");
    const s = sessById.get(sid);
    return {
      at: a.created_at,
      session_id: sid,
      visitor_label: s ? visitorLabel(s) : "Visitor",
      parent_name: s ? clean(s.parent_name, 120) || null : null,
      parent_email: s ? clean(s.parent_email, 160) || null : null,
      client_ip: s ? clean((s as { client_ip?: unknown }).client_ip, 64) || null : null,
      event_type: clean(a.event_type, 40),
      event_label: surfaceLabel(String(a.event_type || "")),
      detail: clean(a.detail, 160) || null,
      geo_label: s ? clean(s.geo_label, 120) || null : null,
      client_device_label: s ? deviceLabel(s.client_device) || null : null,
    };
  });

  const [{ count: visitsToday }, { count: visitsAllTime }] = await Promise.all([
    admin
      .from("portal_booking_service_sessions")
      .select("id", { count: "exact", head: true })
      .gte("issued_at", dayStart.toISOString()),
    admin
      .from("portal_booking_service_sessions")
      .select("id", { count: "exact", head: true }),
  ]);

  return portalAdminJson(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    online_window_minutes: ONLINE_MS / 60000,
    summary: {
      online_now: online.length,
      active_last_24h: online.length + recent.length,
      visits_today: visitsToday || 0,
      visits_all_time: visitsAllTime || 0,
      geo: geoSummary,
    },
    online,
    recent,
    activity,
    map: {
      london_only: true,
      points: mapPoints,
      outside: outsideList,
    },
  });
});
