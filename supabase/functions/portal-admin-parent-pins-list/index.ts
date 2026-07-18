// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-pins-list
// Office list of family portal PINs (readable) for support / login help.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

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

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return portalAdminJson(500, { ok: false, error: "config" });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: creds, error: credsErr } = await supabase
    .from("portal_parent_portal_credentials")
    .select("parent_person_id, pin_display, changed_by_parent, updated_at")
    .order("updated_at", { ascending: false });

  if (credsErr) {
    console.error("[portal-admin-parent-pins-list] creds", credsErr.message);
    return portalAdminJson(500, { ok: false, error: "creds_failed" });
  }

  const { data: contacts, error: contactsErr } = await supabase
    .from("portal_parent_contacts")
    .select(
      "parent_person_id, parent_display, parent_first_name, parent_last_name, child_display, child_first_name, contact_id, email, mobile",
    )
    .limit(5000);

  if (contactsErr) {
    console.error("[portal-admin-parent-pins-list] contacts", contactsErr.message);
    return portalAdminJson(500, { ok: false, error: "contacts_failed" });
  }

  const kidsByParent = new Map<string, string[]>();
  const parentMeta = new Map<string, { parent: string; email: string; mobile: string }>();
  for (const c of contacts || []) {
    const pid = String(c.parent_person_id || "");
    if (!pid) continue;
    const child = String(c.child_display || c.child_first_name || "").trim();
    if (!kidsByParent.has(pid)) kidsByParent.set(pid, []);
    if (child && !kidsByParent.get(pid)!.includes(child)) kidsByParent.get(pid)!.push(child);
    if (!parentMeta.has(pid)) {
      parentMeta.set(pid, {
        parent: String(c.parent_display || `${c.parent_first_name || ""} ${c.parent_last_name || ""}`).trim(),
        email: String(c.email || ""),
        mobile: String(c.mobile || ""),
      });
    }
  }

  const rows = (creds || []).map((r) => {
    const pid = String(r.parent_person_id);
    const meta = parentMeta.get(pid) || { parent: pid, email: "", mobile: "" };
    const kids = kidsByParent.get(pid) || [];
    return {
      parent_person_id: pid,
      parent: meta.parent,
      children: kids.join("; "),
      login_names: kids.map((k) => k.split(/\s+/)[0]).filter(Boolean).join(" / "),
      pin: String(r.pin_display || ""),
      changed_by_parent: !!r.changed_by_parent,
      updated_at: r.updated_at,
      email: meta.email,
      mobile: meta.mobile,
    };
  });

  return portalAdminJson(200, { ok: true, count: rows.length, pins: rows });
});
