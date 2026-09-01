// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-office-calendar
// ---------------------------
// Admin shared office calendar: list / upsert / delete meetings, notes, events.
//
// Deploy:
//   npx supabase functions deploy portal-admin-office-calendar --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const ENTRY_TYPES = new Set(["meeting", "note", "event"]);

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function normIsoDate(v: unknown): string {
  const s = clean(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normTime(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0") + ":00";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
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

  const action = clean(body.action || "list").toLowerCase();
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const actorId = verified.userId || null;
  let actorName = clean(verified.email) || "Admin";
  if (actorId) {
    const { data: prof } = await admin
      .from("staff_profiles")
      .select("full_name, username")
      .eq("id", actorId)
      .maybeSingle();
    const n = clean(prof?.full_name) || clean(prof?.username);
    if (n) actorName = n;
  }

  if (action === "list") {
    const from = normIsoDate(body.from);
    const to = normIsoDate(body.to);
    if (!from || !to) {
      return portalAdminJson(400, { ok: false, error: "missing_range" });
    }
    const { data, error } = await admin
      .from("portal_office_calendar_entries")
      .select(
        "id, entry_date, entry_type, title, body, start_time, end_time, all_day, created_by, created_by_name, updated_by, created_at, updated_at",
      )
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[portal-admin-office-calendar] list", error.message);
      return portalAdminJson(500, { ok: false, error: "query_failed" });
    }
    return portalAdminJson(200, { ok: true, entries: data || [] });
  }

  if (action === "upsert") {
    const id = clean(body.id);
    const entryDate = normIsoDate(body.entry_date);
    const entryType = clean(body.entry_type).toLowerCase();
    const title = clean(body.title).slice(0, 200);
    const bodyText = clean(body.body).slice(0, 8000);
    const startTime = normTime(body.start_time);
    const endTime = normTime(body.end_time);
    const allDay = body.all_day === false || startTime ? false : true;

    if (!entryDate) {
      return portalAdminJson(400, { ok: false, error: "missing_date" });
    }
    if (!ENTRY_TYPES.has(entryType)) {
      return portalAdminJson(400, { ok: false, error: "invalid_type" });
    }
    if (!title) {
      return portalAdminJson(400, { ok: false, error: "missing_title" });
    }

    const row = {
      entry_date: entryDate,
      entry_type: entryType,
      title,
      body: bodyText || null,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
      all_day: allDay,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const { data, error } = await admin
        .from("portal_office_calendar_entries")
        .update(row)
        .eq("id", id)
        .select(
          "id, entry_date, entry_type, title, body, start_time, end_time, all_day, created_by, created_by_name, updated_by, created_at, updated_at",
        )
        .maybeSingle();
      if (error) {
        console.error("[portal-admin-office-calendar] update", error.message);
        return portalAdminJson(500, { ok: false, error: "update_failed" });
      }
      if (!data) {
        return portalAdminJson(404, { ok: false, error: "not_found" });
      }
      return portalAdminJson(200, { ok: true, entry: data });
    }

    const { data, error } = await admin
      .from("portal_office_calendar_entries")
      .insert([
        {
          ...row,
          created_by: actorId,
          created_by_name: actorName,
        },
      ])
      .select(
        "id, entry_date, entry_type, title, body, start_time, end_time, all_day, created_by, created_by_name, updated_by, created_at, updated_at",
      )
      .single();
    if (error) {
      console.error("[portal-admin-office-calendar] insert", error.message);
      return portalAdminJson(500, { ok: false, error: "insert_failed" });
    }
    return portalAdminJson(200, { ok: true, entry: data });
  }

  if (action === "delete") {
    const id = clean(body.id);
    if (!id) {
      return portalAdminJson(400, { ok: false, error: "missing_id" });
    }
    const { error } = await admin
      .from("portal_office_calendar_entries")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("[portal-admin-office-calendar] delete", error.message);
      return portalAdminJson(500, { ok: false, error: "delete_failed" });
    }
    return portalAdminJson(200, { ok: true, deleted: id });
  }

  return portalAdminJson(400, { ok: false, error: "unknown_action" });
});
